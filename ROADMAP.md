# Roadmap – mineclash-wars (Arbeitsname)

Territorial-Strategiespiel mit **Einsatz-Matches** für mineclash.de: Spieler wetten Sparbuch-Coins,
der Gewinner bekommt den Topf. Basis: [OpenFront](https://github.com/openfrontio/OpenFrontIO) (AGPL-3.0),
Look & Feel nach FrontWars (nur Stil nachgebaut, kein Code übernommen).

## Rahmen (entschieden)
- Spiel um WindSMP-Geld ist von den WindSMP-Admins erlaubt, **solange kein Glücksspiel** enthalten ist.
  WindSMP-$ ist nicht für Echtgeld kaufbar (vom WindSMP-Team verboten).
- Zufall: Angriffe, Spawn, Nuke-Rand, KI-Nationen/Tribes bleiben; Handel/Züge nur minimal zufällig (#8).
- Einsatz in **Sparbuch-Coins** (mineclash), Login mit mineclash-Konto (Mojang-UUID).
- **Allianzen erlaubt**, grobes Teaming über Runden verboten, Spieler können melden (#27).
- Eigener Container, öffentliches Repo (AGPL).

## Kritischer Pfad bis zum ersten Einsatz-Match
```
#4 eigene API ──► #21 Login ──► #22 Wallet ──► #23 Einsatz-Lobbys ──► #25 Auszahlungsregeln
                                  │
#6 Hosting ─────────────────────► #24 Gewinner serverseitig (Pflicht vor Geld!)
                                  │
                   #29 Replays ──► #28 Reports ──► #30 Admin ──► #31 Regeln ──► #33 Beta
```
Parallel dazu: HUD (#12–#18), Menü/Lobby (#19, #20), Branding/Assets (#3, #7).

## Phasen
| Phase | Inhalt | Issues |
|---|---|---|
| 0 Fundament | Repo, Upstream-Sync, proprietäre Assets, eigene API, Client entschlacken, Hosting, Branding | #1–#7 |
| 1 Gameplay | ✅ Handel/Züge minimaler Zufall, Regelwerk Einsatz-Matches | #8, #9 |
| 2 HUD | ✅ Control-Panel, ✅ Baubalken, Infokarte, Event-Log, Rangliste, Radialmenü, Hide UI, Design-Tokens, Mobil | #10–#18 |
| 3 Menü & Lobby | Hauptmenü FrontWars-Aufbau, Lobby-Ansicht | #19, #20 |
| 4 Konten & Einsatz | Login, Wallet, Einsatz-Lobbys, verbindlicher Gewinner, Auszahlung, Schutz | #21–#26 |
| 5 Fairness | Anti-Teaming-Konzept, Reports, Replays, Admin | #27–#30 |
| 6 Launch | Regeln/AGPL-Link, Einbindung mineclash.de, Lasttest + Beta | #31–#33 |

## Bewusst nicht geplant
- **Chaos-Modus** (Zufalls-Modifikatoren) – widerspricht „kein Glücksspiel".
- Map-Editor / Community-Maps, Themes-Editor, Freunde-Features über OpenFront hinaus – erst nach dem Launch, falls gewünscht.

Übersicht mit Status: Issue #34.
