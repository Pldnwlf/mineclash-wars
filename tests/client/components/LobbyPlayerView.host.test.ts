import { GameMode } from "@openfront/engine-api/game/GameTypes";
import type { ClientInfo } from "@openfront/shared/WireSchemas";
import { render } from "lit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../src/client/components/LobbyPlayerView";
import type { LobbyTeamView } from "../../../src/client/components/LobbyPlayerView";
import { renderLobbyStake } from "../../../src/client/mineclash/LobbyStakePanel";

// mineclash #20: host crown, hand-over button, random teams, stake area
const c = (clientID: string): ClientInfo => ({
  clientID,
  username: clientID,
  clanTag: null,
});

async function mount(props: Partial<LobbyTeamView>): Promise<LobbyTeamView> {
  const view = document.createElement("lobby-player-view") as LobbyTeamView;
  view.gameMode = GameMode.FFA;
  Object.assign(view, props);
  document.body.append(view);
  await view.updateComplete;
  return view;
}

describe("lobby host UI", () => {
  beforeEach(() => document.body.replaceChildren());

  it("shows the crown only on the host row", async () => {
    const view = await mount({
      clients: [c("host"), c("guest")],
      lobbyCreatorClientID: "host",
      currentClientID: "host",
    });
    const crowns = view.querySelectorAll("[data-test-host-crown]");
    expect(crowns).toHaveLength(1);
    expect(crowns[0].closest(".player-tag")?.textContent).toContain("host");
  });

  it("hand-over button exists for the host only, never on host/self rows", async () => {
    const onTransferHost = vi.fn();
    const asHost = await mount({
      clients: [c("host"), c("guest")],
      lobbyCreatorClientID: "host",
      currentClientID: "host",
      onTransferHost,
    });
    const buttons = asHost.querySelectorAll<HTMLButtonElement>(
      "[data-test-transfer-host]",
    );
    expect(buttons).toHaveLength(1);
    buttons[0].click();
    expect(onTransferHost).toHaveBeenCalledWith("guest");

    document.body.replaceChildren();
    const asGuest = await mount({
      clients: [c("host"), c("guest")],
      lobbyCreatorClientID: "host",
      currentClientID: "guest",
    });
    expect(asGuest.querySelectorAll("[data-test-transfer-host]")).toHaveLength(
      0,
    );
  });

  it("random teams: no assigned-team preview, only the note", async () => {
    const view = await mount({
      gameMode: GameMode.Team,
      teamCount: 2,
      clients: [c("a"), c("b")],
      randomTeams: true,
    });
    expect(view.querySelector("[data-test-random-teams]")).not.toBeNull();
    expect(view.textContent).not.toContain("host_modal.assigned_teams");
  });
});

describe("lobby stake area", () => {
  it("is hidden without a stake and shows stake + pot with one", () => {
    const root = document.createElement("div");
    render(renderLobbyStake(null), root);
    expect(root.querySelector("[data-test-lobby-stake]")).toBeNull();
    render(
      renderLobbyStake({
        stakePerPlayer: 100,
        pot: 300,
        rake: 15,
        donations: true,
      }),
      root,
    );
    expect(
      root.querySelector("[data-test-lobby-stake]")?.textContent,
    ).toContain("300");
  });
});
