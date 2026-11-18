/**
 * DIAGNOSIS LOGIC - plain deterministic code, NOT the LLM.
 * Mastery, weak/medium/strong classification, priority and the revision schedule all live here,
 * so the diagnosis is reproducible and measurable. The LLM only writes explanations around these numbers.
 */

export type TopicStatus = "weak" | "medium" | "strong" | "untested";

export const WEAK_BELOW = 0.5;
export const STRONG_FROM = 0.8;

export type TopicAttempt = { attemptId: number; at: number; correct: number; total: number };

/** Recency-weighted accuracy: newest attempt weight 1, the one before 0.5, then 0.25 ... so improvement is reflected quickly. */
export function masteryFor(results: TopicAttempt[]): number | null {
  const valid = results.filter((r) => r.total > 0).sort((a, b) => b.at - a.at);
  if (!valid.length) return null;
  let num = 0;
  let den = 0;
  valid.forEach((r, i) => {
    const w = Math.pow(0.5, i);
    num += w * (r.correct / r.total);
    den += w;
  });
  return num / den;
}

export function statusOf(m: number | null): TopicStatus {
  if (m === null) return "untested";
  if (m < WEAK_BELOW) return "weak";
  if (m < STRONG_FROM) return "medium";
  return "strong";
}

/** examWeight in [0,1] = share of the most-asked topic's past-paper questions. */
export function priorityOf(mastery: number | null, examWeight: number): number {
  const m = mastery === null ? 0.4 : mastery; // unknown topics are treated as moderately risky
  return (1 - m) * (0.4 + 0.6 * examWeight);
}

export type PlanTopic = { id: number; name: string; mastery: number | null; examWeight: number };
export type Session = { topicId: number; name: string; minutes: number; status: TopicStatus; mastery: number | null; priority: number };
export type PlanDay = { day: number; sessions: Session[]; minutes: number };
export type Plan = {
  days: PlanDay[];
  skipped: { topicId: number; name: string; status: TopicStatus }[];
  totalMinutes: number;
  order: Session[];
};

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

export function buildPlan(topics: PlanTopic[], days: number, hoursPerDay: number): Plan {
  const dayCap = Math.max(15, Math.round(hoursPerDay * 60));
  const total = Math.max(1, days) * dayCap;

  const items = topics
    .map((t) => ({ ...t, p: Math.max(0.03, priorityOf(t.mastery, t.examWeight)) }))
    .sort((a, b) => b.p - a.p);

  let active = [...items];
  let alloc: { t: (typeof items)[number]; m: number }[] = [];
  for (;;) {
    const sumP = active.reduce((a, t) => a + t.p, 0) || 1;
    alloc = active.map((t) => ({ t, m: Math.max(10, round5((total * t.p) / sumP)) }));
    const sum = alloc.reduce((a, x) => a + x.m, 0);
    if (sum <= total || active.length <= 1) break;
    active = active.slice(0, -1); // not enough time: drop the lowest-priority topic and re-balance
  }
  const skipped = items
    .filter((t) => !active.includes(t))
    .map((t) => ({ topicId: t.id, name: t.name, status: statusOf(t.mastery) }));

  // give rounding leftovers to the highest-priority topic
  let used = alloc.reduce((a, x) => a + x.m, 0);
  while (alloc.length && used + 5 <= total) {
    alloc[0].m += 5;
    used += 5;
  }

  const order: Session[] = alloc.map(({ t, m }) => ({
    topicId: t.id,
    name: t.name,
    minutes: m,
    status: statusOf(t.mastery),
    mastery: t.mastery,
    priority: Number(t.p.toFixed(3)),
  }));

  // pack sessions sequentially into days, splitting a session across a day boundary if needed
  const planDays: PlanDay[] = [];
  let cur: PlanDay = { day: 1, sessions: [], minutes: 0 };
  for (const s of order) {
    let left = s.minutes;
    while (left > 0) {
      if (cur.minutes >= dayCap) {
        planDays.push(cur);
        cur = { day: cur.day + 1, sessions: [], minutes: 0 };
      }
      const take = Math.min(left, dayCap - cur.minutes);
      cur.sessions.push({ ...s, minutes: take });
      cur.minutes += take;
      left -= take;
    }
  }
  if (cur.sessions.length) planDays.push(cur);

  return { days: planDays, skipped, totalMinutes: used, order };
}
