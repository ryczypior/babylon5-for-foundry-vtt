/**
 * Personal weapon attacks (book pp. 156–172).
 *
 * The tables and the pure arithmetic live here; the dialog, the rolls and the chat card live in
 * `module/tests/weapon-tests.mjs` — the same split the other subsystems use.
 *
 * The one thing to keep straight: **the four attack lines already exist on the actor**
 * (`system.attacks.*`), each one BAB + its own ability. A weapon does not recompute them; it
 * picks the line it uses and adds what is specific to the weapon and the shot.
 */

/** −2 for every range increment past the first (book p. 160). */
export const RANGE_INCREMENT_PENALTY = -2;

/** Not having the proficiency feat for a weapon's category. */
export const NON_PROFICIENT_PENALTY = -4;

/** A burst is three rolls at this penalty and costs three shots. */
export const BURST_PENALTY = -6;
export const BURST_SHOTS = 3;
export const BURST_ATTACKS = 3;

/** Two-weapon fighting (book p. 171); the key is `${offHandIsLight}-${hasFeat}`. */
export const TWO_WEAPON_PENALTIES = {
  "false-false": { primary: -6, offHand: -10 },
  "true-false":  { primary: -4, offHand: -8 },
  "false-true":  { primary: -4, offHand: -4 },
  "true-true":   { primary: -2, offHand: -2 }
};

/** How much of the Strength bonus a grip carries into damage (book p. 162). */
export const GRIP_STRENGTH = { oneHanded: 1, twoHanded: 1.5, offHand: 0.5 };

/** Feats this subsystem reads directly, by `internalId`. */
export const WEAPON_FEATS = {
  proficiency: "weapon-proficiency",           // choice: a weapon category
  exoticProficiency: "exotic-weapon-proficiency",
  focus: "weapon-focus",                       // choice: a specific weapon
  specialisation: "weapon-specialisation",
  improvedCritical: "improved-critical",
  pointBlankShot: "point-blank-shot",
  twoWeaponFighting: "two-weapon-fighting"
};

export const WEAPON_FOCUS_ATTACK = 1;
export const WEAPON_SPECIALISATION_DAMAGE = 2;

/* -------------------------------------------- */
/*  Weapon properties                           */
/* -------------------------------------------- */

/**
 * Parse a printed critical like `20/x2`, `19-20/x2` or `18-20/x3`.
 * @returns {{threat: number, multiplier: number}} threat is the lowest natural that threatens
 */
export function parseCritical(printed) {
  const text = String(printed ?? "").trim();
  const match = text.match(/^(\d+)(?:\s*[-–]\s*(\d+))?\s*\/\s*[x×]?(\d+)/i);
  if (!match) return { threat: 20, multiplier: 2 };
  // "19-20" prints the range low-first; a bare "20" threatens on 20 only.
  const threat = Number(match[1]);
  return { threat: Math.clamp(threat, 2, 20), multiplier: Number(match[3]) || 2 };
}

/** Improved Critical and Marksman double the threat *range*, not the threat number. */
export function widenThreat(threat) {
  return Math.clamp(20 - (20 - threat) * 2 - 1, 2, 20);
}

export function hasFeature(weapon, feature) {
  return (weapon.system.features ?? []).some(f =>
    String(f).toLowerCase().replace(/[^a-z]/g, "") === feature);
}

export const isLight = weapon => hasFeature(weapon, "light");
export const isAutomatic = weapon => hasFeature(weapon, "automatic");
export const isRapidFire = weapon => hasFeature(weapon, "rapidfire");
export const isNonlethalWeapon = weapon => hasFeature(weapon, "nonlethal");

/**
 * Melee and thrown weapons add Strength to damage; other ranged weapons do not (book p. 162).
 * The book says "close combat & thrown", which taken literally covers a grenade, so it is
 * included — the dialog shows the contribution as its own line, so a table that reads splash
 * weapons the other way can see it and cancel it.
 */
export function addsStrengthToDamage(weapon) {
  return weapon.system.isMelee || weapon.system.category === "grenade"
    || (weapon.system.rangeIncrement > 0 && weapon.system.category === "closeCombat");
}

/* -------------------------------------------- */
/*  Modifiers                                   */
/* -------------------------------------------- */

/** −2 per increment beyond the first; melee weapons have no increment to exceed. */
export function rangePenalty(weapon, increments = 1) {
  if (!weapon.system.rangeIncrement) return 0;
  return RANGE_INCREMENT_PENALTY * Math.max(0, Math.ceil(increments) - 1);
}

/**
 * Whether the character is proficient. Classes state their proficiencies as prose
 * ("All close combat, grenade and pistol weapons"), so the category is matched loosely out of
 * that text and out of the Weapon Proficiency feat's choice.
 *
 * This is **advisory**: the dialog pre-ticks the −4 and lets it be unticked, the way a failed
 * feat prerequisite warns without blocking.
 */
export function isProficient(actor, weapon) {
  const category = weapon.system.category;
  const needle = category.replace(/([A-Z])/g, " $1").toLowerCase().trim();   // closeCombat → close combat

  for (const cls of actor.itemTypes.class) {
    const text = (cls.system.weaponProficiencies ?? "").toLowerCase();
    if (!text) continue;
    if (text.includes("all weapon") || text.includes("all simple and")) return true;
    if (text.includes(needle)) return true;
  }

  for (const feat of actor.itemTypes.feat) {
    const id = feat.system.internalId;
    const choice = (feat.system.choice?.value ?? "").toLowerCase();
    if (id === WEAPON_FEATS.proficiency && (choice.includes(needle) || needle.includes(choice) && choice)) return true;
    if (id === WEAPON_FEATS.exoticProficiency && choice && weapon.name.toLowerCase().includes(choice)) return true;
  }
  return false;
}

/** A feat naming this specific weapon — Weapon Focus, Weapon Specialisation, Improved Critical. */
export function hasWeaponFeat(actor, weapon, internalId) {
  const name = weapon.name.toLowerCase();
  return actor.itemTypes.feat.some(feat => {
    if (feat.system.internalId !== internalId) return false;
    const choice = (feat.system.choice?.value ?? "").trim().toLowerCase();
    return !!choice && (name.includes(choice) || choice.includes(name));
  });
}

/* -------------------------------------------- */
/*  Damage                                      */
/* -------------------------------------------- */

/**
 * The Strength contribution to damage for this grip, rounded down. A light weapon held in two
 * hands still adds only ×1 (book p. 162).
 */
export function strengthDamage(strMod, grip, light) {
  const factor = grip === "twoHanded" && light ? 1 : (GRIP_STRENGTH[grip] ?? 1);
  // A Strength *penalty* applies in full whatever the grip; only the bonus is scaled.
  if (strMod < 0) return strMod;
  return Math.floor(strMod * factor);
}

/**
 * Build the damage expression. A critical rolls the whole thing `multiplier` times — including
 * the flat parts, which is what the book means by "applying all modifiers each time" — so the
 * expression is repeated rather than multiplied.
 */
export function damageFormula(weapon, { bonus = 0, multiplier = 1 } = {}) {
  const single = bonus ? `${weapon.system.damage} + ${bonus}` : `${weapon.system.damage}`;
  if (multiplier <= 1) return single;
  return Array.from({ length: multiplier }, () => `(${single})`).join(" + ");
}
