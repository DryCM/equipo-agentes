import type { Agent } from "./llm.ts";
import { seedFiles } from "./seed.ts";

// Test-only stand-in for the LLM (LLM_MOCK=1). Develop gets it wrong the first
// time (broken link) so the Testing -> Develop rework loop is exercised.
export function mockChat(agent: Agent, user: string) {
  if (agent === "orchestrator")
    return {
      tasks: [
        { title: "Crear página de contacto", description: "Nueva página contacto.html con formulario.", acceptance: ["Existe contacto.html", "Tiene formulario con email y mensaje"] },
        { title: "Enlazar contacto en el menú", description: "Añadir el enlace en la navegación.", acceptance: ["El menú enlaza a contacto.html"] },
      ],
    };
  if (agent === "develop") {
    const target = user.includes("FALLOS A CORREGIR") ? "contacto.html" : "contacto.htm";
    return {
      summary: `Página de contacto creada y enlazada (${target})`,
      files: [
        { path: "contacto.html", content: seedFiles["productos.html"].replace(/<main>[\s\S]*<\/main>/, '<main><h2>Contacto</h2><form><input type="email" name="email"><textarea name="mensaje"></textarea><button>Enviar</button></form></main>') },
        { path: "index.html", content: seedFiles["index.html"].replace("</nav>", ` <a href="${target}">Contacto</a></nav>`) },
      ],
    };
  }
  return { pass: true, issues: [] };
}
