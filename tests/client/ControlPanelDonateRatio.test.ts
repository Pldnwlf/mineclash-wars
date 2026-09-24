import { afterEach, beforeEach, describe, expect, it } from "vitest";

import "../../src/client/hud/layers/ControlPanel";
import type { ControlPanel } from "../../src/client/hud/layers/ControlPanel";
import type { UIState } from "../../src/client/UIState";
import type { GameView } from "../../src/client/view";
import { EventBus } from "../../src/core/EventBus";

// The donate sliders only show when the game allows that donation, and moving
// one sets the share a quick donation to an ally sends.
describe("control-panel donate sliders", () => {
  let panel: ControlPanel;
  let uiState: UIState;

  const mount = async (donateTroops: boolean, donateGold: boolean) => {
    panel = document.createElement("control-panel") as ControlPanel;
    uiState = {
      attackRatio: 0.2,
      donateTroopRatio: 0.1,
      donateGoldRatio: 0.1,
    } as UIState;
    panel.uiState = uiState;
    panel.eventBus = new EventBus();
    panel.game = {
      inSpawnPhase: () => false,
      myPlayer: () => null,
      config: () => ({
        donateTroops: () => donateTroops,
        donateGold: () => donateGold,
      }),
    } as unknown as GameView;
    document.body.appendChild(panel);
    panel.init();
    await panel.updateComplete;
  };

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    panel.remove();
  });

  it("shows only the donations the game allows", async () => {
    await mount(true, false);
    expect(panel.querySelector("input.accent-blue-500")).not.toBeNull();
    expect(panel.querySelector("input.accent-yellow-400")).toBeNull();
  });

  it("writes the slider value to uiState", async () => {
    await mount(true, true);
    const troops = panel.querySelector<HTMLInputElement>(
      "input.accent-blue-500",
    )!;
    troops.value = "35";
    troops.dispatchEvent(new Event("input"));
    const gold = panel.querySelector<HTMLInputElement>(
      "input.accent-yellow-400",
    )!;
    gold.value = "60";
    gold.dispatchEvent(new Event("input"));

    expect(uiState.donateTroopRatio).toBeCloseTo(0.35);
    expect(uiState.donateGoldRatio).toBeCloseTo(0.6);
  });
});
