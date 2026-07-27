import B5ActorSheet from "./actor-sheet.mjs";
import { B5 } from "../config.mjs";

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
      openStation: B5CraftSheet.#onOpenStation
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

    // Weapons grouped by firing arc, because that is how they are fired and destroyed.
    context.weaponsByArc = Object.fromEntries(
      B5.craftArcs.map(arc => [arc, this.actor.itemTypes.craftWeapon.filter(w => w.system.arc === arc)])
    );
    context.features = this.actor.itemTypes.craftFeature;
    context.spacesRemaining = this.actor.system.spacesRemaining;
    context.spacesTotal = this.actor.system.spacesTotal;
    context.isSurface = this.actor.system.details.craftType === "surfaceVehicle";

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
