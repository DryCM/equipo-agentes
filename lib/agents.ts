import { db, migrate } from "./db.ts";
import { chatJson, type Agent } from "./llm.ts";
import { seedFiles, type Files } from "./seed.ts";

const MAX_ATTEMPTS = 3;
const LOCK_MS = 330_000; // longer than the step route's maxDuration

const ORCHESTRATOR = `Eres el Orquestador de un equipo de 3 agentes (Orquestador, Develop, Testing) que modifican una web estática (HTML/CSS, sin JavaScript de servidor).
Divide la petición del usuario en 1 a 4 tareas de desarrollo pequeñas, concretas y ordenadas: si una tarea depende de otra (p. ej. enlazar una página), la que crea la dependencia va antes. Cada tarea debe poder comprobarse leyendo los archivos.
Responde SOLO con JSON: {"tasks":[{"title":"...","description":"...","acceptance":["criterio comprobable", "..."]}]}`;

const DEVELOP = `Eres Develop, el desarrollador del equipo. Implementas UNA tarea sobre una web estática (HTML/CSS).
Devuelve el contenido COMPLETO de cada archivo que crees o modifiques (no diffs). Usa rutas relativas y mantén el estilo existente. No borres contenido que no tenga que ver con la tarea.
Si hay fallos señalados por Testing, corrígelos todos.
Responde SOLO con JSON: {"summary":"qué has hecho, en una frase","files":[{"path":"archivo.html","content":"..."}]}`;

const TESTING = `Eres Testing, el QA del equipo. Compruebas con rigor si los archivos cumplen CADA criterio de aceptación de la tarea.
Falla la tarea si algún criterio no se cumple, si hay HTML roto o si se ha roto algo que ya existía. Sé concreto en cada fallo (archivo y qué falta).
Responde SOLO con JSON: {"pass":true|false,"issues":["..."]}`;

export async function log(runId: string, agent: Agent | "system", message: string) {
  await db.execute({
    sql: "INSERT INTO events (run_id, agent, message, created_at) VALUES (?, ?, ?, ?)",
    args: [runId, agent, message, Date.now()],
  });
}

export async function createRun(request: string) {
  await migrate();
  const id = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO runs (id, request, status, active_agent, files, created_at) VALUES (?, ?, 'planning', 'orchestrator', ?, ?)",
    args: [id, request, JSON.stringify(seedFiles), Date.now()],
  });
  await log(id, "orchestrator", `Petición recibida: «${request}»`);
  return id;
}

function filesBlock(files: Files) {
  return Object.entries(files).map(([p, c]) => `--- ${p} ---\n${c}`).join("\n\n");
}

