/**
 * Influence (book pp. 106–119).
 *
 * The thing to keep straight: **Influence is not a point pool.** It is a per-faction score that
 * never refreshes, and a check is `score + 2d6` — not d20. The only way to spend it is to
 * *burn* it: after a check falls short, permanently give up N points of the score to add 2N to
 * the result. That is a decision made against a known DC, which is why the check dialog asks
 * for one and the card carries the burn button rather than the sheet.
 */

/** The general DC list (book p. 107). Each faction's own resource table overrides it. */
export const GENERAL_DCS = {
  rumours: 10,
  minorAid: 12,
  internalNews: 15,
  averageAid: 20,
  considerableAid: 25,
  majorAid: 30,
  epicAid: 40
};

/** Each point burned adds this much to the result — and is gone from the score for good. */
export const BURN_MULTIPLIER = 2;

/**
 * *Heart of Izil'zha*, the Ranger's 10th-level feature, rolls 3d6 instead of 2d6 — but only on
 * checks that use **Ranger Influence**. The feature also lets that Influence pressure every
 * Minbari faction rather than only Minbari Social; pressuring (book p. 113) is not modelled, so
 * that half stays in the class feature's own text.
 */
export const RANGER_DICE = "3d6";
export const RANGER_CLASS_KEY = "ranger";
export const HEART_OF_IZILZHA_LEVEL = 10;

/**
 * Whether an Influence entry is the Ranger one. There is no Influence compendium, so entries are
 * hand-entered: the stable `internalId` is checked first and the faction and name are matched
 * loosely after it, the same convention the rest of the system uses for authored data.
 */
export function isRangerInfluence(item) {
  const id = (item.system.internalId ?? "").trim().toLowerCase();
  if (id) return id === "ranger" || id === "anlashok";
  const text = `${item.name} ${item.system.faction ?? ""}`.toLowerCase();
  return /ranger|anla'?\s?shok/.test(text);
}

/** The dice this character rolls for this Influence entry. */
export function influenceDice(actor, item, fallback) {
  const rangerLevels = actor.itemTypes.class
    .filter(cls => cls.system.classKey === RANGER_CLASS_KEY)
    .reduce((sum, cls) => sum + cls.system.levels, 0);

  return rangerLevels >= HEART_OF_IZILZHA_LEVEL && isRangerInfluence(item)
    ? RANGER_DICE
    : fallback;
}

/** Aiding another's Influence check: the same kind of check against a flat DC for +2. */
export const AID_DC = 10;
export const AID_BONUS = 2;

/**
 * Class features that soften the −4 for repeating a request inside a week (book p. 108).
 *
 * `scope` is what the feature covers: `any` Influence, or one identified the way
 * `isRangerInfluence` identifies the Ranger's. The prestige classes are not shipped yet; their
 * entries are here so they work the day they are.
 */
export const REPEAT_SOFTENERS = [
  { classKey: "diplomat", level: 3, penalty: -3, scope: "any", key: "strongInfluence" },
  { classKey: "diplomat", level: 9, penalty: -2, scope: "any", key: "powerfulInfluence" },
  { classKey: "fence", level: 1, penalty: -3, scope: "criminal", key: "webOfContacts" },
  { classKey: "fence", level: 5, penalty: -2, scope: "criminal", key: "greaterWebOfContacts" },
  { classKey: "psiCop", level: 4, penalty: -3, scope: "psiCorps", key: "corpsIsMother" },
  { classKey: "psiCop", level: 8, penalty: -2, scope: "psiCorps", key: "corpsIsFather" }
];

/** Which softeners a given Influence entry falls under. */
function inScope(item, scope) {
  if (scope === "any") return true;
  const id = (item.system.internalId ?? "").trim().toLowerCase();
  const text = `${item.name} ${item.system.faction ?? ""}`.toLowerCase();
  if (scope === "criminal") return id === "criminal" || /criminal/.test(text);
  if (scope === "psiCorps") return id === "psi-corps" || /psi\s*corps/.test(text);
  return false;
}

/**
 * The per-attempt repeat penalty for this entry, softened by whichever class feature applies.
 * The best (least bad) one wins; they do not stack.
 *
 * Reads the actor's classes, so it belongs to the actor's own prepare step — an Item's derived
 * data runs a cycle behind.
 */
export function repeatPenaltyPerUse(actor, item, fallback) {
  let penalty = fallback;
  let source = null;

  for (const softener of REPEAT_SOFTENERS) {
    if (!inScope(item, softener.scope)) continue;
    const levels = actor.itemTypes.class
      .filter(cls => cls.system.classKey === softener.classKey)
      .reduce((sum, cls) => sum + cls.system.levels, 0);
    if (levels >= softener.level && softener.penalty > penalty) {
      penalty = softener.penalty;
      source = softener.key;
    }
  }
  return { penalty, source };
}

/**
 * How many points closing a shortfall would cost, and what the result would become.
 * A character can never burn more than the score he still has.
 *
 * @param {number} result     the check total
 * @param {number} dc         the DC it fell short of
 * @param {number} available  the current Influence score
 */
export function burnToClose(result, dc, available) {
  const shortfall = Math.max(0, dc - result);
  const needed = Math.ceil(shortfall / BURN_MULTIPLIER);
  const points = Math.min(needed, Math.max(0, available));
  return {
    shortfall,
    needed,
    points,
    // Burning everything left may still not be enough; the card says so rather than pretending.
    enough: needed > 0 && points >= needed,
    result: result + points * BURN_MULTIPLIER
  };
}
