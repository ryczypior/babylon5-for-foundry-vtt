import B5CharacterSheet from "./character-sheet.mjs";

const PATH = "systems/babylon5/templates/actor/character";
const NPC_PATH = "systems/babylon5/templates/actor/npc";

/**
 * NPCs use the character data model, so the sheet reuses the character parts and adds a
 * stat-block tab for the numbers a GM reads mid-scene.
 */
export default class B5NpcSheet extends B5CharacterSheet {

  static DEFAULT_OPTIONS = {
    classes: ["npc"],
    position: { width: 780, height: 720 }
  };

  static INITIAL_TAB = "statblock";

  static PARTS = {
    header:    { template: `${PATH}/header.hbs` },
    nav:       { template: `${PATH}/nav.hbs` },
    statblock: { template: `${NPC_PATH}/tab-statblock.hbs`, scrollable: [""] },
    skills:    { template: `${PATH}/tab-skills.hbs`,        scrollable: [""] },
    feats:     { template: `${PATH}/tab-feats.hbs`,         scrollable: [""] },
    gear:      { template: `${PATH}/tab-gear.hbs`,          scrollable: [""] },
    telepathy: { template: `${PATH}/tab-telepathy.hbs`,     scrollable: [""] },
    biography: { template: `${PATH}/tab-biography.hbs`,     scrollable: [""] }
  };

  static TAB_DEFINITIONS = [
    { id: "statblock", icon: "fa-solid fa-rectangle-list" },
    { id: "skills",    icon: "fa-solid fa-list-check" },
    { id: "feats",     icon: "fa-solid fa-star" },
    { id: "gear",      icon: "fa-solid fa-box-open" },
    { id: "telepathy", icon: "fa-solid fa-brain", requiresTelepathy: true },
    { id: "biography", icon: "fa-solid fa-book" }
  ];
}
