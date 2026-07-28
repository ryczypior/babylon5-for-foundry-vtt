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
      /** Weapon spaces knocked out so far; the mount dies when they run out. */
      spacesLost: int(),
      /** Failed its DC 25 check after a partial hit: −2 to hit and half Offence. */
      impaired: bool(false),
      destroyed: bool(false)
    };
  }

  /** @override */
  prepareDerivedData() {
    this.totalSpaces = Math.max(1, this.weaponSpaces) * Math.max(1, this.count);
    this.spacesLeft = Math.max(0, this.totalSpaces - this.spacesLost);
    // Losing every space destroys the mount; the flag can also be set by hand and stays set.
    if (this.spacesLost >= this.totalSpaces) this.destroyed = true;

    this.effectiveOffence = this.impaired ? Math.floor(this.offence / 2) : this.offence;
    this.attackPenalty = this.impaired ? -2 : 0;
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
