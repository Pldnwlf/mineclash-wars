// mineclash #16: H hides the whole HUD (screenshots), H/Esc/eye button restores.
// State is per match: init() always starts visible. Hiding is one body class +
// one stylesheet, so layer visibility lives in this single place.
import { EventBus } from "../../core/EventBus";
import { UserSettings } from "../../core/game/UserSettings";
import { Controller } from "../Controller";
import { CloseViewEvent, ToggleHudEvent } from "../InputHandler";

const HIDDEN_CLASS = "mc-hud-hidden";
const BUTTON_ID = "mc-hud-eye";
// Everything that is HUD; modals (build menu, win, player panel, settings) stay.
const HUD_TAGS = [
  "attacks-display",
  "tutorial-panel",
  "control-panel",
  "unit-display",
  "chat-display",
  "events-display",
  "actionable-events",
  "game-right-sidebar",
  "replay-panel",
  "game-left-sidebar",
  "performance-overlay",
  "player-info-overlay",
  "heads-up-message",
  "spawn-timer",
  "immunity-timer",
  "in-game-promo",
  "alert-frame",
];
const CSS = `
body.${HIDDEN_CLASS} :is(${HUD_TAGS.join(",")}) { display: none !important; }
#${BUTTON_ID} { display: none; position: fixed; left: 8px; top: 8px; z-index: 2000;
  width: 36px; height: 36px; border-radius: 9999px; border: 0; color: #fff;
  background: rgba(0,0,0,.55); font-size: 18px; line-height: 1; }
body.in-game #${BUTTON_ID} { display: block; }
body.${HIDDEN_CLASS} #${BUTTON_ID} { opacity: .4; }
@media (hover: hover) and (pointer: fine) { #${BUTTON_ID} { display: none !important; } }
`;

export class HudVisibilityController implements Controller {
  private hidden = false;

  constructor(
    private eventBus: EventBus,
    private userSettings: UserSettings,
  ) {}

  isHidden(): boolean {
    return this.hidden;
  }

  init() {
    this.apply(false);
    this.ensureDom();
    this.eventBus.on(ToggleHudEvent, () => this.set(!this.hidden));
    // Esc keeps closing menus (other CloseViewEvent listeners); it only also
    // brings the HUD back.
    this.eventBus.on(CloseViewEvent, () => this.set(false));
  }

  /** Hiding is a no-op while the setting is off; restoring is always allowed. */
  private set(hidden: boolean) {
    if (hidden && !this.userSettings.hideInterfaceEnabled()) return;
    this.apply(hidden);
  }

  private apply(hidden: boolean) {
    this.hidden = hidden;
    document.body?.classList.toggle(HIDDEN_CLASS, hidden);
  }

  private ensureDom() {
    if (document.getElementById(BUTTON_ID)) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    const btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.textContent = "\u{1F441}";
    btn.addEventListener("click", () => this.set(!this.hidden));
    document.body.appendChild(btn);
  }
}
