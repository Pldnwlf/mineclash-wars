import { PlayerType } from "@openfront/engine-api/game/GameTypes";
import { AllianceRejectExecution } from "@openfront/engine/execution/alliance/AllianceRejectExecution";
import { AllianceRequestExecution } from "@openfront/engine/execution/alliance/AllianceRequestExecution";
import { Game, Player } from "@openfront/engine/game/Game";
import {
  boatCounter,
  cooldownSeconds,
} from "../src/client/mineclash/RadialLabels";
import { playerInfo, setup } from "./util/Setup";

// mineclash #15
describe("radial menu cooldowns", () => {
  let game: Game;
  let p1: Player;
  let p2: Player;

  beforeEach(async () => {
    game = await setup(
      "plains",
      { infiniteGold: false, instantBuild: true, donateGold: true },
      [
        playerInfo("player1", PlayerType.Human),
        playerInfo("player2", PlayerType.Human),
      ],
    );
    p1 = game.player("player1");
    p1.conquer(game.ref(0, 0));
    p1.addGold(1000n);
    p2 = game.player("player2");
    p2.conquer(game.ref(0, 1));
  });

  test("no cooldown before any request", () => {
    expect(p1.allianceRequestReadyTick(p2)).toBe(0);
    expect(p1.donateReadyTick(p2)).toBe(0);
  });

  test("alliance request cooldown matches canSendAllianceRequest", () => {
    game.addExecution(new AllianceRequestExecution(p1, p2.id()));
    game.executeNextTick();
    game.addExecution(new AllianceRejectExecution(p1.id(), p2));
    game.executeNextTick();

    const ready = p1.allianceRequestReadyTick(p2);
    expect(ready).toBeGreaterThan(game.ticks());
    expect(p1.canSendAllianceRequest(p2)).toBe(false);
    while (game.ticks() < ready) game.executeNextTick();
    expect(p1.canSendAllianceRequest(p2)).toBe(true);
  });

  test("incoming request has no cooldown", () => {
    game.addExecution(new AllianceRequestExecution(p1, p2.id()));
    game.executeNextTick();
    game.addExecution(new AllianceRejectExecution(p1.id(), p2));
    game.executeNextTick();
    game.addExecution(new AllianceRequestExecution(p2, p1.id()));
    game.executeNextTick();
    expect(p1.allianceRequestReadyTick(p2)).toBe(0);
  });

  test("donate cooldown matches canDonateGold", () => {
    game.addExecution(new AllianceRequestExecution(p1, p2.id()));
    game.executeNextTick();
    game.addExecution(new AllianceRequestExecution(p2, p1.id()));
    game.executeNextTick();
    expect(p1.donateGold(p2, 1n)).toBe(true);

    const ready = p1.donateReadyTick(p2);
    expect(ready).toBe(game.ticks() + game.config().donateCooldown());
    expect(p1.canDonateGold(p2)).toBe(false);
    while (game.ticks() < ready) game.executeNextTick();
    expect(p1.canDonateGold(p2)).toBe(true);
  });

  test("client helpers", () => {
    expect(cooldownSeconds(undefined, 50)).toBe(0);
    expect(cooldownSeconds(40, 50)).toBe(0);
    expect(cooldownSeconds(80, 50)).toBe(3);
    expect(boatCounter(2, 3)).toBe("2/3");
  });
});
