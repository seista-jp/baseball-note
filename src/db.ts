import Dexie, { type EntityTable } from "dexie";
import type { AiAnalysis, LogEntry } from "./types";
import type { DraftRow } from "./drafts";

export type BaseballDatabase = Dexie & {
  logs: EntityTable<LogEntry, "id">;
  aiAnalyses: EntityTable<AiAnalysis, "id">;
  composerDrafts: EntityTable<DraftRow, "id">;
};

export function createDatabase(name: string): BaseballDatabase {
  const db = new Dexie(name) as BaseballDatabase;
  db.version(1).stores({
    logs: "id, date, createdAt",
  });

  db.version(2).stores({
    aiAnalyses: "id, createdAt",
  });

  // Additive upgrade only: existing logs and AI analyses are not migrated.
  db.version(3).stores({ composerDrafts: "id, state, updatedAt" });
  return db;
}

export const db = createDatabase("baseballNote");
