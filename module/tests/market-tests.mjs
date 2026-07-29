import { conditionModifiers, partsTotal } from "../system/roll-modifiers.mjs";
import { modifierFooter, readModifierParts } from "./roll-dialog.mjs";
import { burnToClose, BURN_MULTIPLIER } from "../system/influence.mjs";
import {
  BLACK_MARKET_LEGALITIES, blackMarketPrice, sourcingRoutes
} from "../system/market.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Sourcing restricted and illegal goods (equipment chapter §1.4–1.5, Influence §A.17).
 *
 * Two things happen at once and the card reports both:
 *
 *  - **finding a fence** is a check, and Influence is one of the three printed ways to make it —
 *    Local Influence at DC 10/15 or Criminal at DC 15/20, against Knowledge (specific local) at
 *    DC 20/25. The Influence routes are markedly better, which is the whole point of the hook;
 *  - **the price** is arithmetic off the list price: 200 % of list for restricted goods and 300 %
 *    for illegal ones, with a haggling floor of 150 % / 250 %. It is not a secret, so the dialog
 *    shows the band before the roll and the card repeats it after.
 *
 * An Influence route is a real Influence attempt: it counts against the week and a failure offers
 * the same burn any other check would, through the same card flag.
 */
export default class B5MarketTests {

  static async promptSourcing(actor, itemId) {
    const item = actor.items.get(itemId);
    if (!item || !actor.isOwner) return null;

    const legality = item.system.legality;
    if (!BLACK_MARKET_LEGALITIES.includes(legality)) {
      ui.notifications.info(game.i18n.format("B5.Warning.notBlackMarket", { item: item.name }));
      return null;
    }

    const price = blackMarketPrice(item.system.cost, legality);
    const routes = sourcingRoutes(actor, legality);
    if (!routes.some(route => route.available)) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.noSourcingRoute"));
      return null;
    }

    const first = routes.find(route => route.available);

    const routeOptions = routes.map(route => {
      const name = game.i18n.localize(`B5.Market.route.${route.key}`);
      const detail = route.available
        ? `${route.label} ${route.modifier >= 0 ? "+" : ""}${route.modifier}, ${route.dice}`
        : game.i18n.localize("B5.Market.routeClosed");
      // A closed route stays on the list, disabled, so the dialog says why it is closed. The
      // first open one is selected outright rather than left to the browser's reset behaviour.
      return `<option value="${route.key}" ${route.available ? "" : "disabled"}`
        + `${route === first ? " selected" : ""}>`
        + `${name} — ${game.i18n.localize("B5.Field.dc")} ${route.dc} (${detail})</option>`;
    }).join("");

    const content = `
      <p class="b5-hint b5-modifier-head">
        ${item.name} · ${game.i18n.localize(`B5.Legality.${legality}`)}
        · ${game.i18n.format("B5.Market.listPrice", { cost: item.system.cost })}
      </p>
      <p class="b5-hint">${game.i18n.format("B5.Market.band", {
        standard: price.standard, floor: price.floor
      })}</p>
      <div class="form-group"><label>${game.i18n.localize("B5.Market.route.label")}</label>
        <select name="route">${routeOptions}</select></div>
      <fieldset class="b5-modifier-group">
        <legend>${game.i18n.localize("B5.Section.situational")}</legend>
        <label class="b5-modifier-row"><input type="checkbox" name="ownRace">
          <span class="b5-modifier-name">${game.i18n.localize("B5.Market.ownRace")}</span>
          <span class="b5-modifier-value">${game.i18n.localize("B5.Market.noRoll")}</span></label>
      </fieldset>
      ${modifierFooter(first.modifier)}`;

    const result = await DialogV2.prompt({
      window: { title: game.i18n.format("B5.Market.title", { item: item.name }) },
      classes: ["b5-dialog"],
      content,
      render: this.#liveTotal(routes),
      ok: {
        label: game.i18n.localize("B5.Market.source"),
        callback: (event, button) => {
          const form = button.form;
          const data = new foundry.applications.ux.FormDataExtended(form).object;
          data.parts = readModifierParts(form);
          return data;
        }
      },
      rejectClose: false
    });
    if (!result) return null;

