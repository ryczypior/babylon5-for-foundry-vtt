import { B5 } from "../config.mjs";

/** Register the Handlebars helpers and preload the sheet partials. */
export function registerHandlebars() {
  Handlebars.registerHelper({
    /** Format a modifier with an explicit sign: 3 → "+3", −1 → "−1". */
    b5Signed(value) {
      const n = Number(value) || 0;
      return n >= 0 ? `+${n}` : `${n}`;
    },

    /** Localised ability abbreviation, e.g. "Dex". */
    b5AbilityAbbr(key) {
      return game.i18n.localize(B5.abilityAbbreviations[key] ?? key);
    },

    b5Concat(...args) {
      args.pop();
      return args.join("");
    },

    b5Eq(a, b) {
      return a === b;
    },

    /** Percentage of a resource, clamped, for bar widths. */
    b5Percent(value, max) {
      const m = Number(max) || 0;
      if (!m) return 0;
      return Math.clamp(Math.round((Number(value) / m) * 100), 0, 100);
    }
  });
}

/**
 * The item sheet body is chosen with a dynamic partial (`{{> (lookup . "bodyTemplate")}}`),
 * so every per-type template has to be registered up front.
 */
const ITEM_TYPES = [
  "class", "race", "skill", "feat", "influence", "telepathicAbility",
  "weapon", "armour", "ammunition", "gear", "weaponAccessory",
  "craftWeapon", "craftFeature"
];

export async function preloadTemplates() {
  const { loadTemplates } = foundry.applications.handlebars;
  return loadTemplates(ITEM_TYPES.map(t => `systems/babylon5/templates/item/types/${t}.hbs`));
}
