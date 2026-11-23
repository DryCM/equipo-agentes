import { db, migrate } from "@/lib/db.ts";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await migrate();
  const [run, tasks, events] = await db.batch(
    [
      { sql: "SELECT * FROM runs WHERE id = ?", args: [id] },
      { sql: "SELECT * FROM tasks WHERE run_id = ? ORDER BY idx", args: [id] },
      { sql: "SELECT * FROM events WHERE run_id = ? ORDER BY id", args: [id] },
    ],
    "read",
  );
  if (!run.rows[0]) return Response.json({ error: "No encontrada" }, { status: 404 });
  const r = run.rows[0];
  return Response.json({
    run: { ...r, files: JSON.parse(String(r.files)) },
    tasks: tasks.rows.map((t) => ({ ...t, acceptance: JSON.parse(String(t.acceptance)) })),
    events: events.rows,
  });
}
