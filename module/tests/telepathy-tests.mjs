import {
  SAVE_SUCCESS_NONLETHAL, TRAIT_DCS,
  checkDc, checkParts, mentalEffortDie, partsTotal, reach, requiredPower
} from "../system/telepathy.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Using a telepathic ability (book pp. 116–131).
 *
 * The pipeline the rules describe:
 *
 *   is the ability in reach at all (Power ≤ P-Rating + 6)?
 *   → mental effort if the P-Rating falls short: Nd4 nonlethal, or Nd3 with Discipline Focus,
 *     or N points of lethal damage instead — and the boost is void if it knocks you out
 *   → the Telepathy check, against the ability's DC plus its variation and the second-ability bump
 *   → the subject's Will save at `5 + P-Rating + telepath level + Cha`, which on a success costs
 *     the telepath one more point of nonlethal
 *
 * What is left to the table: whether the ability's *effect* happened. The book is explicit that
 * a failed Telepathy check often still activates the ability — the telepath simply fails to get
 * what he was after, or causes side effects — so the card reports the check and the save and
 * stops there rather than inventing an outcome.
 */
export default class B5TelepathyTests {

  /* -------------------------------------------- */
  /*  Dialog                                      */
  /* -------------------------------------------- */

  /** Ask for the options this use needs, then resolve it. */
  static async promptAbility(actor, itemId) {
    const item = actor.items.get(itemId);
    if (item?.type !== "telepathicAbility" || !actor.isOwner) return null;

    const tel = actor.system.telepathy;
    const ability = item.system;

    if (ability.outOfReach) {
      ui.notifications.warn(game.i18n.format("B5.Warning.abilityOutOfReach", {
        ability: item.name, power: ability.power, ceiling: tel.effectiveP + 6
      }));
      return null;
    }

    const variationOptions = ability.variations.map((v, index) => {
      const dc = v.dcMode === "absolute"
        ? `DC ${v.dc}`
        : `DC ${v.dc >= 0 ? "+" : ""}${v.dc}`;
      return `<option value="${index}">${v.name} — ${dc}</option>`;
    }).join("");

    const secondAbility = tel.maintaining.length > 0;
    const effortLine = ability.needsEffort
      ? game.i18n.format("B5.Telepathy.effortNeeded", {
        dice: ability.mentalEffortDice, die: `d${ability.mentalEffortDie}`,
        power: ability.power, rating: tel.effectiveP
      })
      : game.i18n.format("B5.Telepathy.withinRating", { rating: tel.effectiveP });

    const content = `
      <p class="b5-hint">
        ${game.i18n.localize("B5.Field.power")} ${ability.power} ·
        ${game.i18n.localize("B5.Field.dc")} ${ability.dc} ·
        ${game.i18n.localize(`B5.Range.${ability.effectiveRange}`)} ·
        ${game.i18n.localize(`B5.Discipline.${ability.discipline}`)}
      </p>
      <p class="${ability.needsEffort ? "b5-warning-inline" : "b5-hint"}">${effortLine}</p>
      ${secondAbility ? `<p class="b5-warning-inline">${game.i18n.format("B5.Telepathy.secondAbility", {
        count: tel.maintaining.length,
        bump: tel.synergist ? 2 : 4
      })}</p>` : ""}

      ${variationOptions ? `<div class="form-group"><label>${game.i18n.localize("B5.Telepathy.variation")}</label>
        <select name="variation"><option value="">—</option>${variationOptions}</select></div>` : ""}
      ${ability.multiSubject ? `<div class="form-group"><label>${game.i18n.localize("B5.Telepathy.subjects")}</label>
        <input type="number" name="subjects" value="1" min="1"></div>` : ""}
      <div class="form-group"><label>
        <input type="checkbox" name="touching"> ${game.i18n.localize("B5.Telepathy.touching")}</label></div>
      <div class="form-group"><label>
        <input type="checkbox" name="crossSpecies" ${tel.adaptiveMind ? "disabled" : ""}>
        ${game.i18n.localize("B5.Telepathy.crossSpecies")}</label></div>
      ${ability.needsEffort ? `<div class="form-group"><label>
        <input type="checkbox" name="lethal"> ${game.i18n.localize("B5.Telepathy.takeLethal")}</label></div>` : ""}
      <div class="form-group"><label>${game.i18n.localize("B5.Order.dcOverride")}</label>
        <input type="number" name="dc" placeholder="${game.i18n.localize("B5.Telepathy.dcOverrideHint")}"></div>
      <div class="form-group"><label>${game.i18n.localize("B5.Field.misc")}</label>
        <input type="number" name="misc" value="0"></div>`;

    const result = await DialogV2.prompt({
      window: { title: game.i18n.format("B5.Telepathy.use", { ability: item.name }) },
      classes: ["b5-dialog"],
      content,
      ok: {
        label: game.i18n.localize("B5.Telepathy.useShort"),
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      rejectClose: false
    });
    if (!result) return null;

    return this.useAbility(actor, itemId, {
      variationIndex: result.variation === "" || result.variation == null ? null : Number(result.variation),
      subjects: Math.max(1, Number(result.subjects) || 1),
      touching: !!result.touching,
      crossSpecies: !!result.crossSpecies,
      lethal: !!result.lethal,
      dcOverride: Number.isNumeric(result.dc) && result.dc !== null ? Number(result.dc) : null,
      misc: Number(result.misc) || 0
    });
  }

  /* -------------------------------------------- */
  /*  Resolution                                  */
  /* -------------------------------------------- */

  static async useAbility(actor, itemId, {
    variationIndex = null, subjects = 1, touching = false, crossSpecies = false,
    lethal = false, dcOverride = null, misc = 0
  } = {}) {
    const item = actor.items.get(itemId);
    if (item?.type !== "telepathicAbility") return null;

    // Extra subjects raise the Power the ability demands before anything else is decided.
    const power = requiredPower(item, subjects);

    // Priced against the standing rating, never against a rating a previous ability borrowed:
    // mental effort buys one use, so each use pays for itself.
    const state = reach(actor.system.telepathy.ratedP, power);
    if (state.outOfReach) {
      ui.notifications.warn(game.i18n.format("B5.Warning.abilityOutOfReach", {
        ability: item.name, power, ceiling: actor.system.telepathy.ratedP + 6
      }));
      return null;
    }

    const effort = state.dice > 0
      ? await this.#applyMentalEffort(actor, item, { dice: state.dice, lethal })
      // No effort means no boost — the save DC must not inherit the last ability's.
      : await this.#clearBoost(actor);

    // The boost only holds while the telepath stays conscious.
    if (effort?.unconscious) {
      await this.#postCard(actor, item, { effort, knockedOut: true, subjects });
      return { effort, knockedOut: true };
    }

    const secondAbility = actor.system.telepathy.maintaining.length > 0;
    const variation = variationIndex === null ? null : item.system.variations[variationIndex] ?? null;
    const computed = checkDc(actor, item, { variation, secondAbility });
    // Reflect Attack and its like set their DC from the opposing telepath's result, so the
    // dialog takes a number when the table already knows it.
    const dc = dcOverride ?? computed.dc;
    const dcParts = computed.parts;

    const parts = checkParts(actor, item, { touching, subjects, crossSpecies, misc });
    const modifier = partsTotal(parts);
    const roll = await new Roll("1d20 + @modifier", { modifier }).evaluate();
    const success = roll.total >= dc;

    // An ability held over rounds needs the action spent every round; the tray is the reminder.
    if (success && item.system.concentration) {
      const maintaining = [...new Set([...actor.system.telepathy.maintaining, item.id])];
      await actor.update({ "system.telepathy.maintaining": maintaining });
    }

    const report = {
      item, roll, dc, dcParts, parts, modifier, success, effort, variation, subjects,
      // Self and area abilities have no subject to resist — Mind Mirror, Psychometry and
      // Sense Telepathy carry no save type, so their cards carry no save block.
      saveDC: item.system.saveType ? actor.system.telepathy.saveDC : null
    };
    await this.#postCard(actor, item, report);
    return report;
  }

  /**
   * Mental effort: one die per point of P-Rating borrowed, as nonlethal damage — or one point
   * of lethal per die, at the telepath's option. Mental Fortress never reduces it, and neither
   * does anything else, so the damage bypasses DR.
   */
  static async #applyMentalEffort(actor, item, { dice, lethal }) {
    const die = mentalEffortDie(actor, item.system.discipline);
    let roll = null;
    let amount = dice;

    if (!lethal) {
      roll = await new Roll(`${dice}d${die}`).evaluate();
      amount = roll.total;
    }

    await actor.applyDamage(amount, { nonlethal: !lethal, ignoreDr: true });
    await actor.update({ "system.telepathy.pRating.temp": dice });

    const hp = actor.system.attributes.hp;
    return {
      dice, die, lethal, amount, roll,
      // Nonlethal damage equal to or above current hit points puts the telepath under.
      unconscious: !lethal ? hp.nonlethal >= hp.value : hp.value <= 0
    };
  }

