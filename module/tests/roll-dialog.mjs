import { conditionModifiers, partsTotal, presetsFor } from "../system/roll-modifiers.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * The modifier prompt shared by every personal roll.
 *
 * Held shift on a roll button opens it; a plain click rolls straight, so the common case still
 * costs one click. It offers three things, in the order they matter:
 *
 *  1. the conditions the character already carries, **pre-checked**, because forgetting the −2
 *     for Shaken is the classic table error and the sheet already knows about it;
 *  2. the printed situational modifiers for this kind of roll, unchecked;
 *  3. a free number for everything the book leaves to the GM, and the roll mode.
 *
 * @returns {Promise<{situational: number, parts: Array, rollMode: string}|null>} null if cancelled
 */
export async function promptRollModifiers(actor, { kind, subtype = null, label, base = 0 } = {}) {
  const conditions = conditionModifiers(actor, kind);
  const presets = presetsFor(kind, subtype);

  const row = (part, checked) => `
    <label class="b5-modifier-row">
      <input type="checkbox" data-part="${part.key}" data-value="${part.value}"
             data-label="${part.labelKey}" ${checked ? "checked" : ""}>
      <span class="b5-modifier-name">${game.i18n.localize(part.labelKey)}</span>
      <span class="b5-modifier-value">${part.value >= 0 ? "+" : ""}${part.value}</span>
    </label>`;

  const rollModes = Object.entries(CONFIG.Dice.rollModes)
    .map(([value, config]) => {
      const name = game.i18n.localize(typeof config === "string" ? config : config.label);
      const current = game.settings.get("core", "rollMode");
      return `<option value="${value}" ${value === current ? "selected" : ""}>${name}</option>`;
    }).join("");

  const content = `
    <p class="b5-hint b5-modifier-head">
      ${label} <strong>${base >= 0 ? "+" : ""}${base}</strong>
    </p>
    ${conditions.length ? `<fieldset class="b5-modifier-group">
      <legend>${game.i18n.localize("B5.Section.conditions")}</legend>
      ${conditions.map(part => row(part, true)).join("")}
    </fieldset>` : ""}
    ${presets.length ? `<fieldset class="b5-modifier-group">
      <legend>${game.i18n.localize("B5.Section.situational")}</legend>
      ${presets.map(part => row(part, false)).join("")}
    </fieldset>` : ""}
    <div class="form-group"><label>${game.i18n.localize("B5.Field.misc")}</label>
      <input type="number" name="misc" value="0"></div>
    <div class="form-group"><label>${game.i18n.localize("B5.Field.rollMode")}</label>
      <select name="rollMode">${rollModes}</select></div>
    <p class="b5-modifier-total">
      ${game.i18n.localize("B5.Field.total")} <strong data-total>${base >= 0 ? "+" : ""}${base}</strong>
    </p>`;

  const result = await DialogV2.prompt({
    window: { title: game.i18n.format("B5.Roll.modifiersFor", { label }) },
    classes: ["b5-dialog"],
    content,
    /** Keep the running total honest while boxes are ticked — it is why the dialog is worth opening. */
    render: (event, dialog) => {
      const form = dialog.element.querySelector("form") ?? dialog.element;
      const output = form.querySelector("[data-total]");
      if (!output) return;
      const update = () => {
        const ticked = [...form.querySelectorAll("input[data-part]:checked")]
          .reduce((sum, input) => sum + Number(input.dataset.value), 0);
        const misc = Number(form.querySelector("[name=misc]")?.value) || 0;
        const total = base + ticked + misc;
        output.textContent = `${total >= 0 ? "+" : ""}${total}`;
      };
      form.addEventListener("change", update);
      form.addEventListener("input", update);
    },
    ok: {
      label: game.i18n.localize("B5.Roll.roll"),
      callback: (event, button) => {
        const form = button.form;
        const parts = [...form.querySelectorAll("input[data-part]:checked")].map(input => ({
          key: input.dataset.part,
          value: Number(input.dataset.value),
          labelKey: input.dataset.label
        }));
        const misc = Number(form.querySelector("[name=misc]")?.value) || 0;
        if (misc) parts.push({ key: "misc", value: misc, labelKey: "B5.Field.misc" });
        return { parts, rollMode: form.querySelector("[name=rollMode]")?.value };
      }
    },
    rejectClose: false
  });
  if (!result) return null;

  return {
    situational: partsTotal(result.parts),
    parts: result.parts,
    rollMode: result.rollMode
  };
}
