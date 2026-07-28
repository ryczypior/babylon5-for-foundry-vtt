import { B5 } from "../config.mjs";
import {
  ORDERS, SKILL_STATIONS, ORDER_BUDGET_FEATS, STEALTH_LOSS_PER_ORDER,
  availableOrders, bandAfterMove, isSoloCraft, skillKeyOf
} from "../system/orders.mjs";
import { ACTIVE_CHAFF_INTERCEPT, weaponQualities } from "../system/gunnery.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Issuing and resolving space-combat orders.
 *
 * The engine owns the parts that are unambiguous — who rolls, against what, how many orders
 * are left, the range-band move and the Stealth these orders cost. Everything the rules leave
 * to the table (which weapons actually fire, what a lock is worth, how a Ram is adjudicated)
 * is printed on the chat card instead of being enforced.
 */
export default class B5OrderTests {

  /* -------------------------------------------- */
  /*  Budget                                      */
  /* -------------------------------------------- */

  /**
   * Orders per turn. The commander's feats set it (Spacecraft Proficiency 2 → Veteran 3 →
   * Elite 4 → Legendary 5); without a commander the craft's own `ordersPerTurn` stands, and
   * an unproficient commander gets one.
   */
  static orderBudget(craft) {
    const commander = this.stationActor(craft, isSoloCraft(craft) ? "pilot" : "commander")
      ?? this.stationActor(craft, "pilot");
    if (!commander) return Math.max(1, craft.system.attributes.ordersPerTurn);

    let best = 1;
    for (const feat of commander.itemTypes?.feat ?? []) {
      const granted = ORDER_BUDGET_FEATS[feat.system.internalId];
      if (granted) best = Math.max(best, granted);
    }
    return Math.max(best, craft.system.attributes.ordersPerTurn);
  }

  static ordersRemaining(craft) {
    return this.orderBudget(craft) - (craft.system.combat.ordersUsed ?? 0);
  }

  /**
   * Start of a new turn: the allowance, the once-per-round record, the Stealth penalty and the
   * designated interceptors all reset. Everything a turn owns is cleared here, so a caller that
   * is not the sheet does not get a half-reset.
   */
  static async resetTurn(craft) {
    await craft.update({
      "system.combat.ordersUsed": 0,
      "system.combat.ordersIssued": [],
      "system.combat.stealthPenalty": 0,
      "system.combat.interceptors": { designated: [], used: [], chaff: 0, penalty: 0 }
    });
  }

  /* -------------------------------------------- */
  /*  Who rolls                                   */
  /* -------------------------------------------- */

  static stationActor(craft, role) {
    const uuid = craft.system.crew.stations?.[role];
    return uuid ? fromUuidSync(uuid) : null;
  }

  /**
   * The character whose station covers this order's skill, with their total. Anything no
   * character covers is rolled by the crew with its Training bonus (book p. 188).
   */
  static resolveExecutor(craft, order) {
    const key = skillKeyOf(order);
    for (const role of SKILL_STATIONS[key] ?? []) {
      const actor = this.stationActor(craft, role);
      if (!actor) continue;
      const bonus = this.#skillTotal(actor, order.skill);
      if (bonus === null) continue;      // trained-only skill this character does not have
      return {
        actor, bonus, role,
        label: game.i18n.format("B5.Order.byStation", {
          name: actor.name, role: game.i18n.localize(`B5.CraftRole.${role}`)
        })
      };
    }
    return {
      actor: null,
      // Casualties in the crew spaces cost the ship its own Training bonus (book p. 197).
      bonus: craft.system.crew.effectiveTraining ?? craft.system.crew.training ?? 0,
      role: null,
      label: game.i18n.localize("B5.Order.byCrew")
    };
  }

