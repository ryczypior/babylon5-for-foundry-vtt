/**
 * The black market and the trade hooks (book §1.4–1.6 of the equipment chapter, §A.17 of the
 * Influence chapter — the two chapters state the same rules from either side).
 *
 * **Influence does not replace money.** Credits stay a plain cash currency; Influence touches the
 * economy at four specific points, and only three of them carry printed numbers:
 *
 *  1. **cash grants** — the resource rows that literally pay out credits, which is why a resource
 *     row carries a `credits` figure and the check card offers to bank it;
 *  2. **the black market** — an Influence check *instead of* a skill check to find a fence, and a
 *     price band of 200 % / 300 % of list with a haggling floor (below);
 *  3. **the trade bonus** — a successful Economic or Local check at DC 15 lends **+5** to the
 *     Profession / Knowledge / Intrigue check that finds a supplier or a buyer, offered as a
 *     preset on skill rolls rather than applied here;
 *  4. **factory-cost equipment** at DC 15, which has **no printed multiplier** — nothing to
 *     compute, so it stays in the resource row's text where the book leaves it.
 */
import { influenceDice } from "./influence.mjs";
import { B5 } from "../config.mjs";

/** Legality tiers that need a fence at all; `unrestricted` buys at list price. */
export const BLACK_MARKET_LEGALITIES = ["restricted", "illegal"];

/**
 * The three printed ways to find a fence (equipment chapter §1.4). Influence is markedly better
 * at it than the skill is — that is the point of the hook.
 */
export const SOURCING_ROUTES = {
  localInfluence: {
    kind: "influence", influence: "local", dc: { restricted: 10, illegal: 15 }
  },
  criminalInfluence: {
    kind: "influence", influence: "criminal", dc: { restricted: 15, illegal: 20 }
  },
  knowledgeLocal: {
    kind: "skill", skillKey: "knowledge", subtype: /local|lokal/i,
    dc: { restricted: 20, illegal: 25 }
  }
};

/** Standard black-market price and the floor haggling can reach (equipment chapter §1.5). */
export const BLACK_MARKET_MULTIPLIERS = {
  restricted: { standard: 2, floor: 1.5 },
  illegal: { standard: 3, floor: 2.5 }
};

/** A successful Economic or Local check at this DC lends this much to a trade skill check. */
export const TRADE_DC = 15;
export const TRADE_BONUS = 5;

/**
 * What a black-market item costs: the asking price and the floor haggling can reach. Both are
 * rounded, because a ×1.5 of an odd list price is not a whole credit and the book prices
 * everything in whole ones.
 *
 * @returns {{standard: number, floor: number, multiplier: number}|null} null when legal
 */
export function blackMarketPrice(cost, legality) {
  const multipliers = BLACK_MARKET_MULTIPLIERS[legality];
  if (!multipliers) return null;
  return {
    standard: Math.round(cost * multipliers.standard),
    floor: Math.round(cost * multipliers.floor),
    multiplier: multipliers.standard
  };
}

/**
 * The Influence entry a route needs. The stable `internalId` decides it — `local-babylon5` is
 * still Local Influence — and a hand-entered entry falls back to a loose match on the name and
 * faction, the convention the rest of the system uses for authored data.
 */
const INFLUENCE_PATTERNS = {
  local: /\blocal\b|lokal/i,
  criminal: /criminal|przestępcz/i
};

export function isInfluence(item, key) {
  const id = (item.system.internalId ?? "").trim().toLowerCase();
  if (id) return id === key || id.startsWith(`${key}-`);
  return INFLUENCE_PATTERNS[key].test(`${item.name} ${item.system.faction ?? ""}`);
}

function findInfluence(actor, key) {
  return actor.itemTypes.influence.find(item => isInfluence(item, key));
}

/** Knowledge (specific local) — a subtyped skill Item, so it is matched on its subtype. */
function findSkill(actor, route) {
  return actor.itemTypes.skill.find(item =>
    item.system.skillKey === route.skillKey && route.subtype.test(item.system.subtype ?? ""));
}

/**
 * The §A.17 uses **this** Influence can be asked for, as rows for the check dialog's dropdown —
 * the black market for Local and Criminal Influence, the trade contact for Local and for any
 * Economic one. They sit alongside the faction's own resource table rather than inside it,
 * because the book states them in the economy chapter and not in the faction's table.
 */
export function marketRequests(item) {
  const local = isInfluence(item, "local");
  const criminal = isInfluence(item, "criminal");
  const rows = [];

  if (local || criminal) {
    const route = local ? SOURCING_ROUTES.localInfluence : SOURCING_ROUTES.criminalInfluence;
    rows.push({ dc: route.dc.restricted, labelKey: "B5.Market.findRestricted" });
    rows.push({ dc: route.dc.illegal, labelKey: "B5.Market.findIllegal" });
  }
  if (local || item.system.category === "economic") {
    rows.push({ dc: TRADE_DC, labelKey: "B5.Market.tradeContact" });
  }
  return rows;
}

/**
 * Which of the three routes this character can actually take, with what each brings to the roll.
 *
 * A route the character has no entry or no skill for is returned **unavailable** rather than
 * omitted, so the dialog can say *why* a route is closed instead of silently offering fewer.
 *
 * @param {string} legality  restricted | illegal
 * @returns {Array<{key, kind, dc, available, itemId, label, modifier, dice}>}
 */
export function sourcingRoutes(actor, legality) {
  return Object.entries(SOURCING_ROUTES).map(([key, route]) => {
    const dc = route.dc[legality] ?? null;
    const base = { key, kind: route.kind, dc, available: false, itemId: null, label: "", modifier: 0 };

    if (route.kind === "influence") {
      const item = findInfluence(actor, route.influence);
      if (!item) return { ...base, dice: B5.INFLUENCE_DICE };
      return {
        ...base,
        available: true,
        itemId: item.id,
        label: item.name,
        // An Influence check is the score plus whatever repeating the request already costs.
        modifier: item.system.value + item.system.repeatPenalty,
        dice: influenceDice(actor, item, B5.INFLUENCE_DICE)
      };
    }

    const skill = findSkill(actor, route);
    if (!skill) return { ...base, dice: "1d20" };
    return {
      ...base,
      available: true,
      itemId: skill.id,
      label: skill.system.label ?? skill.name,
      modifier: skill.system.total,
      dice: "1d20"
    };
  });
}
