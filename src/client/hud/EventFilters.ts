// mineclash #13: event log category filters (after FrontWars EventsDisplay, see CREDITS.md)
import {
  getMessageCategory,
  MessageCategory,
  MessageType,
} from "../../core/game/Game";

const STORAGE_KEY = "mineclash-eventFilters";

// Order = order of the filter icons.
export const FILTER_CATEGORIES: readonly MessageCategory[] = [
  MessageCategory.ATTACK,
  MessageCategory.NUKE,
  MessageCategory.TRADE,
  MessageCategory.ALLIANCE,
  MessageCategory.CHAT,
];

export function parseHiddenCategories(
  raw: string | null,
): Set<MessageCategory> {
  try {
    const list: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(list)) return new Set();
    return new Set(FILTER_CATEGORIES.filter((c) => list.includes(c)));
  } catch {
    return new Set();
  }
}

export function isTypeShown(
  hidden: ReadonlySet<MessageCategory>,
  type: MessageType,
): boolean {
  return !hidden.has(getMessageCategory(type));
}

export function loadHiddenCategories(): Set<MessageCategory> {
  try {
    return parseHiddenCategories(localStorage.getItem(STORAGE_KEY));
  } catch {
    return new Set();
  }
}

export function saveHiddenCategories(hidden: ReadonlySet<MessageCategory>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
  } catch {
    // storage unavailable: filters just won't persist
  }
}
