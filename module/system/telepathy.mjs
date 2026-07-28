/**
 * Telepathy (book pp. 116–131).
 *
 * The constants and the pure arithmetic live here; the dialog, the rolls and the chat card live
 * in `module/tests/telepathy-tests.mjs` — the same split as `orders.mjs` / `order-tests.mjs`
 * and `gunnery.mjs` / `attack-tests.mjs`.
 *
 * Two things about this subsystem are easy to get wrong and are worth stating up front:
 *
 *  - **P-Rating is raw power, the Telepathy skill is control.** They are separate numbers and
 *    neither substitutes for the other: the P-Rating decides *whether* an ability is usable at
 *    all, the skill check decides *how well* it goes.
 *  - **There is no fatigue track.** Reaching above your P-Rating costs nonlethal damage on the
 *    ordinary hit-point track, so `attributes.hp.nonlethal` *is* the telepathic exhaustion meter.
 */

/** The five Disciplines (book p. 118). */
export const DISCIPLINES = ["scanning", "blocking", "communication", "biokinetics", "sensing"];

/** Ability range bands, narrowest first. */
export const RANGE_BANDS = ["self", "touch", "close", "medium", "long"];

/**
 * Touching the subject is worth a bonus to the Telepathy check, and the bonus is larger the
 * more range the ability could have covered (book p. 118). Gloves halve it, and a Touch ability
 * instead takes a flat −2 for them.
 */
export const TOUCH_BONUS = { self: 0, touch: 0, close: 2, medium: 4, long: 6 };

export const MAX_MENTAL_EFFORT_DICE = 6;
export const MENTAL_EFFORT_DIE = 4;
export const MENTAL_EFFORT_DIE_FOCUSED = 3;      // Discipline Focus, telepath class

/** Traits are not activated abilities; they roll flat against these DCs (book p. 117). */
export const TRAIT_DCS = { accidentalScan: 16, dangerSense: 20 };
export const DANGER_SENSE_P_RATING = 7;

export const CROSS_SPECIES_PENALTY = -4;         // removed by Adaptive Mind
export const GLOVES_TOUCH_PENALTY = -2;
export const MULTI_SUBJECT_CHECK_PENALTY = -2;   // cumulative, per subject beyond the first
export const MULTI_SUBJECT_POWER = 1;            // per subject beyond the first
export const SECOND_ABILITY_DC = 4;              // Synergist halves it
export const SECOND_ABILITY_DC_SYNERGIST = 2;
export const ABILITY_FOCUS_BONUS = 2;
export const SAVE_SUCCESS_NONLETHAL = 1;         // what a resisted ability costs the telepath

/** Feats this subsystem reads directly, by `internalId`. */
export const TELEPATHY_FEATS = {
  adaptiveMind: "adaptive-mind",
  abilityFocus: "ability-focus",
  synergist: "synergist",
  meditation: "meditation",
  combatTelepath: "combat-telepath",
  mentalFortress: "mental-fortress",
  mindshredder: "mindshredder",
  latentTelepath: "latent-telepath"
};

export const MENTAL_FORTRESS_DR = 2;

/* -------------------------------------------- */
/*  Reach                                       */
/* -------------------------------------------- */

/**
 * What it would take to use this ability right now.
 *
 * `free` — the P-Rating already covers the Power.
 * `effort` — mental effort can bridge the gap, at `dice` dice of nonlethal damage.
 * `outOfReach` — the gap is more than six, so the ability can never be used at this P-Rating.
 *
 * @param {number} effectiveP  the telepath's current P-Rating, suppression and boosts included
 * @param {number} power       the ability's required Power, extra subjects already added
 */
export function reach(effectiveP, power) {
  const gap = Math.max(0, power - effectiveP);
  return {
    gap,
    free: gap === 0,
    dice: gap,
    outOfReach: gap > MAX_MENTAL_EFFORT_DICE
  };
}

