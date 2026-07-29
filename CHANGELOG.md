# Changelog

## 0.2.0 — 2026-07-29

**First published release.** 0.1.0 was the in-development version and was never tagged, so this
release is everything at once. All of it has been exercised on Foundry 13.351, and every
subsystem was checked against the corebook's own worked examples.

### What it does

| Area | |
|---|---|
| **Actors** | `character`, `npc` and `craft` (spacecraft, aircraft and surface vehicles share one stat block), on ApplicationV2 sheets with `TypeDataModel` schemas |
| **Items** | 13 types: class, race, skill, feat, influence, telepathic ability, weapon, armour, ammunition, gear, weapon accessory, craft weapon, craft feature |
| **Character** | racial modifiers, class skills, feat effects and prerequisites, the skill-point budget and rank caps, the three shared progression tracks, and the Fence and Psi Cop prestige classes |
| **Personal combat** | the four attack lines, iteratives, bursts, criticals off their printed threat ranges, and damage through the `damage − max(0, DR − AP)` pipeline |
| **Telepathy** | P-Rating and reach, mental effort paid in nonlethal damage, the whole Telepathy modifier stack, the Will save DC with a resistance button, maintained abilities and the traits |
| **Influence** | checks on 2d6, burning worked out to the point, per-faction resource tables, the black market and the trade bonus, aiding another, and pressure chains across factions |
| **Space combat** | crew stations, the 47 orders, weapon fire (Total Offence → interception → shielding → Armour), the damage cascade with impairment checks, and *Fire Interceptors!* feeding the barrage |
| **Rolls** | all of the above, with a shift-click modifier prompt that pre-applies the conditions a character already carries |
| **Languages** | complete in English and Polish, ~965 keys |

### Worth knowing

- **The manifest declares no compendium packs.** They are not distributed with the system, and a
  manifest that declares packs it does not ship leaves a fresh install with a row of empty
  compendia. Content is added separately — see the README.
- **Only unconditional modifiers are applied automatically.** Situational ones stay in the text,
  because applying them silently would be wrong more often than right.
- **Advisory, never blocking**: an unmet feat prerequisite, an out-of-scope Influence pressure, a
  weapon fired across two arcs and an unproficient attack all warn and proceed.
- A failed Telepathy check is not reported as a failed ability, and a check with no DC given is
  reported as undecided rather than as a miss.

### Known gaps

Left to the table on purpose: telepathic duels, the sleeper-drug timer, full rapid fire, attacks
of opportunity and the combat manoeuvres, what a weapons lock is worth, and how a ram or an
escort's percentage chance resolves. Quick Space Combat is not implemented.
