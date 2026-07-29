import { B5 } from "../config.mjs";
import { partsTotal } from "../system/roll-modifiers.mjs";
import { liveTotal, modifierFooter, modifierGroups, readModifierParts } from "./roll-dialog.mjs";
import {
  AID_BONUS, AID_DC, BURN_MULTIPLIER, GENERAL_DCS, burnToClose, influenceDice,
  outlookKey, resourceList, resourceOutlook
} from "../system/influence.mjs";
import {
  PRESSURE_STEP, halveScore, pressureLegality, rangerRestriction, resolveLink, specialParts
} from "../system/pressure.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Resource descriptions are authored prose that ends up inside an attribute and an option label,
 * and several of them carry an apostrophe (Kha'Ri, Anla'Shok). Escaping keeps a stray quote from
 * closing the attribute early.
 */
const escapeHTML = text => foundry.utils.escapeHTML(String(text ?? ""));

/**
 * Influence checks and the burn that follows a failed one (book pp. 106–119).
 *
 * The check is `score + 2d6` against a DC, and burning is the only way to spend Influence: after
 * falling short, permanently give up N points to add 2N. The card works out exactly how many
 * points would close the gap and offers that as one button, because the arithmetic is the whole
 * decision and getting it wrong costs the character permanently.
 *
 * `B5Actor.rollInfluence` remains the plain roll for macros and the shift-click prompt; this is
 * the flow the sheet uses, because it is the one that knows the DC.
 */
export default class B5InfluenceTests {

  /* -------------------------------------------- */
  /*  The check                                   */
  /* -------------------------------------------- */

  /**
   * @param {number|null} dc       a DC decided before the dialog opened (a resource row clicked)
   * @param {string} request       what is being asked for, printed on the card
   */
  static async promptCheck(actor, itemId, { dc: presetDc = null, request = "" } = {}) {
    const item = actor.items.get(itemId);
    if (item?.type !== "influence" || !actor.isOwner) return null;

    const base = item.system.value + item.system.repeatPenalty;
    const dice = influenceDice(actor, item, B5.INFLUENCE_DICE);

    // The faction's own table overrides the generic list (book p. 107), so it is offered first
    // and each row says what the dice still have to produce.
    const ownOptions = resourceList(item).map(resource => {
      const outlook = resourceOutlook(resource.dc, {
        score: item.system.value, penalty: item.system.repeatPenalty, dice
      });
      const key = outlookKey(outlook);
      const marker = key ? game.i18n.localize(key) : `${outlook.needed}+`;
      return `<option value="${resource.dc}" data-request="${escapeHTML(resource.description)}">`
        + `${escapeHTML(resource.description)} — ${resource.dc} (${marker})</option>`;
    }).join("");

    const generalOptions = Object.entries(GENERAL_DCS).map(([key, dc]) => {
      const label = game.i18n.localize(`B5.InfluenceDc.${key}`);
      return `<option value="${dc}" data-request="${escapeHTML(label)}">${label} — ${dc}</option>`;
    }).join("");

    const dcOptions = ownOptions
      ? `<optgroup label="${escapeHTML(item.name)}">${ownOptions}</optgroup>`
        + `<optgroup label="${game.i18n.localize("B5.Influence.generalList")}">${generalOptions}</optgroup>`
      : generalOptions;

    const content = `
      <p class="b5-hint b5-modifier-head">
        ${item.name} — ${game.i18n.localize("B5.Field.score")} <strong>${item.system.value}</strong>
        · ${dice}${dice === B5.INFLUENCE_DICE ? "" : ` (${game.i18n.localize("B5.Influence.heartOfIzilzha")})`}
        ${item.system.repeatPenalty
          ? ` · ${game.i18n.format("B5.Influence.repeat", {
            uses: item.system.usesThisWeek, penalty: item.system.repeatPenalty })}`
          : ""}
      </p>
      ${request ? `<p class="b5-hint">${game.i18n.format("B5.Influence.requesting",
        { request: escapeHTML(request) })}</p>` : ""}
      <div class="form-group"><label>${game.i18n.localize(ownOptions
        ? "B5.Influence.resource" : "B5.Influence.activity")}</label>
        <select name="preset"><option value="">—</option>${dcOptions}</select></div>
      <div class="form-group"><label>${game.i18n.localize("B5.Field.dc")}</label>
        <input type="number" name="dc" value="${presetDc ?? ""}"
          placeholder="${game.i18n.localize("B5.Influence.dcHint")}"></div>
      ${modifierGroups(actor, { kind: "influence" })}
      ${modifierFooter(base)}`;

    const result = await DialogV2.prompt({
      window: { title: game.i18n.format("B5.Influence.checkWith", { faction: item.name }) },
      classes: ["b5-dialog"],
      content,
      render: liveTotal(base),
      ok: {
        label: game.i18n.localize("B5.Roll.roll"),
        callback: (event, button) => {
          const form = button.form;
          const data = new foundry.applications.ux.FormDataExtended(form).object;
          data.parts = readModifierParts(form);
          // What was picked, not just its DC — the card names the request.
          data.request = form.elements.preset?.selectedOptions?.[0]?.dataset.request ?? "";
          return data;
        }
      },
      rejectClose: false
    });
    if (!result) return null;

    // A typed DC wins over the table pick; either may be left blank for an undecided roll.
    const dc = Number.isNumeric(result.dc) && result.dc !== null ? Number(result.dc)
      : (result.preset ? Number(result.preset) : null);

    return this.check(actor, itemId, {
      dc, parts: result.parts ?? [], rollMode: result.rollMode,
      request: result.request || request
    });
  }

