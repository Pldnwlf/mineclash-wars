// mineclash #21: Ende-zu-Ende lokal, Prod-Pfad (JWT-Pflicht).
//   Terminal 1: npm run stub:api
//   Terminal 2: MINECLASH_API_URL=http://localhost:8787 npm run start:server-dev
//   Terminal 3: npx tsx scripts/mineclash-e2e-login.ts
// Zwei Konten (Alice, Bob) + ein Gast joinen einer privaten Lobby; erwartet:
// Roster zeigt den MC-Namen trotz anderem Join-Namen, der Gast behält seinen.
import {
  createGameWireContext,
  decodeServerMessage,
  encodeClientMessage,
} from "@openfront/shared/ZbinWire";
import WebSocket from "ws";

const API = process.env.MINECLASH_API_URL ?? "http://localhost:8787";
const GAME = process.env.GAME_URL ?? "http://localhost:3001"; // worker 0 direkt
const WS = GAME.replace(/^http/, "ws");

async function token(path: string, init?: RequestInit) {
  const r = await fetch(API + path, init);
  return ((await r.json()) as { token: string }).token;
}

function join(gameID: string, tok: string, username: string) {
  return new Promise<string[]>((resolve, reject) => {
    const ws = new WebSocket(`${WS}/w0`);
    const ctx = createGameWireContext([]);
    const timer = setTimeout(
      () => reject(new Error("timeout " + username)),
      8000,
    );
    ws.on("open", () =>
      ws.send(
        encodeClientMessage(
          {
            type: "join",
            gameID,
            username,
            clanTag: null,
            token: tok,
            turnstileToken: null,
            gitCommit: "DEV",
            platform: "web",
          } as never,
          undefined,
        ),
      ),
    );
    ws.on("message", (b: Buffer) => {
      const m = decodeServerMessage(b, ctx) as {
        type: string;
        lobby?: { clients?: { username: string }[] };
      };
      if (m.type === "lobby_info" && m.lobby?.clients) {
        clearTimeout(timer);
        resolve(m.lobby.clients.map((c) => c.username));
      }
    });
    ws.on("close", (code, reason) => {
      clearTimeout(timer);
      reject(new Error(`closed ${code} ${reason}`));
    });
  });
}

const alice = await token("/dev/login?name=Alice");
const bob = await token("/dev/login?name=Bob");
const guest = await token("/auth/guest", { method: "POST" });

const created = await fetch(`${GAME}/w0/api/create_game`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${alice}`,
    "content-type": "application/json",
  },
  body: "{}",
});
const { gameID } = (await created.json()) as { gameID: string };
console.log("game", gameID, created.status);

const a = await join(gameID, alice, "Fake1");
console.log("alice sees", a);
const b = await join(gameID, bob, "Fake2");
console.log("bob sees", b);
const g = await join(gameID, guest, "FreierName");
console.log("guest sees", g);
const ok =
  b.includes("Alice") &&
  b.includes("Bob") &&
  !b.includes("Fake1") &&
  g.includes("FreierName");
console.log(ok ? "E2E OK" : "E2E FAIL");
process.exit(ok ? 0 : 1);
