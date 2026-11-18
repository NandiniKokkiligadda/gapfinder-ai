/** Shared data loaders (all queries are scoped by user_id). */
import { q } from "./db";
import { bm25 } from "./retrieval";
import { masteryFor, statusOf, buildPlan, TopicAttempt } from "./mastery";

export type ChunkRow = {
  id: number;
  document_id: number;
  section: string;
  page: number | null;
  text: string;
  topic_id: number | null;
  filename: string;
  kind: string;
};

export const citationOf = (c: Pick<ChunkRow, "filename" | "section" | "page">) =>
  `${c.filename} — ${c.section}${c.page ? `, p.${c.page}` : ""}`;

/** Study material = textbook + notes. (Syllabus defines topics; papers define exam weight.) */
export async function loadMaterialChunks(userId: number): Promise<ChunkRow[]> {
  return q<ChunkRow>(
    `select c.id, c.document_id, c.section, c.page, c.text, c.topic_id, d.filename, d.kind
       from chunks c join documents d on d.id = c.document_id
      where c.user_id = $1 and d.kind in ('textbook','notes') order by c.id`,
    [userId]
  );
}

export function retrieve(chunks: ChunkRow[], query: string, k = 5) {
  const hits = bm25(chunks.map((c) => ({ id: c.id, text: `${c.section}. ${c.text}` })), query, k);
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return hits.map((h) => ({ chunk: byId.get(h.id)!, score: h.score, coverage: h.coverage }));
}

export type TopicRow = { id: number; name: string; subtopics: string[]; keywords: string[]; position: number; exam_count: number };

export async function loadTopics(userId: number): Promise<TopicRow[]> {
  return q<TopicRow>(`select id, name, subtopics, keywords, position, exam_count from topics where user_id=$1 order by position, id`, [userId]);
}

export type TopicState = {
  id: number;
  name: string;
  subtopics: string[];
  examCount: number;
  examWeight: number;
  mastery: number | null;
  status: ReturnType<typeof statusOf>;
  reason: string | null;
  history: { attemptId: number; at: number; pct: number }[];
};

export async function loadTopicStates(userId: number): Promise<TopicState[]> {
  const topics = await loadTopics(userId);
  const rows = await q<any>(
    `select tr.topic_id, tr.correct, tr.total, tr.reason, a.id as attempt_id, extract(epoch from a.created_at)*1000 as at
       from topic_results tr join attempts a on a.id = tr.attempt_id
      where a.user_id=$1 and a.status='done' order by a.created_at asc, a.id asc`,
    [userId]
  );
  const maxExam = Math.max(0, ...topics.map((t) => t.exam_count));
  return topics.map((t) => {
    const mine = rows.filter((r) => r.topic_id === t.id);
    const attempts: TopicAttempt[] = mine.map((r) => ({ attemptId: r.attempt_id, at: Number(r.at), correct: r.correct, total: r.total }));
    const mastery = masteryFor(attempts);
    return {
      id: t.id,
      name: t.name,
      subtopics: t.subtopics,
      examCount: t.exam_count,
      examWeight: maxExam > 0 ? t.exam_count / maxExam : 0,
      mastery,
      status: statusOf(mastery),
      reason: mine.length ? mine[mine.length - 1].reason : null,
      history: mine.map((r) => ({ attemptId: r.attempt_id, at: Number(r.at), pct: r.total ? Math.round((100 * r.correct) / r.total) : 0 })),
    };
  });
}

export async function loadSettings(userId: number) {
  const r = await q<{ days: number; hours_per_day: number }>(`select days, hours_per_day from settings where user_id=$1`, [userId]);
  return r[0] ? { days: r[0].days, hoursPerDay: r[0].hours_per_day } : { days: 5, hoursPerDay: 2 };
}

export async function computePlan(userId: number) {
  const [states, settings, notes] = await Promise.all([
    loadTopicStates(userId),
    loadSettings(userId),
    q<{ topic_id: number; note: string }>(`select topic_id, note from topic_notes where user_id=$1`, [userId]),
  ]);
  const plan = buildPlan(
    states.map((s) => ({ id: s.id, name: s.name, mastery: s.mastery, examWeight: s.examWeight })),
    settings.days,
    settings.hoursPerDay
  );
  return { settings, plan, notes: Object.fromEntries(notes.map((n) => [n.topic_id, n.note])) };
}
