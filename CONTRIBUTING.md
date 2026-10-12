# Contributing zu mineclash-wars

Fork von [OpenFront](https://github.com/openfrontio/OpenFrontIO) (AGPL). Ziel: Upstream-Merges leicht halten, damit wir nicht wie FrontWars abdriften. Details zu den Issues: `ROADMAP.md`.

## Branches

- `main`: Entwicklung. Alle Änderungen landen zuerst hier.
- `release`: einzige Deploy-Quelle (play.mineclash.de, #6). Nur getesteter Stand von `main` wird hierher gemergt. Nie direkt auf `release` committen.

## Upstream-Merge (nur bei Bedarf)

Kein fester Rhythmus. Merge bei wichtigen Fixes oder neuen Karten.

```bash
git remote add upstream https://github.com/openfrontio/OpenFrontIO.git   # einmalig
git fetch upstream
git checkout main
git merge --no-ff upstream/main      # Konflikte lösen (siehe Konfliktzonen)
npx tsc --noEmit && npm test && npm run lint
git checkout release && git merge main   # erst nach grünen Tests + Browser-Check
```

Vorher mit `git merge --no-commit --no-ff upstream/main` + `git merge --abort` probeweise prüfen. Upstream-Commits nie einzeln cherry-picken.

## Regeln für eigenen Code

- Eigene Logik in eigene Dateien (z. B. `src/server/Mineclash*.ts`, `src/client/mineclash/`). In Upstream-Dateien nur minimale Hooks/Aufrufe, kein Umbau.
- Jede Änderung in einer Upstream-Datei mit Kommentar markieren: `// mineclash #N: ...` (N = Issue-Nr.).
- Upstream-Doku nicht umschreiben: `CLAUDE.md`, `src/client/render/CLAUDE.md`, `.claude/skills/run-openfront`, `docs/`.
- UI-Texte über `translateText()`; Einträge nur in `resources/lang/en.json` und `resources/lang/de.json`.
- `src/core` bleibt deterministisch und braucht Tests.
- Übernommener FrontWars-Code/Assets: Eintrag in `CREDITS.md`.
- Commits: kurz, `bereich: was (#N)`.

## Konfliktzonen

Upstream-Dateien, die wir bereits angefasst haben (Stand seit `38cd12d`):

| Bereich | Dateien |
| --- | --- |
| HUD-Layer | `src/client/hud/GameRenderer.ts`, `hud/layers/ControlPanel.ts`, `RadialMenuElements.ts`, `SendResourceModal.ts`, `UnitDisplay.ts` |
| Client-Shell | `index.html`, `src/client/Main.ts`, `UIState.ts`, `GameVersion.ts`, `styles.css`, `components/DesktopNavBar.ts`, `MobileNavBar.ts`, `PlayPage.ts`, `SteamWishlistButton.ts` |
| Server / Configs | `src/server/MapPlaylist.ts`, `src/server/RenderHtml.ts`, `vite.config.ts` (ServerEnv/Configs: bei Anpassung hier ergänzen) |
| Core | `src/core/execution/PortExecution.ts`, `TrainStationExecution.ts` (Upstream hat nach `packages/engine/src/execution/` verschoben) |
| Texte | `resources/lang/en.json`, `resources/lang/de.json` |
| Tests/Snapshots | `tests/InputHandler.test.ts`, `tests/client/*`, `tests/__snapshots__/NationGoldPerMinute.test.ts.snap`, `TradeTrainScenarios.test.ts.snap` |

Eigene Dateien (konfliktfrei): `src/server/MineclashMaps.ts`, `tests/server/MineclashMaps.test.ts`, `resources/images/mineclash/`, `CREDITS.md`, `ROADMAP.md`.

Tipps: `lang/en.json` und `styles.css` nur am Dateiende/in eigenen Blöcken ergänzen; Snapshots nach Merge neu erzeugen (`npx vitest -u`), nicht von Hand mergen.

## Letzter Test-Merge

2026-10-12, `upstream/main` (Tag v0.34.24) in `main`-Stand (16 eigene Commits seit Fork):

- Upstream-Commits seit unserem Stand: 109.
- Konflikte (5): `packages/engine/src/execution/PortExecution.ts`, `packages/engine/src/execution/TrainStationExecution.ts` (Upstream verschob `src/core` nach `packages/engine/src`), `resources/lang/en.json`, `tests/__snapshots__/NationGoldPerMinute.test.ts.snap`, `tests/__snapshots__/TradeTrainScenarios.test.ts.snap`.
- Automatisch gemerged (kein Konflikt): `index.html`, `Main.ts`, `styles.css`, HUD-Layer, NavBars, `MapPlaylist.ts`, `RenderHtml.ts`, `vite.config.ts`, `de.json`.
- Danach `git merge --abort`; nichts von Upstream committet.
