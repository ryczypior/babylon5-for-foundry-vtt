import { B5 } from "../config.mjs";

/**
 * Feat prerequisite checking.
 *
 * The book gates feats on ability scores, skill ranks, BAB, other feats, character level,
 * P-Rating (both a floor and, for Resist Scan, a ceiling), race, Minbari caste and
 * "1st character level only". Everything else — "must have suffered a great injustice",
 * "Games Master's permission" — is narrative and is reported as a note for the GM rather
 * than as a failure, because no amount of data can decide it.
 *
 * Nothing here blocks anything: a GM may hand out a feat that does not qualify. The result
 * is advisory and is what the sheet renders.
 */

/** @typedef {{key: string, label: string, met: boolean|null, detail: string}} PrereqResult */

/**
 * @param {Actor} actor
 * @param {Item} feat
 * @returns {{met: boolean, unmet: PrereqResult[], notes: PrereqResult[], results: PrereqResult[]}}
 */
export function checkFeatPrerequisites(actor, feat) {
  const results = [];
  const p = feat.system.prerequisites ?? {};
  const sys = actor.system;

  /** @param {boolean|null} met — null means "cannot be decided automatically" */
  const push = (key, label, met, detail = "") => results.push({ key, label, met, detail });

  // ── ability scores ──────────────────────────────────────────
  for (const [ability, required] of Object.entries(p.abilities ?? {})) {
    const value = sys.abilities?.[ability]?.value ?? 0;
    push(`ability.${ability}`,
      `${game.i18n.localize(B5.abilities[ability] ?? ability)} ${required}`,
      value >= required, `${value}/${required}`);
  }

  // ── skill ranks ─────────────────────────────────────────────
  for (const [skill, required] of Object.entries(p.skills ?? {})) {
    const { ranks, label } = resolveSkillRanks(actor, skill);
    push(`skill.${skill}`, `${label} ${required}`, ranks >= required, `${ranks}/${required}`);
  }

  // ── base attack bonus ───────────────────────────────────────
  if (p.bab) {
    const bab = sys.attributes?.bab?.value ?? 0;
    push("bab", `${game.i18n.localize("B5.Field.bab")} +${p.bab}`, bab >= p.bab, `+${bab}/+${p.bab}`);
  }

  // ── character level ─────────────────────────────────────────
  if (p.characterLevel) {
    const level = sys.progression?.level ?? 0;
    push("level", `${game.i18n.localize("B5.Field.characterLevel")} ${p.characterLevel}`,
      level >= p.characterLevel, `${level}/${p.characterLevel}`);
  }

  // ── other feats ─────────────────────────────────────────────
  for (const required of p.feats ?? []) {
    const match = findFeat(actor, required, feat);
    push(`feat.${required}`, required, !!match,
      match ? match.name : game.i18n.localize("B5.Prereq.missing"));
  }

  // ── P-Rating floor and ceiling ──────────────────────────────
  const pRating = sys.telepathy?.pRating?.value ?? 0;
  if (p.pRatingMin) {
    push("pRatingMin", `P${p.pRatingMin}+`, pRating >= p.pRatingMin, `P${pRating}`);
  }
  if (p.pRatingMax !== null && p.pRatingMax !== undefined) {
    push("pRatingMax", game.i18n.format("B5.Prereq.pRatingMax", { value: p.pRatingMax }),
      pRating <= p.pRatingMax, `P${pRating}`);
  }
  // Every telepathy feat needs an actual P-Rating, whether or not one is written down.
  if (feat.system.category === "telepathy" && !p.pRatingMin) {
    push("pRatingCategory", "P1+", pRating >= 1, `P${pRating}`);
  }

  // ── race and caste ──────────────────────────────────────────
  if (feat.system.category === "racial" && feat.system.race) {
    const race = actor.itemTypes.race[0];
    const raceKey = race?.system?.raceKey ?? "";
    const key = `B5.Race.${feat.system.race}`;
    const label = game.i18n.has(key) ? game.i18n.localize(key) : feat.system.race;
    push("race", label, raceKey === feat.system.race,
      race ? race.name : game.i18n.localize("B5.Prereq.noRace"));
  }
  if (p.caste) {
    const caste = actor.itemTypes.race[0]?.system?.caste ?? sys.details?.minbariCaste ?? "";
    push("caste", game.i18n.format("B5.Prereq.caste", { caste: p.caste }),
      caste === p.caste, caste || "—");
  }

  // ── 1st level only ──────────────────────────────────────────
  if (p.firstLevelOnly) {
    const level = sys.progression?.level ?? 1;
    push("firstLevelOnly", game.i18n.localize("B5.Field.firstLevelOnly"), level <= 1, `${level}`);
  }

  // ── repeat rules ────────────────────────────────────────────
  const duplicate = actor.itemTypes.feat.find(f => f !== feat
    && sameFeat(f, feat)
    && (f.system.choice?.value ?? "") === (feat.system.choice?.value ?? ""));
  if (duplicate && !feat.system.repeatable?.allowed) {
    push("duplicate", game.i18n.localize("B5.Prereq.duplicate"), false, "");
  }
  if (feat.system.requiresChoice && !feat.system.choice?.value) {
    push("choice", game.i18n.localize("B5.Prereq.choiceMissing"), false, "");
  }

  // ── narrative gates the GM has to rule on ───────────────────
  if (p.other) push("other", p.other, null, "");

  const unmet = results.filter(r => r.met === false);
  const notes = results.filter(r => r.met === null);
  return { met: unmet.length === 0, unmet, notes, results };
}