  static #skillTotal(actor, skill) {
    if (typeof skill === "string") return actor.system.skills?.[skill]?.total ?? null;
    const item = actor.itemTypes?.skill?.find(i => i.system.skillKey === skill.skill
      && i.system.subtype?.toLowerCase() === skill.subtype);
    return item ? item.system.total : null;
  }

  /* -------------------------------------------- */
  /*  Issuing                                     */
  /* -------------------------------------------- */

  /** Open the picker, then resolve whatever was chosen. */
  static async promptOrder(craft) {
    if (!craft.isOwner) return null;
    const asResponseAllowed = true;
    const orders = availableOrders(craft).sort((a, b) =>
      game.i18n.localize(`B5.Order.${a.key}.name`)
        .localeCompare(game.i18n.localize(`B5.Order.${b.key}.name`), game.i18n.lang));

    const grouped = {};
    for (const order of orders) (grouped[order.type] ??= []).push(order);

    const remaining = this.ordersRemaining(craft);
    const options = Object.entries(grouped).map(([type, list]) => {
      const items = list.map(o => {
        const executor = this.resolveExecutor(craft, o);
        const dc = o.dc === "special" ? game.i18n.localize("B5.Order.dcSpecial") : `DC ${o.dc}`;
        return `<option value="${o.key}">${game.i18n.localize(`B5.Order.${o.key}.name`)} — ${dc} (${executor.bonus >= 0 ? "+" : ""}${executor.bonus})</option>`;
      }).join("");
      return `<optgroup label="${game.i18n.localize(`B5.OrderType.${type}`)}">${items}</optgroup>`;
    }).join("");

    const content = `
      <p class="b5-hint">${game.i18n.format("B5.Order.remaining", { remaining, budget: this.orderBudget(craft) })}</p>
      <div class="form-group"><label>${game.i18n.localize("B5.Order.order")}</label>
        <select name="order">${options}</select></div>
      <div class="form-group"><label>${game.i18n.localize("B5.Order.dcOverride")}</label>
        <input type="number" name="dc" placeholder="${game.i18n.localize("B5.Order.dcOverrideHint")}"></div>
      <div class="form-group"><label>${game.i18n.localize("B5.Field.misc")}</label>
        <input type="number" name="modifier" value="0"></div>
      ${asResponseAllowed ? `<div class="form-group"><label>
        <input type="checkbox" name="asResponse"> ${game.i18n.localize("B5.Order.asResponse")}</label></div>` : ""}`;

    const result = await DialogV2.prompt({
      window: { title: game.i18n.localize("B5.Order.issue") },
      content,
      ok: {
        label: game.i18n.localize("B5.Order.issue"),
        callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
      },
      rejectClose: false
    });
    if (!result) return null;

    return this.issueOrder(craft, result.order, {
      dcOverride: Number.isNumeric(result.dc) && result.dc !== null ? Number(result.dc) : null,
      modifier: Number(result.modifier) || 0,
      asResponse: !!result.asResponse
    });
  }

  /**
   * Roll an order and post the card. Returns the resolution, or null when the order could not
   * be issued (out of allowance, once-per-round already used, missing feature).
   */
  static async issueOrder(craft, key, { dcOverride = null, modifier = 0, asResponse = false } = {}) {
    const order = ORDERS[key];
    if (!order) return null;

    const blocked = this.#blockedReason(craft, key, order, asResponse);
    if (blocked) {
      ui.notifications.warn(blocked);
      return null;
    }

    const executor = this.resolveExecutor(craft, order);
    const baseDc = asResponse && order.responseDc !== undefined ? order.responseDc : order.dc;
    const dc = dcOverride ?? (baseDc === "special" ? null : baseDc);

    const roll = await new Roll("1d20 + @bonus + @modifier",
      { bonus: executor.bonus, modifier }).evaluate();
    const success = dc === null ? null : roll.total >= dc;

    await this.#applyEffects(craft, key, order, { success, asResponse });

    await this.#postCard(craft, {
      key, order, roll, dc, success, executor, modifier, asResponse,
      remaining: this.ordersRemaining(craft)
    });

    return { roll, dc, success };
  }

  /** Why this order cannot be issued, or null when it can. */
  static #blockedReason(craft, key, order, asResponse) {
    if (!asResponse && this.ordersRemaining(craft) <= 0) {
      return game.i18n.localize("B5.Warning.noOrdersLeft");
    }
    if (order.limit === "one" && (craft.system.combat.ordersIssued ?? []).includes(key)) {
      return game.i18n.format("B5.Warning.orderOncePerRound",
        { order: game.i18n.localize(`B5.Order.${key}.name`) });
    }
    if (order.requires) {
      const has = craft.itemTypes.craftFeature.some(f =>
        !f.system.destroyed && f.name.toLowerCase().includes(order.requires.toLowerCase()));
      if (!has) {
        return game.i18n.format("B5.Warning.orderNeedsFeature",
          { order: game.i18n.localize(`B5.Order.${key}.name`), feature: order.requires });
      }
    }
    if (craft.system.combat.destroyed) return game.i18n.localize("B5.Warning.craftDestroyed");
    return null;
  }

  /**
   * The mechanical side-effects worth automating: the order allowance, the once-per-round
   * record, the Stealth an order gives away, and the range-band move (which happens on a
   * failure too — the craft still moves, it just does so badly).
   */
  static async #applyEffects(craft, key, order, { success, asResponse }) {
    const updates = {};
    if (!asResponse) updates["system.combat.ordersUsed"] = (craft.system.combat.ordersUsed ?? 0) + 1;

    const issued = [...(craft.system.combat.ordersIssued ?? []), key];
    updates["system.combat.ordersIssued"] = issued;

    if (key !== "runSilent") {
      updates["system.combat.stealthPenalty"] =
        (craft.system.combat.stealthPenalty ?? 0) + STEALTH_LOSS_PER_ORDER;
    }

    if (order.movesBand) {
      // Afterburners moves two bands on a success, one on a failure; the plain moves always go.
      const steps = key === "afterburners" && success === false ? 1 : order.movesBand;
      updates["system.combat.band"] = bandAfterMove(craft.system.combat.band, steps);
    }

    if (key === "fireInterceptors") Object.assign(updates, this.#designateInterceptors(craft, { success, asResponse }));

    await craft.update(updates);
  }

  /**
   * *Fire Interceptors!* has no target number of its own — the check is made per incoming
   * barrage, against that barrage's highest attack roll. All the order does is designate the
   * mounts, which the barrage engine then offers to the craft being shot at.
   *
   * A failed order still designates them; it only makes every later check harder.
   */
  static #designateInterceptors(craft, { success, asResponse }) {
    const designated = craft.itemTypes.craftWeapon
      .filter(weapon => !weapon.system.destroyed
        && weaponQualities(weapon).intercept > 0)
      .map(weapon => weapon.id);

    const chaff = craft.itemTypes.craftFeature.some(feature =>
      !feature.system.destroyed && /active chaff/i.test(feature.name))
      ? ACTIVE_CHAFF_INTERCEPT : 0;

    if (!designated.length && !chaff) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.noInterceptors"));
      return {};
    }

    return {
      "system.combat.interceptors": {
        designated,
        used: [],
        chaff,
        penalty: success === false ? (asResponse ? -6 : -4) : 0
      }
    };
  }

  static async #postCard(craft, data) {
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/babylon5/templates/chat/order.hbs", {
        craft,
        name: game.i18n.localize(`B5.Order.${data.key}.name`),
        type: game.i18n.localize(`B5.OrderType.${data.order.type}`),
        effect: game.i18n.localize(`B5.Order.${data.key}.effect`),
        failure: game.i18n.localize(`B5.Order.${data.key}.failure`),
        executor: data.executor.label,
        bonus: data.executor.bonus,
        modifier: data.modifier,
        total: data.roll.total,
        dc: data.dc,
        success: data.success,
        undecided: data.success === null,
        asResponse: data.asResponse,
        remaining: data.remaining,
        band: game.i18n.localize(`B5.Range.${craft.system.combat.band}`),
        stealthPenalty: craft.system.combat.stealthPenalty
      });

    await data.roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: craft }),
      flavor: content
    });
  }
}
