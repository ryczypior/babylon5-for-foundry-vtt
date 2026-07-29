/**
 * Package the compendium content as a drop-in module archive, plus its Polish install notes.
 *
 * `npm run content` is for this machine: it links the packs into the Foundry data directory. This
 * one is for handing them to somebody else — a self-contained `babylon5-content/` with the packs
 * **copied**, never linked, so the archive works on a machine that has no copy of this repository.
 *
 * Usage: npm run content:zip -- <output directory>
 *        (defaults to packs/_dist, which is inside the untracked packs/ tree)
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PACKS } from "./packs.mjs";
import { MODULE_ID, MODULE_TITLE, declarations, manifest } from "./content-module.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const system = JSON.parse(fs.readFileSync(path.join(root, "system.json"), "utf8"));
const version = system.version;
const outDir = path.resolve(process.argv[2] ?? path.join(root, "packs", "_dist"));
const archiveName = `${MODULE_ID}-${version}.zip`;

/** How many documents each source holds, for the readme's table. */
function entryCounts() {
  return PACKS.map(pack => {
    const source = path.join(root, "packs", "_source", pack.source);
    const entries = fs.existsSync(source)
      ? JSON.parse(fs.readFileSync(source, "utf8")).length
      : null;
    const label = declarations().find(d => d.name === pack.en)?.label ?? pack.en;
    return { label, en: pack.en, pl: pack.pl, entries, document: pack.document ?? "Item" };
  });
}

function readme(counts) {
  const rows = counts.map(pack =>
    `| ${pack.label} | \`${pack.en}\` · \`${pack.pl}\` | ${pack.entries ?? "—"} |`).join("\n");
  const total = counts.reduce((sum, pack) => sum + (pack.entries ?? 0), 0);

  return `# Kompendia do systemu Babylon 5 2nd Edition (Foundry VTT)

Zawartość kompendiów do systemu \`babylon5\`: klasy, rasy, atuty, ekwipunek, zdolności
telepatyczne, wpływy i jednostki — po angielsku i po polsku. **Nie są częścią systemu.** System
instaluje się bez treści, a te paczki dokłada się osobno, jako moduł.

Wersja: **${version}** · archiwum: \`${archiveName}\`

## Czego potrzebujesz

- **Foundry VTT 13** lub nowsze,
- zainstalowany system **Babylon 5 2nd Edition** — w zakładce *Game Systems* wybierz
  *Install System* i wklej:

  \`\`\`
  https://github.com/ryczypior/babylon5-for-foundry-vtt/releases/latest/download/system.json
  \`\`\`

## Instalacja

1. **Zamknij Foundry.** Działający serwer trzyma paczki otwarte i nadpisanie ich w tym momencie
   zostawia je w niespójnym stanie.
2. Rozpakuj archiwum do katalogu **\`Data/modules\`** swojej instalacji Foundry, tak aby powstała
   ścieżka \`Data/modules/${MODULE_ID}/module.json\`:

   \`\`\`bash
   unzip ${archiveName} -d ~/.local/share/FoundryVTT/Data/modules
   \`\`\`

   Katalog \`Data\` leży domyślnie w:

   | System | Ścieżka |
   |---|---|
   | Linux | \`~/.local/share/FoundryVTT/Data\` |
   | Windows | \`%localappdata%\\FoundryVTT\\Data\` |
   | macOS | \`~/Library/Application Support/FoundryVTT/Data\` |

3. Uruchom Foundry i wejdź do świata opartego na systemie Babylon 5.
4. Włącz moduł: **Game Settings → Manage Modules → ${MODULE_TITLE}**.
   Świat przeładuje się sam.
5. Kompendia pojawią się w zakładce **Compendium Packs**, w folderze *Babylon 5*; wersje polskie
   w podfolderze *Polski*.

## Co jest w środku

| Paczka | Nazwy | Wpisów |
|---|---|---|
${rows}

Razem **${total}** wpisów w każdym języku: ${counts.length * 2} paczek — ${counts.length} angielskich
i ${counts.length} polskich.

Polski i angielski to **osobne paczki**, nie tłumaczenie w locie — Foundry nie tłumaczy zawartości
kompendiów. Przy polskim interfejsie otwieraj paczki z podfolderu *Polski*; przeciągnięcie wpisu na
kartę postaci działa identycznie z jednej i z drugiej.

Jednostki (\`craft\`) to **aktorzy**, nie przedmioty — z drukowanym uzbrojeniem w środku. Reszta to
przedmioty.

## Aktualizacja

Zamknij Foundry, usuń katalog \`Data/modules/${MODULE_ID}\` i rozpakuj nowe archiwum. Wersja modułu
idzie w parze z wersją systemu, więc archiwum ${version} pasuje do systemu ${version}.

## Gdy kompendiów nie widać

- Moduł włącza się **w konkretnym świecie**, nie globalnie — sprawdź *Manage Modules* w tym świecie,
  w którym grasz.
- Po dołożeniu plików Foundry trzeba **uruchomić ponownie**: moduły wczytują się przy starcie.
- Sprawdź, czy nie ma podwójnego katalogu. Poprawna ścieżka to
  \`Data/modules/${MODULE_ID}/module.json\`, a nie \`.../${MODULE_ID}/${MODULE_ID}/module.json\`.
- Moduł wymaga systemu \`babylon5\`. Bez niego Foundry pokaże go jako niezgodny i nie da włączyć.

## Uwaga o treści

Paczki zawierają materiał z podręcznika *Babylon 5 Roleplaying Game, 2nd Edition* (Mongoose
Publishing, 2006) i dlatego nie są rozpowszechniane razem z systemem. Do użytku z legalnie nabytym
egzemplarzem podręcznika.
`;
}

/* ---------------------------------------------------------------- */

const packs = declarations();
const missing = packs.filter(pack => !fs.existsSync(path.join(root, pack.path)));
if (missing.length) {
  console.error(`Not built (run npm run pack first): ${missing.map(p => p.name).join(", ")}`);
  process.exit(1);
}

const staging = fs.mkdtempSync(path.join(os.tmpdir(), "b5-content-"));
const moduleDir = path.join(staging, MODULE_ID);
fs.mkdirSync(moduleDir, { recursive: true });

fs.writeFileSync(path.join(moduleDir, "module.json"),
  `${JSON.stringify(manifest(version, system.compatibility), null, 2)}\n`);

const notes = readme(entryCounts());
fs.writeFileSync(path.join(moduleDir, "readme.md"), notes);

// `dereference` matters: the local module links its packs, and a zip of links is useless.
for (const pack of packs) {
  fs.cpSync(path.join(root, pack.path), path.join(moduleDir, pack.path),
    { recursive: true, dereference: true });
}

fs.mkdirSync(outDir, { recursive: true });
const archive = path.join(outDir, archiveName);
fs.rmSync(archive, { force: true });
execFileSync("zip", ["-rq", archive, MODULE_ID], { cwd: staging });
fs.writeFileSync(path.join(outDir, "readme.md"), notes);
fs.rmSync(staging, { recursive: true, force: true });

const size = (fs.statSync(archive).size / 1024 / 1024).toFixed(1);
console.log(`${archive} — ${packs.length} packs, ${size} MB`);
console.log(`${path.join(outDir, "readme.md")} — install notes (Polish)`);