    return this.source(actor, itemId, {
      route: result.route,
      ownRace: !!result.ownRace,
      parts: result.parts ?? [],
      rollMode: result.rollMode
    });
  }

  /**
   * The shared running total cannot be reused here: the base moves when another route is picked,
   * because each route rolls a different thing. Otherwise it is the same sum — ticked parts plus
   * the misc field.
   */
  static #liveTotal(routes) {
    return (event, dialog) => {
      const form = dialog.element.querySelector("form") ?? dialog.element;
      const output = form.querySelector("[data-total]");
      if (!output) return;
      const update = () => {
        const route = routes.find(r => r.key === form.elements.route?.value);
        const total = (route?.modifier ?? 0)
          + [...form.querySelectorAll("input[data-part]:checked")]
            .reduce((sum, input) => sum + Number(input.dataset.value), 0)
          + (Number(form.querySelector("[name=misc]")?.value) || 0);
        output.textContent = `${total >= 0 ? "+" : ""}${total}`;
      };
      form.addEventListener("change", update);
      form.addEventListener("input", update);
    };
  }

  /**
   * Resolve it. The racial exception (equipment chapter §1.5) is not a modifier but a way past the
   * whole procedure — a character buying his own race's equipment in his own race's territory pays
   * list price and rolls nothing — so it short-circuits before the roll.
   */
  static async source(actor, itemId, {
    route: routeKey, ownRace = false, parts = [], rollMode = null
  } = {}) {
    const item = actor.items.get(itemId);
    if (!item) return null;

    const legality = item.system.legality;
    const price = blackMarketPrice(item.system.cost, legality);
    if (!price) return null;

    if (ownRace) {
      await this.#postCard(actor, item, {
        legality, price, ownRace: true, pay: item.system.cost
      }, rollMode);
      return { ownRace: true, price };
    }

    const route = sourcingRoutes(actor, legality).find(r => r.key === routeKey);
    if (!route?.available) {
      ui.notifications.warn(game.i18n.localize("B5.Warning.noSourcingRoute"));
      return null;
    }

    // The skill route is a skill check, so the conditions the character is already carrying apply
    // to it — Shaken's −2 is the classic table error. Influence checks take none in this system,
    // which is why this is decided per route rather than in the dialog.
    const applied = route.kind === "skill"
      ? [...conditionModifiers(actor, "skill"), ...parts]
      : parts;

    const modifier = route.modifier + partsTotal(applied);
    const roll = await new Roll(`${route.dice} + @modifier`, { modifier }).evaluate();
    const success = roll.total >= route.dc;

    // An Influence route is an Influence attempt like any other: it counts against the week, and
    // falling short offers the burn that would close it.
    let burn = null;
    let influenceItem = null;
    if (route.kind === "influence") {
      influenceItem = actor.items.get(route.itemId);
      await influenceItem.update({
        "system.usesThisWeek": influenceItem.system.usesThisWeek + 1
      });
      if (!success) burn = burnToClose(roll.total, route.dc, influenceItem.system.value);
    }

    await this.#postCard(actor, item, {
      legality, price, route, roll, success, parts: applied, burn, influenceItem,
      pay: success ? price.standard : 0
    }, rollMode);
    return { roll, success, price, burn };
  }

  /* -------------------------------------------- */

  /**
   * Pay for it. The asking price is what the button spends; haggling lands somewhere between it
   * and the floor, and that is a conversation, not arithmetic — so the card prints both and this
   * only refuses when the money is not there.
   */
  static async payFromCard(message) {
    const data = message.flags?.babylon5?.market;
    if (!data?.pay) return null;

    const actor = await fromUuid(data.actorUuid);
    if (!actor?.isOwner) return null;

    const before = actor.system.wealth.credits;
    if (before < data.pay) {
      ui.notifications.warn(game.i18n.format("B5.Warning.cannotAfford", {
        price: data.pay, credits: before
      }));
      return null;
    }

    await actor.update({ "system.wealth.credits": before - data.pay });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="b5-order-card b5-influence-card">
        <div class="b5-order-head">
          <span class="b5-order-name">${data.item}</span>
          <span class="b5-order-type">${game.i18n.localize("B5.Market.paid")}</span>
        </div>
        <div class="b5-order-result ok">${game.i18n.format("B5.Market.payResult", {
          price: data.pay, from: before, to: before - data.pay
        })}</div>
      </div>`
    });
    return { paid: data.pay, credits: before - data.pay };
  }

  static async #postCard(actor, item, {
    legality, price, route = null, roll = null, success = null, parts = [],
    burn = null, influenceItem = null, ownRace = false, pay = 0
  }, rollMode) {
    const content = await foundry.applications.handlebars.renderTemplate(
      "systems/babylon5/templates/chat/market.hbs", {
        name: item.name,
        legality: game.i18n.localize(`B5.Legality.${legality}`),
        cost: item.system.cost,
        price,
        ownRace,
        route: route ? game.i18n.localize(`B5.Market.route.${route.key}`) : null,
        routeLabel: route?.label ?? null,
        dc: route?.dc ?? null,
        dice: route?.dice ?? null,
        total: roll?.total ?? null,
        success,
        parts: parts.map(p => ({
          label: game.i18n.localize(p.labelKey ?? `B5.Modifier.${p.key}`), value: p.value
        })),
        pay,
        burn: burn?.needed ? { ...burn, boost: burn.points * BURN_MULTIPLIER } : null
      });

    const flags = { babylon5: {} };
    if (pay) flags.babylon5.market = { actorUuid: actor.uuid, item: item.name, pay };
    if (burn?.points) {
      flags.babylon5.influence = {
        actorUuid: actor.uuid, itemId: influenceItem.id, faction: influenceItem.name,
        points: burn.points, result: roll.total, dc: route.dc, grant: 0
      };
    }

    const data = {
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls: roll ? [roll] : [],
      sound: roll ? CONFIG.sounds.dice : null,
      flags
    };
    ChatMessage.applyRollMode(data, rollMode ?? game.settings.get("core", "rollMode"));
    await ChatMessage.create(data);
  }
}
