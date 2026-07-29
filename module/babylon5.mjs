import { B5 } from "./config.mjs";

import B5Actor from "./documents/actor.mjs";
import B5Item from "./documents/item.mjs";

import CharacterData from "./data/actor/character.mjs";
import NpcData from "./data/actor/npc.mjs";
import CraftData from "./data/actor/craft.mjs";

import {
  ClassData, RaceData, SkillData, FeatData, InfluenceData, TelepathicAbilityData
} from "./data/item/character-items.mjs";
import {
  WeaponData, ArmourData, AmmunitionData, GearData, WeaponAccessoryData
} from "./data/item/physical-items.mjs";
import { CraftWeaponData, CraftFeatureData } from "./data/item/craft-items.mjs";

import B5CharacterSheet from "./sheets/character-sheet.mjs";
import B5NpcSheet from "./sheets/npc-sheet.mjs";
import B5CraftSheet from "./sheets/craft-sheet.mjs";
import B5ItemSheet from "./sheets/item-sheet.mjs";

import B5TelepathyTests from "./tests/telepathy-tests.mjs";
import B5WeaponTests from "./tests/weapon-tests.mjs";
import B5InfluenceTests from "./tests/influence-tests.mjs";
import B5MarketTests from "./tests/market-tests.mjs";
import { registerHandlebars, preloadTemplates } from "./helpers/handlebars.mjs";

Hooks.once("init", () => {
  console.log("Babylon 5 2e | Initialising system");

  CONFIG.B5 = B5;
  CONFIG.Actor.documentClass = B5Actor;
  CONFIG.Item.documentClass = B5Item;

  CONFIG.Actor.dataModels = {
    character: CharacterData,
    npc: NpcData,
    craft: CraftData
  };

  CONFIG.Item.dataModels = {
    class: ClassData,
    race: RaceData,
    skill: SkillData,
    feat: FeatData,
    influence: InfluenceData,
    telepathicAbility: TelepathicAbilityData,
    weapon: WeaponData,
    armour: ArmourData,
    ammunition: AmmunitionData,
    gear: GearData,
    weaponAccessory: WeaponAccessoryData,
    craftWeapon: CraftWeaponData,
    craftFeature: CraftFeatureData
  };

  // Initiative is a plain Dex check in this system.
  CONFIG.Combat.initiative = {
    formula: "1d20 + @attributes.initiative.total",
    decimals: 2
  };

  registerSheets();
  registerHandlebars();
  preloadTemplates();
});

/** Register the system's sheets and retire the core defaults. */
function registerSheets() {
  const { DocumentSheetConfig } = foundry.applications.apps;

  DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.appv1?.sheets?.ActorSheet ?? ActorSheet);
  DocumentSheetConfig.unregisterSheet(Item, "core", foundry.appv1?.sheets?.ItemSheet ?? ItemSheet);

  DocumentSheetConfig.registerSheet(Actor, "babylon5", B5CharacterSheet, {
    types: ["character"], makeDefault: true, label: "B5.Sheet.Character"
  });
  DocumentSheetConfig.registerSheet(Actor, "babylon5", B5NpcSheet, {
    types: ["npc"], makeDefault: true, label: "B5.Sheet.Npc"
  });
  DocumentSheetConfig.registerSheet(Actor, "babylon5", B5CraftSheet, {
    types: ["craft"], makeDefault: true, label: "B5.Sheet.Craft"
  });
  DocumentSheetConfig.registerSheet(Item, "babylon5", B5ItemSheet, {
    types: Object.keys(CONFIG.Item.dataModels), makeDefault: true, label: "B5.Sheet.Item"
  });
}

/**
 * Two cards carry buttons that act on the *reader's* current targets rather than on the actor
 * who posted them: the telepathy card rolls the subject's Will save, and the weapon card spends
 * its damage through the target's DR. Both belong in chat for that reason.
 */
Hooks.on("renderChatMessageHTML", (message, html) => {
  const handlers = {
    telepathyResist: () => B5TelepathyTests.rollResistance(message),
    weaponApplyDamage: () => B5WeaponTests.applyDamage(message),
    influenceBurn: () => B5InfluenceTests.burnFromCard(message),
    influenceGrant: () => B5InfluenceTests.grantFromCard(message),
    pressureContinue: () => B5InfluenceTests.continuePressure(message),
    marketPay: () => B5MarketTests.payFromCard(message)
  };
  for (const [action, handler] of Object.entries(handlers)) {
    html.querySelector(`[data-action=${action}]`)?.addEventListener("click", handler);
  }
});

Hooks.once("ready", () => {
  console.log("Babylon 5 2e | Ready");
});
