// Runs a full mocked run against a throwaway SQLite file: npm test
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.LLM_MOCK = "1";
process.env.TURSO_DATABASE_URL = "file:selftest.db";
rmSync("selftest.db", { force: true });

const { createRun, step, brokenLinks } = await import("../lib/agents.ts");
const { db } = await import("../lib/db.ts");

assert.deepEqual(brokenLinks({ "a.html": '<a href="b.html">x</a><a href="https://e.com">y</a><a href="#top">z</a>', "b.html": "" }), []);
assert.deepEqual(brokenLinks({ "a.html": '<a href="c.html?x=1">x</a>' }), ['a.html: enlace roto a "c.html?x=1"']);

const id = await createRun("Añade una página de contacto");
let status = "planning";
for (let i = 0; i < 30 && (status === "planning" || status === "working"); i++) {
  const r = await step(id);
  assert.ok(r.ok, r.error ?? "step failed");
  status = r.status!;
}
assert.equal(status, "done");

const tasks = (await db.execute({ sql: "SELECT status, attempts FROM tasks WHERE run_id = ? ORDER BY idx", args: [id] })).rows;
assert.deepEqual(tasks.map((t) => t.status), ["done", "done"]);
assert.equal(tasks[0].attempts, 2, "first task should fail once in Testing, then pass");
const files = JSON.parse(String((await db.execute({ sql: "SELECT files FROM runs WHERE id = ?", args: [id] })).rows[0].files));
assert.ok(files["index.html"].includes('href="contacto.html"'));
assert.deepEqual(brokenLinks(files), []);

console.log("selftest ok");
