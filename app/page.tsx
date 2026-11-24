"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Run = { id: string; request: string; status: string; active_agent: string | null; files: Record<string, string>; created_at: number };
type Task = { id: number; idx: number; title: string; description: string; acceptance: string[]; status: string; attempts: number; feedback: string | null };
type Event = { id: number; agent: string; message: string; created_at: number };
type Detail = { run: Run; tasks: Task[]; events: Event[] };

const AGENTS = [
  { key: "orchestrator", name: "Orquestador", role: "Divide la petición en tareas y las reparte" },
  { key: "develop", name: "Develop", role: "Implementa cada tarea en la web" },
  { key: "testing", name: "Testing", role: "Comprueba lo hecho y devuelve los fallos" },
];

const TASK_LABEL: Record<string, [string, string]> = {
  pending: ["Pendiente", "var(--muted)"],
  developing: ["En desarrollo", "var(--develop)"],
  testing: ["En testing", "var(--testing)"],
  rework: ["Falla · vuelve a Develop", "#c92a2a"],
  done: ["Pasa ✓", "#2f9e44"],
  failed: ["Fallida", "#c92a2a"],
};
const RUN_LABEL: Record<string, string> = { planning: "Planificando", working: "En curso", done: "Completada", failed: "Terminada con fallos" };
const live = (s?: string) => s === "planning" || s === "working";

