import { B5 } from "../../config.mjs";
import { int, num, str, bool, html } from "../fields.mjs";

const fields = foundry.data.fields;
const TypeDataModel = foundry.abstract.TypeDataModel;

/** Fields every item carries. */
const common = () => ({
  description: html(),
  source: str(),               // book page reference
  internalId: str()            // stable id for compendium lookups
});

/**
 * The numeric, always-on effects an item grants. Races and feats share this shape so the
 * actor can apply both through one code path.
 *
 * Deliberately only *unconditional* bonuses live here. Situational ones — Abbai +8 Athletics
 * when swimming, Narn +1 to hit Centauri, Veteran Spacehand's +1 aboard spacecraft — stay in
 * the description, because applying them silently would be wrong more often than right.
 */
const bonuses = () => new fields.SchemaField({
  abilities: new fields.ObjectField({ initial: {} }),   // { str: 2, cha: -2 } — races only
  skills: new fields.ObjectField({ initial: {} }),      // { bluff: 2 } — plain or subtyped skill key
  saves: new fields.ObjectField({ initial: {} }),       // { fort: 1 }
  initiative: int(),
  dvDodge: int(),
  hp: int(),
  naturalDr: int(),
  acpReduction: int(),                                  // Armour Familiarity: 2
  acpNatural: int(),                                    // Drazi Dense Scales: 1
  speedOverride: new fields.NumberField({ required: true, integer: true, nullable: true, initial: null }),
  /** Bonus applied to whichever skill the item's `choice.value` names (Skill Focus). */
  chosenSkill: int()
});

/* -------------------------------------------- */

/**
 * One entry per class the character has levels in. The class itself only declares which of
 * the three shared progression tracks it uses — the tables live in `B5.progressionTracks`.
 */
export class ClassData extends TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      classKey: str(),                       // "soldier", "officer", …
      levels: int(1, { min: 0, max: B5.MAX_CLASS_LEVEL }),
      takenAtFirstLevel: bool(false),        // decides whose Initial HP / Influence applies
      variant: str(),                        // officer branch, worker type
      tracks: new fields.SchemaField({
        bab: str("average"),
        fort: str("poor"),
        ref: str("poor"),
        will: str("poor"),
        defence: str("average")
      }),
      initialHp: int(6),
      additionalHp: int(2),
      skillPoints: int(4),
      classSkills: new fields.ArrayField(str(), { initial: [] }),
      initialInfluence: str(),               // e.g. "2d4 political"
      additionalInfluenceText: str(),        // the full rule, which is rarely just a number
      additionalInfluence: int(1),
      startingCredits: str(),
      keyAbilities: str(),
      weaponProficiencies: str(),            // there is no armour proficiency system
      entryRequirement: str(),               // Ranger level 5+, telepath needs the Telepath feat
      features: new fields.ArrayField(
        new fields.SchemaField({
          level: int(1),
          name: str(),
          description: html()
        }),
        { initial: [] }
      )
    };
  }
}

/* -------------------------------------------- */

/** Exactly one race per actor; it applies ability modifiers, speed and racial traits. */
export class RaceData extends TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      raceKey: str(),
      abilityModifiers: new fields.SchemaField(
        Object.fromEntries(Object.keys(B5.abilities).map(k => [k, int()]))
      ),
      size: str("medium"),
      speed: int(30),
      swimSpeed: int(),
      naturalDr: int(),
      favouredClasses: new fields.ArrayField(str(), { initial: [] }),
      canBeTelepath: bool(true),             // Narn: false
      caste: str(),                          // Minbari only
      grantedClassSkills: new fields.ArrayField(str(), { initial: [] }),
      bonusFeats: int(),
      bonusSkillPointsFirst: int(),
      bonusSkillPointsPerLevel: int(),
      traits: new fields.ArrayField(
        new fields.SchemaField({ name: str(), description: html() }),
        { initial: [] }
      ),
      languages: new fields.ArrayField(str(), { initial: [] }),
      bonuses: bonuses()
    };
  }
}

