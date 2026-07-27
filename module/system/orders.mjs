/**
 * The order list (book pp. 186–199 and Appendix A).
 *
 * Mechanics live here; the printed name, effect and failure text live in `lang/*.json` under
 * `B5.Order.<key>.{name,effect,failure}`, so both languages read from the compendium-style
 * data rather than from hard-coded English.
 *
 * Fields:
 *  - `type`        offensive | defensive | tactical
 *  - `skill`       plain skill key, or `{skill, subtype}` for Operations/Technical
 *  - `dc`          a number, or "special" when the target number comes from the situation
 *                  (an opposed roll, the target's Stealth, an incoming barrage's attack roll)
 *  - `responseDc`  the harder DC when the order is held and used as a response
 *  - `arc`         which firing arc the order uses, where it matters
 *  - `limit`       "one" (once per round) or "multiple"
 *  - `soloOnly` / `capitalOnly`   restricted by craft class
 *  - `requires`    a craft feature that must be present (matched against craftFeature items)
 *  - `bannedIn`    combat environments where the order may not be issued
 *  - `movesBand`   how many range bands it moves, and in which direction — the one effect
 *                  worth applying automatically
 *  - `responseOnly` the order exists only as a response to another order
 */
export const ORDERS = {
  /* ── offensive ──────────────────────────────────────────── */
  fireAtWill:        { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 5,  arc: "one",  limit: "multiple" },
  broadsides:        { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 15, arc: "portStarboard", limit: "multiple" },
  concentrateFire:   { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 15, arc: "one",  limit: "multiple" },
  fighterScreen:     { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 15, responseDc: 20, arc: "special", limit: "one", bannedIn: ["surfaceVehicle"] },
  fireMainGun:       { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 20, arc: "fore", limit: "one", requires: "Lightning Cannon" },
  spray:             { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 25, arc: "all",  limit: "multiple" },
  targetBridge:      { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 25, arc: "one",  limit: "one" },
  targetEngines:     { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 20, arc: "one",  limit: "one" },
  targetCargo:       { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 20, arc: "one",  limit: "one" },
  targetLaunchBays:  { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 20, arc: "one",  limit: "one" },
  targetWeapons:     { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 20, arc: "one",  limit: "one" },
  blastOnLaunch:     { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 20, arc: "one",  limit: "one", responseOnly: true },
  opportunityFire:   { type: "offensive", skill: { skill: "operations", subtype: "gunnery" }, dc: 10, arc: "one",  limit: "multiple", responseOnly: true },

  /* ── defensive ──────────────────────────────────────────── */
  braceForImpact:    { type: "defensive", skill: { skill: "operations", subtype: "systems" },  dc: 10, limit: "one" },
  defensivePosition: { type: "defensive", skill: { skill: "operations", subtype: "piloting" }, dc: 15, responseDc: 20, limit: "one" },
  extremeMeasures:   { type: "defensive", skill: { skill: "operations", subtype: "piloting" }, dc: 20, responseDc: 25, limit: "multiple" },
  fireInterceptors:  { type: "defensive", skill: { skill: "operations", subtype: "gunnery" },  dc: "special", responseDc: "special", limit: "one", bannedIn: ["surfaceVehicle"] },
  shakeTheLock:      { type: "defensive", skill: { skill: "operations", subtype: "systems" },  dc: "special", limit: "multiple" },
  pivot:             { type: "defensive", skill: { skill: "operations", subtype: "piloting" }, dc: 15, responseDc: 20, limit: "one", requires: "Pivotal Thrusters", bannedIn: ["surfaceVehicle"] },
  returnToBase:      { type: "defensive", skill: "pilot", dc: 10, limit: "one", soloOnly: true },
  skindancing:       { type: "defensive", skill: "pilot", dc: 30, limit: "one", soloOnly: true, bannedIn: ["surfaceVehicle"] },

  /* ── tactical ───────────────────────────────────────────── */
  afterburners:      { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 10, limit: "one", requires: "Afterburners", movesBand: 2 },
  angleForEffect:    { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 20, limit: "one" },
  attainOrbit:       { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 10, limit: "one", bannedIn: ["surfaceVehicle", "spacecraft"] },
  closeForBattle:    { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 5,  responseDc: 10, limit: "one", movesBand: 1 },
  escortDefence:     { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 20, limit: "one" },
  systemsBackOnline: { type: "tactical", skill: { skill: "technical", subtype: "engineering" }, dc: 20, limit: "multiple" },
  grapple:           { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 15, limit: "multiple", requires: "Grapple" },
  hesInYourSix:      { type: "tactical", skill: "pilot", dc: "special", limit: "multiple", soloOnly: true },
  holdHerTogether:   { type: "tactical", skill: { skill: "technical", subtype: "engineering" }, dc: 15, limit: "multiple" },
  hover:             { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 15, limit: "one" },
  joinBattleGroup:   { type: "tactical", skill: "drive", dc: 15, limit: "one", soloOnly: true },
  joinFleet:         { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 10, limit: "one" },
  joinWing:          { type: "tactical", skill: "pilot", dc: 15, limit: "one", soloOnly: true },
  land:              { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 5,  limit: "one" },
  launchFighters:    { type: "tactical", skill: { skill: "operations", subtype: "systems" },  dc: 10, limit: "one" },
  lockWeapons:       { type: "tactical", skill: { skill: "operations", subtype: "sensors" },  dc: "special", limit: "multiple" },
  openJumpPoint:     { type: "tactical", skill: { skill: "operations", subtype: "systems" },  dc: 10, limit: "one", bannedIn: ["surfaceVehicle"] },
  pullBack:          { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 5,  responseDc: 10, limit: "one", movesBand: -1 },
  ramThem:           { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: "special", limit: "one" },
  reEntry:           { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 10, limit: "one", bannedIn: ["surfaceVehicle", "aircraft"] },
  routeControl:      { type: "tactical", skill: { skill: "technical", subtype: "electronics" }, dc: 25, limit: "one" },
  runSilent:         { type: "tactical", skill: { skill: "operations", subtype: "systems" },  dc: 15, limit: "one" },
  seizeInitiative:   { type: "tactical", skill: { skill: "knowledge", subtype: "tactics" },   dc: "special", limit: "multiple" },
  shadowJump:        { type: "tactical", skill: { skill: "operations", subtype: "systems" },  dc: 10, limit: "one", requires: "Shadow Jump", bannedIn: ["aircraft"] },
  takeOff:           { type: "tactical", skill: { skill: "operations", subtype: "piloting" }, dc: 5,  limit: "one" },
  targetingRun:      { type: "tactical", skill: "pilot", dc: 20, limit: "one", soloOnly: true, bannedIn: ["surfaceVehicle"] }
};

