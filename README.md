# Equipo de agentes (Orquestador · Develop · Testing)

App en Next.js donde tres agentes de IA trabajan juntos sobre una pequeña web de ejemplo (una panadería):

1. **Orquestador** recibe la petición (p. ej. «añade una página de contacto a esta web»), la divide en 1–4 tareas con criterios de aceptación y se las asigna a Develop.
2. **Develop** implementa cada tarea devolviendo los archivos completos que crea o modifica.
3. **Testing** revisa cada tarea: primero un chequeo automático (enlaces locales rotos) y después una revisión con LLM contra los criterios. Si falla, la tarea vuelve a Develop con la lista de fallos. Máximo 3 intentos por tarea.

En pantalla se ve qué agente está trabajando, el registro de cada uno, el estado de cada tarea (Pendiente → En desarrollo → En testing → Pasa / Falla · vuelve a Develop / Fallida) y una vista previa de la web resultante.

## Cómo funciona

- `lib/agents.ts` — máquina de estados. `step()` ejecuta **una** acción de un agente y la guarda en la base de datos. El navegador llama a `POST /api/runs/:id/step` en bucle, así ninguna petición dura más que una llamada al LLM (encaja en los límites de Vercel) y se puede cerrar la pestaña y pulsar «Reanudar» después. Un bloqueo en la fila evita que dos pestañas avancen la misma ejecución a la vez.
- `lib/llm.ts` — cliente para cualquier API compatible con OpenAI (por defecto Google Gemini, que tiene plan gratuito).
- `lib/db.ts` — Turso (libSQL). Las tablas se crean solas en el primer uso. Tablas: `runs`, `tasks`, `events`.
- `app/page.tsx` — la interfaz.

## Ejecutar en local

```bash
npm install
cp .env.example .env.local   # pon tu LLM_API_KEY; sin TURSO_* usa un fichero local.db
npm run dev
```

`npm test` ejecuta una ejecución completa con agentes simulados (`LLM_MOCK=1`) contra una base de datos local, y comprueba que Testing rechaza el primer intento (enlace roto) y que Develop lo corrige.

## Desplegar (todo en planes gratuitos)

1. **LLM**: crea una API key gratuita en Google AI Studio → `LLM_API_KEY`.
2. **Base de datos**: crea una base de datos en Turso → `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN`.
3. **Vercel**: importa el repositorio y añade esas variables de entorno. No hace falta nada más.

Las claves solo viven en variables de entorno; `.env*` está en `.gitignore`.

## Cómo lo he programado

Con Claude Code (app de escritorio). Le pasé el enunciado y fui dirigiendo las decisiones: una máquina de estados con un paso de agente por petición (para encajar en los límites de Vercel y poder reanudar), Turso porque permite usar SQLite en local para las pruebas, y el LLM intercambiable por variables de entorno para no pagar. Claude Code escribió el código y un test de extremo a extremo con agentes simulados (`npm test`) que comprueba el ciclo Testing → Develop; lo probó en el navegador y creó el repositorio, el proyecto de Vercel y la base de datos de Turso desde la terminal.

Al probar en producción salieron dos problemas que se corrigieron:
- El modelo de Gemini configurado estaba retirado y el plan gratuito devolvía 503/429 a menudo: ahora hay una lista de modelos de reserva y un límite de 300 s por paso.
- Si el Orquestador ponía «enlazar la página» antes de «crear la página», el chequeo de enlaces rotos de Testing hacía fallar la tarea sin remedio: ahora ese chequeo se hace sobre el resultado final y el Orquestador ordena las tareas por dependencias.

Las claves solo están en las variables de entorno de Vercel, nunca en el repositorio.

## Limitaciones conocidas

- La app no tiene login: cualquiera con la URL puede lanzar ejecuciones y gastar la cuota gratuita del LLM.
- La web de ejemplo es estática (HTML/CSS). La vista previa se muestra en un iframe sin scripts porque el HTML lo escribe un LLM.
- Si la pestaña se cierra, la ejecución se queda en pausa hasta que alguien pulsa «Reanudar».
