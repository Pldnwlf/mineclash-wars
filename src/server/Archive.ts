import { GameID, ID } from "@openfront/engine-api/Schemas";
import {
  GameRecord,
  GameRecordSchema,
  PartialGameRecord,
} from "@openfront/shared/WireSchemas";
import z from "zod";
import { registeredSite } from "./ClusterCheckin";
import { logger } from "./Logger";
import { readMatchRecord, writeMatchRecord } from "./MineclashArchive";
import { writeHistory } from "./MineclashHistory";
import { ServerEnv } from "./ServerEnv";

const log = logger.child({ component: "Archive" });

export async function archive(gameRecord: GameRecord) {
  try {
    const parsed = GameRecordSchema.safeParse(gameRecord);
    if (!parsed.success) {
      log.error(`invalid game record: ${z.prettifyError(parsed.error)}`, {
        gameID: gameRecord.info.gameID,
      });
      return;
    }
    // mineclash #29: eigene Ablage statt closed-source API
    await writeMatchRecord(gameRecord);
    // mineclash #40: Match-Historie je Teilnehmer
    await writeHistory(gameRecord).catch((e) =>
      log.error(`history write failed: ${e}`),
    );
  } catch (error) {
    log.error(`error archiving game record: ${error}`, {
      gameID: gameRecord.info.gameID,
    });
    return;
  }
}

export async function readGameRecord(
  gameId: GameID,
): Promise<GameRecord | null> {
  try {
    if (!ID.safeParse(gameId).success) {
      log.error(`invalid game ID: ${gameId}`);
      return null;
    }
    const record = await readMatchRecord(gameId);
    if (record === null) return null;
    return GameRecordSchema.parse(record);
  } catch (error) {
    log.error(`error reading game record: ${error}`, {
      gameID: gameId,
    });
    return null;
  }
}

export function finalizeGameRecord(
  clientRecord: PartialGameRecord,
): GameRecord {
  return {
    ...clientRecord,
    gitCommit: ServerEnv.gitCommit(),
    subdomain: ServerEnv.subdomain(),
    domain: ServerEnv.domain(),
    site: registeredSite(),
  };
}
