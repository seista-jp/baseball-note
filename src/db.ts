import Dexie, { type EntityTable } from "dexie";
import type { AiAnalysis, LogEntry } from "./types";

export const db = new Dexie("baseballNote") as Dexie & {
  logs: EntityTable<LogEntry, "id">;
  aiAnalyses: EntityTable<AiAnalysis, "id">;
};

db.version(1).stores({
  logs: "id, date, createdAt",
});

db.version(2).stores({
  aiAnalyses: "id, createdAt",
});
