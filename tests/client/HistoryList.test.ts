import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", () => ({
  translateText: (key: string) => `[${key}]`,
  getMapName: (m: string) => m,
  currentPagePath: (p: string) => p,
}));
vi.mock("../../src/client/ClientEnv", () => ({
  ClientEnv: { gamePath: (id: string) => `/w0/game/${id}` },
}));
vi.mock("../../src/client/mineclash/ReportApi", () => ({
  reportAfterMatch: vi.fn(),
}));

import { HistoryList } from "../../src/client/mineclash/HistoryList";

const match = {
  id: "m1abcdefg1",
  end: 1,
  map: "World",
  mode: "Free For All",
  type: "Public",
  result: "won",
  playerCount: 2,
  stake: false,
  players: [{ uuid: "u-bob", name: "Bob" }],
};

async function mount(loader: any, reporter: any = vi.fn()) {
  if (!customElements.get("history-list"))
    customElements.define("history-list", HistoryList);
  const el = document.createElement("history-list") as HistoryList;
  el.loader = loader;
  el.reporter = reporter;
  document.body.appendChild(el);
  await new Promise((r) => setTimeout(r));
  await el.updateComplete;
  return el;
}

describe("history-list", () => {
  it("rendert Liste mit Replay-Link", async () => {
    const el = await mount(async () => [match]);
    expect(el.querySelectorAll(".match")).toHaveLength(1);
    expect(el.querySelector(".result")?.textContent).toContain("result_won");
    expect(el.querySelector("a.replay")?.getAttribute("href")).toBe(
      "/w0/game/m1abcdefg1",
    );
  });

  it("nicht eingeloggt (null) zeigt Login-Hinweis", async () => {
    const el = await mount(async () => null);
    expect(el.textContent).toContain("history_login");
    expect(el.querySelector(".match")).toBeNull();
  });

  it("Melden ruft reportAfterMatch mit Auswahl und Grund", async () => {
    const reporter = vi.fn().mockResolvedValue("ok");
    const el = await mount(async () => [match], reporter);
    (el.querySelector(".report-toggle") as HTMLElement).click();
    await el.updateComplete;
    const box = el.querySelector(".report-target") as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    await el.updateComplete;
    (el.querySelector(".report-submit") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    expect(reporter).toHaveBeenCalledWith("m1abcdefg1", ["u-bob"], "botting");
  });

  it("zeigt Fehler bei Doppel-Report", async () => {
    const reporter = vi.fn().mockResolvedValue("duplicate");
    const el = await mount(async () => [match], reporter);
    (el.querySelector(".report-toggle") as HTMLElement).click();
    await el.updateComplete;
    const box = el.querySelector(".report-target") as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    await el.updateComplete;
    (el.querySelector(".report-submit") as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r));
    await el.updateComplete;
    expect(el.querySelector(".report-error")?.textContent).toContain(
      "report_duplicate",
    );
  });
});