  /**
   * Draw on a faction's resources (book §A.16): the same check, with the DC and the request taken
   * from the row that was clicked. The dialog still opens, because a resource draw takes the
   * situational modifiers like any other attempt.
   */
  static async drawResource(actor, itemId, index) {
    const item = actor.items.get(itemId);
    const resource = item?.system.resources?.[index];
    if (!resource) return null;
    return this.promptCheck(actor, itemId, { dc: resource.dc, request: resource.description });
  }

  /** Roll it, count the attempt against the week, and post the card. */
  static async check(actor, itemId, { dc = null, parts = [], rollMode = null, request = "" } = {}) {
    const item = actor.items.get(itemId);
    if (item?.type !== "influence") return null;

    const situational = partsTotal(parts);
    const modifier = item.system.value + item.system.repeatPenalty + situational;
    const dice = influenceDice(actor, item, B5.INFLUENCE_DICE);
    const roll = await new Roll(`${dice} + @modifier`, { modifier }).evaluate();
    const success = dc === null ? null : roll.total >= dc;

    // Every attempt counts against the week, which is what drives the −4 on the next one.
    await item.update({ "system.usesThisWeek": item.system.usesThisWeek + 1 });

    const burn = success === false
      ? burnToClose(roll.total, dc, item.system.value)
      : null;

    await this.#postCard(actor, item, { roll, dc, success, parts, burn, request }, rollMode);
    return { roll, dc, success, burn };
  }

  /* -------------------------------------------- */
  /*  Burning                                     */
  /* -------------------------------------------- */

