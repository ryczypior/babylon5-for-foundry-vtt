/**
 * Craft weapon fire (book pp. 193–197).
 *
 * The tables and the pure arithmetic live here; the dialog, the rolls and the chat cards live in
 * `module/tests/attack-tests.mjs`, the same split as `orders.mjs` / `order-tests.mjs`.
 *
 * The pipeline the rules describe, in order:
 *
 *   one attack roll per weapon (Rapid Fire X rolls X times at −5, a linked mount rolls once)
 *   → Total Offence = highest hit + half of every other hit
 *   → interceptors and Active Chaff
 *   → Adaptive Armour (÷4) or Bio-Adaptive Shielding (÷2)
 *   → − Armour = damage, one point per structural space
 *   → 2d6 location with the −1 cascade, d10 for the weapon arc, 12 = a lost feature
 *   → impairment check per partly-destroyed area
 *   → Beam armour damage last
 */

/** Random Craft Damage, 2d6. The cascade subtracts 1 and re-reads this table. */
export const DAMAGE_LOCATIONS = {
  2: "engine",  3: "control", 4: "engine", 5: "control", 6: "crew",   7: "cargo",
  8: "hangar",  9: "weapons", 10: "cargo", 11: "weapons", 12: "special"
};

/** Weaponry Damage Location, d10 — which arc a weapons hit lands in. */
export const WEAPON_ARC_LOCATIONS = {
  1: "fore", 2: "fore", 3: "port", 4: "port", 5: "starboard",
  6: "starboard", 7: "aft", 8: "aft", 9: "turret", 10: "turret"
};

/**
 * The check that resists impairment when an area loses some but not all of its spaces,
 * DC 25, +1 for every ten spaces of that type still remaining.
 */
export const IMPAIRMENT_CHECKS = {
  engine:  { skill: "technical", subtype: "engineering" },
  control: { skill: "technical", subtype: "electronics" },
  crew:    { skill: "technical", subtype: "engineering" },
  cargo:   { skill: "technical", subtype: "mechanical" },
  hangar:  { skill: "technical", subtype: "mechanical" },
  weapons: { skill: "technical", subtype: "electronics" }
};

export const IMPAIRMENT_DC = 25;

/**
 * Which range bands a weapon may fire in. The book only prints Close and Long weapons against
 * a Close and a Long band ("Close weapons at close range only, Long weapons at close or long");
 * the middle band is this system's own, so a Long weapon covers it and a Medium weapon reaches
 * one band out. Nothing fires at sensor range, which is why no band beyond `long` exists.
 */
export const WEAPON_RANGE_BANDS = {
  close:  ["close"],
  medium: ["close", "medium"],
  long:   ["close", "medium", "long"]
};

/** Rapid Fire makes several attack rolls, each at this penalty. */
export const RAPID_FIRE_PENALTY = -5;

/* -------------------------------------------- */
/*  Weapon qualities                            */
/* -------------------------------------------- */

const QUALITY_PATTERNS = [
  ["beam",         /^beam\s+(\d+d\d+)$/i,          m => m[1]],
  ["rapidFire",    /^rapid[\s-]?fire\s+(\d+)$/i,   m => Number(m[1])],
  ["intercept",    /^intercept\s+(\d+)$/i,         m => Number(m[1])],
  ["ap",           /^ap\s+(\d+)$/i,                m => Number(m[1])],
  ["linked",       /^(twin|tri|quad)[\s-]?linked$/i, () => true],
  ["array",        /^array$/i,                     () => true],
  ["electroPulse", /^electro[\s-]?pulse$/i,        () => true]
];

/**
 * Parse a craft weapon's free-text quality list into the flags the pipeline needs.
 * Anything unrecognised is kept in `other` so the chat card can still print it.
 */
export function weaponQualities(weapon) {
  const parsed = {
    beam: null, rapidFire: 1, intercept: 0, ap: 0,
    linked: false, array: false, electroPulse: false, other: []
  };
  for (const raw of weapon.system.qualities ?? []) {
    const text = String(raw).trim();
    const hit = QUALITY_PATTERNS.find(([, pattern]) => pattern.test(text));
    if (!hit) {
      if (text) parsed.other.push(text);
      continue;
    }
    const [key, pattern, extract] = hit;
    parsed[key] = extract(text.match(pattern));
  }
  return parsed;
}

/* -------------------------------------------- */
/*  Eligibility                                 */
/* -------------------------------------------- */

/** Turret weapons fire into all four arcs; everything else fires only into its own. */
export function weaponInArc(weapon, arc) {
  if (!arc || arc === "all") return true;
  if (weapon.system.arc === "turret") return true;
  if (arc === "portStarboard") return ["port", "starboard"].includes(weapon.system.arc);
  return weapon.system.arc === arc;
}