// Deterministic check Testing runs before asking the LLM: every local link must exist.
export function brokenLinks(files: Files): string[] {
  const issues: string[] = [];
  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith(".html")) continue;
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
    for (const [, href] of content.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^([a-z]+:|#|\/\/)/i.test(href)) continue; // external, mailto:, anchors
      const target = new URL(dir + href.split(/[?#]/)[0], "http://x/").pathname.slice(1);
      if (target && !(target in files)) issues.push(`${path}: enlace roto a "${href}"`);
    }
  }
  return issues;
}

type Task = { id: number; title: string; description: string; acceptance: string; status: string; attempts: number; feedback: string | null };

// Advances a run by exactly one agent action. The browser calls this in a loop,
// so no single request runs longer than one LLM call (fits serverless limits).
export async function step(runId: string): Promise<{ ok: boolean; status?: string; busy?: boolean; error?: string }> {
  await migrate();
  const now = Date.now();
  const lock = await db.execute({
    sql: `UPDATE runs SET locked_at = ? WHERE id = ? AND status IN ('planning','working')
          AND (locked_at IS NULL OR locked_at < ?)`,
    args: [now, runId, now - LOCK_MS],
  });
  if (lock.rowsAffected === 0) {
    const r = await db.execute({ sql: "SELECT status FROM runs WHERE id = ?", args: [runId] });
    if (!r.rows[0]) return { ok: false, error: "Ejecución no encontrada" };
    return { ok: true, busy: true, status: String(r.rows[0].status) };
  }

  try {
    const run = (await db.execute({ sql: "SELECT * FROM runs WHERE id = ?", args: [runId] })).rows[0];
    const files: Files = JSON.parse(String(run.files));
    if (run.status === "planning") await plan(runId, String(run.request), files);
    else await work(runId, files);
    const s = await db.execute({ sql: "SELECT status FROM runs WHERE id = ?", args: [runId] });
    return { ok: true, status: String(s.rows[0].status) };
  } catch (e: any) {
    // The run stays resumable: the next step retries the same action.
    await log(runId, "system", `Error: ${e.message}`);
    return { ok: false, error: e.message };
  } finally {
    await db.execute({ sql: "UPDATE runs SET locked_at = NULL WHERE id = ?", args: [runId] });
  }
}

async function plan(runId: string, request: string, files: Files) {
  const out = await chatJson("orchestrator", ORCHESTRATOR, `PETICIÓN: ${request}\n\nARCHIVOS ACTUALES:\n${filesBlock(files)}`);
  const tasks = Array.isArray(out.tasks) ? out.tasks.slice(0, 4) : [];
  if (!tasks.length) throw new Error("El Orquestador no devolvió tareas");
  await db.batch(
    [
      ...tasks.map((t: any, i: number) => ({
        sql: "INSERT INTO tasks (run_id, idx, title, description, acceptance, status) VALUES (?, ?, ?, ?, ?, 'pending')",
        args: [runId, i, String(t.title), String(t.description ?? ""), JSON.stringify((t.acceptance ?? []).map(String))],
      })),
      { sql: "UPDATE runs SET status = 'working', active_agent = 'develop' WHERE id = ?", args: [runId] },
    ],
    "write",
  );
  await log(runId, "orchestrator", `Plan: ${tasks.length} tareas → ${tasks.map((t: any) => t.title).join(" · ")}. Asignadas a Develop; Testing validará cada una.`);
}

async function work(runId: string, files: Files) {
  const rows = (await db.execute({
    sql: "SELECT * FROM tasks WHERE run_id = ? AND status NOT IN ('done','failed') ORDER BY idx LIMIT 1",
    args: [runId],
  })).rows as unknown as Task[];
  const task = rows[0];

  if (!task) {
    const failed = (await db.execute({ sql: "SELECT COUNT(*) AS n FROM tasks WHERE run_id = ? AND status = 'failed'", args: [runId] })).rows[0].n;
    const status = Number(failed) ? "failed" : "done";
    await db.execute({ sql: "UPDATE runs SET status = ?, active_agent = NULL WHERE id = ?", args: [status, runId] });
    await log(runId, "orchestrator", Number(failed) ? `Terminado con ${failed} tarea(s) sin superar Testing.` : "Todas las tareas han pasado Testing. Petición completada.");
    return;
  }

  const criteria = JSON.parse(task.acceptance) as string[];
  const taskBlock = `TAREA: ${task.title}\n${task.description}\nCRITERIOS DE ACEPTACIÓN:\n${criteria.map((c) => `- ${c}`).join("\n")}`;

  if (task.status === "testing") {
    await db.execute({ sql: "UPDATE runs SET active_agent = 'testing' WHERE id = ?", args: [runId] });
    await log(runId, "testing", `Revisando «${task.title}»`);
    // Links may point to pages a later task creates, so the link check only runs on the last open task.
    const later = (await db.execute({ sql: "SELECT COUNT(*) AS n FROM tasks WHERE run_id = ? AND idx > ? AND status NOT IN ('done','failed')", args: [runId, task.idx] })).rows[0].n;
    const auto = Number(later) ? [] : brokenLinks(files);
    const out = await chatJson("testing", TESTING, `${taskBlock}\n\nARCHIVOS:\n${filesBlock(files)}`);
    const issues = [...auto, ...(Array.isArray(out.issues) ? out.issues.map(String) : [])];
    const pass = out.pass === true && auto.length === 0;
    const attempts = task.attempts + 1;
    const status = pass ? "done" : attempts >= MAX_ATTEMPTS ? "failed" : "rework";
    await db.batch(
      [
        { sql: "UPDATE tasks SET status = ?, attempts = ?, feedback = ? WHERE id = ?", args: [status, attempts, pass ? null : issues.join("\n"), task.id] },
        { sql: "UPDATE runs SET active_agent = ? WHERE id = ?", args: [status === "rework" ? "develop" : "orchestrator", runId] },
      ],
      "write",
    );
    await log(runId, "testing", pass ? `✅ «${task.title}» pasa.` : `❌ «${task.title}» falla (intento ${attempts}/${MAX_ATTEMPTS}): ${issues.join(" | ")}`);
    if (status === "failed") await log(runId, "orchestrator", `«${task.title}» agota los intentos; sigo con la siguiente.`);
    return;
  }

  // pending, rework, or a develop step that crashed midway
  await db.batch(
    [
      { sql: "UPDATE tasks SET status = 'developing' WHERE id = ?", args: [task.id] },
      { sql: "UPDATE runs SET active_agent = 'develop' WHERE id = ?", args: [runId] },
    ],
    "write",
  );
  if (task.status !== "developing") // a retry after an LLM error: already announced
    await log(runId, "develop", task.feedback ? `Corrigiendo «${task.title}»` : `Empezando «${task.title}»`);
  const feedback = task.feedback ? `\n\nFALLOS A CORREGIR (de Testing):\n${task.feedback}` : "";
  const out = await chatJson("develop", DEVELOP, `${taskBlock}${feedback}\n\nARCHIVOS ACTUALES:\n${filesBlock(files)}`);
  const changed = (Array.isArray(out.files) ? out.files : []).filter((f: any) => typeof f?.path === "string" && typeof f?.content === "string");
  if (!changed.length) throw new Error("Develop no devolvió archivos");
  for (const f of changed) files[f.path.replace(/^\.?\//, "")] = f.content;
  await db.batch(
    [
      { sql: "UPDATE runs SET files = ?, active_agent = 'testing' WHERE id = ?", args: [JSON.stringify(files), runId] },
      { sql: "UPDATE tasks SET status = 'testing' WHERE id = ?", args: [task.id] },
    ],
    "write",
  );
  await log(runId, "develop", `${out.summary ?? "Hecho"} (${changed.map((f: any) => f.path).join(", ")}). Paso a Testing.`);
}
