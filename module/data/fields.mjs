/**
 * Small factories for the field shapes this system repeats everywhere.
 * Keeping them here means every "class bonus / ability mod / misc / total" block on the
 * printed character sheet has exactly one definition.
 */
const fields = foundry.data.fields;

/** A plain integer field with a default. */
export const int = (initial = 0, options = {}) =>
  new fields.NumberField({ required: true, integer: true, nullable: false, initial, ...options });

/** A number that may hold half-ranks (cross-class skill purchases). */
export const num = (initial = 0, options = {}) =>
  new fields.NumberField({ required: true, nullable: false, initial, ...options });

export const str = (initial = "", options = {}) =>
  new fields.StringField({ required: true, blank: true, initial, ...options });

export const bool = (initial = false) =>
  new fields.BooleanField({ required: true, initial });

export const html = () =>
  new fields.HTMLField({ required: true, blank: true, initial: "" });

/**
 * The recurring "breakdown + total" block from the printed sheet: several contributing
 * bonuses plus a derived total. `total` is always recomputed, never stored input.
 */
export const bonusBlock = (extra = {}) =>
  new fields.SchemaField({
    classBonus: int(),
    abilityMod: int(),
    misc: int(),
    total: int(),
    ...extra
  });

/** Attack line: BAB + ability modifier + misc. */
export const attackBlock = () =>
  new fields.SchemaField({
    bab: int(),
    abilityMod: int(),
    misc: int(),
    total: int()
  });

/** Current/max pair. */
export const resource = (initial = 0, max = 0) =>
  new fields.SchemaField({
    value: int(initial),
    max: int(max)
  });
