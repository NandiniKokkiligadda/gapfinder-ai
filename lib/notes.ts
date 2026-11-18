/** Plan generation (LLM part): grounded study notes per priority topic. The ORDER and TIME come from lib/mastery.ts. */
import { z } from "zod";
import { q } from "./db";
import { generateJSON, GROUNDING_RULES } from "./llm";
import { computePlan, loadMaterialChunks, retrieve, citationOf } from "./data";

const NotesSchema = z.object({ notes: z.array(z.object({ topicId: z.number(), note: z.string() })) });

export async function regeneratePlanNotes(userId: number) {
  const { plan } = await computePlan(userId);
  const focus = plan.order.filter((s) => s.status !== "strong").slice(0, 6);
  if (!focus.length) {
    await q(`delete from topic_notes where user_id=$1`, [userId]);
    return;
  }
  const material = await loadMaterialChunks(userId);
  const missed = await q<{ topic_id: number; subtopic: string | null; question: string }>(
    `select aa.topic_id, aa.subtopic, aa.question from attempt_answers aa join attempts a on a.id=aa.attempt_id
      where a.user_id=$1 and a.status='done' and aa.is_correct=false order by a.id desc limit 60`,
    [userId]
  );
  const blocks = focus.map((s) => {
    const mine = missed.filter((m) => m.topic_id === s.topicId);
    const query = `${s.name} ${mine.map((m) => `${m.subtopic ?? ""} ${m.question}`).join(" ")}`;
    const ctx = retrieve(material.filter((c) => c.topic_id === s.topicId).length ? material.filter((c) => c.topic_id === s.topicId) : material, query, 2).map((h) => h.chunk);
    return `TOPIC ${s.topicId} "${s.name}" (${s.status}, mastery ${s.mastery === null ? "untested" : Math.round(s.mastery * 100) + "%"}, ${s.minutes} min)
Missed: ${mine.map((m) => m.subtopic || m.question).slice(0, 4).join("; ") || "nothing recorded yet"}
SOURCES: ${ctx.map((c) => `(${citationOf(c)}) ${c.text.slice(0, 450)}`).join(" | ")}`;
  });

  try {
    const out = await generateJSON({
      schema: NotesSchema,
      system: `${GROUNDING_RULES}\nTask: for each topic write a 1-2 sentence revision instruction (max 40 words): what exactly to re-read (name the file and section from SOURCES) and what to practise, targeting the missed ideas. No outside facts.`,
      prompt: blocks.join("\n\n"),
      shape: `{"notes":[{"topicId":1,"note":"Re-read notes.pdf — Chapter 1 › 1.2 Light Reaction, then explain where ATP is made."}]}`,
      maxOutputTokens: 1500,
    });
    await q(`delete from topic_notes where user_id=$1`, [userId]);
    for (const n of out.notes) {
      if (focus.some((f) => f.topicId === n.topicId))
        await q(`insert into topic_notes (user_id,topic_id,note) values ($1,$2,$3) on conflict (user_id,topic_id) do update set note=excluded.note`, [userId, n.topicId, n.note]);
    }
  } catch (e) {
    console.error("plan notes failed", e);
  }
}
