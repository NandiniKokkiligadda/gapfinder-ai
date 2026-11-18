/** Diagnostic quiz: retrieval -> grounded question generation -> grounded evaluation -> deterministic diagnosis. */
import { z } from "zod";
import { q } from "./db";
import { generateJSON, GROUNDING_RULES } from "./llm";
import { supportRatio } from "./retrieval";
import { loadMaterialChunks, loadTopics, retrieve, citationOf, ChunkRow, TopicRow } from "./data";
import { HttpError } from "./auth";

const QuizSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().min(8),
      options: z.array(z.string().min(1)).length(4),
      correctIndex: z.number().int().min(0).max(3),
      sourceId: z.string(),
      evidence: z.string().min(5),
      subtopic: z.string().optional().default(""),
    })
  ),
});

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

function contextFor(topic: TopicRow, material: ChunkRow[]): ChunkRow[] {
  // RETRIEVAL: chunks tagged with this topic, ranked against the topic profile; fall back to whole-corpus search.
  const query = `${topic.name} ${topic.subtopics.join(" ")} ${topic.keywords.join(" ")}`;
  const own = material.filter((c) => c.topic_id === topic.id);
  let hits = retrieve(own.length >= 2 ? own : material, query, 4).map((h) => h.chunk);
  if (hits.length < 2 && own.length) hits = own.slice(0, 4);
  return hits;
}

