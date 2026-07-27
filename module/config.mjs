/**
 * Static configuration for the Babylon 5 2nd Edition system.
 * Everything here is rules data that never changes at runtime.
 */
export const B5 = {};

B5.SYSTEM_ID = "babylon5";

/* -------------------------------------------- */
/*  Abilities                                   */
/* -------------------------------------------- */

B5.abilities = {
  str: "B5.Ability.str.long",
  dex: "B5.Ability.dex.long",
  con: "B5.Ability.con.long",
  int: "B5.Ability.int.long",
  wis: "B5.Ability.wis.long",
  cha: "B5.Ability.cha.long"
};

B5.abilityAbbreviations = {
  str: "B5.Ability.str.abbr",
  dex: "B5.Ability.dex.abbr",
  con: "B5.Ability.con.abbr",
  int: "B5.Ability.int.abbr",
  wis: "B5.Ability.wis.abbr",
  cha: "B5.Ability.cha.abbr"
};

/* -------------------------------------------- */
/*  Progression tracks (book p. 254)            */
/* -------------------------------------------- */

/**
 * Every class — core and prestige — rates each of BAB, the three saves and Defence as
 * good / average / poor. Index 0 is unused so that `track[level]` reads naturally.
 */
B5.progressionTracks = {
  bab: {
    good:    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    average: [0, 0, 1, 2, 3, 3, 4, 5, 6, 6, 7],
    poor:    [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]
  },
  save: {
    good:    [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7],
    average: [0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5],
    poor:    [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3]
  },
  defence: {
    good:    [0, 1, 2, 2, 3, 4, 4, 5, 6, 6, 7],
    average: [0, 0, 1, 1, 2, 3, 3, 4, 5, 5, 6],
    poor:    [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]
  }
};

B5.trackRatings = ["good", "average", "poor"];

/** Class levels are capped at 10 — beyond that a character multiclasses or takes a prestige class. */
B5.MAX_CLASS_LEVEL = 10;
B5.MAX_CHARACTER_LEVEL = 20;

/* -------------------------------------------- */
/*  Core classes (book pp. 34–57)               */
/* -------------------------------------------- */

/**
 * Reference data used to seed `class` Items. The Item itself carries the working copy,
 * so a GM may edit or add classes without touching this table.
 */
B5.classes = {
  agent:     { initialHp: 6, additionalHp: 2, skillPoints: 8, bab: "average", fort: "poor",    ref: "good",    will: "poor", defence: "average", credits: "3d6*100" },
  diplomat:  { initialHp: 5, additionalHp: 1, skillPoints: 6, bab: "poor",    fort: "poor",    ref: "poor",    will: "good", defence: "poor",    credits: "4d6*100" },
  lurker:    { initialHp: 6, additionalHp: 2, skillPoints: 6, bab: "average", fort: "good",    ref: "poor",    will: "poor", defence: "average", credits: "1d6*100" },
  officer:   { initialHp: 6, additionalHp: 2, skillPoints: 4, bab: "good",    fort: "poor",    ref: "poor",    will: "good", defence: "good",    credits: "3d6*100", variants: ["fleet", "groundForces", "pilot"] },
  ranger:    { initialHp: 7, additionalHp: 2, skillPoints: 6, bab: "good",    fort: "average", ref: "average", will: "average", defence: "good", credits: "2d6*100" },
  scientist: { initialHp: 5, additionalHp: 1, skillPoints: 8, bab: "poor",    fort: "poor",    ref: "poor",    will: "good", defence: "poor",    credits: "4d6*100" },
  soldier:   { initialHp: 8, additionalHp: 3, skillPoints: 4, bab: "good",    fort: "good",    ref: "poor",    will: "poor", defence: "good",    credits: "2d6*100" },
  telepath:  { initialHp: 6, additionalHp: 2, skillPoints: 4, bab: "poor",    fort: "poor",    ref: "poor",    will: "good", defence: "poor",    credits: "3d6*100" },
  trader:    { initialHp: 5, additionalHp: 2, skillPoints: 6, bab: "average", fort: "poor",    ref: "poor",    will: "good", defence: "average", credits: "6d6*100" },
  workerBlue:      { initialHp: 5, additionalHp: 1, skillPoints: 6, bab: "poor", fort: "good", ref: "poor", will: "poor", defence: "poor", credits: "2d6*100" },
  workerPerforming:{ initialHp: 5, additionalHp: 1, skillPoints: 6, bab: "poor", fort: "poor", ref: "good", will: "poor", defence: "poor", credits: "3d6*100" },
  workerWhite:     { initialHp: 5, additionalHp: 1, skillPoints: 6, bab: "poor", fort: "poor", ref: "poor", will: "good", defence: "poor", credits: "4d6*100" }
};

