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
    position: { width: 840, height: 760 }
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
      return { role, label: game.i18n.localize(`B5.CraftRole.${role}`), uuid,
               actor: uuid ? fromUuidSync(uuid) : null };
    });

    return context;
  }
}
