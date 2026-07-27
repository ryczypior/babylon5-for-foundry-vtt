import { B5 } from "../../config.mjs";
import { int, num, str, bool, html } from "../fields.mjs";

const fields = foundry.data.fields;
const TypeDataModel = foundry.abstract.TypeDataModel;

/** Fields shared by everything a character can carry. */
const physical = () => ({
  description: html(),
  source: str(),
  internalId: str(),
  quantity: int(1),
  weight: num(),
  cost: int(),
  legality: str("unrestricted"),   // unrestricted | restricted | illegal
  carried: bool(true)
});

/* -------------------------------------------- */

export class WeaponData extends TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      category: str("pistol"),               // closeCombat | exotic | grenade | heavy | pistol | rifle
      damage: str("1d6"),
      damageType: str("bludgeoning"),
      critical: str("20/x2"),
      rangeIncrement: int(),                 // 0 = melee
      areaOfEffect: str(),
      size: str("medium"),
      ap: int(),                             // armour piercing: ignores this much DR
      features: new fields.ArrayField(str(), { initial: [] }),
      ammo: new fields.SchemaField({
        usesAmmo: bool(false),
        ammoId: str(),                       // internalId of the matching ammunition
        capacity: int(),                     // capacity is per weapon, not per clip
        current: int()
      }),
      rateOfFire: str("single"),             // single | burst | automatic
      equipped: bool(false),
      attackLine: str("personalRanged"),     // which of the four attack bonuses applies
      notes: str()
    };
  }

  /** Melee weapons have no range increment. */
  get isMelee() {
    return this.category === "closeCombat" || this.rangeIncrement === 0;
  }
}

/* -------------------------------------------- */

/** Armour grants Damage Reduction — it never contributes to Defence Value. */
export class ArmourData extends TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      dr: int(),
      speedReduction: int(),
      acp: int(),                            // hits Acrobatics, Athletics, Drive, Pilot, Stealth
      worn: bool(false),
      notes: str()
    };
  }

  /** Donning takes ACP + 1 minutes, halved on a DC 15 Dex check. */
  get donTimeMinutes() {
    return this.acp + 1;
  }
}

/* -------------------------------------------- */

export class AmmunitionData extends TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      ammoId: str(),                         // matched against weapon.system.ammo.ammoId
      capacity: int(),                       // rounds delivered when loaded
      notes: str()
    };
  }
}

/* -------------------------------------------- */

export class GearData extends TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      subtype: str("tool"),                  // communication | computer | medical | tool | survival | security | accessory | implant
      skillBonuses: new fields.ArrayField(
        new fields.SchemaField({ skill: str(), subtype: str(), bonus: int() }),
        { initial: [] }
      ),
      uses: new fields.SchemaField({ value: int(), max: int() }),
      notes: str()
    };
  }
}

/* -------------------------------------------- */

/** Scopes, silencers and tripods attach to a weapon. */
export class WeaponAccessoryData extends TypeDataModel {
  static defineSchema() {
    return {
      ...physical(),
      mountsOn: new fields.ArrayField(str(), { initial: [] }),   // weapon categories
      attachedTo: str(),                     // id of the weapon Item
      effect: str(),
      notes: str()
    };
  }
}
