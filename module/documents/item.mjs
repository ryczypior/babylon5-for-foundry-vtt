/**
 * Base Item document. Type-specific behaviour lives in the data models; this class exposes
 * the few things the sheets and chat cards need from any item.
 */
export default class B5Item extends Item {

  /** @override */
  getRollData() {
    const data = { ...this.system };
    if (this.actor) data.actor = this.actor.getRollData();
    return data;
  }

  /** Weapons roll with whichever attack line they declare (close combat, ranged, gunnery…). */
  async rollAttack(options = {}) {
    if (this.type !== "weapon" || !this.actor) return null;
    return this.actor.rollAttack(this.system.attackLine, {
      ...options,
      flavour: game.i18n.format("B5.Roll.WeaponAttack", { weapon: this.name })
    });
  }

  /** Damage roll; the AP value travels with it so the target can apply DR correctly. */
  async rollDamage() {
    if (this.type !== "weapon") return null;
    const roll = await new Roll(this.system.damage, this.getRollData()).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: game.i18n.format("B5.Roll.WeaponDamage", { weapon: this.name })
    });
    return roll;
  }
}
