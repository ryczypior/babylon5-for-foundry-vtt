import { B5 } from "../../config.mjs";
import { int, num, str, bool, html, bonusBlock, attackBlock } from "../fields.mjs";

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
      isClassSkill: bool(false),
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
        skillPoints: new fields.SchemaField({ total: int(), spent: int() }),
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
          value: int()                       // derived; fixed for life once set
        }),
        disciplineFocus: new fields.ArrayField(str(), { initial: [] }),
        mindShield: new fields.SchemaField({
          active: bool(false),
          willBonus: int(),                  // derived: +P while active
          checkPenalty: int()                // derived: −P while active
        }),
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
    this.#prepareAbilities();
    this.#prepareClasses();
    this.#prepareEquipment();
    this.#prepareHitPoints();
    this.#prepareDefences();
    this.#prepareAttacks();
    this.#prepareSkills();
    this.#prepareSubsystems();
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
    prog.featsGranted = CharacterData.featsAtLevel(prog.level);
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
      hp.max = Math.max(1, max);
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
    const dexWhenFlatFooted = Math.min(0, a.dv.dexMod);
    a.dv.total = 10 + a.dv.classBonus + a.dv.dexMod + a.dv.sizeMod + a.dv.dodge + a.dv.misc;
    a.dv.flatFooted = 10 + a.dv.classBonus + dexWhenFlatFooted + a.dv.sizeMod + a.dv.misc;

    for (const [key, cfg] of Object.entries(B5.saves)) {
      const save = this.saves[key];
      save.abilityMod = this.abilities[cfg.ability].mod;
      save.total = save.classBonus + save.abilityMod + save.misc;
    }

    a.initiative.abilityMod = this.abilities.dex.mod;
    a.initiative.total = a.initiative.abilityMod + a.initiative.misc;
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
      const penalty = cfg.acp ? acp : 0;
      skill.total = Math.floor(skill.ranks) + this.abilities[cfg.ability].mod
        + skill.misc + skill.synergy - penalty;
    }
  }

  #prepareSubsystems() {
    const tel = this.telepathy;
    tel.pRating.value = tel.pRating.base + tel.pRating.bonus;
    const telepathLevels = this.parent.itemTypes.class
      .filter(c => c.system.classKey === "telepath")
      .reduce((sum, c) => sum + c.system.levels, 0);
    tel.saveDC = 5 + tel.pRating.value + telepathLevels + this.abilities.cha.mod;
    tel.mindShield.willBonus = tel.mindShield.active ? tel.pRating.value : 0;
    tel.mindShield.checkPenalty = tel.mindShield.active ? -tel.pRating.value : 0;

    // Influence adds score ÷ 5 to Diplomacy and Intimidate; we expose the best score's bonus.
    const best = this.parent.itemTypes.influence
      .reduce((max, i) => Math.max(max, i.system.value), 0);
    this.influence.socialBonus = Math.floor(best / B5.INFLUENCE_SOCIAL_DIVISOR);
  }

  /* -------------------------------------------- */
  /*  Static helpers                              */
  /* -------------------------------------------- */

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
