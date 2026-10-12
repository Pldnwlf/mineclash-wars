import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Auth", () => ({
  getAuthHeader: async () => "Bearer t",
}));
vi.mock("../../src/client/ClientEnv", () => ({
  ClientEnv: {
    gameHttpBase: () => "http://h",
    gameWorkerPath: () => "w0",
  },
}));
vi.mock("../../src/client/Utils", () => ({
  translateText: (k: string, p?: Record<string, unknown>) =>
    p ? `${k}|${JSON.stringify(p)}` : k,
}));

import { GameConfig } from "@openfront/engine-api/Schemas";
import { leaderboardBadgeText } from "../../src/client/mineclash/LeaderboardBadge";
import {
  lobbyStakeInfo,
  renderLobbyStake,
} from "../../src/client/mineclash/LobbyStakePanel";
import {
  pickFreeLobby,
  pickStakeLobby,
  stakeEmptyKey,
  stakeOf,
} from "../../src/client/mineclash/menu/MenuLogic";
import {
  canHostStake,
  createStakeLobby,
  parseStakeInput,
  runStakeJoinGate,
  StakeCreateError,
  stakeErrorText,
  stakeGate,
  stakeKickText,
  StakeStatus,
  validateStake,
} from "../../src/client/mineclash/StakeApi";

const status = (o: Partial<StakeStatus> = {}): StakeStatus => ({
  walletReady: true,
  wdPerCoin: 1000,
  rulesAccepted: true,
  balance: 500,
  ...o,
});

afterEach(() => vi.unstubAllGlobals());

describe("parseStakeInput", () => {
  it("plain number = coins", () => {
    expect(parseStakeInput("100", 1000)).toBe(100);
    expect(parseStakeInput("1.5", 1000)).toBeNull();
    expect(parseStakeInput("0", 1000)).toBeNull();
    expect(parseStakeInput("abc", 1000)).toBeNull();
  });
  it("k / m / $ = money at the rate, rounded up", () => {
    expect(parseStakeInput("15m", 1000)).toBe(15_000);
    expect(parseStakeInput("10k", 1000)).toBe(10);
    expect(parseStakeInput("$2.5m", 1000)).toBe(2_500);
    expect(parseStakeInput("$1500", 1000)).toBe(2); // 1.5 -> up
    expect(parseStakeInput("1k", 3)).toBe(334); // 333.33 -> up
    expect(parseStakeInput("$1", 1000)).toBe(1); // never 0
  });
  it("money without a rate is invalid", () => {
    expect(parseStakeInput("15m", null)).toBeNull();
    expect(parseStakeInput("100", null)).toBe(100);
  });
});

describe("create lobby validation", () => {
  it("caps at the host's own balance", () => {
    expect(validateStake("500", 1000, 500)).toEqual({ ok: true, coins: 500 });
    expect(validateStake("501", 1000, 500)).toEqual({
      ok: false,
      error: "too_high",
    });
    expect(validateStake("x", 1000, 500)).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(validateStake("1m", 1000, 500)).toEqual({
      ok: false,
      error: "too_high", // 1m = 1000 coins
    });
    expect(validateStake("$200k", 1000, 500)).toEqual({ ok: true, coins: 200 });
  });
  it("field only for logged in + rules + wallet", () => {
    expect(canHostStake(status())).toBe(true);
    expect(canHostStake(status({ rulesAccepted: false }))).toBe(false);
    expect(canHostStake(status({ rulesAccepted: null, balance: null }))).toBe(
      false,
    );
    expect(canHostStake(status({ walletReady: false }))).toBe(false);
    expect(canHostStake(null)).toBe(false);
  });
  it("create_game sends mineclashStakeCoins, maps error codes", async () => {
    const f = vi.fn(async () => ({
      ok: true,
      json: async () => ({ gameID: "ABCD1234" }),
    }));
    vi.stubGlobal("fetch", f);
    await expect(createStakeLobby(42, "tok", "http://h")).resolves.toEqual({
      gameID: "ABCD1234",
    });
    const [u, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(u).toBe("http://h/api/create_game");
    expect(JSON.parse(init.body as string)).toEqual({
      mineclashStakeCoins: 42,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "stake_insufficient_funds" }),
      })),
    );
    await expect(createStakeLobby(42, "tok", "http://h")).rejects.toEqual(
      expect.objectContaining({ code: "stake_insufficient_funds" }),
    );
    expect(new StakeCreateError("x").code).toBe("x");
  });
});

describe("stake errors", () => {
  it("known codes use kick_reason.<code>, others the generic text", () => {
    expect(stakeErrorText("stake_ip_limit")).toBe("kick_reason.stake_ip_limit");
    expect(stakeErrorText("kick_reason.stake_guest")).toBe(
      "kick_reason.stake_guest",
    );
    expect(stakeErrorText("boom")).toContain("mineclash.stake_error");
    expect(stakeKickText("kick_reason.stake_ip_limit")).not.toBeNull();
    expect(stakeKickText("kick_reason.host_left")).toBeNull();
  });
});

