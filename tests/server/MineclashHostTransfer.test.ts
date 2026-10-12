import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GamePhase } from "../../src/server/GameServer";
import {
  makeClient as harnessClient,
  makeGame as harnessGame,
  makeMockWs,
} from "../util/GameServerHarness";

// mineclash #20: host handover
describe("GameServer - transfer_host", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
  });

  function setup() {
    const game = harnessGame({ creatorPersistentID: "host-pid" });
    const hostWs = makeMockWs();
    const guestWs = makeMockWs();
    game.joinClient(
      harnessClient({
        clientID: "host0001",
        persistentID: "host-pid",
        username: "HostUser",
        ws: hostWs,
      }),
    );
    game.joinClient(
      harnessClient({
        clientID: "guest001",
        persistentID: "guest-pid",
        username: "GuestUser",
        ws: guestWs,
      }),
    );
    const act = (clientID: string, targetClientID: string) =>
      game.handleIntent({ type: "transfer_host", targetClientID } as any, {
        clientID,
        isLobbyCreator: game.gameInfo().lobbyCreatorClientID === clientID,
        isAdmin: false,
        isAdminBot: false,
      });
    return { game, hostWs, guestWs, act };
  }

  it("host hands over: crown moves, old host loses the right", () => {
    const { game, act } = setup();
    expect(game.gameInfo().lobbyCreatorClientID).toBe("host0001");
    expect(act("host0001", "guest001").status).toBe(200);
    expect(game.gameInfo().lobbyCreatorClientID).toBe("guest001");
    expect(act("host0001", "guest001").status).toBe(403);
    expect(act("guest001", "host0001").status).toBe(200);
  });

  it("non-host cannot hand over", () => {
    const { game, act } = setup();
    expect(act("guest001", "guest001").status).toBe(403);
    expect(game.gameInfo().lobbyCreatorClientID).toBe("host0001");
  });

  it("rejects self and unknown targets", () => {
    const { game, act } = setup();
    expect(act("host0001", "host0001").status).toBe(404);
    expect(act("host0001", "nobody01").status).toBe(404);
    expect(game.gameInfo().lobbyCreatorClientID).toBe("host0001");
  });

  it("new host leaving closes the lobby, old host leaving does not", async () => {
    const { game, hostWs, guestWs, act } = setup();
    act("host0001", "guest001");
    await hostWs.trigger("close");
    expect(game.phase()).toBe(GamePhase.Lobby);
    await guestWs.trigger("close");
    expect(game.phase()).toBe(GamePhase.Finished);
  });
});