export default function Home() {
  const [request, setRequest] = useState("Añade una página de contacto a esta web");
  const [runs, setRuns] = useState<{ id: string; request: string; status: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [driving, setDriving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState("index.html");
  const driveId = useRef(0);

  const loadRuns = useCallback(() => fetch("/api/runs").then((r) => r.json()).then(setRuns).catch(() => {}), []);
  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/runs/${id}`);
    if (r.ok) setDetail(await r.json());
  }, []);

  // Drives the run: one agent action per request until it finishes.
  const drive = useCallback(async (id: string) => {
    const me = ++driveId.current;
    setDriving(true);
    setError(null);
    let failures = 0;
    while (driveId.current === me) {
      const res = await fetch(`/api/runs/${id}/step`, { method: "POST" }).then((r) => r.json()).catch((e) => ({ ok: false, error: String(e) }));
      await loadDetail(id);
      if (!res.ok) {
        if (++failures >= 8) { setError(res.error); break; }
        setError(`Reintentando (${failures}/8): el LLM gratuito está saturado…`);
        await new Promise((r) => setTimeout(r, 5000 * failures)); // free tiers rate-limit; ~3 min in total
        continue;
      }
      failures = 0;
      setError(null);
      if (!live(res.status)) break;
      if (res.busy) await new Promise((r) => setTimeout(r, 2000)); // another tab is driving it
    }
    if (driveId.current === me) setDriving(false);
    loadRuns();
  }, [loadDetail, loadRuns]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  // Poll while a step is in flight so the active agent shows live.
  useEffect(() => {
    if (!selected) return;
    loadDetail(selected);
    const t = setInterval(() => loadDetail(selected), 2000);
    return () => clearInterval(t);
  }, [selected, loadDetail]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request }) });
    const j = await r.json();
    if (!r.ok) return setError(j.error);
    setSelected(j.id);
    setFile("index.html");
    loadRuns();
    drive(j.id);
  }

  function open(id: string) {
    driveId.current++; // stop driving the previous run
    setDriving(false);
    setSelected(id);
    setDetail(null);
    setFile("index.html");
  }

  const run = detail?.run.id === selected ? detail.run : undefined;
  const files = run ? Object.keys(run.files).sort() : [];

  return (
    <main className="stack">
      <header>
        <h1>Equipo de agentes</h1>
        <p className="muted" style={{ margin: 0 }}>Un Orquestador reparte el trabajo, Develop lo implementa y Testing lo revisa hasta que todo pasa. Trabajan sobre una pequeña web de ejemplo.</p>
      </header>

      <form className="card stack" onSubmit={submit}>
        <label htmlFor="req"><h2>Nueva petición</h2></label>
        <textarea id="req" rows={2} value={request} onChange={(e) => setRequest(e.target.value)} maxLength={500} />
        <div className="row">
          <button type="submit" disabled={driving}>Enviar al equipo</button>
          {runs.length > 0 && (
            <select aria-label="Ejecuciones anteriores" value={selected ?? ""} onChange={(e) => open(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
              <option value="" disabled>Ver una ejecución anterior…</option>
              {runs.map((r) => <option key={r.id} value={r.id}>{RUN_LABEL[r.status] ?? r.status} · {r.request.slice(0, 70)}</option>)}
            </select>
          )}
        </div>
        {error && <p role="alert" style={{ color: "#c92a2a", margin: 0 }}>{error}</p>}
      </form>

      {run && detail && (
        <>
          <div className="row">
            <strong>«{run.request}»</strong>
            <span className="badge">{RUN_LABEL[run.status] ?? run.status}</span>
            {live(run.status) && !driving && <button onClick={() => drive(run.id)}>Reanudar</button>}
          </div>

          <section className="grid3" aria-label="Agentes">
            {AGENTS.map((a) => {
              const active = live(run.status) && run.active_agent === a.key;
              const events = detail.events.filter((e) => e.agent === a.key);
              return (
                <div key={a.key} className={`card agent${active ? " active" : ""}`} style={{ "--c": `var(--${a.key})` } as React.CSSProperties}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <h2 style={{ margin: 0 }}>{a.name}</h2>
                    <span className="row" style={{ gap: 6 }}><span className="dot" />{active ? "Trabajando…" : "En espera"}</span>
                  </div>
                  <div className="muted">{a.role}</div>
                  <ul className="log">
                    {events.slice().reverse().map((e) => <li key={e.id}>{e.message}</li>)}
                    {!events.length && <li className="muted">Sin actividad todavía</li>}
                  </ul>
                </div>
              );
            })}
          </section>

          <section className="card">
            <h2>Tareas</h2>
            {!detail.tasks.length && <p className="muted">El Orquestador está preparando el plan…</p>}
            {detail.tasks.length > 0 && (
              <div className="tablewrap">
                <table>
                  <thead><tr><th>#</th><th>Tarea</th><th>Estado</th><th>Intentos</th></tr></thead>
                  <tbody>
                    {detail.tasks.map((t) => {
                      const [label, color] = TASK_LABEL[t.status] ?? [t.status, "var(--muted)"];
                      return (
                        <tr key={t.id}>
                          <td>{t.idx + 1}</td>
                          <td>
                            <strong>{t.title}</strong>
                            <div className="muted">{t.description}</div>
                            <div className="muted">Criterios: {t.acceptance.join(" · ")}</div>
                            {t.feedback && <pre>{t.feedback}</pre>}
                          </td>
                          <td><span className="badge" style={{ color }}>{label}</span></td>
                          <td>{t.attempts}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Resultado: la web</h2>
            <div className="row tabs" style={{ marginBottom: 8 }}>
              {files.map((f) => <button key={f} aria-pressed={f === file} onClick={() => setFile(f)}>{f}</button>)}
            </div>
            {file.endsWith(".html") ? (
              // Sandboxed (no scripts): the HTML is LLM-written. Stylesheets are inlined since srcdoc can't fetch them.
              <iframe title="Vista previa" sandbox="" srcDoc={(run.files[file] ?? "").replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/g, (tag, href) => run.files[href] != null ? `<style>${run.files[href]}</style>` : tag)} />
            ) : (
              <pre style={{ color: "inherit" }}>{run.files[file]}</pre>
            )}
          </section>

          <section className="card">
            <h2>Registro completo</h2>
            <ul className="log" style={{ maxHeight: 300 }}>
              {detail.events.map((e) => (
                <li key={e.id}><span className="badge" style={{ color: `var(--${e.agent})` }}>{AGENTS.find((a) => a.key === e.agent)?.name ?? "Sistema"}</span> {e.message}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
