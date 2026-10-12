// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  CloseViewEvent,
  ToggleHudEvent,
} from "../../../src/client/InputHandler";
import { HudVisibilityController } from "../../../src/client/mineclash/HudVisibilityController";
import { EventBus } from "@openfront/shared/EventBus";
import { UserSettings } from "../../../src/client/UserSettings";

describe("HudVisibilityController", () => {
  let bus: EventBus;
  let settings: UserSettings;

  const make = () => {
    const c = new HudVisibilityController(bus, settings);
    c.init();
    return c;
  };

  beforeEach(() => {
    localStorage.clear();
    document.body.className = "";
    bus = new EventBus();
    settings = new UserSettings();
  });

  it("toggles on H, restores on H and Esc", () => {
    const c = make();
    bus.emit(new ToggleHudEvent());
    expect(c.isHidden()).toBe(true);
    expect(document.body.classList.contains("mc-hud-hidden")).toBe(true);
    bus.emit(new ToggleHudEvent());
    expect(c.isHidden()).toBe(false);
    bus.emit(new ToggleHudEvent());
    bus.emit(new CloseViewEvent());
    expect(c.isHidden()).toBe(false);
    expect(document.body.classList.contains("mc-hud-hidden")).toBe(false);
  });

  it("does nothing when the setting is off", () => {
    settings.toggleHideInterface();
    const c = make();
    bus.emit(new ToggleHudEvent());
    expect(c.isHidden()).toBe(false);
  });

  it("starts visible in the next match", () => {
    const c = make();
    bus.emit(new ToggleHudEvent());
    c.init();
    expect(c.isHidden()).toBe(false);
    expect(document.body.classList.contains("mc-hud-hidden")).toBe(false);
  });
});
