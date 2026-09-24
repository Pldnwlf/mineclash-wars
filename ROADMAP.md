# Roadmap – mineclash-wars (Arbeitsname)

Territorial-Strategiespiel mit **Einsatz-Matches** für mineclash.de: Spieler wetten Sparbuch-Coins,
der Gewinner bekommt den Topf. Basis: [OpenFront](https://github.com/openfrontio/OpenFrontIO) (AGPL-3.0),
Look & Feel nach FrontWars (Stil nachgebaut, alter offener FrontWars-Client als Vorlage – siehe Rahmen).

## Rahmen (entschieden)
- Spiel um WindSMP-Geld ist von den WindSMP-Admins erlaubt, **solange kein Glücksspiel** enthalten ist.
  WindSMP-$ ist nicht für Echtgeld kaufbar (vom WindSMP-Team verboten).
- Zufall: Angriffe, Spawn, Nuke-Rand, KI-Nationen/Tribes bleiben; Handel/Züge nur minimal zufällig (#8).
- Einsatz in **Sparbuch-Coins** (mineclash), Login mit mineclash-Konto (Mojang-UUID).
- **Allianzen erlaubt**, grobes Teaming über Runden verboten, Spieler können melden (#27).
- Eigener Container, öffentliches Repo (AGPL).
- Der alte offene FrontWars-Client (GPL v3, Stand 2025-08, `../frontwars`) darf als Vorlage dienen (#12/#13), mit Hinweis in
  `CREDITS.md` – der geschlossene Live-Client, Logo und Assets bleiben tabu.
- Eingebunden als **iframe-Tab `/play`** auf mineclash.de mit Vollbild-Knopf, Spiel läuft auf `play.mineclash.de` (#32).
- Menü wie FrontWars: **zwei Rotations-Karten (Einsatz | Gratis)** mit je einer aktiven Lobby + Custom-Lobby-Liste (#19, #23).
  Custom-Lobbys: Start per Host-Knopf, Gratis-Runden offen für alle inkl. Gäste (Einsatz: <2 Menschen ⇒ zurück), Host stellt alle Optionen wie in FrontWars ein (Bots, Nationen, Startgold,
  Multiplikator, Einheiten aus, …). Handy-Ansicht im Hinterkopf, jetzt keine Priorität.
- Sieg in Einsatz-Matches: nur Menschen zählen, letzter Mensch mit Gebiet gewinnt. 80 %, ab Min. 15 Overtime −1 %/Min.,
  bei Min. 25 (70 %) Schluss ⇒ Mensch mit dem meisten Land gewinnt, Gleichstand teilt (#9). Das gilt für die Rotation;
  in Custom-Lobbys setzt der Host die Länge oder keine (dann ohne Zeitlimit). Team-Modi: Gewinnerteam teilt gleichmässig (#23).
- **Disconnect zählt nicht:** Rejoin jederzeit bis Matchende, auch Tab-Reload (#9, #36). Absturz/Abbruch ⇒ alle Einsätze zurück.
- Rake 5 % wird **verbrannt** (Geld bleibt auf BestesAuto ⇒ Deckung steigt), Gewinner bekommt alles, Auszahlung sofort
  nach Server-Prüfung. Rückbuchung bei Teaming nur bis Saldo 0 (#25).
- Einsatz fix in Coins, $-Anzeige mit live Sparbuch-Kurs, 1× täglich aktualisiert (#19, #22).
- Beitritt per Klick auf die Lobby-Karte (gelber Glow, nochmal klicken = raus), **kein Ready** (#19, #20).
- Max. **2 Konten pro IP** je Einsatz-Lobby, geteilte IPs pro Match in der DB protokolliert (#23, #27).
- Regel-Popup mit „Akzeptieren“ vor dem ersten Einsatz-Match, Tutorial freiwillig (#31, #35).
- Replays 7/90 Tage, alte Builds werden nicht aufgehoben – abspielbar, soweit der Code-Stand passt (#29).
- Keine Limits, Selbstsperre oder Altersgrenze (#26, zu).
- Logo = MineClash-Logo, Schrift Overpass, Musik von NCS (#3, #37).
- Alle Entscheide (2026-09-24/25) stehen im Abschnitt „Entscheide“ der Issues. Das Konzept-Doc ist in Teilen überholt
  (Allianzen aus, Stufen 10/100/1000, Top-3-Verteilung) – es gelten die Issues.

## Noch offen
- Tap-to-Attack mobil (#18), konkrete Farbpalette (#17), Start-Alarm (#37), Beta-Teilnehmer (#33), endgültiger Name (#7).

## Kritischer Pfad bis zum ersten Einsatz-Match
```
#5 Turnstile-Umbau ──┐
#4 eigene API ───────┴─► #21 Login ──► #22 Wallet ──► #23 Einsatz-Lobbys ──► #25 Auszahlung
                                                                            ▲
#6 Hosting ───┐                                                             │
#9 Siegregeln ┼─► #24 Gewinner serverseitig (Pflicht vor Geld!) ────────────┤
#29 Replays ──┘                                                             │
#36 Reconnect-Test ─────────────────────────────────────────────────────────┘

#29 Replays ──► #28 Reports ──► #30 Admin ──► #31 Regeln ──► #35 Tutorial ──► #33 Beta
```
Parallel dazu: HUD (#12–#18), Menü/Lobby (#19, #20), Branding/Assets (#3, #7).

🔴 Code-Abgleich 2026-09-24 (Details im Abschnitt „Code-Abgleich“ der Issues): Siegschwelle ist 80 %, im FFA gewinnt
immer genau ein Spieler – auch eine KI (#9, #25); nach einem Disconnect entscheidet der Übriggebliebene den Sieger-Vote
allein – egal, wer das Match wirklich gewonnen hat (#24); `/users/@me` + EdDSA-JWT + Gast-JWT fehlen im API-Plan (#4, #21); Turnstile-Ausbau sperrt sonst alle Joins (#5).

## Phasen
| Phase | Inhalt | Issues |
|---|---|---|
| 0 Fundament | Repo, Upstream-Sync, proprietäre Assets, eigene API, Client entschlacken, Hosting, Branding, Musik (NCS) | #1–#7, #37 |
| 1 Gameplay | ✅ Handel/Züge minimaler Zufall, Regelwerk Einsatz-Matches | #8, #9 |
| 2 HUD | ✅ Control-Panel, ✅ Baubalken, Infokarte, Event-Log, Rangliste, Radialmenü, Hide UI, Design-Tokens, Mobil | #10–#18 |
| 3 Menü & Lobby | Hauptmenü FrontWars-Aufbau, Lobby-Ansicht | #19, #20 |
| 4 Konten & Einsatz | Login, Wallet, Einsatz-Lobbys, verbindlicher Gewinner, Auszahlung (Schutz #26: entschieden, zu) | #21–#26 |
| 5 Fairness | Anti-Teaming-Konzept, Reports, Replays, Admin, Tab-Wechsel/Login-Ablauf testen | #27–#30, #36 |
| 6 Launch | Regeln/AGPL-Link, Einbindung mineclash.de, Lasttest + Beta, Tutorial ergänzen | #31–#33, #35 |

## Bewusst nicht geplant
- **Chaos-Modus** (Zufalls-Modifikatoren) – widerspricht „kein Glücksspiel".
- Map-Editor / Community-Maps, Themes-Editor, Freunde-Features über OpenFront hinaus – erst nach dem Launch, falls gewünscht.

Übersicht mit Status: Issue #34.