/** Which station rolls which skill (book p. 188). Falls back to the crew's Training bonus. */
export const SKILL_STATIONS = {
  "operations.gunnery":     ["gunner", "pilot"],
  "operations.piloting":    ["chiefPilot", "pilot"],
  "operations.sensors":     ["sensorOperator", "pilot"],
  "operations.systems":     ["systemsOperator", "pilot"],
  "technical.electronics":  ["technician"],
  "technical.engineering":  ["engineer"],
  "technical.mechanical":   ["mechanic"],
  "knowledge.tactics":      ["commander"],
  "pilot":                  ["pilot", "chiefPilot"],
  "drive":                  ["pilot", "chiefPilot"]
};

/** Orders per turn granted by the commander's feats (1 without Spacecraft Proficiency). */
export const ORDER_BUDGET_FEATS = {
  "legendary-commander": 5, "legendary-pilot": 5, "legendary-gropos": 5,
  "elite-commander": 4, "elite-pilot": 4, "elite-gropos": 4,
  "veteran-commander": 3, "veteran-pilot": 3, "veteran-gropos": 3,
  "spacecraft-proficiency": 2, "surface-vehicle-proficiency": 2
};

/** Executing an order drops the craft's Stealth by 5 (Run Silent, Run Dark excepted). */
export const STEALTH_LOSS_PER_ORDER = 5;

export const RANGE_BANDS = ["close", "medium", "long"];

/** `movesBand` is toward the centre when positive: long → medium → close. */
export function bandAfterMove(band, steps) {
  const index = RANGE_BANDS.indexOf(band);
  if (index < 0) return band;
  return RANGE_BANDS[Math.clamp(index - steps, 0, RANGE_BANDS.length - 1)];
}

/** Normalised `skill.subtype` key used by SKILL_STATIONS. */
export function skillKeyOf(order) {
  const s = order.skill;
  return typeof s === "string" ? s : `${s.skill}.${s.subtype}`;
}

/**
 * The orders a craft may issue right now: response-only orders are excluded from the normal
 * list, solo-only orders need a solo craft, and orders banned in this environment are dropped.
 */
export function availableOrders(craft, { asResponse = false } = {}) {
  const craftType = craft.system.details.craftType;
  const solo = isSoloCraft(craft);
  return Object.entries(ORDERS).filter(([, order]) => {
    if (order.responseOnly && !asResponse) return false;
    if (asResponse && !order.responseOnly && order.responseDc === undefined) return false;
    if (order.soloOnly && !solo) return false;
    if (order.bannedIn?.includes(craftType)) return false;
    return true;
  }).map(([key, order]) => ({ key, ...order }));
}

/** A solo craft is one with no crew stations beyond a pilot — fighters and shuttles. */
export function isSoloCraft(craft) {
  return (craft.system.crew.complement ?? 1) <= 1;
}
