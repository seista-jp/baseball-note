import Dexie, { type EntityTable } from "dexie";
import type { LogEntry } from "./types";

export const db = new Dexie("baseballNote") as Dexie & {
  logs: EntityTable<LogEntry, "id">;
};

db.version(1).stores({
  logs: "id, date, createdAt",
});