/* -------------------------------------------- */
/*  Races (book pp. 22–33)                      */
/* -------------------------------------------- */

B5.races = {
  abbai:    { abilities: { str: -2, wis: 2 }, size: "medium", speed: 30, swimSpeed: 40, canBeTelepath: true },
  brakiri:  { abilities: {},                  size: "medium", speed: 30, canBeTelepath: true, darkvision: 60 },
  centauri: { abilities: { wis: -2, cha: 2 }, size: "medium", speed: 30, canBeTelepath: true },
  drazi:    { abilities: { str: 2, int: -2 }, size: "medium", speed: 30, canBeTelepath: true, naturalDr: 1 },
  human:    { abilities: {},                  size: "medium", speed: 30, canBeTelepath: true, bonusFeats: 1, bonusSkillPointsFirst: 4, bonusSkillPointsPerLevel: 1 },
  minbari:  { abilities: { str: 2, cha: -2 }, size: "medium", speed: 30, canBeTelepath: true, castes: ["religious", "warrior", "worker"] },
  narn:     { abilities: { con: 2, cha: -2 }, size: "medium", speed: 30, canBeTelepath: false },
  pakmara:  { abilities: { dex: -2, con: 4, cha: -2 }, size: "medium", speed: 20, canBeTelepath: true }
};

B5.minbariCastes = ["religious", "warrior", "worker"];

/* -------------------------------------------- */
/*  Size                                        */
/* -------------------------------------------- */

/** Size modifier applies to DV and to attack rolls; the grapple modifier is the inverse scale. */
B5.sizes = {
  fine:       { mod:  8, grapple: -16 },
  diminutive: { mod:  4, grapple: -12 },
  tiny:       { mod:  2, grapple:  -8 },
  small:      { mod:  1, grapple:  -4 },
  medium:     { mod:  0, grapple:   0 },
  large:      { mod: -1, grapple:   4 },
  huge:       { mod: -2, grapple:   8 },
  gargantuan: { mod: -4, grapple:  12 },
  colossal:   { mod: -8, grapple:  16 }
};

/* -------------------------------------------- */
/*  Skills (book pp. 58–87)                     */
/* -------------------------------------------- */

/**
 * The 19 plain skills live as fixed fields on the actor. The four subtyped skills
 * (see `B5.subtypedSkills`) are embedded Items instead, because a character may hold
 * several instances of each.
 */
B5.skills = {
  acrobatics:  { ability: "dex", untrained: true,  acp: true },
  appraise:    { ability: "int", untrained: true,  acp: false },
  athletics:   { ability: "str", untrained: true,  acp: true },
  bluff:       { ability: "cha", untrained: true,  acp: false },
  computerUse: { ability: "int", untrained: true,  acp: false },
  concentration: { ability: "con", untrained: true, acp: false },
  diplomacy:   { ability: "cha", untrained: true,  acp: false },
  drive:       { ability: "dex", untrained: true,  acp: true },
  intimidate:  { ability: "cha", untrained: true,  acp: false },
  intrigue:    { ability: "cha", untrained: true,  acp: false },
  investigate: { ability: "int", untrained: true,  acp: false },
  linguistics: { ability: "int", untrained: true,  acp: false },
  medical:     { ability: "int", untrained: false, acp: false },
  notice:      { ability: "wis", untrained: true,  acp: false },
  pilot:       { ability: "dex", untrained: true,  acp: true },
  senseMotive: { ability: "wis", untrained: true,  acp: false },
  stealth:     { ability: "dex", untrained: true,  acp: true },
  subterfuge:  { ability: "dex", untrained: true,  acp: false },
  telepathy:   { ability: "cha", untrained: false, acp: false }
};

/** Skills that take a subtype and are therefore modelled as Items. */
B5.subtypedSkills = {
  knowledge:  { ability: "int", untrained: false, acp: false, untrainedException: "ownCulture" },
  operations: { ability: "int", untrained: false, acp: false },
  profession: { ability: "wis", untrained: false, acp: false, abilityByGroup: { whiteCollar: "int", blueCollar: "wis", performing: "cha" } },
  technical:  { ability: "int", untrained: false, acp: false }
};

