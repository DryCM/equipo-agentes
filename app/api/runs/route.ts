import { db, migrate } from "@/lib/db.ts";
import { createRun } from "@/lib/agents.ts";

export async function GET() {
  await migrate();
  const r = await db.execute("SELECT id, request, status, created_at FROM runs ORDER BY created_at DESC LIMIT 20");
  return Response.json(r.rows);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const request = typeof body.request === "string" ? body.request.trim() : "";
  if (request.length < 3 || request.length > 500)
    return Response.json({ error: "La petición debe tener entre 3 y 500 caracteres" }, { status: 400 });
  return Response.json({ id: await createRun(request) });
}
