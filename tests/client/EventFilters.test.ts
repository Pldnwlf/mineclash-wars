import { describe, expect, it } from "vitest";
import {
  FILTER_CATEGORIES,
  isTypeShown,
  parseHiddenCategories,
} from "../../src/client/hud/EventFilters";
import {
  getMessageCategory,
  MessageCategory,
  MessageType,
} from "@openfront/engine-api/game/GameTypes";

describe("event log filters", () => {
  it("shows everything by default", () => {
    const hidden = parseHiddenCategories(null);
    for (const t of Object.values(MessageType)) {
      expect(isTypeShown(hidden, t as MessageType)).toBe(true);
    }
  });

  it("each category hides exactly its own message types", () => {
    for (const c of FILTER_CATEGORIES) {
      const hidden = new Set([c]);
      for (const t of Object.values(MessageType) as MessageType[]) {
        expect(isTypeShown(hidden, t)).toBe(getMessageCategory(t) !== c);
      }
    }
  });

  it("donations are the TRADE category", () => {
    const hidden = new Set([MessageCategory.TRADE]);
    expect(isTypeShown(hidden, MessageType.DONATION_SENT)).toBe(false);
    expect(isTypeShown(hidden, MessageType.DONATION_RECEIVED)).toBe(false);
    expect(isTypeShown(hidden, MessageType.CHAT)).toBe(true);
  });

  it("parses stored state and ignores garbage", () => {
    expect([...parseHiddenCategories('["CHAT","bogus"]')]).toEqual(["CHAT"]);
    expect(parseHiddenCategories("{not json").size).toBe(0);
    expect(parseHiddenCategories('"CHAT"').size).toBe(0);
  });
});
