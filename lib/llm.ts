import { mockChat } from "./mock.ts";

export type Agent = "orchestrator" | "develop" | "testing";

// Any OpenAI-compatible chat endpoint works (Gemini, Groq, OpenRouter, OpenAI...).
export async function chatJson(agent: Agent, system: string, user: string): Promise<any> {
  if (process.env.LLM_MOCK) return mockChat(agent, user);

  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error("Falta LLM_API_KEY en las variables de entorno");
  const base = process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
  // Comma-separated fallbacks: free tiers often answer 503 (overloaded) or 429 (quota) for one model only.
  const models = (process.env.LLM_MODEL || "gemini-3.8-flash,gemini-flash-latest,gemini-flash-lite-latest").split(",");
  let error = "";
  for (const model of models) {
    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      signal: AbortSignal.timeout(90_000), // 3 models × 90s stays under the route's 300s limit
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.trim(),
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    }).catch((e) => e as Error);
    if (res instanceof Error) {
      error = `LLM (${model.trim()}): ${res.name === "TimeoutError" ? "sin respuesta en 90 s" : res.message}`;
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      return parseJson(data.choices?.[0]?.message?.content ?? "");
    }
    error = `LLM ${res.status} (${model.trim()}): ${(await res.text()).slice(0, 300)}`;
    if (![404, 429, 503].includes(res.status)) break; // auth or bad request: another model won't help
  }
  throw new Error(error);
}

// Models sometimes wrap JSON in ```fences``` or prose; take the outermost object.
export function parseJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`Respuesta del LLM sin JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}