B5.operationsSubtypes = ["driving", "gunnery", "piloting", "sensors", "systems"];
B5.technicalSubtypes = ["electronics", "engineering", "mechanical"];
B5.professionGroups = ["whiteCollar", "blueCollar", "performing"];

/** Max ranks: class skills get level + 3; cross-class gets half that. */
B5.maxRanks = (characterLevel, isClassSkill) =>
  isClassSkill ? characterLevel + 3 : (characterLevel + 3) / 2;

/* -------------------------------------------- */
/*  Attacks & combat                            */
/* -------------------------------------------- */

/**
 * The printed sheet carries four attack lines plus feint/resist feint, each using a
 * different ability — this is not stock d20 and must not be collapsed into one bonus.
 */
B5.attackLines = {
  closeCombat:    { ability: "str" },
  personalRanged: { ability: "dex" },
  spaceGunnery:   { ability: "int" },
  spaceSoloCraft: { ability: "dex" },
  feint:          { ability: "dex" },
  resistFeint:    { ability: "wis" }
};

B5.saves = {
  fort: { ability: "con" },
  ref:  { ability: "dex" },
  will: { ability: "wis" }
};

B5.damageTypes = ["bludgeoning", "piercing", "slashing", "energy", "projectile", "special"];

B5.weaponFeatures = ["ap", "automatic", "doubleWeapon", "light", "nonlethal", "rapidFire"];

B5.weaponCategories = ["closeCombat", "exotic", "grenade", "heavy", "pistol", "rifle"];

B5.legality = ["unrestricted", "restricted", "illegal"];

/** Conditions carried as flags on the actor; the numeric payload is applied by the sheet. */
B5.conditions = [
  "blinded", "dazed", "dazzled", "deafened", "disabled", "dying", "entangled",
  "exhausted", "fatigued", "flatFooted", "frightened", "grappled", "helpless",
  "nauseated", "panicked", "paralysed", "pinned", "prone", "shaken", "sickened",
  "staggered", "stunned", "unconscious"
];

/* -------------------------------------------- */
/*  Influence (book pp. 106–119)                */
/* -------------------------------------------- */

/** Influence checks roll 2d6 — not d20. The score is per faction and never refreshes. */
B5.INFLUENCE_DICE = "2d6";
B5.INFLUENCE_REPEAT_PENALTY = -4;
B5.INFLUENCE_BURN_MULTIPLIER = 2;
B5.INFLUENCE_SOCIAL_DIVISOR = 5;

B5.influenceCategories = ["political", "military", "criminal", "corporate", "media", "religious", "local", "social"];

/* -------------------------------------------- */
/*  Telepathy (book pp. 120–131)                */
/* -------------------------------------------- */

B5.MAX_MENTAL_EFFORT_DICE = 6;
B5.MENTAL_EFFORT_DIE = "1d4";
B5.MENTAL_EFFORT_DIE_FOCUSED = "1d3";
B5.telepathyDisciplines = ["scan", "manipulation", "communication", "perception", "assault"];

/* -------------------------------------------- */
/*  Craft (book pp. 180–233)                    */
/* -------------------------------------------- */

B5.craftTypes = ["spacecraft", "aircraft", "surfaceVehicle"];

B5.craftArcs = ["fore", "aft", "port", "starboard", "turret"];

/** Movement is abstracted into three range bands (book p. 186). */
B5.craftRangeBands = ["close", "medium", "long"];

/** Structural spaces are the craft's damage track — each point of damage destroys one space. */
B5.craftSpaces = ["cargo", "control", "crew", "engine", "hangar", "weapons"];

B5.craftRoles = ["commander", "pilot", "chiefPilot", "sensorOperator", "gunner", "systemsOperator", "technician", "engineer", "mechanic", "uninvolved"];

B5.orderTypes = ["offensive", "defensive", "tactical", "response"];

B5.crewGrades = ["green", "trained", "veteran", "elite"];

/* -------------------------------------------- */
/*  Item type groupings (sheet filtering)       */
/* -------------------------------------------- */

B5.physicalItemTypes = ["weapon", "armour", "ammunition", "gear", "weaponAccessory"];
B5.characterItemTypes = ["class", "race", "skill", "feat", "influence", "telepathicAbility", ...B5.physicalItemTypes];
B5.craftItemTypes = ["craftWeapon", "craftFeature"];
