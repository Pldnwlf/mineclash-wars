# mineclash-wars (Arbeitsname)

Echtzeit-Territorial-Strategiespiel mit **Einsatz-Matches** für mineclash.de: Spieler setzen Sparbuch-Coins ein, der Gewinner bekommt den Topf (abzüglich Rake). Kein Glücksspiel, Regeln und Plan siehe [ROADMAP.md](ROADMAP.md).

## Herkunft

Fork von [OpenFront](https://github.com/openfrontio/OpenFrontIO) (`openfrontio/OpenFrontIO`, Stand `38cd12d`, 2026-09-23). Das HUD orientiert sich am offenen alten FrontWars-Client. Übernommenes ist in [CREDITS.md](CREDITS.md) aufgeführt.

## Lizenz

- Quellcode: **GNU AGPL-3.0** ([LICENSE](LICENSE)) mit **zusätzlichen Bedingungen nach §7** (seit 2025-12-16): Copyright-Hinweis "© OpenFront and Contributors" an sichtbarer Stelle (Footer, Ladebildschirm) behalten; veränderte Versionen dürfen sich nicht als Original ausgeben.
- Assets: siehe [LICENSE-ASSETS](LICENSE-ASSETS).
- Lizenzgeschichte: [LICENSING.md](LICENSING.md).
- `proprietary/` ist Eigentum der OpenFront-Autoren, nicht frei nutzbar: nicht verwenden, nicht verändern, nicht darauf verweisen.

## Lokal starten

```bash
npm run inst   # Abhängigkeiten (npm ci --ignore-scripts, nicht npm install)
npm run dev    # Client + Server mit Hot Reload
```

Dann [http://localhost:9000](http://localhost:9000) öffnen. Tests: `npm test`, Lint: `npm run lint`. Weitere Befehle und Architektur: [CLAUDE.md](CLAUDE.md), [docs/](docs/).

## Branches und Remotes

- `main`: Entwicklung. `release`: stabiler Stand, `main` wird nach `release` gemerged.
- `origin`: dieses Repo (`Pldnwlf/mineclash-wars`).
- `upstream`: `https://github.com/openfrontio/OpenFrontIO.git`. Einrichten: `git remote add upstream https://github.com/openfrontio/OpenFrontIO.git`. Upstream-Dateien möglichst nicht ändern, damit Merges leicht bleiben.

## Weiterlesen

- [ROADMAP.md](ROADMAP.md): Plan, Geld- und Siegregeln, Phasen
- [CREDITS.md](CREDITS.md): Herkunft und Danksagungen