  /**
   * The two traits run underneath the mind shield and take no mental effort — they are a flat
   * Telepathy check against a fixed DC.
   */
  static async rollTrait(actor, trait, { strongEmotions = false, misc = 0 } = {}) {
    const tel = actor.system.telepathy;
    if (!tel.traits?.[trait]) {
      ui.notifications.warn(game.i18n.format("B5.Warning.traitUnavailable", {
        trait: game.i18n.localize(`B5.Telepathy.trait.${trait}`)
      }));
      return null;
    }

    const parts = checkParts(actor, null, { misc, isTrait: true });
    // Gloves dull an accidental scan, which is always a touch.
    if (trait === "accidentalScan" && tel.gloves) parts.push({ key: "gloves", value: -2 });
    if (trait === "accidentalScan" && strongEmotions) parts.push({ key: "strongEmotions", value: 4 });

    const modifier = partsTotal(parts);
    const dc = TRAIT_DCS[trait];
    const roll = await new Roll("1d20 + @modifier", { modifier }).evaluate();

    await this.#postTraitCard(actor, trait, { roll, dc, parts, success: roll.total >= dc });
    return { roll, dc, success: roll.total >= dc };
  }

  /** Cancelling an ability you are maintaining is a free action. */
  static async cancelAbility(actor, itemId) {
    const maintaining = actor.system.telepathy.maintaining.filter(id => id !== itemId);
    await actor.update({ "system.telepathy.maintaining": maintaining });
  }

