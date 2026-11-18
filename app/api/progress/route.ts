import { q } from "@/lib/db";
import { handle, requireUser } from "@/lib/auth";
import { loadTopicStates } from "@/lib/data";

export const GET = handle(async () => {
  const u = await requireUser();
  const attempts = await q<any>(
    `select id, correct, total, extract(epoch from created_at)*1000 as at from attempts where user_id=$1 and status='done' order by created_at asc, id asc`,
    [u.id]
  );
  const topics = await loadTopicStates(u.id);
  const docs = await q<{ n: number }>(`select count(*)::int as n from documents where user_id=$1`, [u.id]);
  const open = await q<{ n: number }>(`select count(*)::int as n from attempts where user_id=$1 and status='open'`, [u.id]);
  return {
    stage: { documents: docs[0].n, topics: topics.length, attempts: attempts.length, openQuiz: open[0].n > 0 },
    attempts: attempts.map((a, i) => ({ n: i + 1, id: a.id, correct: a.correct, total: a.total, pct: a.total ? Math.round((100 * a.correct) / a.total) : 0 })),
    topics: topics.map((t) => ({ id: t.id, name: t.name, status: t.status, mastery: t.mastery, history: t.history })),
  };
});