  /**
   * Burn from the card: the points are already worked out, so this only confirms and applies.
   * The score is reduced permanently — there is no refresh anywhere in this subsystem.
   */
  static async burnFromCard(message) {
    const data = message.flags?.babylon5?.influence;
    if (!data) return null;

    const actor = await fromUuid(data.actorUuid);
    const item = actor?.items.get(data.itemId);
    if (!item) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.influenceGone"));
      return null;
    }
    if (!item.isOwner) return null;

    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("B5.Influence.burnTitle") },
      content: `<p>${game.i18n.format("B5.Influence.burnConfirm", {
        points: data.points, faction: item.name,
        from: item.system.value, to: Math.max(0, item.system.value - data.points),
        result: data.result, dc: data.dc
      })}</p>`
    });
    if (!confirmed) return null;

    return this.burn(actor, item.id, data.points, { result: data.result, dc: data.dc });
  }

  /** Ask how much to burn outside a check — a GM ruling, a favour called in. */
  static async promptBurn(actor, itemId) {
    const item = actor.items.get(itemId);
    if (item?.type !== "influence" || !actor.isOwner) return null;
    if (item.system.value <= 0) {
      ui.notifications.warn(game.i18n.format("B5.Warning.nothingToBurn", { faction: item.name }));
      return null;
    }

    const result = await DialogV2.prompt({
      window: { title: game.i18n.localize("B5.Influence.burnTitle") },
      classes: ["b5-dialog"],
      content: `
        <p class="b5-hint">${game.i18n.format("B5.Influence.burnHint",
          { faction: item.name, score: item.system.value, multiplier: BURN_MULTIPLIER })}</p>
        <div class="form-group"><label>${game.i18n.localize("B5.Influence.points")}</label>
          <input type="number" name="points" value="1" min="1" max="${item.system.value}"></div>`,
      ok: {
        label: game.i18n.localize("B5.Influence.burn"),
        callback: (event, button) =>
          new foundry.applications.ux.FormDataExtended(button.form).object
      },
      rejectClose: false
    });
    if (!result) return null;

    const points = Math.clamp(Number(result.points) || 0, 1, item.system.value);
    return this.burn(actor, itemId, points);
  }

  /** Apply the burn. Permanent: it raises `burned`, which the score is derived against. */
  static async burn(actor, itemId, points, { result = null, dc = null } = {}) {
    const item = actor.items.get(itemId);
    if (item?.type !== "influence" || points <= 0) return null;

    const spent = Math.min(points, item.system.value);
    const before = item.system.value;
    await item.update({ "system.burned": item.system.burned + spent });

    const boosted = result === null ? null : result + spent * BURN_MULTIPLIER;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="b5-order-card b5-influence-card">
        <div class="b5-order-head">
          <span class="b5-order-name">${item.name}</span>
          <span class="b5-order-type">${game.i18n.localize("B5.Influence.burned")}</span>
        </div>
        <div class="b5-order-line">${game.i18n.format("B5.Influence.burnResult", {
          points: spent, from: before, to: item.system.value
        })}</div>
        ${boosted === null ? "" : `<div class="b5-order-result ${boosted >= dc ? "ok" : "fail"}">
          ${game.i18n.format("B5.Influence.burnOutcome", { result: boosted, dc })} —
          ${game.i18n.localize(boosted >= dc ? "B5.Order.success" : "B5.Order.failure")}</div>`}
        <div class="b5-order-foot">${game.i18n.localize("B5.Influence.permanent")}</div>
      </div>`
    });
    return { spent, value: item.system.value, result: boosted };
  }

  /**
   * Aid another character's Influence attempt (book p. 113): the helper makes a check of the
   * *same kind* against a flat DC 10, and a success is worth +2 to the character being helped.
   *
   * It is the helper's own roll, on the helper's own entry, which is why this lives beside the
   * check rather than inside it — the character being helped just ticks the preset the card
   * tells them they have earned.
   */
  static async aid(actor, itemId) {
    const item = actor.items.get(itemId);
    if (item?.type !== "influence" || !actor.isOwner) return null;

    const dice = influenceDice(actor, item, B5.INFLUENCE_DICE);
    const modifier = item.system.value + item.system.repeatPenalty;
    const roll = await new Roll(`${dice} + @modifier`, { modifier }).evaluate();
    const success = roll.total >= AID_DC;

    // Aiding is an attempt like any other, so it counts against the week.
    await item.update({ "system.usesThisWeek": item.system.usesThisWeek + 1 });

    const data = {
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="b5-order-card b5-influence-card">
        <div class="b5-order-head">
          <span class="b5-order-name">${item.name}</span>
          <span class="b5-order-type">${game.i18n.localize("B5.Influence.aiding")}</span>
        </div>
        <div class="b5-order-result ${success ? "ok" : "fail"}">
          ${roll.total} ${game.i18n.localize("B5.Order.versus")} ${AID_DC} —
          ${game.i18n.localize(success ? "B5.Influence.aidGranted" : "B5.Influence.aidFailed")}
        </div>
        <div class="b5-order-foot">${game.i18n.localize("B5.Influence.aidHint")}</div>
      </div>`,
      rolls: [roll],
      sound: CONFIG.sounds.dice
    };
    ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
    await ChatMessage.create(data);
    return { roll, success, bonus: success ? AID_BONUS : 0 };
  }

  /* -------------------------------------------- */
  /*  Pressure                                    */
  /* -------------------------------------------- */

  /**
   * Lean on another faction (book p. 113). Resolved **one link at a time**, because that is how
   * it plays: this faction agrees, and only then does the question of who *they* lean on arise.
   * The card for a link that carries pays it forward with a button.
   *
   * @param {number|null} carried  a result inherited from the previous link, already reduced
   */
  static async promptPressure(actor, itemId, { carried = null, chain = [] } = {}) {
    const item = actor.items.get(itemId);
    if (item?.type !== "influence" || !actor.isOwner) return null;

    const raceOptions = B5.influenceRaces.map(r =>
      `<option value="${r}">${game.i18n.localize(`B5.InfluenceRace.${r}`)}</option>`).join("");
    const typeOptions = B5.influenceCategories.map(c =>
      `<option value="${c}">${game.i18n.localize(`B5.InfluenceCategory.${c}`)}</option>`).join("");

    const base = item.system.value + item.system.repeatPenalty;
    const dice = influenceDice(actor, item, B5.INFLUENCE_DICE);

    const content = `
      <p class="b5-hint b5-modifier-head">
        ${carried === null
          ? game.i18n.format("B5.Pressure.opening", {
            faction: item.name, score: item.system.value, dice })
          : game.i18n.format("B5.Pressure.carrying", { result: carried, step: PRESSURE_STEP })}
      </p>
      <div class="form-group"><label>${game.i18n.localize("B5.Pressure.targetRace")}</label>
        <select name="race">${raceOptions}</select></div>
      <div class="form-group"><label>${game.i18n.localize("B5.Pressure.targetType")}</label>
        <select name="category">${typeOptions}</select></div>
      <div class="form-group"><label>${game.i18n.localize("B5.Pressure.targetName")}</label>
        <input type="text" name="target" placeholder="${game.i18n.localize("B5.Pressure.targetHint")}"></div>

      <fieldset class="b5-modifier-group">
        <legend>${game.i18n.localize("B5.Pressure.special")}</legend>
        <label class="b5-modifier-row"><input type="checkbox" name="socialToSocial">
          <span class="b5-modifier-name">${game.i18n.localize("B5.Pressure.socialToSocial")}</span>
          <span class="b5-modifier-value">−5</span></label>
        <label class="b5-modifier-row"><input type="checkbox" name="greyCouncil">
          <span class="b5-modifier-name">${game.i18n.localize("B5.Pressure.greyCouncil")}</span>
          <span class="b5-modifier-value">½</span></label>
        <label class="b5-modifier-row"><input type="checkbox" name="leagueSocial">
          <span class="b5-modifier-name">${game.i18n.localize("B5.Pressure.leagueSocial")}</span>
          <span class="b5-modifier-value">½</span></label>
      </fieldset>

      <div class="form-group"><label>${game.i18n.localize("B5.Pressure.finalDc")}</label>
        <input type="number" name="dc" placeholder="${game.i18n.localize("B5.Pressure.finalDcHint")}"></div>
      ${carried === null ? `<div class="form-group"><label>${game.i18n.localize("B5.Field.misc")}</label>
        <input type="number" name="misc" value="0"></div>` : ""}`;

    const result = await DialogV2.prompt({
      window: { title: game.i18n.format("B5.Pressure.title", { faction: item.name }) },
      classes: ["b5-dialog"],
      content,
      ok: {
        label: game.i18n.localize("B5.Pressure.apply"),
        callback: (event, button) =>
          new foundry.applications.ux.FormDataExtended(button.form).object
      },
      rejectClose: false
    });
    if (!result) return null;

    return this.pressure(actor, itemId, {
      carried, chain,
      race: result.race,
      category: result.category,
      target: result.target,
      socialToSocial: !!result.socialToSocial,
      greyCouncil: !!result.greyCouncil,
      leagueSocial: !!result.leagueSocial,
      dc: Number.isNumeric(result.dc) && result.dc !== null ? Number(result.dc) : null,
      misc: Number(result.misc) || 0,
      base, dice
    });
  }

  /** Resolve one link and post it. */
  static async pressure(actor, itemId, {
    carried = null, chain = [], race = null, category = null, target = "",
    socialToSocial = false, greyCouncil = false, leagueSocial = false,
    dc = null, misc = 0
  } = {}) {
    const item = actor.items.get(itemId);
    if (item?.type !== "influence") return null;

    // A chain that already has links but nothing to carry is a broken chain — the previous
    // faction refused. Rolling here would silently start a fresh one.
    if (chain.length && carried === null) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.pressureChainBroken"));
      return null;
    }

    // Legality is advisory in the same way a failed feat prerequisite is: it warns and proceeds.
    const legality = pressureLegality(item, { race, category });
    const ranger = rangerRestriction(item, actor, { race });
    if (!legality.legal) {
      ui.notifications.warn(game.i18n.localize(`B5.Warning.${legality.reason}`));
      if (!legality.advisory) return null;
    }
    if (ranger) ui.notifications.warn(game.i18n.localize(`B5.Warning.${ranger}`));

    let roll = null;
    let result = carried;
    const parts = [...specialParts({ socialToSocial })];
    if (misc) parts.push({ key: "misc", value: misc, labelKey: "B5.Field.misc" });

    if (carried === null) {
      // The opening link is the only one that rolls.
      const score = halveScore(item.system.value, { greyCouncil, leagueSocial });
      const modifier = score + item.system.repeatPenalty + partsTotal(parts);
      const dice = influenceDice(actor, item, B5.INFLUENCE_DICE);
      roll = await new Roll(`${dice} + @modifier`, { modifier }).evaluate();
      result = roll.total;
      await item.update({ "system.usesThisWeek": item.system.usesThisWeek + 1 });
      if (greyCouncil || leagueSocial) {
        parts.unshift({ key: "halved", value: score - item.system.value, labelKey: "B5.Pressure.halved" });
      }
    } else if (partsTotal(parts)) {
      result += partsTotal(parts);
    }

    const link = resolveLink(result, { dc });
    const steps = [...chain, {
      target: target || game.i18n.localize(`B5.InfluenceCategory.${category}`),
      race, category, result: link.result, dc: link.dc,
      success: link.success, final: link.final, rolled: roll !== null
    }];

    await this.#postPressureCard(actor, item, { link, steps, parts, roll, legality, ranger });
    return { link, steps, roll };
  }

  /** Continue a chain from the card that carried it. */
  static async continuePressure(message) {
    const data = message.flags?.babylon5?.pressure;
    if (!data) return null;
    const actor = await fromUuid(data.actorUuid);
    if (!actor?.isOwner) return null;
    return this.promptPressure(actor, data.itemId, { carried: data.carried, chain: data.chain });
  }

  /**
   * A new scenario clears the repeat counters. The book allows one attempt per scenario (or per
   * two weeks) without penalty, and nothing else about Influence ever refreshes.
   */
  static async newScenario(actor) {
    const updates = actor.itemTypes.influence
      .filter(item => item.system.usesThisWeek)
      .map(item => ({ _id: item.id, "system.usesThisWeek": 0 }));
    if (!updates.length) return 0;
    await actor.updateEmbeddedDocuments("Item", updates);
    ui.notifications.info(game.i18n.format("B5.Influence.scenarioReset", { count: updates.length }));
    return updates.length;
  }

  /* -------------------------------------------- */

  static async #postPressureCard(actor, item, { link, steps, parts, roll, legality, ranger }) {
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/babylon5/templates/chat/pressure.hbs", {
        name: item.name,
        steps: steps.map((s, index) => ({
          ...s,
          index: index + 1,
          label: s.target,
          rolledLabel: s.rolled ? game.i18n.localize("B5.Pressure.rolled")
            : game.i18n.localize("B5.Pressure.inherited")
        })),
        parts: parts.map(p => ({
          label: game.i18n.localize(p.labelKey ?? `B5.Modifier.${p.key}`), value: p.value
        })),
        link,
        carries: link.carried !== null,
        advisory: !legality.legal || !!ranger,
        advisoryText: [
          legality.legal ? null : game.i18n.localize(`B5.Warning.${legality.reason}`),
          ranger ? game.i18n.localize(`B5.Warning.${ranger}`) : null
        ].filter(Boolean).join(" ")
      });

    const data = {
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls: roll ? [roll] : [],
      sound: roll ? CONFIG.sounds.dice : null,
      flags: link.carried !== null ? {
        babylon5: {
          pressure: {
            actorUuid: actor.uuid, itemId: item.id, carried: link.carried, chain: steps
          }
        }
      } : {}
    };
    ChatMessage.applyRollMode(data, game.settings.get("core", "rollMode"));
    await ChatMessage.create(data);
  }

  static async #postCard(actor, item, { roll, dc, success, parts, burn, request }, rollMode) {
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/babylon5/templates/chat/influence.hbs", {
        name: item.name,
        request,
        category: game.i18n.localize(`B5.InfluenceCategory.${item.system.category}`),
        dice: roll.formula.split(" ")[0],
        upgraded: !roll.formula.startsWith(B5.INFLUENCE_DICE),
        score: item.system.value,
        parts: parts.map(p => ({
          label: game.i18n.localize(p.labelKey ?? `B5.Modifier.${p.key}`), value: p.value
        })),
        repeatPenalty: item.system.repeatPenalty,
        uses: item.system.usesThisWeek,
        total: roll.total,
        dc,
        undecided: dc === null,
        success,
        burn: burn?.needed ? { ...burn, boost: burn.points * BURN_MULTIPLIER } : null
      });

    const data = {
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls: [roll],
      sound: CONFIG.sounds.dice,
      flags: burn?.points ? {
        babylon5: {
          influence: {
            actorUuid: actor.uuid, itemId: item.id,
            points: burn.points, result: roll.total, dc
          }
        }
      } : {}
    };
    ChatMessage.applyRollMode(data, rollMode ?? game.settings.get("core", "rollMode"));
    await ChatMessage.create(data);
  }
}
