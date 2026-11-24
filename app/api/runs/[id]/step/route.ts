import { step } from "@/lib/agents.ts";

export const maxDuration = 300; // one agent action per request (Vercel Hobby max)

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await step(id);
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
