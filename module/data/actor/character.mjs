import { B5 } from "../../config.mjs";
import { int, num, str, bool, html, bonusBlock, attackBlock } from "../fields.mjs";
import {
  DANGER_SENSE_P_RATING, MENTAL_FORTRESS_DR, TELEPATHY_FEATS, mentalEffortDie, reach
} from "../../system/telepathy.mjs";
import { repeatPenaltyPerUse } from "../../system/influence.mjs";

const fields = foundry.data.fields;

/**
 * Player character data model.
 *
 * Everything the player types is a stored field; everything the rules compute is written in
 * `prepareDerivedData()`. Beware of the system's departures from stock d20:
 *  - there is no Armour Class: DV = 10 + class Defence bonus + Dex mod + size mod,
 *    and the class bonus applies even when flat-footed;
 *  - armour grants Damage Reduction only, never a bonus to DV;
 *  - the Con modifier is added to hit points exactly once, at 1st level.
 */
export default class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const abilityField = () => new fields.SchemaField({
      base: int(10),
      racial: int(),
      levelIncrease: int(),
      misc: int(),
      damage: int(),
      drain: int(),
      value: int(10),        // derived
      mod: int(),            // derived
      temp: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, nullable: true, initial: null }),
        mod: int()
      })
    });

    const skillField = (key, cfg) => new fields.SchemaField({
      ranks: num(0, { min: 0 }),
      isClassSkill: bool(false),   // manual tick; classes and races add to it, never remove
      misc: int(),
      synergy: int(),
      keyAbility: str(cfg.ability),
      total: int()           // derived
    });

    const skills = {};
    for (const [key, cfg] of Object.entries(B5.skills)) skills[key] = skillField(key, cfg);

    return {
      details: new fields.SchemaField({
        player: str(),
        race: str(),
        minbariCaste: str(),
        homeworld: str(),
        affiliation: str(),
        age: str(),
        gender: str(),
        biography: html(),
        notes: html()
      }),

      progression: new fields.SchemaField({
        xp: new fields.SchemaField({ value: int(), next: int(1000) }),
        level: int(1),                       // derived: Σ class levels
        featsGranted: int(1),                // derived from character level
        featsSpent: int(),                   // derived: count of feat Items
        abilityIncreasesGranted: int(),      // derived: levels 4, 8, 12, 16, 20
        skillPoints: new fields.SchemaField({
          total: int(),                      // derived budget
          spent: int(),                      // derived: ranks × 1 (class) or × 2 (cross-class)
          available: int(),                  // derived
          manualTotal: new fields.NumberField({ required: true, integer: true, nullable: true, initial: null })
        }),
        multiclassBalanced: bool(true),      // derived: class levels within 1 of each other
        xpPenalty: int()                     // derived: −20 when unbalanced
      }),

      abilities: new fields.SchemaField(
        Object.fromEntries(Object.keys(B5.abilities).map(k => [k, abilityField()]))
      ),

      attributes: new fields.SchemaField({
        size: str("medium"),
        sizeMod: int(),                      // derived
        speed: new fields.SchemaField({
          base: int(30),
          armourReduction: int(),            // derived from worn armour
          value: int(30)                     // derived
        }),
        hp: new fields.SchemaField({
          value: int(1),
          max: int(1),                       // derived
          maxOverride: new fields.NumberField({ required: true, integer: true, nullable: true, initial: null }),
          temp: int(),
          nonlethal: int()                   // separate counter, not subtracted from hp
        }),
        massiveDamageThreshold: int(10),     // derived: Con score
        bab: new fields.SchemaField({
          value: int(),                      // derived
          iteratives: new fields.ArrayField(int(), { initial: [] })
        }),
        dv: new fields.SchemaField({
          classBonus: int(),                 // derived from class Items
          dexMod: int(),                     // derived
          sizeMod: int(),                    // derived
          dodge: int(),                      // situational dodge bonuses (stack)
          misc: int(),
          total: int(10),                    // derived
          flatFooted: int(10)                // derived: loses the Dex bonus and dodge bonuses
        }),
        dr: new fields.SchemaField({
          natural: int(),                    // racial (Drazi 1)
          armour: int(),                     // derived from worn armour
          misc: int(),
          total: int()                       // derived
        }),
        acp: int(),                          // derived from worn armour
        initiative: new fields.SchemaField({ // initiative is a plain Dex check
          abilityMod: int(),
          misc: int(),
          total: int()
        }),
        ordersPerTurn: new fields.SchemaField({
          surfaceVehicle: int(1),
          space: int(1),
          soloCraft: int(1)
        })
      }),

      saves: new fields.SchemaField({
        fort: bonusBlock(),
        ref: bonusBlock(),
        will: bonusBlock()
      }),

      attacks: new fields.SchemaField(
        Object.fromEntries(Object.keys(B5.attackLines).map(k => [k, attackBlock()]))
      ),

      skills: new fields.SchemaField(skills),

      languages: new fields.SchemaField({
        fluent: new fields.ArrayField(str(), { initial: [] }),
        known: new fields.ArrayField(str(), { initial: [] })
      }),

      telepathy: new fields.SchemaField({
        isTelepath: bool(false),
        canBeTelepath: bool(true),           // Narn: false
        pRating: new fields.SchemaField({
          base: int(),
          bonus: int(),
          value: int(),                      // derived; fixed for life once set
          /** This round's mental-effort boost — the only part of a P-Rating that ever moves. */
          temp: int(),
          /** Sleeper drugs treat the telepath as P0 for ten days. */
          suppressed: bool(false)
        }),
        /** Telepath class picks: mental effort in these Disciplines rolls d3 instead of d4. */
        disciplineFocus: new fields.ArrayField(str(), { initial: [] }),
        mindShield: new fields.SchemaField({
          active: bool(false),
          willBonus: int(),                  // derived: +P while active
          checkPenalty: int(),               // derived: −P while active
          dr: int()                          // derived: Mental Fortress, only while active
        }),
        /** Psi Corps gloves: −2 on Touch abilities and half the touch bonus. */
        gloves: bool(false),
        /** An enemy Jamming ability subtracts its telepath's P-Rating from every check. */
        jammedBy: int(),
        /** Item ids of the abilities being maintained — drives the second-ability DC bump. */
        maintaining: new fields.ArrayField(str(), { initial: [] }),
        saveDC: int()                        // derived: 5 + P + telepath level + Cha mod
      }),

      influence: new fields.SchemaField({
        socialBonus: int()                   // derived: highest score ÷ 5
      }),

      wealth: new fields.SchemaField({
        credits: int(),
        lifestyle: str(),
        debt: int()
      }),

      encumbrance: new fields.SchemaField({
        load: num(),                         // derived: Σ item weight
        max: num(),                          // derived from Str
        penalty: int()
      }),

      shipboard: new fields.SchemaField({
        craft: str(),                        // uuid of the craft Actor
        role: str(),
        spacecraftProficiency: bool(false)
      }),

      conditions: new fields.SchemaField(
        Object.fromEntries(B5.conditions.map(c => [c, bool(false)]))
      )
    };
  }

  /* -------------------------------------------- */

  /** @override — reset accumulators that derived data adds into. */
  prepareBaseData() {
    const a = this.attributes;
    a.dv.classBonus = 0;
    a.dr.armour = 0;
    a.acp = 0;
    a.speed.armourReduction = 0;
    for (const save of Object.values(this.saves)) save.classBonus = 0;
  }

  /** @override */
  prepareDerivedData() {
    this.#collectBonuses();     // race + feats, gathered before anything reads them
    this.#applyRace();
    this.#prepareAbilities();
    this.#prepareClasses();
    this.#prepareClassSkills();
    this.#prepareEquipment();
    this.#prepareHitPoints();
    this.#prepareDefences();
    this.#prepareAttacks();
    this.#prepareSkills();
    this.#prepareSkillPoints();
    this.#prepareSubsystems();
  }

  /* -------------------------------------------- */

  /**
   * Sum the always-on bonuses granted by the race and the feats. Both item types carry the
   * same `system.bonuses` shape, so one pass handles them.
   *
   * A feat that is not marked as stacking is counted **once per distinct choice** — two
   * Skill Focus items on different skills both count, two copies of Iron Will do not.
   */
  #collectBonuses() {
    const total = {
      abilities: {}, skills: {}, saves: {},
      initiative: 0, dvDodge: 0, hp: 0, naturalDr: 0,
      acpReduction: 0, acpNatural: 0, speedOverride: null
    };

    const add = (bonuses, choiceValue) => {
      if (!bonuses) return;
      for (const [key, value] of Object.entries(bonuses.abilities ?? {})) {
        total.abilities[key] = (total.abilities[key] ?? 0) + value;
      }
      for (const [key, value] of Object.entries(bonuses.skills ?? {})) {
        const k = CharacterData.normaliseSkillKey(key);
        total.skills[k] = (total.skills[k] ?? 0) + value;
      }
      for (const [key, value] of Object.entries(bonuses.saves ?? {})) {
        total.saves[key] = (total.saves[key] ?? 0) + value;
      }
      if (bonuses.chosenSkill && choiceValue) {
        const k = CharacterData.normaliseSkillKey(choiceValue);
        total.skills[k] = (total.skills[k] ?? 0) + bonuses.chosenSkill;
      }
      total.initiative += bonuses.initiative ?? 0;
      total.dvDodge += bonuses.dvDodge ?? 0;
      total.hp += bonuses.hp ?? 0;
      total.acpReduction += bonuses.acpReduction ?? 0;
      total.acpNatural += bonuses.acpNatural ?? 0;
      // Natural DR does not stack — Drazi Dense Scales replaces the racial 1 with 2.
      total.naturalDr = Math.max(total.naturalDr, bonuses.naturalDr ?? 0);
      if (bonuses.speedOverride !== null && bonuses.speedOverride !== undefined) {
        total.speedOverride = Math.max(total.speedOverride ?? 0, bonuses.speedOverride);
      }
    };

    const race = this.parent.itemTypes.race[0];
    add(race?.system?.bonuses);

    const counted = new Set();
    for (const feat of this.parent.itemTypes.feat) {
      const choice = feat.system.choice?.value ?? "";
      const key = `${feat.system.internalId || feat.name}::${choice}`;
      if (!feat.system.repeatable?.stacks) {
        if (counted.has(key)) continue;
        counted.add(key);
      }
      add(feat.system.bonuses, choice);
    }

    this.appliedBonuses = total;
  }

  /** Ability modifiers, size, speed, natural DR and telepathy eligibility come from the race. */
  #applyRace() {
    const race = this.parent.itemTypes.race[0];
    this.race = race ?? null;

    // A race states its ability adjustments in `abilityModifiers`; `bonuses.abilities` is the
    // generic channel any item may use on top of that. With no race item the manually entered
    // racial column is left alone.
    for (const key of Object.keys(this.abilities)) {
      const fromRace = race ? (race.system.abilityModifiers?.[key] ?? 0) : null;
      const fromBonuses = this.appliedBonuses.abilities[key] ?? 0;
      this.abilities[key].racial = fromRace === null && !fromBonuses
        ? this.abilities[key].racial
        : (fromRace ?? 0) + fromBonuses;
    }

    if (race) {
      this.attributes.size = race.system.size || this.attributes.size;
      this.attributes.speed.base = race.system.speed || this.attributes.speed.base;
      this.details.race ||= race.name;
      this.telepathy.canBeTelepath = race.system.canBeTelepath;
      if (race.system.caste) this.details.minbariCaste ||= race.system.caste;
    }

    // A feat may raise the base speed outright (Minbari Enhanced Speed: 40 ft.).
    if (this.appliedBonuses.speedOverride !== null) {
      this.attributes.speed.base = Math.max(this.attributes.speed.base, this.appliedBonuses.speedOverride);
    }

    this.attributes.dr.natural = Math.max(
      this.attributes.dr.natural,
      race?.system?.naturalDr ?? 0,
      this.appliedBonuses.naturalDr
    );

    if (!this.telepathy.canBeTelepath) {
      this.telepathy.isTelepath = false;
      this.telepathy.pRating.base = 0;
      this.telepathy.pRating.bonus = 0;
      this.telepathy.pRating.temp = 0;
    }
  }

  /**
   * Class skills are the union of every class's list plus the race's grants; the manual tick
   * on the sheet can only add to that, never take away.
   *
   * The book's lists name subtypes loosely ("Knowledge (law, specific culture or specific
   * local)"), so a subtyped entry marks the whole skill family — Knowledge, Operations,
   * Profession or Technical — rather than trying to match one subtype.
   */
  #prepareClassSkills() {
    const granted = new Set();
    const families = new Set();

    const register = entry => {
      const base = String(entry).split("(")[0];
      const key = CharacterData.normaliseSkillKey(base);
      if (key in B5.subtypedSkills) families.add(key);
      else if (key) granted.add(key);
    };

    for (const cls of this.parent.itemTypes.class) cls.system.classSkills.forEach(register);
    this.parent.itemTypes.race[0]?.system?.grantedClassSkills?.forEach(register);

    for (const [key, skill] of Object.entries(this.skills)) {
      skill.autoClassSkill = granted.has(key);
      skill.classSkill = skill.isClassSkill || skill.autoClassSkill;
    }

    for (const item of this.parent.itemTypes.skill) {
      const auto = families.has(item.system.skillKey);
      item.system.autoClassSkill = auto;
      item.system.classSkill = item.system.isClassSkill || auto;
    }

    this.classSkillFamilies = [...families];
  }

  /* -------------------------------------------- */

  #prepareAbilities() {
    for (const ability of Object.values(this.abilities)) {
      ability.value = ability.base + ability.racial + ability.levelIncrease
        + ability.misc - ability.damage - ability.drain;
      ability.mod = Math.floor((ability.value - 10) / 2);
      ability.temp.mod = ability.temp.value === null
        ? 0
        : Math.floor((ability.temp.value - 10) / 2);
    }
  }

  /**
   * Class Items drive level, BAB, saves and the Defence bonus. All classes map onto the
   * three shared good/average/poor tracks, so nothing here is per-class special-casing.
   */
  #prepareClasses() {
    const classes = this.parent.itemTypes.class;
    const level = classes.reduce((sum, c) => sum + c.system.levels, 0);
    const prog = this.progression;

    prog.level = Math.max(level, 1);
    // Racial bonus feats (Human +1, Drazi Brawler, Narn Toughness, Pak'ma'ra Great Fortitude)
    // are granted on top of the level progression.
    prog.featsGranted = CharacterData.featsAtLevel(prog.level)
      + (this.parent.itemTypes.race[0]?.system?.bonusFeats ?? 0);
    prog.featsSpent = this.parent.itemTypes.feat.length;
    prog.abilityIncreasesGranted = Math.floor(prog.level / 4);

    // Multiclass XP penalty: class levels must stay within 1 of each other.
    const levels = classes.map(c => c.system.levels).filter(l => l > 0);
    prog.multiclassBalanced = levels.length < 2
      || (Math.max(...levels) - Math.min(...levels)) <= 1;
    prog.xpPenalty = prog.multiclassBalanced ? 0 : -20;

    let bab = 0;
    const saveTotals = { fort: 0, ref: 0, will: 0 };
    let defence = 0;

    for (const cls of classes) {
      const lvl = Math.clamp(cls.system.levels, 0, B5.MAX_CLASS_LEVEL);
      if (!lvl) continue;
      bab += B5.progressionTracks.bab[cls.system.tracks.bab]?.[lvl] ?? 0;
      for (const save of ["fort", "ref", "will"]) {
        saveTotals[save] += B5.progressionTracks.save[cls.system.tracks[save]]?.[lvl] ?? 0;
      }
      defence += B5.progressionTracks.defence[cls.system.tracks.defence]?.[lvl] ?? 0;
    }

    this.attributes.bab.value = bab;
    this.attributes.bab.iteratives = CharacterData.iterativeAttacks(bab);
    this.attributes.dv.classBonus = defence;
    for (const [key, value] of Object.entries(saveTotals)) this.saves[key].classBonus = value;
  }

  /** Worn armour contributes DR, ACP and a speed reduction — never a bonus to DV. */
  #prepareEquipment() {
    const a = this.attributes;
    for (const armour of this.parent.itemTypes.armour) {
      if (!armour.system.worn) continue;
      a.dr.armour += armour.system.dr;
      a.acp += armour.system.acp;
      a.speed.armourReduction += armour.system.speedReduction;
    }

    // Armour Familiarity cuts the armour's own penalty (never below 0); a natural penalty
    // such as Drazi Dense Scales is added afterwards and is not reduced by the feat.
    a.acp = Math.max(0, a.acp - this.appliedBonuses.acpReduction) + this.appliedBonuses.acpNatural;
    a.dr.total = a.dr.natural + a.dr.armour + a.dr.misc;
    a.speed.value = Math.max(0, a.speed.base - a.speed.armourReduction);

    this.encumbrance.load = this.parent.items
      .filter(i => B5.physicalItemTypes.includes(i.type))
      .reduce((sum, i) => sum + (i.system.weight ?? 0) * (i.system.quantity ?? 1), 0);
    this.encumbrance.max = this.abilities.str.value * 10;
  }

  /**
   * max HP = Initial HP of the class taken at 1st level + Con mod (once!)
   *        + Additional HP for every level after the first.
   */
  #prepareHitPoints() {
    const hp = this.attributes.hp;
    if (hp.maxOverride !== null) {
      hp.max = hp.maxOverride;
    } else {
      const classes = this.parent.itemTypes.class;
      const first = classes.find(c => c.system.takenAtFirstLevel) ?? classes[0];
      let max = 0;
      if (first) max += first.system.initialHp + this.abilities.con.mod;
      for (const cls of classes) {
        const levelsAfterFirst = cls === first ? cls.system.levels - 1 : cls.system.levels;
        max += Math.max(0, levelsAfterFirst) * cls.system.additionalHp;
      }
      hp.max = Math.max(1, max + this.appliedBonuses.hp);   // Toughness stacks here
    }
    this.attributes.massiveDamageThreshold = this.abilities.con.value;
  }

  #prepareDefences() {
    const a = this.attributes;
    a.sizeMod = B5.sizes[a.size]?.mod ?? 0;
    a.dv.sizeMod = a.sizeMod;
    a.dv.dexMod = this.abilities.dex.mod;

    // The class Defence bonus applies even when flat-footed; only the Dex *bonus* and
    // dodge bonuses are lost. A Dex penalty still counts.
    const dodge = a.dv.dodge + this.appliedBonuses.dvDodge;
    const dexWhenFlatFooted = Math.min(0, a.dv.dexMod);
    a.dv.total = 10 + a.dv.classBonus + a.dv.dexMod + a.dv.sizeMod + dodge + a.dv.misc;
    a.dv.flatFooted = 10 + a.dv.classBonus + dexWhenFlatFooted + a.dv.sizeMod + a.dv.misc;

    for (const [key, cfg] of Object.entries(B5.saves)) {
      const save = this.saves[key];
      save.abilityMod = this.abilities[cfg.ability].mod;
      save.bonus = this.appliedBonuses.saves[key] ?? 0;   // race and feats
      save.total = save.classBonus + save.abilityMod + save.misc + save.bonus;
    }

    a.initiative.abilityMod = this.abilities.dex.mod;
    a.initiative.bonus = this.appliedBonuses.initiative;
    a.initiative.total = a.initiative.abilityMod + a.initiative.misc + a.initiative.bonus;
  }

  /** Four attack lines plus feint/resist feint, each keyed to a different ability. */
  #prepareAttacks() {
    const bab = this.attributes.bab.value;
    for (const [key, cfg] of Object.entries(B5.attackLines)) {
      const line = this.attacks[key];
      line.bab = bab;
      line.abilityMod = this.abilities[cfg.ability].mod;
      line.total = line.bab + line.abilityMod + line.misc + this.attributes.sizeMod;
    }
  }

  #prepareSkills() {
    const acp = this.attributes.acp;
    for (const [key, cfg] of Object.entries(B5.skills)) {
      const skill = this.skills[key];
      skill.keyAbility = cfg.ability;
      skill.bonus = this.appliedBonuses.skills[key] ?? 0;   // race and feats
      const penalty = cfg.acp ? acp : 0;
      skill.total = Math.floor(skill.ranks) + this.abilities[cfg.ability].mod
        + skill.misc + skill.synergy + skill.bonus - penalty;
    }

    // Subtyped skills are Items, and items are prepared before the actor's derived data —
    // so the ability modifier and the family-wide bonus (the Minbari worker caste's +2
    // Technical, say) have to be added here, where both are current.
    for (const item of this.parent.itemTypes.skill) {
      const bonus = this.appliedBonuses.skills[item.system.skillKey] ?? 0;
      const mod = this.abilities[item.system.keyAbility]?.mod ?? 0;
      item.system.bonus = bonus;
      item.system.abilityMod = mod;
      item.system.total = Math.floor(item.system.ranks) + mod
        + item.system.misc + item.system.synergy + bonus;
    }
  }

  /**
   * Skill points.
   *
   * Budget: the very first character level pays `(class base + Int mod) × 4`, every later
   * level pays `class base + Int mod` for whichever class that level was taken in. The sum
   * therefore depends only on how many levels sit in each class, never on the order they
   * were taken — which is why this works without a level-up log.
   *
   * Humans add a flat +4 at 1st level and +1 per later level on top.
   *
   * Cost: a class skill charges 1 point per rank, a cross-class skill 1 point per *half*
   * rank — so a cross-class rank costs 2.
   *
   * Simplification worth knowing: the current Intelligence modifier is used for every level.
   * A character whose Int rose at 4th level really earned fewer points at levels 1–3. Set
   * `manualTotal` to record the true figure when it matters.
   */
  #prepareSkillPoints() {
    const points = this.progression.skillPoints;
    const intMod = this.abilities.int.mod;
    const race = this.parent.itemTypes.race[0];
    const classes = this.parent.itemTypes.class;
    const first = classes.find(c => c.system.takenAtFirstLevel) ?? classes[0];

    let total = 0;
    if (first) {
      const perLevel = first.system.skillPoints + intMod;
      total += Math.max(0, perLevel) * B5.FIRST_LEVEL_SKILL_MULTIPLIER;
      total += race?.system?.bonusSkillPointsFirst ?? 0;
    }
    for (const cls of classes) {
      const laterLevels = Math.max(0, cls.system.levels - (cls === first ? 1 : 0));
      const perLevel = cls.system.skillPoints + intMod + (race?.system?.bonusSkillPointsPerLevel ?? 0);
      total += laterLevels * Math.max(0, perLevel);
    }

    let spent = 0;
    for (const [key, skill] of Object.entries(this.skills)) {
      spent += skill.ranks * (skill.classSkill ? 1 : 2);
      skill.maxRanks = B5.maxRanks(this.progression.level, skill.classSkill);
      skill.overMaxRanks = skill.ranks > skill.maxRanks;
    }
    for (const item of this.parent.itemTypes.skill) {
      spent += item.system.ranks * (item.system.classSkill ? 1 : 2);
      item.system.maxRanks = B5.maxRanks(this.progression.level, item.system.classSkill);
      item.system.overMaxRanks = item.system.ranks > item.system.maxRanks;
    }

    points.total = points.manualTotal ?? total;
    points.spent = Math.round(spent);
    points.available = points.total - points.spent;
  }

  #prepareSubsystems() {
    const tel = this.telepathy;
    tel.pRating.value = tel.pRating.base + tel.pRating.bonus;

    // The P-Rating itself never changes; what moves is this round's mental-effort boost, and
    // sleeper drugs flattening the telepath to P0. `ratedP` is the telepath's standing rating
    // with the drug applied but not the boost — mental effort buys one ability, not a new band.
    tel.ratedP = tel.pRating.suppressed ? 0 : tel.pRating.value;
    tel.effectiveP = tel.ratedP + (tel.pRating.suppressed ? 0 : tel.pRating.temp);

    // Psi Cop levels stack with telepath levels here, but the prestige classes are not shipped
    // yet — when they are, add their key to this filter rather than a second sum.
    tel.telepathLevel = this.parent.itemTypes.class
      .filter(c => c.system.classKey === "telepath")
      .reduce((sum, c) => sum + c.system.levels, 0);
    tel.saveDC = 5 + tel.effectiveP + tel.telepathLevel + this.abilities.cha.mod;

    // Feats this subsystem reads by internalId, the way the order engine reads its budget feats.
    const feats = this.parent.itemTypes.feat;
    const has = id => feats.some(f => f.system.internalId === id);
    tel.adaptiveMind = has(TELEPATHY_FEATS.adaptiveMind);
    tel.synergist = has(TELEPATHY_FEATS.synergist);
    tel.meditation = has(TELEPATHY_FEATS.meditation);
    tel.combatTelepath = has(TELEPATHY_FEATS.combatTelepath);
    tel.mindshredder = has(TELEPATHY_FEATS.mindshredder);
    // Ability Focus is per-Discipline and may be taken more than once.
    tel.abilityFocus = feats
      .filter(f => f.system.internalId === TELEPATHY_FEATS.abilityFocus)
      .map(f => f.system.choice?.value?.trim().toLowerCase())
      .filter(Boolean);

    tel.mindShield.willBonus = tel.mindShield.active ? tel.effectiveP : 0;
    tel.mindShield.checkPenalty = tel.mindShield.active ? -tel.effectiveP : 0;
    // Mental Fortress protects only while the shield is up, and never against your own effort.
    tel.mindShield.dr = tel.mindShield.active && has(TELEPATHY_FEATS.mentalFortress)
      ? MENTAL_FORTRESS_DR : 0;

    // The three traits are a straight function of the P-Rating, so they are derived, not stored.
    // They read the standing rating: borrowing P-Rating for one ability does not develop a
    // trait the telepath does not have.
    tel.traits = {
      accidentalScan: tel.ratedP >= 1,
      dangerSense: tel.ratedP >= DANGER_SENSE_P_RATING,
      mindShield: tel.ratedP >= 1
    };

    this.#prepareTelepathicAbilities();

    this.#prepareInfluence();

    // Influence adds score ÷ 5 to Diplomacy and Intimidate; we expose the best score's bonus.
    const best = this.parent.itemTypes.influence
      .reduce((max, i) => Math.max(max, i.system.value), 0);
    this.influence.socialBonus = Math.floor(best / B5.INFLUENCE_SOCIAL_DIVISOR);
  }

  /**
   * The repeat penalty depends on the character's *classes* — Diplomat 3 softens it to −3 for
   * every Influence, Fence and Psi Cop for their own — so it is finished here rather than in the
   * Item, whose derived data runs a cycle behind the actor's.
   */
  #prepareInfluence() {
    for (const item of this.parent.itemTypes.influence) {
      const { penalty, source } = repeatPenaltyPerUse(this.parent, item, B5.INFLUENCE_REPEAT_PENALTY);
      item.system.repeatPenaltyPerUse = penalty;
      item.system.repeatSoftenedBy = source;
      item.system.repeatPenalty = item.system.usesThisWeek * penalty;
    }
  }

  /**
   * Finish the telepathic ability Items here rather than in their own `prepareDerivedData`:
   * every one of these values reads the P-Rating, and item-derived data runs a cycle behind
   * the actor's. Subtyped skill Items are finished the same way, for the same reason.
   */
  #prepareTelepathicAbilities() {
    const tel = this.telepathy;
    for (const item of this.parent.itemTypes.telepathicAbility) {
      const ability = item.system;

      // The band widens with the P-Rating: Surface Scan is Close, and Medium from P10.
      ability.effectiveRange = ability.range.upgrades
        .filter(u => u.pRating <= tel.effectiveP)
        .reduce((band, u) => u.band || band, ability.range.band);

      // What a fresh use costs, priced against the standing rating — a boost bought for one
      // ability never discounts the next one, so the figure on the sheet does not drift.
      const state = reach(tel.ratedP, ability.power);
      ability.mentalEffortDice = state.dice;
      ability.mentalEffortDie = mentalEffortDie(this.parent, ability.discipline);
      ability.outOfReach = state.outOfReach;
      ability.needsEffort = !state.free && !state.outOfReach;
      ability.maintained = tel.maintaining.includes(item.id);
    }
  }

  /* -------------------------------------------- */
  /*  Static helpers                              */
  /* -------------------------------------------- */

  /**
   * Turn a book-style skill name into a `B5.skills` key: "Sense Motive", "sense motive" and
   * "senseMotive" all resolve to `senseMotive`.
   */
  static normaliseSkillKey(name) {
    const cleaned = String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!cleaned) return "";
    for (const key of [...Object.keys(B5.skills), ...Object.keys(B5.subtypedSkills)]) {
      if (key.toLowerCase() === cleaned) return key;
    }
    return cleaned;
  }

  /** Feats arrive at character levels 1, 3, 6, 9, 12, 15 and 18. */
  static featsAtLevel(level) {
    if (level < 1) return 0;
    if (level < 3) return 1;
    return 2 + Math.floor((level - 3) / 3);
  }

  /** Iterative attacks appear once BAB exceeds +5, dropping 5 each time. */
  static iterativeAttacks(bab) {
    const attacks = [];
    for (let b = bab; b > 0 || attacks.length === 0; b -= 5) {
      attacks.push(b);
      if (b <= 5) break;
    }
    return attacks;
  }
}