describe("join gate", () => {
  it("pure order: wallet, login, rules, funds", () => {
    expect(stakeGate(status({ walletReady: false }), 10)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(stakeGate(null, 10)).toEqual({ ok: false, reason: "unavailable" });
    expect(
      stakeGate(status({ rulesAccepted: null, balance: null }), 10),
    ).toEqual({ ok: false, reason: "login" });
    expect(stakeGate(status({ rulesAccepted: false }), 10)).toEqual({
      ok: false,
      reason: "rules",
    });
    expect(stakeGate(status({ balance: 5 }), 10)).toEqual({
      ok: false,
      reason: "funds",
    });
    expect(stakeGate(status(), 10)).toEqual({ ok: true });
  });

  it("rules not accepted: popup, POST rules-accept, then join", async () => {
    const f = vi.fn(async (u: string, _init?: RequestInit) =>
      u.endsWith("/status")
        ? { ok: true, json: async () => status({ rulesAccepted: false }) }
        : { ok: true, json: async () => ({ ok: true }) },
    );
    vi.stubGlobal("fetch", f);
    const showRules = vi.fn(async () => true);
    const notify = vi.fn();
    await expect(runStakeJoinGate(10, { showRules, notify })).resolves.toBe(
      true,
    );
    expect(showRules).toHaveBeenCalledOnce();
    const post = f.mock.calls.find((c) => c[0].endsWith("/rules-accept"));
    expect((post?.[1] as RequestInit).method).toBe("POST");
    expect(notify).not.toHaveBeenCalled();
  });

  it("declined popup or missing login or funds: no join, hint shown", async () => {
    const serve = (s: StakeStatus) =>
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, json: async () => s })),
      );
    const notify = vi.fn();
    serve(status({ rulesAccepted: false }));
    expect(
      await runStakeJoinGate(10, { showRules: async () => false, notify }),
    ).toBe(false);
    serve(status({ rulesAccepted: null, balance: null }));
    expect(
      await runStakeJoinGate(10, { showRules: async () => true, notify }),
    ).toBe(false);
    expect(notify.mock.lastCall?.[0]).toContain(
      "mineclash.stake_login_required",
    );
    serve(status({ balance: 1 }));
    expect(
      await runStakeJoinGate(10, { showRules: async () => true, notify }),
    ).toBe(false);
    expect(notify.mock.lastCall?.[0]).toContain("mineclash.stake_not_enough");
    serve(status({ walletReady: false }));
    await runStakeJoinGate(10, { showRules: async () => true, notify });
    expect(notify.mock.lastCall?.[0]).toContain("mineclash.stake_unavailable");
  });
});

describe("menu cards", () => {
  const lobby = (id: string, cfg: object) =>
    ({ gameID: id, gameConfig: cfg }) as any;
  it("stake card = lobby with mineclashStake, free card = without", () => {
    const games = {
      ffa: [
        lobby("S", { mineclashStake: { coins: 10 }, mineclashRules: {} }),
        lobby("F", { mineclashRules: {} }),
      ],
    } as any;
    expect(pickStakeLobby(games)?.gameID).toBe("S");
    expect(pickFreeLobby(games)?.gameID).toBe("F");
    expect(stakeOf(pickStakeLobby(games))).toEqual({ coins: 10 });
    expect(stakeOf(pickFreeLobby(games))).toBeNull();
    expect(pickStakeLobby({ ffa: [lobby("F", {})] } as any)).toBeNull();
  });
  it("wallet down shows the unavailable text", () => {
    expect(stakeEmptyKey(false)).toBe("mineclash.stake_unavailable");
    expect(stakeEmptyKey(true)).toBe("mineclash.menu_no_stake_lobby");
    expect(stakeEmptyKey(undefined)).toBe("mineclash.menu_no_stake_lobby");
  });
});

describe("lobby stake panel + badge", () => {
  it("stake info: pot, 5 % rake (rounded up), donations", () => {
    const cfg = {
      mineclashStake: { coins: 10 },
      donateGold: true,
    } as GameConfig;
    expect(lobbyStakeInfo(cfg, 3, 1000)).toEqual({
      stakePerPlayer: 10,
      pot: 30,
      rake: 2, // 30 - floor(28.5)
      donations: true,
      moneyValue: "$10K",
    });
    expect(lobbyStakeInfo({} as GameConfig, 3, 1000)).toBeNull();
    expect(lobbyStakeInfo(cfg, 0, null)?.pot).toBe(0);
    expect(renderLobbyStake(null).strings.join("")).toBe("");
  });
  it("badge shows the pot in stake matches", () => {
    expect(leaderboardBadgeText()).toBe("leaderboard.badge_economy_classic");
    expect(leaderboardBadgeText(100, 3)).toBe(
      'mineclash.badge_pot|{"coins":"300"}',
    );
  });
});
