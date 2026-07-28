import { B5 } from "../config.mjs";
import { promptRollModifiers } from "../tests/roll-dialog.mjs";
import { influenceDice } from "../system/influence.mjs";

/**
 * Base Actor document. Derived data lives in the type data models; this class holds the
 * roll pipeline and the damage rules that are shared by every actor type.
 */
export default class B5Actor extends Actor {

  /** @override */
  getRollData() {
    const data = { ...this.system };
    if (this.system.abilities) {
      for (const [key, ability] of Object.entries(this.system.abilities)) {
        data[key] = ability.mod;
      }
    }
    data.level = this.system.progression?.level ?? 0;
    data.bab = this.system.attributes?.bab?.value ?? 0;
    return data;
  }

  /* -------------------------------------------- */
  /*  Rolls                                       */
  /* -------------------------------------------- */

  /**
   * Skill check: 1d20 + ranks + ability mod + misc + synergy − armour check penalty.
   * @param {string} skillKey  key in `system.skills`, or an Item id for a subtyped skill
   * @param {object} [options] {situational, flavour, prompt, parts, rollMode}
   */
  async rollSkill(skillKey, options = {}) {
    const skill = this.system.skills?.[skillKey];
    const item = skill ? null : this.items.get(skillKey);
    if (!skill && !item) return null;

    const total = skill ? skill.total : item.system.total;
    const label = skill
      ? game.i18n.localize(`B5.Skill.${skillKey}`)
      : item.name;

    return this.#rollCheck({
      ...options,
      formula: "1d20",
      modifier: total,
      kind: "skill",
      label,
      flavour: options.flavour ?? game.i18n.format("B5.Roll.SkillCheck", { skill: label })
    });
  }

  /** Saving throw: 1d20 + class bonus + ability mod + misc. */
  async rollSave(saveKey, options = {}) {
    const save = this.system.saves?.[saveKey];
    if (!save) return null;
    const label = game.i18n.localize(`B5.Save.${saveKey}`);
    return this.#rollCheck({
      ...options,
      formula: "1d20",
      modifier: save.total,
      kind: "save",
      subtype: saveKey,
      label,
      flavour: options.flavour ?? game.i18n.format("B5.Roll.SaveCheck", { save: label })
    });
  }

  /** One of the four attack lines (or feint / resist feint). */
  async rollAttack(lineKey, options = {}) {
    const line = this.system.attacks?.[lineKey];
    if (!line) return null;
    const label = game.i18n.localize(`B5.Attack.${lineKey}`);
    return this.#rollCheck({
      ...options,
      formula: "1d20",
      modifier: line.total,
      kind: "attack",
      subtype: lineKey,
      label,
      flavour: game.i18n.format("B5.Roll.AttackCheck", { line: label })
    });
  }

  /** Initiative is a plain Dex check. */
  async rollInitiativeCheck(options = {}) {
    const label = game.i18n.localize("B5.Roll.Initiative");
    return this.#rollCheck({
      ...options,
      formula: "1d20",
      modifier: this.system.attributes?.initiative?.total ?? 0,
      kind: "initiative",
      label,
      flavour: label
    });
  }

  /**
   * Influence check — 2d6, not d20. Repeated attempts on the same faction within a week
   * take a cumulative −4.
   */
  async rollInfluence(itemId, options = {}) {
    const item = this.items.get(itemId);
    if (item?.type !== "influence") return null;
    return this.#rollCheck({
      ...options,
      // Heart of Izil'zha upgrades Ranger Influence to 3d6.
      formula: influenceDice(this, item, B5.INFLUENCE_DICE),
      modifier: item.system.value + item.system.repeatPenalty,
      kind: "influence",
      label: item.name,
      flavour: game.i18n.format("B5.Roll.InfluenceCheck", { faction: item.name })
    });
  }

  /**
   * The one place a roll is assembled. `prompt` opens the modifier dialog first — the sheet
   * passes it on a shift-click, and a macro can ask for it directly. A cancelled dialog returns
   * null rather than rolling.
   */
  async #rollCheck({
    formula, modifier, flavour, kind, label, subtype = null,
    situational = 0, parts = [], prompt = false, rollMode = null
  }) {
    if (prompt) {
      const chosen = await promptRollModifiers(this, { kind, subtype, label, base: modifier });
      if (!chosen) return null;
      situational += chosen.situational;
      parts = [...parts, ...chosen.parts];
      rollMode = chosen.rollMode ?? rollMode;
    }

    const terms = [formula];
    if (modifier) terms.push(`${modifier}`);
    if (situational) terms.push(`${situational}`);
    const roll = await new Roll(terms.join(" + "), this.getRollData()).evaluate();

    // Print what was applied, so a −2 for Shaken is visible rather than folded into a total.
    const breakdown = parts.length
      ? `<div class="b5-roll-parts">${parts.map(part =>
        `${game.i18n.localize(part.labelKey ?? `B5.Modifier.${part.key}`)} `
        + `${part.value >= 0 ? "+" : ""}${part.value}`).join(" · ")}</div>`
      : "";

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `${flavour}${breakdown}`
    }, { rollMode: rollMode ?? undefined });
    return roll;
  }

  /* -------------------------------------------- */
  /*  Damage                                      */
  /* -------------------------------------------- */

  /**
   * Apply damage through the system's pipeline: `damage − max(0, DR − AP)`.
   * DR may reduce a hit to zero — this overrides the usual "minimum 1 damage".
   * Nonlethal damage is tracked separately and never subtracted from hit points.
   */
  async applyDamage(amount, { ap = 0, nonlethal = false, ignoreDr = false } = {}) {
    const dr = ignoreDr ? 0 : (this.system.attributes?.dr?.total ?? 0);
    const reduced = Math.max(0, amount - Math.max(0, dr - ap));
    if (!reduced) return { applied: 0, dr };

    if (nonlethal) {
      const current = this.system.attributes.hp.nonlethal;
      await this.update({ "system.attributes.hp.nonlethal": current + reduced });
    } else {
      const hp = this.system.attributes.hp;
      await this.update({ "system.attributes.hp.value": hp.value - reduced });
    }
    return { applied: reduced, dr };
  }

  /* -------------------------------------------- */

  /** @override — seed a sensible starting state so a fresh actor is not empty. */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;

    const updates = {};
    if (!data.prototypeToken?.actorLink && this.type === "character") {
      updates.prototypeToken = { actorLink: true, sight: { enabled: true }, disposition: 1 };
    }
    if (foundry.utils.isEmpty(updates)) return;
    this.updateSource(updates);
  }
}