/** The Power an ability actually demands: +1 for every subject beyond the first. */
export function requiredPower(ability, subjects = 1) {
  return ability.system.power + MULTI_SUBJECT_POWER * Math.max(0, subjects - 1);
}

/** Discipline Focus in the ability's own Discipline drops the mental-effort die to d3. */
export function mentalEffortDie(actor, discipline) {
  return (actor.system.telepathy.disciplineFocus ?? []).includes(discipline)
    ? MENTAL_EFFORT_DIE_FOCUSED
    : MENTAL_EFFORT_DIE;
}

/* -------------------------------------------- */
/*  The check                                   */
/* -------------------------------------------- */

/**
 * Assemble the Telepathy check's modifiers as a list of labelled parts, so the chat card can
 * show the arithmetic instead of a bare total.
 *
 * @returns {Array<{key: string, value: number}>} only the parts that are non-zero
 */
export function checkParts(actor, ability, {
  touching = false, subjects = 1, crossSpecies = false, misc = 0, isTrait = false
} = {}) {
  const tel = actor.system.telepathy;
  const parts = [{ key: "skill", value: actor.system.skills?.telepathy?.total ?? 0 }];

  // A raised mind shield costs the telepath his own P-Rating on every check — except the two
  // traits, which run underneath it.
  if (!isTrait && tel.mindShield.active) {
    parts.push({ key: "mindShield", value: tel.mindShield.checkPenalty });
  }

  if (!isTrait && ability) {
    if (touching) {
      const bonus = TOUCH_BONUS[ability.system.range?.band] ?? 0;
      // Gloves halve the touch bonus, and cost a flat −2 on an ability that is Touch anyway.
      const gloved = tel.gloves ? Math.floor(bonus / 2) : bonus;
      if (gloved) parts.push({ key: "touch", value: gloved });
    }
    if (tel.gloves && (ability.system.range?.band === "touch" || touching)) {
      parts.push({ key: "gloves", value: GLOVES_TOUCH_PENALTY });
    }
    if ((tel.abilityFocus ?? []).includes(ability.system.discipline)) {
      parts.push({ key: "abilityFocus", value: ABILITY_FOCUS_BONUS });
    }
    const extra = Math.max(0, subjects - 1);
    if (extra) parts.push({ key: "subjects", value: MULTI_SUBJECT_CHECK_PENALTY * extra });
  }

  if (crossSpecies && !tel.adaptiveMind) {
    parts.push({ key: "crossSpecies", value: CROSS_SPECIES_PENALTY });
  }
  if (tel.jammedBy) parts.push({ key: "jammed", value: -tel.jammedBy });
  if (misc) parts.push({ key: "misc", value: misc });

  return parts.filter(part => part.value !== 0 || part.key === "skill");
}

export function partsTotal(parts) {
  return parts.reduce((sum, part) => sum + part.value, 0);
}

/**
 * The DC of the Telepathy check: the ability's own DC, the chosen variation (absolute DCs
 * replace it, relative ones add to it), and the penalty for holding a second ability.
 */
export function checkDc(actor, ability, { variation = null, secondAbility = false } = {}) {
  const parts = [];
  let dc = ability.system.dc;

  if (variation) {
    if (variation.dcMode === "absolute") dc = variation.dc;
    else dc += variation.dc;
    parts.push({ key: "variation", value: variation.dc, mode: variation.dcMode, name: variation.name });
  }
  if (secondAbility) {
    const bump = actor.system.telepathy.synergist ? SECOND_ABILITY_DC_SYNERGIST : SECOND_ABILITY_DC;
    dc += bump;
    parts.push({ key: "secondAbility", value: bump });
  }
  return { dc, parts };
}

/** Concentration to hold an ability is the table's DC plus the ability's Power (book p. 119). */
export function concentrationDc(baseDc, ability, { secondAbility = false, synergist = false } = {}) {
  const bump = secondAbility ? (synergist ? SECOND_ABILITY_DC_SYNERGIST : SECOND_ABILITY_DC) : 0;
  return baseDc + ability.system.power + bump;
}
