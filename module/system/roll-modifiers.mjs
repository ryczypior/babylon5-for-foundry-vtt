/**
 * The situational side of a roll (book pp. 168–172 for combat, p. 107 for Influence).
 *
 * Two different things live here and they are deliberately kept apart:
 *
 *  - **Conditions** the character is already carrying. These are ticked on the sheet, so the
 *    engine knows about them and pre-checks them in the dialog. Only the **unconditional** ones
 *    appear — Shaken's flat −2 does, Blinded's "−4 on most Strength and Dexterity based skill
 *    checks" does not, because whether it applies depends on the skill. The conditional ones are
 *    offered as presets instead, unchecked, the same stance the race and feat bonuses take.
 *  - **Presets** for the situation, which the engine cannot know: flanking, cover, aid another,
 *    firing into a melee. These are always offered unchecked.
 */

/**
 * What a tracked condition costs, by roll kind. Kinds: `attack`, `save`, `skill`, `initiative`.
 * Anything absent from a condition's entry is unaffected.
 */
export const CONDITION_MODIFIERS = {
  shaken:     { attack: -2, save: -2, skill: -2 },
  frightened: { attack: -2, save: -2, skill: -2 },
  panicked:   { save: -2, skill: -2 },        // a panicked character cannot attack at all
  sickened:   { attack: -2, save: -2, skill: -2 },
  dazzled:    { attack: -1 },
  entangled:  { attack: -2 },
  deafened:   { initiative: -4 }
};

/**
 * Situational modifiers worth one click, from the printed tables. `kinds` lists the roll kinds
 * a preset is offered for; `lines` narrows an attack preset to particular attack lines, because
 * flanking is close combat only and firing into a melee is ranged only.
 */
export const PRESETS = [
  /* ── attacks ─────────────────────────────────────────────── */
  { key: "flanking",        value: 2,   kinds: ["attack"], lines: ["closeCombat"] },
  { key: "charge",          value: 2,   kinds: ["attack"], lines: ["closeCombat"] },
  { key: "higherGround",    value: 1,   kinds: ["attack"], lines: ["closeCombat"] },
  { key: "attackerProne",   value: -4,  kinds: ["attack"], lines: ["closeCombat"] },
  { key: "attackerProneRanged", value: -2, kinds: ["attack"], lines: ["personalRanged"] },
  { key: "pointBlank",      value: 1,   kinds: ["attack"], lines: ["personalRanged"] },
  { key: "runningDefender", value: -2,  kinds: ["attack"], lines: ["personalRanged"] },
  { key: "intoMelee",       value: -4,  kinds: ["attack"], lines: ["personalRanged"] },
  { key: "threatened",      value: -4,  kinds: ["attack"], lines: ["personalRanged"] },
  { key: "invisible",       value: 2,   kinds: ["attack"], lines: ["closeCombat", "personalRanged"] },
  { key: "fightingDefensively", value: -4, kinds: ["attack"], lines: ["closeCombat", "personalRanged"] },
  { key: "wrongDamageType", value: -4,  kinds: ["attack"], lines: ["closeCombat", "personalRanged"] },
  { key: "squeezing",       value: -4,  kinds: ["attack"], lines: ["closeCombat", "personalRanged"] },

  /* ── skills ──────────────────────────────────────────────── */
  { key: "aidAnother",      value: 2,   kinds: ["skill", "attack"] },
  { key: "favourable",      value: 2,   kinds: ["skill"] },
  { key: "unfavourable",    value: -2,  kinds: ["skill"] },
  { key: "blindedSkill",    value: -4,  kinds: ["skill"] },
  { key: "fascinated",      value: -4,  kinds: ["skill"] },

  /* ── saves ───────────────────────────────────────────────── */
  { key: "cover",           value: 2,   kinds: ["save"], saves: ["ref"] },
  { key: "improvedCover",   value: 4,   kinds: ["save"], saves: ["ref"] },
  { key: "poorCover",       value: 1,   kinds: ["save"], saves: ["ref"] },

  /* ── Influence (book p. 107); the repeat penalty is already on the Item ── */
  { key: "unusualRange",    value: -2,  kinds: ["influence"] },
  { key: "extremeRange",    value: -5,  kinds: ["influence"] },
  { key: "withinReach",     value: -10, kinds: ["influence"] },
  { key: "contactAiding",   value: 2,   kinds: ["influence"] },
  { key: "devotedFriend",   value: 4,   kinds: ["influence"] },
  { key: "influenceAid",    value: 2,   kinds: ["influence"] }
];

/**
 * The conditions this actor is carrying that unconditionally affect this kind of roll.
 * They label themselves off `B5.Condition.*`, which the sheet already translates.
 * @returns {Array<{key: string, value: number, labelKey: string}>}
 */
export function conditionModifiers(actor, kind) {
  const conditions = actor.system?.conditions ?? {};
  return Object.entries(CONDITION_MODIFIERS)
    .filter(([key, effects]) => conditions[key] && effects[kind] !== undefined)
    .map(([key, effects]) => ({ key, value: effects[kind], labelKey: `B5.Condition.${key}` }));
}

/** The presets offered for this roll, narrowed by attack line or save where that matters. */
export function presetsFor(kind, subtype = null) {
  return PRESETS.filter(preset => {
    if (!preset.kinds.includes(kind)) return false;
    if (preset.lines && !preset.lines.includes(subtype)) return false;
    if (preset.saves && !preset.saves.includes(subtype)) return false;
    return true;
  }).map(preset => ({ ...preset, labelKey: `B5.Modifier.${preset.key}` }));
}

export function partsTotal(parts) {
  return parts.reduce((sum, part) => sum + part.value, 0);
}