  /** The mental-effort boost lasts the round; this is the "round is over" button. */
  static async clearMentalEffort(actor) {
    await actor.update({ "system.telepathy.pRating.temp": 0 });
  }

  static async #clearBoost(actor) {
    if (actor.system.telepathy.pRating.temp) await this.clearMentalEffort(actor);
    return null;
  }

  /* -------------------------------------------- */
  /*  Resisting                                   */
  /* -------------------------------------------- */

  /**
   * Roll the Will save for every targeted token. A subject who saves is unaffected and the
   * telepath takes one point of nonlethal for the effort (book p. 119).
   */
  static async rollResistance(message) {
    const data = message.flags?.babylon5?.telepathy;
    if (!data) return null;

    const subjects = [...game.user.targets].map(token => token.actor)
      .filter(a => a?.system?.saves && a.isOwner);
    if (!subjects.length) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.noSaveTargets"));
      return null;
    }

    const telepath = await fromUuid(data.telepathUuid);
    const results = [];
    for (const subject of subjects) {
      // A subject with his own mind shield up adds his P-Rating to the save.
      const shield = subject.system.telepathy?.mindShield?.willBonus ?? 0;
      const roll = await subject.rollSave("will", {
        situational: shield,
        flavour: game.i18n.format("B5.Telepathy.resisting", { ability: data.ability })
      });
      const saved = roll.total >= data.saveDC;
      results.push({ name: subject.name, total: roll.total, saved, shield });
      // Each subject who shrugs it off costs the telepath a point.
      if (saved && telepath?.isOwner) {
        await telepath.applyDamage(SAVE_SUCCESS_NONLETHAL, { nonlethal: true, ignoreDr: true });
      }
    }

    const lines = results.map(r => `<li class="${r.saved ? "fail" : "ok"}">${r.name} — ${r.total} `
      + `${game.i18n.localize(r.saved ? "B5.Telepathy.saved" : "B5.Telepathy.affected")}</li>`).join("");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: telepath }),
      content: `<div class="b5-order-card b5-telepathy-card">
        <div class="b5-order-head"><span class="b5-order-name">${data.ability}</span>
          <span class="b5-order-type">${game.i18n.localize("B5.Telepathy.willSave")} ${data.saveDC}</span></div>
        <ul class="b5-telepathy-saves">${lines}</ul></div>`
    });
    return results;
  }

  /* -------------------------------------------- */
  /*  Chat                                        */
  /* -------------------------------------------- */

  static async #postCard(actor, item, report) {
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/babylon5/templates/chat/telepathy.hbs", {
        name: item.name,
        discipline: game.i18n.localize(`B5.Discipline.${item.system.discipline}`),
        power: item.system.power,
        range: game.i18n.localize(`B5.Range.${item.system.effectiveRange}`),
        subjects: report.subjects > 1 ? report.subjects : null,
        variation: report.variation?.name ?? null,
        effort: report.effort ? {
          dice: report.effort.dice,
          die: report.effort.die,
          lethal: report.effort.lethal,
          amount: report.effort.amount
        } : null,
        knockedOut: !!report.knockedOut,
        parts: report.parts?.map(p => ({
          label: game.i18n.localize(`B5.Telepathy.part.${p.key}`), value: p.value
        })),
        total: report.roll?.total,
        dc: report.dc,
        success: report.success,
        maintained: report.success && item.system.concentration,
        saveDC: report.saveDC,
        saveType: item.system.saveType
      });

    const data = {
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls: [report.effort?.roll, report.roll].filter(Boolean),
      sound: CONFIG.sounds.dice,
      flags: report.saveDC ? {
        babylon5: { telepathy: { saveDC: report.saveDC, ability: item.name, telepathUuid: actor.uuid } }
      } : {}
    };
    ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
    await ChatMessage.create(data);
  }

  static async #postTraitCard(actor, trait, { roll, dc, parts, success }) {
    const label = game.i18n.localize(`B5.Telepathy.trait.${trait}`);
    const breakdown = parts.map(p =>
      `${game.i18n.localize(`B5.Telepathy.part.${p.key}`)} ${p.value >= 0 ? "+" : ""}${p.value}`).join(" · ");

    const data = {
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="b5-order-card b5-telepathy-card">
        <div class="b5-order-head"><span class="b5-order-name">${label}</span>
          <span class="b5-order-type">DC ${dc}</span></div>
        <div class="b5-order-line">${breakdown}</div>
        <div class="b5-order-result ${success ? "ok" : "fail"}">
          ${roll.total} — ${game.i18n.localize(success ? "B5.Order.success" : "B5.Order.failure")}</div>
        <div class="b5-order-foot">${game.i18n.localize(`B5.Telepathy.traitHint.${trait}`)}</div>
      </div>`,
      rolls: [roll],
      sound: CONFIG.sounds.dice
    };
    ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
    await ChatMessage.create(data);
  }
}
