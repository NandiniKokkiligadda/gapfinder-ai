import { handle, requireUser } from "@/lib/auth";
import { loadMaterialChunks, retrieve, citationOf } from "@/lib/data";
import { streamAnswer, GROUNDING_RULES } from "@/lib/llm";

export const maxDuration = 60;

const NOT_IN_MATERIAL = "This isn't covered in your uploaded material, so I can't explain it reliably. Try rephrasing, or upload the chapter that covers it.";

export const POST = handle(async (req) => {
  const u = await requireUser();
  const { question, topicId, history } = await req.json();
  const text = String(question || "").trim();
  if (!text) return Response.json({ error: "Ask something." }, { status: 400 });

  let material = await loadMaterialChunks(u.id);
  if (topicId) {
    const scoped = material.filter((c) => c.topic_id === Number(topicId));
    if (scoped.length) material = scoped;
  }
  // Follow-ups like "why?" retrieve better when combined with the previous question.
  const prev = Array.isArray(history) ? history.filter((m: any) => m.role === "user").slice(-1)[0]?.content ?? "" : "";
  const hits = retrieve(material, text.split(/\s+/).length < 4 ? `${prev} ${text}` : text, 4);

  const headers = (extra: Record<string, string> = {}) => ({
    "Content-Type": "text/plain; charset=utf-8",
    "X-Sources": encodeURIComponent(JSON.stringify(hits.map((h, i) => ({ id: `S${i + 1}`, citation: citationOf(h.chunk) })))),
    ...extra,
  });

  // RETRIEVAL GATE: if nothing relevant was retrieved, the LLM is never called -> it cannot make something up.
  if (!hits.length || hits[0].coverage < 0.34) return new Response(NOT_IN_MATERIAL, { headers: { ...headers(), "X-Sources": encodeURIComponent("[]") } });

  const sources = hits.map((h, i) => `[S${i + 1}] (${citationOf(h.chunk)})\n${h.chunk.text}`).join("\n\n");
  const result = streamAnswer(
    `${GROUNDING_RULES}\nExplain the topic clearly for a school/college student in at most 150 words, using simple language. Cite the passages you used like [S1]. If the SOURCES do not answer the question, reply exactly: "${NOT_IN_MATERIAL}"`,
    `SOURCES:\n${sources}\n\nStudent question: ${text}`
  );
  return result.toTextStreamResponse({ headers: headers() });
});