export async function generateQuiz(userId: number, perTopic = 3, maxTopics = 10) {
  const topics = await loadTopics(userId);
  if (!topics.length) throw new HttpError(400, "Build the topic map first.");
  const material = await loadMaterialChunks(userId);
  if (!material.length) throw new HttpError(400, "No study material found.");

  const prev = await q<{ question: string; topic_id: number }>(
    `select aa.question, aa.topic_id from attempt_answers aa join attempts a on a.id=aa.attempt_id where a.user_id=$1 order by aa.id desc limit 80`,
    [userId]
  );
  const chosen = [...topics].sort((a, b) => b.exam_count - a.exam_count).slice(0, maxTopics);

  await q(`delete from attempts where user_id=$1 and status='open'`, [userId]);
  const att = await q<{ id: number }>(`insert into attempts (user_id) values ($1) returning id`, [userId]);
  const attemptId = att[0].id;

  const generated = await pool(chosen, 3, async (topic) => {
    const ctx = contextFor(topic, material);
    if (!ctx.length) return [];
    const sources = ctx.map((c, i) => `[S${i + 1}] (${citationOf(c)})\n${c.text}`).join("\n\n");
    const avoid = prev.filter((p) => p.topic_id === topic.id).slice(0, 6).map((p) => `- ${p.question}`).join("\n");
    try {
      const r = await generateJSON({
        schema: QuizSchema,
        system: `${GROUNDING_RULES}\nTask: write ${perTopic} multiple-choice questions that test understanding of the topic "${topic.name}". Every question must be answerable from exactly one source passage, which you name in sourceId (e.g. "S2"). "evidence" must be a short phrase copied word-for-word from that passage that proves the correct answer. Provide exactly 4 options, one correct, with plausible distractors. "subtopic" is the specific idea tested.`,
        prompt: `SOURCES:\n${sources}\n\n${avoid ? `Do NOT repeat these earlier questions:\n${avoid}\n\n` : ""}Write ${perTopic} questions.`,
        shape: `{"questions":[{"question":"...","options":["A","B","C","D"],"correctIndex":1,"sourceId":"S1","evidence":"exact phrase from S1","subtopic":"Light reaction"}]}`,
        maxOutputTokens: 1800,
        temperature: 0.4,
      });
      const rows: any[] = [];
      for (const item of r.questions.slice(0, perTopic)) {
        const idx = Number(item.sourceId.replace(/\D/g, "")) - 1;
        const src = ctx[idx];
        if (!src) continue;
        // GROUNDING CHECK: quoted evidence must really be in the retrieved chunk, otherwise drop the question.
        if (supportRatio(item.evidence, src.text) < 0.6) continue;
        const correctText = item.options[item.correctIndex];
        const options = shuffle(item.options);
        rows.push({
          topic_id: topic.id,
          subtopic: item.subtopic || null,
          question: item.question,
          options,
          correct_index: options.indexOf(correctText),
          citation: citationOf(src),
          evidence: item.evidence,
        });
      }
      return rows;
    } catch (e) {
      console.error("quiz gen failed for topic", topic.name, e);
      return [];
    }
  });

  const rows = generated.flat();
  if (!rows.length) {
    await q(`delete from attempts where id=$1`, [attemptId]);
    throw new HttpError(502, "Could not generate grounded questions right now. Please try again in a few seconds.");
  }
  for (const r of rows) {
    await q(
      `insert into attempt_answers (attempt_id,topic_id,subtopic,question,options,correct_index,citation,evidence) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [attemptId, r.topic_id, r.subtopic, r.question, JSON.stringify(r.options), r.correct_index, r.citation, r.evidence]
    );
  }
  await q(`update attempts set total=$1 where id=$2`, [rows.length, attemptId]);
  return loadOpenQuiz(userId);
}

/** Open quiz as shown to the student: correct answers are NOT sent to the browser. */
export async function loadOpenQuiz(userId: number) {
  const a = await q<{ id: number }>(`select id from attempts where user_id=$1 and status='open' order by id desc limit 1`, [userId]);
  if (!a[0]) return null;
  const rows = await q<any>(
    `select aa.id, aa.topic_id, t.name as topic_name, aa.question, aa.options, aa.citation
       from attempt_answers aa join topics t on t.id=aa.topic_id where aa.attempt_id=$1 order by aa.id`,
    [a[0].id]
  );
  return {
    attemptId: a[0].id,
    questions: rows.map((r) => ({ id: r.id, topicId: r.topic_id, topicName: r.topic_name, question: r.question, options: r.options, citation: r.citation })),
  };
}

const EvalSchema = z.object({ items: z.array(z.object({ id: z.number(), explanation: z.string() })) });
const ReasonSchema = z.object({ reasons: z.array(z.object({ topicId: z.number(), reason: z.string() })) });

export async function submitQuiz(userId: number, attemptId: number, answers: Record<string, number>) {
  const att = await q<{ id: number }>(`select id from attempts where id=$1 and user_id=$2 and status='open'`, [attemptId, userId]);
  if (!att[0]) throw new HttpError(404, "Quiz not found or already submitted.");
  const rows = await q<any>(
    `select aa.*, t.name as topic_name from attempt_answers aa join topics t on t.id=aa.topic_id where aa.attempt_id=$1 order by aa.id`,
    [attemptId]
  );

  // DETERMINISTIC grading (MCQ): correctness is never decided by the LLM.
  for (const r of rows) {
    const chosen = answers[String(r.id)];
    r.chosen_index = Number.isInteger(chosen) ? chosen : null;
    r.is_correct = r.chosen_index === r.correct_index;
  }

  // GENERATION: explain each answer using only the cited source evidence; write the per-topic reason.
  const byTopic = new Map<number, any[]>();
  for (const r of rows) byTopic.set(r.topic_id, [...(byTopic.get(r.topic_id) || []), r]);

  const evalPromise = generateJSON({
    schema: EvalSchema,
    system: `${GROUNDING_RULES}\nTask: for each item explain in 1-2 sentences why the correct answer is right and, if the student chose differently, why their choice is wrong. Use only the EVIDENCE given.`,
    prompt: rows
      .map(
        (r) =>
          `ID ${r.id}\nQuestion: ${r.question}\nCorrect answer: ${r.options[r.correct_index]}\nStudent chose: ${r.chosen_index === null ? "(no answer)" : r.options[r.chosen_index]}\nEVIDENCE: "${r.evidence}" (${r.citation})`
      )
      .join("\n\n"),
    shape: `{"items":[{"id":12,"explanation":"..."}]}`,
    maxOutputTokens: 2500,
  }).catch(() => ({ items: [] as { id: number; explanation: string }[] }));

  const reasonPromise = generateJSON({
    schema: ReasonSchema,
    system: `Task: write one short, specific reason (max 25 words) per topic explaining the student's performance, using ONLY the numbers and missed subtopics given. Be concrete, e.g. "You got 3 of 4 wrong, mostly on the light reaction." Do not invent anything.`,
    prompt: [...byTopic.entries()]
      .map(([tid, rs]) => {
        const missed = rs.filter((r) => !r.is_correct).map((r) => r.subtopic || r.question);
        return `Topic ${tid} "${rs[0].topic_name}": ${rs.filter((r) => r.is_correct).length} of ${rs.length} correct. Missed: ${missed.join("; ") || "none"}`;
      })
      .join("\n"),
    shape: `{"reasons":[{"topicId":1,"reason":"..."}]}`,
    maxOutputTokens: 1200,
  }).catch(() => ({ reasons: [] as { topicId: number; reason: string }[] }));

  const [evalOut, reasonOut] = await Promise.all([evalPromise, reasonPromise]);
  const expl = new Map(evalOut.items.map((i) => [i.id, i.explanation]));

  let correct = 0;
  for (const r of rows) {
    if (r.is_correct) correct++;
    r.explanation =
      expl.get(r.id) ||
      (r.is_correct ? `Correct. Source: ${r.citation}.` : `The correct answer is "${r.options[r.correct_index]}". See ${r.citation}.`);
    await q(`update attempt_answers set chosen_index=$1, is_correct=$2, explanation=$3 where id=$4`, [r.chosen_index, r.is_correct, r.explanation, r.id]);
  }

  const topicSummaries: any[] = [];
  for (const [tid, rs] of byTopic) {
    const c = rs.filter((r) => r.is_correct).length;
    const missed = rs.filter((r) => !r.is_correct).map((r) => r.subtopic).filter(Boolean);
    const fallback = `${c} of ${rs.length} correct${missed.length ? `; missed: ${[...new Set(missed)].join(", ")}` : ""}.`;
    const reason = reasonOut.reasons.find((x) => x.topicId === tid)?.reason || fallback;
    await q(`insert into topic_results (attempt_id,topic_id,correct,total,reason) values ($1,$2,$3,$4,$5)`, [attemptId, tid, c, rs.length, reason]);
    topicSummaries.push({ topicId: tid, topicName: rs[0].topic_name, correct: c, total: rs.length, reason });
  }
  await q(`update attempts set status='done', correct=$1, total=$2 where id=$3`, [correct, rows.length, attemptId]);

  return {
    attemptId,
    correct,
    total: rows.length,
    topics: topicSummaries,
    review: rows.map((r) => ({
      id: r.id,
      topicName: r.topic_name,
      question: r.question,
      options: r.options,
      correctIndex: r.correct_index,
      chosenIndex: r.chosen_index,
      isCorrect: r.is_correct,
      explanation: r.explanation,
      citation: r.citation,
      evidence: r.evidence,
    })),
  };
}