export function weaponInRange(weapon, band) {
  return (WEAPON_RANGE_BANDS[weapon.system.range] ?? []).includes(band);
}

/**
 * Whether a craft carries a working feature. Features are hand-authored items, so the name is
 * matched loosely and the stable `internalId` is accepted as well — the same convention the
 * order engine uses for `requires`.
 */
export function hasFeature(craft, name, internalId = null) {
  const needle = name.toLowerCase();
  return craft.itemTypes.craftFeature.some(f => !f.system.destroyed
    && (f.name.toLowerCase().includes(needle)
      || (internalId && f.system.internalId === internalId)));
}

/** Targeting Computer +X: the bonus a held lock adds to every attack roll against that target. */
export function targetingComputerBonus(craft) {
  let best = 0;
  for (const feature of craft.itemTypes.craftFeature) {
    if (feature.system.destroyed) continue;
    const match = feature.name.match(/targeting\s+computer\s*\(?\s*\+?(\d+)/i);
    if (match) best = Math.max(best, Number(match[1]));
  }
  return best;
}

/** Adaptive Armour quarters a barrage, Bio-Adaptive Shielding halves it. */
export function shieldDivisor(craft) {
  if (hasFeature(craft, "adaptive armour", "adaptive-armour")
    || hasFeature(craft, "adaptive armor", "adaptive-armour")) return 4;
  if (hasFeature(craft, "bio-adaptive", "bio-adaptive-shielding")) return 2;
  return 1;
}

/* -------------------------------------------- */
/*  Total Offence                               */
/* -------------------------------------------- */

/**
 * `Total Offence = Offence of the highest-Offence weapon that hit + half the Offence of each
 * other weapon that hit` (book p. 194).
 *
 * A critical doubles that weapon's Offence, which is why the book can say a critical on a
 * second or later weapon leaves its Offence "not halved" — doubling and then halving is the
 * printed Offence. The barrage is ordered by **printed** Offence, so a critical never promotes
 * a weapon into the unhalved slot.
 *
 * @param {Array<{offence: number, crit?: boolean}>} hits
 */
export function totalOffence(hits = []) {
  if (!hits.length) return 0;
  const ordered = [...hits].sort((a, b) => b.offence - a.offence)
    .map(h => (h.crit ? h.offence * 2 : h.offence));
  return ordered[0] + ordered.slice(1).reduce((sum, value) => sum + Math.floor(value / 2), 0);
}

/**
 * Everything between the barrage and the structural spaces: interception first, then the
 * shielding divisor, then Armour (book p. 195 and the summary on p. 196).
 */
export function resolveMitigation(offence, { intercepted = 0, divisor = 1, armour = 0 } = {}) {
  const afterInterception = Math.max(0, offence - Math.max(0, intercepted));
  const afterShielding = divisor > 1 ? Math.floor(afterInterception / divisor) : afterInterception;
  return {
    offence,
    intercepted: Math.min(offence, Math.max(0, intercepted)),
    afterInterception,
    divisor,
    afterShielding,
    armour,
    damage: Math.max(0, afterShielding - armour)
  };
}

/* -------------------------------------------- */
/*  Damage allocation                           */
/* -------------------------------------------- */

/** Spaces a weapon mount occupies in total, and how many of them are already gone. */
export function weaponSpaceTotals(weapon) {
  const total = Math.max(1, weapon.system.weaponSpaces) * Math.max(1, weapon.system.count);
  return { total, lost: Math.min(total, weapon.system.spacesLost), left: Math.max(0, total - weapon.system.spacesLost) };
}

/**
 * Walk the Random Craft Damage cascade and return a plan — nothing is written here, so the
 * caller can post the card and apply the result in one update.
 *
 * The cascade: roll 2d6, delete spaces of that type, and while damage remains subtract 1 from
 * the roll and apply the rest to the new area. A 12 costs a feature (absorbing 1d4) and rolls
 * afresh. A weapons hit picks its arc on a d10, re-rolling arcs that have nothing left.
 *
 * Two endings the book leaves open are decided here and reported on the card:
 *  - a hit located to an already-destroyed engine bay converts the rest to Armour loss, which
 *    is the "structural-space loss beyond a destroyed engine bay converts to Armour" rule;
 *  - if the cascade runs off the bottom of the table with damage left (a craft with nothing
 *    intact to hit), the remainder also comes off Armour.
 *
 * @returns {Promise<object>} `{steps, spaces, weapons, armourLoss, unallocated, rolls}`
 */
export async function allocateCraftDamage(craft, damage) {
  const spaces = Object.fromEntries(Object.entries(craft.system.spaces)
    .map(([key, pool]) => [key, { value: pool.value, max: pool.max, lost: 0 }]));

  const weapons = craft.itemTypes.craftWeapon.map(weapon => {
    const totals = weaponSpaceTotals(weapon);
    return { id: weapon.id, name: weapon.name, arc: weapon.system.arc, ...totals, hit: 0 };
  });

  const features = craft.itemTypes.craftFeature
    .filter(f => !f.system.destroyed && f.system.absorbsDamage)
    .map(f => ({ id: f.id, name: f.name }));

  const plan = { steps: [], spaces, weapons, featuresLost: [], armourLoss: 0, rolls: [] };

  const roll = async formula => {
    const result = await new Roll(formula).evaluate();
    plan.rolls.push({ formula, total: result.total });
    return result.total;
  };

  let remaining = damage;
  let index = await roll("2d6");

  // Every branch either spends damage or moves down the table, so the cascade terminates; the
  // guard only stops a pathological chain of 12s.
  for (let guard = 0; remaining > 0 && guard < 60; guard++) {
    if (index < 2) {
      // The cascade ran off the bottom of the table with damage left: there is nothing intact
      // to destroy, so the rest comes off the hull.
      plan.steps.push({ area: "cascadeExhausted", amount: remaining });
      plan.armourLoss += remaining;
      remaining = 0;
      break;
    }

    const area = DAMAGE_LOCATIONS[index];

    /* A 12 costs one random feature, which absorbs 1d4, and then rolls afresh. */
    if (area === "special") {
      let absorbed = 0;
      let lost = null;
      if (features.length) {
        lost = features.splice(await roll(`1d${features.length}`) - 1, 1)[0];
        absorbed = Math.min(remaining, await roll("1d4"));
        remaining -= absorbed;
        plan.featuresLost.push(lost);
      }
      plan.steps.push({ area: "special", feature: lost?.name ?? null, amount: absorbed });
      if (remaining > 0) index = await roll("2d6");
      continue;
    }

    /* A weapons hit picks its arc on a d10 and is allocated among that arc's mounts. */
    if (area === "weapons" && weapons.some(w => w.left > 0)) {
      const valid = new Set(weapons.filter(w => w.left > 0).map(w => w.arc));
      let arc = null;
      for (let tries = 0; tries < 10 && !arc; tries++) {
        const candidate = WEAPON_ARC_LOCATIONS[await roll("1d10")];
        if (valid.has(candidate)) arc = candidate;
      }
      arc ??= [...valid][0];   // the d10 kept missing; take a valid arc rather than loop forever

      const damaged = [];
      let applied = 0;
      for (const weapon of weapons) {
        if (remaining <= 0) break;
        if (weapon.arc !== arc || weapon.left <= 0) continue;
        const take = Math.min(remaining, weapon.left);
        weapon.left -= take;
        weapon.lost += take;
        weapon.hit += take;
        remaining -= take;
        applied += take;
        damaged.push({ name: weapon.name, amount: take, destroyed: weapon.left === 0 });
      }
      spaces.weapons.lost += applied;
      spaces.weapons.value = Math.max(0, spaces.weapons.value - applied);
      plan.steps.push({ area: "weapons", arc, amount: applied, weapons: damaged });

      // An arc that is wiped out does not spill into another one — the table moves down instead.
      if (remaining > 0) index -= 1;
      continue;
    }

    /* Everything else — including a weapons pool with no mounts recorded — is a plain pool. */
    const pool = spaces[area];
    if (!pool || pool.max <= 0) {
      index -= 1;
      continue;
    }

    // Once the engine bay is gone, further engine hits come off the hull instead (book p. 197).
    if (area === "engine" && pool.value <= 0) {
      plan.steps.push({ area: "engineOverflow", amount: remaining });
      plan.armourLoss += remaining;
      remaining = 0;
      break;
    }

    if (pool.value <= 0) {
      index -= 1;
      continue;
    }

    const applied = Math.min(remaining, pool.value);
    pool.value -= applied;
    pool.lost += applied;
    remaining -= applied;
    plan.steps.push({ area, amount: applied, destroyed: pool.value === 0 });
    if (remaining > 0) index -= 1;
  }

  plan.unallocated = remaining;
  return plan;
}

/**
 * The areas that lost some but not all of their spaces and so must resist impairment.
 * Weapon spaces are excluded: the book impairs individual weapon systems, not the area.
 */
export function areasNeedingImpairment(craft, plan) {
  return Object.entries(plan.spaces)
    .filter(([key, pool]) => key !== "weapons" && pool.lost > 0 && pool.value > 0
      && !craft.system.spaces[key].impaired)
    .map(([area, pool]) => ({ area, bonus: Math.floor(pool.value / 10) }));
}

/** The weapon systems that were hit but not destroyed. */
export function weaponsNeedingImpairment(craft, plan) {
  const bonus = Math.floor(plan.spaces.weapons.value / 10);
  return plan.weapons
    .filter(w => w.hit > 0 && w.left > 0 && !craft.items.get(w.id)?.system.impaired)
    .map(w => ({ id: w.id, name: w.name, bonus }));
}
