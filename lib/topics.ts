/** Topic map: syllabus -> topics (generation), chunks & past-paper questions -> topics (retrieval). */
import { z } from "zod";
import { q } from "./db";
import { generateJSON, GROUNDING_RULES } from "./llm";
import { bm25 } from "./retrieval";
import { loadMaterialChunks, loadTopics, retrieve } from "./data";
import { HttpError } from "./auth";

const TopicsSchema = z.object({
  topics: z
    .array(
      z.object({
        name: z.string().min(2).max(120),
        subtopics: z.array(z.string()).max(10).default([]),
        keywords: z.array(z.string()).max(12).default([]),
      })
    )
    .min(1)
    .max(20),
});

const QuestionsSchema = z.object({ questions: z.array(z.object({ text: z.string().min(8) })).max(40) });

async function docText(userId: number, kind: string, limit: number) {
  const rows = await q<{ text: string }>(
    `select c.text from chunks c join documents d on d.id=c.document_id where c.user_id=$1 and d.kind=$2 order by c.id`,
    [userId, kind]
  );
  return rows.map((r) => r.text).join("\n").slice(0, limit);
}

export async function buildTopicMap(userId: number) {
  const syllabus = await docText(userId, "syllabus", 12000);
  if (!syllabus.trim()) throw new HttpError(400, "Upload a syllabus first.");
  const material = await loadMaterialChunks(userId);
  if (!material.length) throw new HttpError(400, "Upload textbook chapters or notes first.");

  // GENERATION: turn the syllabus text into a structured topic list (only from the syllabus text).
  const parsed = await generateJSON({
    schema: TopicsSchema,
    system: `${GROUNDING_RULES}\nTask: convert the syllabus in SOURCES into a topic map. Use the syllabus's own wording for topic names. Max 12 top-level topics; subtopics are the bullet points under each topic. keywords = 4-8 distinctive terms from the syllabus for that topic.`,
    prompt: `SOURCES:\n${syllabus}`,
    shape: `{"topics":[{"name":"Photosynthesis","subtopics":["Light reaction","Calvin cycle"],"keywords":["chlorophyll","stomata"]}]}`,
    maxOutputTokens: 2500,
  });

  await q(`delete from topics where user_id=$1`, [userId]); // cascades attempts' topic rows
  await q(`delete from attempts where user_id=$1`, [userId]);
  await q(`delete from paper_questions where user_id=$1`, [userId]);
  const ids: number[] = [];
  for (let i = 0; i < parsed.topics.length; i++) {
    const t = parsed.topics[i];
    const r = await q<{ id: number }>(
      `insert into topics (user_id,name,subtopics,keywords,position) values ($1,$2,$3,$4,$5) returning id`,
      [userId, t.name, JSON.stringify(t.subtopics), JSON.stringify(t.keywords), i]
    );
    ids.push(r[0].id);
  }
  const topics = await loadTopics(userId);

  // RETRIEVAL: tag every material chunk with its best-matching topic (BM25 against topic profile).
  const profiles = topics.map((t) => ({
    id: t.id,
    text: `${t.name} ${t.name} ${t.name} ${t.subtopics.join(" ")} ${t.keywords.join(" ")}`,
  }));
  for (const c of material) {
    const hit = bm25(profiles, `${c.section} ${c.text}`, 1)[0];
    if (hit) await q(`update chunks set topic_id=$1 where id=$2`, [hit.id, c.id]);
  }
  // refresh tagged chunks
  const tagged = await loadMaterialChunks(userId);

  // Past papers -> questions -> topics.
  const papers = await docText(userId, "paper", 9000);
  let mapped = 0;
  if (papers.trim()) {
    const qs = await generateJSON({
      schema: QuestionsSchema,
      system: `${GROUNDING_RULES}\nTask: list every distinct exam question found in SOURCES, copied verbatim (fix only line-break artefacts).`,
      prompt: `SOURCES:\n${papers}`,
      shape: `{"questions":[{"text":"Explain the light reaction of photosynthesis."}]}`,
      maxOutputTokens: 2500,
    });
    for (const question of qs.questions) {
      // RETRIEVAL: find the most relevant material chunks, let their topics vote.
      const hits = retrieve(tagged, question.text, 4);
      const votes = new Map<number, number>();
      for (const h of hits) if (h.chunk.topic_id) votes.set(h.chunk.topic_id, (votes.get(h.chunk.topic_id) || 0) + h.score);
      let topicId = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!topicId) topicId = bm25(profiles, question.text, 1)[0]?.id;
      await q(`insert into paper_questions (user_id,text,topic_id,chunk_id) values ($1,$2,$3,$4)`, [
        userId,
        question.text,
        topicId ?? null,
        hits[0]?.chunk.id ?? null,
      ]);
      if (topicId) mapped++;
    }
    await q(
      `update topics t set exam_count = (select count(*) from paper_questions p where p.topic_id=t.id) where t.user_id=$1`,
      [userId]
    );
  }
  return { topics: topics.length, paperQuestions: mapped };
}

export async function loadTopicMap(userId: number) {
  const topics = await loadTopics(userId);
  const qs = await q<{ id: number; text: string; topic_id: number | null }>(
    `select id, text, topic_id from paper_questions where user_id=$1 order by id`,
    [userId]
  );
  const chunkCounts = await q<{ topic_id: number; n: number }>(
    `select topic_id, count(*)::int as n from chunks where user_id=$1 and topic_id is not null group by topic_id`,
    [userId]
  );
  return topics.map((t) => ({
    id: t.id,
    name: t.name,
    subtopics: t.subtopics,
    examCount: t.exam_count,
    chunks: chunkCounts.find((c) => c.topic_id === t.id)?.n ?? 0,
    questions: qs.filter((x) => x.topic_id === t.id).map((x) => x.text),
  }));
}
