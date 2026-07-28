import B5ActorSheet from "./actor-sheet.mjs";
import { B5 } from "../config.mjs";
import B5OrderTests from "../tests/order-tests.mjs";
import B5AttackTests from "../tests/attack-tests.mjs";
import { weaponInRange } from "../system/gunnery.mjs";

const PATH = "systems/babylon5/templates/actor/craft";

/**
 * Craft sheet — spacecraft, aircraft and surface vehicles share one stat block, so they
 * share one sheet; `details.craftType` only changes which order list applies and whether
 * the Stress stat is used.
 */
export default class B5CraftSheet extends B5ActorSheet {

  static DEFAULT_OPTIONS = {
    classes: ["craft"],
    position: { width: 840, height: 760 },
    actions: {
      clearStation: B5CraftSheet.#onClearStation,
      openStation: B5CraftSheet.#onOpenStation,
      issueOrder: B5CraftSheet.#onIssueOrder,
      resetOrders: B5CraftSheet.#onResetOrders,
      fireBarrage: B5CraftSheet.#onFireBarrage,
      repairSpaces: B5CraftSheet.#onRepairSpaces
    }
  };

  static INITIAL_TAB = "overview";

  static PARTS = {
    header:   { template: `${PATH}/header.hbs` },
    nav:      { template: `${PATH}/nav.hbs` },
    overview: { template: `${PATH}/tab-overview.hbs`, scrollable: [""] },
    weapons:  { template: `${PATH}/tab-weapons.hbs`,  scrollable: [""] },
    crew:     { template: `${PATH}/tab-crew.hbs`,     scrollable: [""] },
    damage:   { template: `${PATH}/tab-damage.hbs`,   scrollable: [""] }
  };

  static TAB_DEFINITIONS = [
    { id: "overview", icon: "fa-solid fa-rocket" },
    { id: "weapons",  icon: "fa-solid fa-burst" },
    { id: "crew",     icon: "fa-solid fa-users" },
    { id: "damage",   icon: "fa-solid fa-triangle-exclamation" }
  ];

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.tabs = this.constructor.TAB_DEFINITIONS.map(t => ({
      ...t,
      label: game.i18n.localize(`B5.Tab.${t.id}`),
      active: t.id === this.activeTab
    }));

    // Weapons grouped by firing arc, because that is how they are fired and destroyed. Each
    // one carries whether it can reach the current range band, which is what greys it out.
    const band = this.actor.system.combat.band;
    const weapons = this.actor.itemTypes.craftWeapon.map(item => ({
      item,
      inRange: weaponInRange(item, band),
      firable: !item.system.destroyed && weaponInRange(item, band)
    }));
    context.weaponsByArc = Object.fromEntries(
      B5.craftArcs.map(arc => [arc, weapons.filter(w => w.item.system.arc === arc)])
    );
    context.canFire = weapons.some(w => w.firable);
    context.features = this.actor.itemTypes.craftFeature;
    context.spacesRemaining = this.actor.system.spacesRemaining;
    context.spacesTotal = this.actor.system.spacesTotal;
    context.isSurface = this.actor.system.details.craftType === "surfaceVehicle";

    context.orderBudget = B5OrderTests.orderBudget(this.actor);
    context.ordersRemaining = B5OrderTests.ordersRemaining(this.actor);
    context.effectiveStealth = this.actor.system.attributes.effectiveStealth;

    context.stations = B5.craftRoles.map(role => {
      const uuid = this.actor.system.crew.stations[role];
      const crewman = uuid ? fromUuidSync(uuid) : null;
      const cfg = B5.craftRoleSkills[role] ?? {};
      return {
        role,
        label: game.i18n.localize(`B5.CraftRole.${role}`),
        uuid,
        actor: crewman,
        missing: !!uuid && !crewman,          // the actor was deleted out from under us
        canAttack: cfg.canAttack,
        skillLabel: B5CraftSheet.roleSkillLabel(role),
        skill: crewman ? B5CraftSheet.roleSkillValue(crewman, role) : null
      };
    });

