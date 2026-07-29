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
      /** Prestige classes stop short of ten — the Fence has five levels. */
      maxLevel: int(B5.MAX_CLASS_LEVEL),
      isPrestige: bool(false),
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

  /**
   * Only the actor-independent part is computed here. Embedded items are prepared *before*
   * the actor's derived data, so reading `abilities.<x>.mod` at this point yields the value
   * from the previous preparation cycle — stale right after an ability changes. The owning
   * CharacterData finishes the total in `#prepareSkills()`.
   */
  prepareDerivedData() {
    this.total = Math.floor(this.ranks) + this.misc + this.synergy;
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
      /** political | social | economic | military | specialised | general (book p. 110) */
      category: str("political"),
      /** earth | centauri | narn | minbari | league | general — the other half of that table. */
      race: str("general"),
      base: int(),
      burned: int(),                         // permanent reductions
      misc: int(),
      value: int(),                          // derived
      usesThisWeek: int(),                   // drives the −4 repeat penalty
      /** The printed prose lines of a faction's description (book pp. 110–119). */
      obtainedBy: html(),
      contacts: html(),
      pressures: html(),
      /** any | pre2261 | post2261 — the Rangers, the Vorlons and the Shadows are era-bound. */
      era: str("any"),
      /**
       * The faction's own resource table (book §A.16): what may be asked for, and at what DC.
       * These **override** the generic DC list, so a faction that has a table is asked from it.
       *
       * Authored in the compendium source rather than on the sheet, like the telepathic
       * abilities' variations: array-valued inputs corrupt on `expandObject`.
       */
      resources: new fields.ArrayField(
        new fields.SchemaField({ dc: int(10), description: str() }),
        { initial: [] }
      )
    };
  }

  prepareDerivedData() {
    this.value = Math.max(0, this.base - this.burned + this.misc);
    // The unsoftened figure; `CharacterData.#prepareInfluence()` replaces it on an owned entry,
    // because which class features apply is the actor's business and not knowable here.
    this.repeatPenaltyPerUse = B5.INFLUENCE_REPEAT_PENALTY;
    this.repeatSoftenedBy = null;
    this.repeatPenalty = this.usesThisWeek * B5.INFLUENCE_REPEAT_PENALTY;
  }
}

/* -------------------------------------------- */

/** A telepathic ability. Using one whose Power exceeds the P-Rating costs nonlethal damage. */
export class TelepathicAbilityData extends TypeDataModel {
  static defineSchema() {
    return {
      ...common(),
      discipline: str("scanning"),
      power: int(1),                         // required P-Rating to use for free
      dc: int(10),                           // base Telepathy check DC
      action: str("standard"),               // free | standard | full | special
      actionNote: str(),                     // "10 min per hour of memory", "min 1 minute"
      range: new fields.SchemaField({
        band: str("close"),                  // self | touch | close | medium | long
        /** Higher P-Ratings widen the band: Surface Scan is Close, Medium at P10. */
        upgrades: new fields.ArrayField(
          new fields.SchemaField({ pRating: int(), band: str() }), { initial: [] }
        )
      }),
      duration: str(),
      concentration: bool(false),
      saveType: str("will"),
      multiSubject: bool(false),
      /**
       * Alternative uses of the same ability. An `absolute` variation replaces the base DC, a
       * `delta` one adds to it — both forms are printed, so both are modelled.
       */
      variations: new fields.ArrayField(
        new fields.SchemaField({
          name: str(),
          dcMode: str("delta"),              // delta | absolute
          dc: int(),
          description: html()
        }),
        { initial: [] }
      )
    };
  }

  /**
   * @override — only what does not depend on the owner.
   *
   * Whether this ability is within reach, what the mental effort costs and how far it reaches
   * are all functions of the telepath's current P-Rating, and item-derived data is prepared
   * *before* the actor's — reading `effectiveP` here would get the previous cycle's value, which
   * is exactly wrong the moment mental effort moves it. `CharacterData.#prepareTelepathy()`
   * fills these in instead; the nulls are what an unowned item shows.
   */
  prepareDerivedData() {
    this.effectiveRange = this.range.band;
    this.mentalEffortDice = null;
    this.mentalEffortDie = null;
    this.outOfReach = false;
    this.needsEffort = false;
  }
}