/* -------------------------------------------- */

/**
 * Ranks in a prerequisite skill. A plain key reads the fixed field; a subtyped key reads the
 * best matching skill Item — `technical (electronics)` wants that subtype, bare `profession`
 * accepts the highest-ranked Profession the character has.
 */
function resolveSkillRanks(actor, entry) {
  const [rawBase, rawSubtype] = String(entry).split(/[()]/).map(s => s?.trim());
  // Match case-insensitively against the real skill keys: a prerequisite may be written
  // "computerUse", "Computer Use" or "computer use" and must resolve to `computerUse`.
  const key = resolveSkillKey(rawBase);
  const plain = actor.system.skills?.[key];
  if (plain) return { ranks: plain.ranks, label: game.i18n.localize(`B5.Skill.${key}`) };

  if (key in B5.subtypedSkills) {
    const wanted = rawSubtype ? normalise(rawSubtype) : null;
    // e.g. "Operations (gunnery) 8 ranks" wants that one subtype; a bare "Profession 13 ranks"
    // accepts the best Profession the character has.
    const candidates = actor.itemTypes.skill.filter(i => i.system.skillKey === key
      && (!wanted || normalise(i.system.subtype) === wanted));
    const ranks = candidates.reduce((max, i) => Math.max(max, i.system.ranks), 0);
    const label = rawSubtype
      ? `${game.i18n.localize(`B5.Skill.${key}`)} (${rawSubtype})`
      : game.i18n.localize(`B5.Skill.${key}`);
    return { ranks, label };
  }

  return { ranks: 0, label: rawBase ?? String(entry) };
}

/**
 * Find a prerequisite feat on the actor. When both the prerequisite holder and the candidate
 * name a choice, the choices must match — that is the rulebook's "Weapon Focus with the same
 * weapon" for Weapon Specialisation and Improved Critical.
 */
function findFeat(actor, requiredName, dependent) {
  const wanted = normalise(requiredName);
  const dependentChoice = normalise(dependent?.system?.choice?.value ?? "");
  const candidates = actor.itemTypes.feat.filter(f => f !== dependent
    && (normalise(f.name) === wanted || normalise(f.system.internalId) === wanted));
  if (!candidates.length) return null;
  if (!dependentChoice) return candidates[0];
  return candidates.find(f => normalise(f.system.choice?.value ?? "") === dependentChoice)
    ?? candidates.find(f => !f.system.choice?.value)
    ?? null;
}

/** Map any spelling of a skill name onto its `B5.skills` / `B5.subtypedSkills` key. */
function resolveSkillKey(name) {
  const cleaned = normalise(name);
  for (const key of [...Object.keys(B5.skills), ...Object.keys(B5.subtypedSkills)]) {
    if (normalise(key) === cleaned) return key;
  }
  return cleaned;
}

function sameFeat(a, b) {
  return normalise(a.system.internalId || a.name) === normalise(b.system.internalId || b.name);
}

function normalise(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
