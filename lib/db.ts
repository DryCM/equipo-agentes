import { createClient } from "@libsql/client";

// Turso in production; a local SQLite file when no URL is set (dev and self-test).
export const db = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let ready: Promise<unknown> | undefined;

// Creates the tables on first use, so there is no migration step to run.
export function migrate() {
  ready ??= db.batch(
    [
      `CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        request TEXT NOT NULL,
        status TEXT NOT NULL,
        active_agent TEXT,
        files TEXT NOT NULL,
        locked_at INTEGER,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        idx INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        acceptance TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        feedback TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        agent TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS tasks_run ON tasks(run_id, idx)`,
      `CREATE INDEX IF NOT EXISTS events_run ON events(run_id, id)`,
    ],
    "write",
  ).catch((e) => {
    ready = undefined; // let the next request try again
    throw e;
  });
  return ready;
}
