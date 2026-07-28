/**
 * Pressuring another faction (book p. 113).
 *
 * Related Influences lean on one another — the Minbari religious caste leans on the warrior
 * caste, which leans on Earth's military, which leans on an Earth corporation. Each link is a
 * fresh Influence check against a *different* faction, but only the **first** one is rolled:
 * every link after it inherits the previous result minus five.
 *
 * ```
 * roll the first link → 10 or more? the faction agrees to lean
 *   → the next link's result is automatically (previous − 5)
 *     → repeat, −5 each time
 *       → compare the last result to the DC of what was actually wanted
 * ```
 *
 * Worked example (book p. 108): Sathenn has Minbari Military 12 and rolls 10, for 22. That is
 * at least 10, so the warrior caste passes the request to the worker caste at 22 − 5 = 17, which
 * is also at least 10, so they lean on their Earth counterparts at 17 − 5 = 12 — exactly the DC
 * the GM set for threatening a small company with trade restrictions.
 */

/** A faction agrees to apply pressure on this much or better. */
export const PRESSURE_THRESHOLD = 10;

/** Every link past the first costs this much. */
export const PRESSURE_STEP = -5;

/**
 * The general Influences cannot lean on anyone — except these two, which the book gives
 * `Pressures: Any Political`.
 */
export const GENERAL_MAY_PRESSURE = ["interstellar-alliance", "vorlon"];

/**
 * The named exceptions (book p. 113). `halve` applies to the *attempt*, so it scales the score
 * rather than the result; `penalty` is a flat modifier on the check.
 */
export const SPECIAL_MODIFIERS = {
  socialToSocial: { penalty: -5, key: "socialToSocial" },
  greyCouncil: { halve: true, key: "greyCouncil" },
  leagueSocial: { halve: true, key: "leagueSocial" }
};

/**
 * Whether this Influence may lean on that target at all.
 *
 * The rule is "same race **or** same type", and each faction's printed `Pressures:` line
 * narrows it further. Those lines are per-faction prose the system does not carry, so this
 * checks the two axes it does know and reports the rest as something for the table to confirm —
 * the same advisory stance the feat prerequisites take.
 *
 * @returns {{legal: boolean, reason: string|null, advisory: boolean}}
 */
export function pressureLegality(item, { race, category } = {}) {
  const source = item.system;
  const internalId = (source.internalId ?? "").toLowerCase();

  // Specific Race (League) is resources only — it may never pressure and never boost a social skill.
  if (internalId === "specific-race") {
    return { legal: false, reason: "specificRaceCannotPressure", advisory: false };
  }

  if (source.category === "general") {
    if (!GENERAL_MAY_PRESSURE.includes(internalId)) {
      return { legal: false, reason: "generalCannotPressure", advisory: false };
    }
    // The two exceptions are printed as `Pressures: Any Political`, so the racial axis does not
    // apply to them at all — they reach any political faction and nothing else.
    if (!category) return { legal: true, reason: null, advisory: true };
    return category === "political"
      ? { legal: true, reason: null, advisory: false }
      : { legal: false, reason: "anyPoliticalOnly", advisory: true };
  }

  if (!race && !category) return { legal: true, reason: null, advisory: true };

  const sameRace = race && source.race === race;
  const sameType = category && source.category === category;
  if (sameRace || sameType) return { legal: true, reason: null, advisory: false };

  return { legal: false, reason: "unrelatedFaction", advisory: true };
}

/** The Ranger Influence leans only on Minbari Social, until Heart of Izil'zha widens it. */
export function rangerRestriction(item, actor, { race } = {}) {
  const isRanger = (item.system.internalId ?? "").toLowerCase() === "ranger";
  if (!isRanger) return null;

  const rangerLevels = actor.itemTypes.class
    .filter(cls => cls.system.classKey === "ranger")
    .reduce((sum, cls) => sum + cls.system.levels, 0);
  if (rangerLevels >= 10) return null;              // Heart of Izil'zha: all Minbari factions

  return race === "minbari" ? null : "rangerMinbariSocialOnly";
}

/**
 * One link in the chain.
 *
 * The first link rolls; every later one inherits `carried − 5` and is not rolled at all, which
 * is why `roll` is optional. A link succeeds when its result reaches the threshold — except the
 * last, which is measured against the DC of what was actually wanted.
 *
 * @param {number} result  this link's result, before the step penalty
 * @param {number|null} dc when given, this is the final link and it resolves against the DC
 */
export function resolveLink(result, { dc = null } = {}) {
  if (dc !== null) {
    return { final: true, result, dc, success: result >= dc, carried: null };
  }
  const passes = result >= PRESSURE_THRESHOLD;
  return {
    final: false,
    result,
    dc: PRESSURE_THRESHOLD,
    success: passes,
    carried: passes ? result + PRESSURE_STEP : null
  };
}

/** The modifiers a link carries, as labelled parts the card can print. */
export function specialParts({ socialToSocial = false } = {}) {
  return socialToSocial
    ? [{ key: "socialToSocial", value: SPECIAL_MODIFIERS.socialToSocial.penalty,
      labelKey: "B5.Pressure.socialToSocial" }]
    : [];
}

/** Grey Council and League Social halve the *score* an attempt brings to bear, not the roll. */
export function halveScore(score, { greyCouncil = false, leagueSocial = false } = {}) {
  return greyCouncil || leagueSocial ? Math.floor(score / 2) : score;
}