/* -------------------------------------------- */

/**
 * Only the four subtyped skills are Items — Knowledge (x), Operations (x), Profession (x)
 * and Technical (x). The other 19 are fixed fields on the actor.
 */
export class SkillData extends TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      skillKey: str("knowledge"),
      subtype: str(),                        // "astrophysics", "gunnery", …
      group: str(),                          // Profession: whiteCollar | blueCollar | performing
      keyAbility: str("int"),
      ranks: num(0, { min: 0 }),
      isClassSkill: bool(false),
      misc: int(),
      synergy: int(),
      total: int()                           // derived
    };
  }

  prepareDerivedData() {
    const actor = this.parent.actor;
    if (!actor) return;
    const mod = actor.system.abilities?.[this.keyAbility]?.mod ?? 0;
    this.total = Math.floor(this.ranks) + mod + this.misc + this.synergy;
  }

  get label() {
    const base = game.i18n.localize(`B5.Skill.${this.skillKey}`);
    return this.subtype ? `${base} (${this.subtype})` : base;
  }
}

/* -------------------------------------------- */

/** Feats: general, telepathy or racial. Prerequisites are structured so they can be checked. */
export class FeatData extends TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      category: str("general"),              // general | telepathy | racial
      race: str(),
      prerequisites: new fields.SchemaField({
        abilities: new fields.ObjectField({ initial: {} }),   // { str: 13 }
        skills: new fields.ObjectField({ initial: {} }),      // { bluff: 5 }
        bab: int(),
        feats: new fields.ArrayField(str(), { initial: [] }),
        characterLevel: int(),
        pRatingMin: int(),
        pRatingMax: new fields.NumberField({ required: true, integer: true, nullable: true, initial: null }),
        firstLevelOnly: bool(false),
        caste: str(),                        // Minbari feats gate on the caste
        other: str()                         // narrative gates — reported, never enforced
      }),
      repeatable: new fields.SchemaField({
        allowed: bool(false),
        stacks: bool(false)                  // Toughness stacks; most just take a new choice
      }),
      requiresChoice: bool(false),
      choice: new fields.SchemaField({
        type: str(),                         // weapon | skill | craft | ability | …
        value: str()
      }),
      usage: new fields.SchemaField({
        activation: str("passive"),          // passive | action | reaction
        perDay: int(),
        duration: str()
      }),
      benefit: html(),
      bonuses: bonuses()
    };
  }
}

/* -------------------------------------------- */

/**
 * One Influence score per faction. It is not a point pool: the score never refreshes,
 * checks roll `score + 2d6`, and the only spend is *burning* points permanently.
 */
export class InfluenceData extends TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      faction: str(),
      category: str("political"),
      base: int(),
      burned: int(),                         // permanent reductions
      misc: int(),
      value: int(),                          // derived
      usesThisWeek: int(),                   // drives the −4 repeat penalty
      pressures: html()
    };
  }

  prepareDerivedData() {
    this.value = Math.max(0, this.base - this.burned + this.misc);
    this.repeatPenalty = this.usesThisWeek * B5.INFLUENCE_REPEAT_PENALTY;
  }
}

/* -------------------------------------------- */

/** A telepathic ability. Using one whose Power exceeds the P-Rating costs nonlethal damage. */
export class TelepathicAbilityData extends TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      discipline: str("scan"),
      power: int(1),                         // required P-Rating to use for free
      action: str(),
      range: str(),
      duration: str(),
      concentration: bool(false),
      saveType: str("will"),
      multiSubject: bool(false),
      variations: new fields.ArrayField(
        new fields.SchemaField({ name: str(), power: int(), description: html() }),
        { initial: [] }
      )
    };
  }

  /** Mental effort: (power − P-Rating) d4 nonlethal, capped at 6 dice. */
  get mentalEffortDice() {
    const p = this.parent.actor?.system?.telepathy?.pRating?.value ?? 0;
    return Math.min(Math.max(0, this.power - p), B5.MAX_MENTAL_EFFORT_DICE);
  }
}
