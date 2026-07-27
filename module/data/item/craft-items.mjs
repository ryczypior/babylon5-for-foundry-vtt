import { B5 } from "../../config.mjs";
import { int, str, bool, html } from "../fields.mjs";

const fields = foundry.data.fields;
const TypeDataModel = foundry.abstract.TypeDataModel;

/** A weapon battery mounted in one of a craft's firing arcs. */
export class CraftWeaponData extends TypeDataModel {
  static defineSchema() {
    return {
      description: html(),
      source: str(),
      internalId: str(),
      arc: str("fore"),                      // fore | aft | port | starboard | turret
      range: str("medium"),                  // close | medium | long
      offence: int(),
      qualities: new fields.ArrayField(str(), { initial: [] }),  // AP, Twin-Linked, Interceptor, …
      weaponSpaces: int(1),
      count: int(1),
      destroyed: bool(false)
    };
  }
}

/** A named craft feature (Adaptive Armour, Interceptors, Jump Engine, …). */
export class CraftFeatureData extends TypeDataModel {
  static defineSchema() {
    return {
      description: html(),
      source: str(),
      internalId: str(),
      effect: str(),
      /** A destroyed feature absorbs 1d4 damage on a location roll of 12. */
      absorbsDamage: bool(true),
      destroyed: bool(false)
    };
  }
}
