import http from "http";
import { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  alert,
  ALERT_MAX_MESSAGE,
  alertDrain,
  resetAlertsForTest,
  sanitizeDetails,
  startKumaPush,
} from "../../src/server/MineclashAlerts";

let srv: http.Server;
let base: string;
let hits: { method: string; url: string; body: string }[];

beforeEach(async () => {
  hits = [];
  resetAlertsForTest();
  srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits.push({ method: req.method!, url: req.url!, body });
      res.end("ok");
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.useRealTimers();
  delete process.env.MINECLASH_ALERT_URL;
  delete process.env.MINECLASH_KUMA_PUSH_URL;
  delete process.env.MINECLASH_KUMA_PUSH_SECONDS;
  await new Promise((r) => srv.close(r));
});

describe("alert", () => {
  test("ohne env passiert nichts", async () => {
    await alert("drain haengt", "x");
    expect(hits).toHaveLength(0);
    expect(startKumaPush(() => true)).toBeNull();
  });

  test("payload, stabiler Titel, Kuerzung", async () => {
    process.env.MINECLASH_ALERT_URL = `${base}/beszel/tok`;
    await alertDrain("word ".repeat(400));
    expect(hits).toHaveLength(1);
    expect(hits[0].method).toBe("POST");
    expect(hits[0].url).toBe("/beszel/tok");
    const b = JSON.parse(hits[0].body);
    expect(b.title).toBe("mineclash-wars: drain haengt");
    expect(b.message.length).toBe(ALERT_MAX_MESSAGE);
  });

  test("Rate-Limit pro key", async () => {
    process.env.MINECLASH_ALERT_URL = base;
    await alert("k1", "a");
    await alert("k1", "b");
    await alert("k2", "c");
    expect(hits).toHaveLength(2);
  });

  test("Fehler werden nicht geworfen", async () => {
    process.env.MINECLASH_ALERT_URL = "http://127.0.0.1:1/x";
    await expect(alert("k", "a")).resolves.toBeUndefined();
  });
});

test("sanitizeDetails filtert Personendaten/Secrets", () => {
  const out = sanitizeDetails(
    "game 123e4567-e89b-12d3-a456-426614174000 ip 10.1.2.3 name=Hans mail a@b.de https://h.example/x?t=1 tok abcdefghijklmnopqrstuvwxyz123",
  );
  expect(out).not.toMatch(
    /123e4567|10\.1\.2\.3|Hans|a@b\.de|h\.example|abcdefghij/,
  );
});

describe("kuma push", () => {
  test("Intervall, nur wenn gesund", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    process.env.MINECLASH_KUMA_PUSH_URL = `${base}/api/push/abc`;
    process.env.MINECLASH_KUMA_PUSH_SECONDS = "5";
    let healthy = true;
    const stop = startKumaPush(() => healthy)!;
    await vi.waitFor(() => expect(hits).toHaveLength(1));
    expect(hits[0].method).toBe("GET");
    expect(hits[0].url).toBe("/api/push/abc?status=up&msg=OK");
    vi.advanceTimersByTime(5000);
    await vi.waitFor(() => expect(hits).toHaveLength(2));
    healthy = false;
    vi.advanceTimersByTime(10000);
    await new Promise((r) => setTimeout(r, 50));
    expect(hits).toHaveLength(2);
    stop();
  });
});
