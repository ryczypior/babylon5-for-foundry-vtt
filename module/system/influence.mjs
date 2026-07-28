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

/** Aiding another's Influence check: the same kind of check against a flat DC for +2. */
export const AID_DC = 10;
export const AID_BONUS = 2;

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
