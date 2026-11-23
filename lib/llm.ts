import { mockChat } from "./mock.ts";

export type Agent = "orchestrator" | "develop" | "testing";

// Any OpenAI-compatible chat endpoint works (Gemini, Groq, OpenRouter, OpenAI...).
export async function chatJson(agent: Agent, system: string, user: string): Promise<any> {
  if (process.env.LLM_MOCK) return mockChat(agent, user);

  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error("Falta LLM_API_KEY en las variables de entorno");
  const base = process.env.LLM_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
  const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gemini-3.8-flash",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return parseJson(data.choices?.[0]?.message?.content ?? "");
}

// Models sometimes wrap JSON in ```fences``` or prose; take the outermost object.
export function parseJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(`Respuesta del LLM sin JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start, end + 1));
}