    return context;
  }

  /** @override — light up the station under the cursor while an actor is being dragged. */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const station of this.element.querySelectorAll("[data-station]")) {
      station.addEventListener("dragover", event => {
        event.preventDefault();
        station.classList.add("dragover");
      });
      station.addEventListener("dragleave", () => station.classList.remove("dragover"));
      station.addEventListener("drop", () => station.classList.remove("dragover"));
    }
  }

  /* -------------------------------------------- */
  /*  Crew assignment                             */
  /* -------------------------------------------- */

  /**
   * @override — dropping an Actor onto a station assigns it there. Items keep the base
   * behaviour (craft weapons and features are embedded normally).
   */
  async _onDropDocument(event, document) {
    if (document instanceof Actor) return this.#onDropCrew(event, document);
    return super._onDropDocument(event, document);
  }

  async #onDropCrew(event, crewman) {
    if (!this.isEditable) return;
    const station = event.target.closest("[data-station]");
    if (!station) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.dropOnStation"));
      return;
    }
    if (crewman.type === "craft") {
      ui.notifications.warn(game.i18n.localize("B5.Warning.craftAsCrew"));
      return;
    }

    const role = station.dataset.station;
    const previous = this.actor.system.crew.stations[role];
    await this.actor.update({ [`system.crew.stations.${role}`]: crewman.uuid });

    // Mirror the posting onto the character sheet, and clear it off whoever was there before.
    if (previous && previous !== crewman.uuid) await B5CraftSheet.#clearShipboard(previous, this.actor);
    if (crewman.isOwner) {
      await crewman.update({
        "system.shipboard.craft": this.actor.uuid,
        "system.shipboard.role": role
      });
    }

    ui.notifications.info(game.i18n.format("B5.Info.crewAssigned", {
      name: crewman.name, role: game.i18n.localize(`B5.CraftRole.${role}`)
    }));
  }

  static async #onIssueOrder() {
    await B5OrderTests.promptOrder(this.actor);
  }

  static async #onFireBarrage() {
    await B5AttackTests.promptBarrage(this.actor);
  }

  /**
   * Put the craft back together: every space to its maximum, every impairment cleared and every
   * mount restored. Repair between sessions is a narrative matter in this system, so the sheet
   * offers the whole thing at once rather than trying to model a repair schedule.
   */
  static async #onRepairSpaces() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("B5.Damage.repairTitle") },
      content: `<p>${game.i18n.format("B5.Damage.repairConfirm", { name: this.actor.name })}</p>`
    });
    if (!confirmed) return;

    const updates = { "system.attributes.armour.value": this.actor.system.attributes.armour.max };
    for (const [key, pool] of Object.entries(this.actor.system.spaces)) {
      updates[`system.spaces.${key}.value`] = pool.max;
      updates[`system.spaces.${key}.impaired`] = false;
    }
    updates["system.combat.drifting"] = false;
    await this.actor.update(updates);

    const items = [
      ...this.actor.itemTypes.craftWeapon.map(w => ({
        _id: w.id, "system.spacesLost": 0, "system.impaired": false, "system.destroyed": false
      })),
      ...this.actor.itemTypes.craftFeature.map(f => ({ _id: f.id, "system.destroyed": false }))
    ];
    if (items.length) await this.actor.updateEmbeddedDocuments("Item", items);
  }

  /** New turn — `resetTurn` clears everything a turn owns. */
  static async #onResetOrders() {
    await B5OrderTests.resetTurn(this.actor);
  }

  static async #onClearStation(event, target) {
    const role = target.closest("[data-station]")?.dataset.station;
    if (!role) return;
    const uuid = this.actor.system.crew.stations[role];
    // Flags and object fields merge on update — the key has to be deleted explicitly.
    await this.actor.update({ [`system.crew.stations.-=${role}`]: null });
    if (uuid) await B5CraftSheet.#clearShipboard(uuid, this.actor);
  }

  static async #onOpenStation(event, target) {
    const uuid = target.closest("[data-station]")?.dataset.uuid;
    const crewman = uuid ? await fromUuid(uuid) : null;
    crewman?.sheet.render(true);
  }

  /** Remove this craft's posting from a character who has left the station. */
  static async #clearShipboard(uuid, craft) {
    const crewman = fromUuidSync(uuid);
    if (!crewman?.isOwner) return;
    if (crewman.system?.shipboard?.craft !== craft.uuid) return;
    await crewman.update({ "system.shipboard.craft": "", "system.shipboard.role": "" });
  }

  /* -------------------------------------------- */

  /** The station's signature skill total for this character, or null when it has none. */
  static roleSkillValue(actor, role) {
    const cfg = B5.craftRoleSkills[role];
    if (!cfg?.skill || !actor.system?.skills) return null;

    if (!cfg.subtype) {
      const skill = actor.system.skills[cfg.skill];
      return skill ? { total: skill.total, trained: skill.ranks > 0 } : null;
    }
    const item = actor.itemTypes?.skill?.find(i => i.system.skillKey === cfg.skill
      && i.system.subtype?.toLowerCase() === cfg.subtype);
    // Operations and Technical are trained-only: with no such skill Item the character
    // simply cannot make the roll, which is worth showing rather than hiding.
    return item ? { total: item.system.total, trained: item.system.ranks > 0 } : null;
  }

  static roleSkillLabel(role) {
    const cfg = B5.craftRoleSkills[role];
    if (!cfg?.skill) return "";
    const base = game.i18n.localize(`B5.Skill.${cfg.skill}`);
    return cfg.subtype ? `${base} (${game.i18n.localize(`B5.Subtype.${cfg.subtype}`)})` : base;
  }
}
