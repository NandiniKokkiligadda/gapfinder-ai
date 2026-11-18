import { q } from "@/lib/db";
import { handle, requireUser } from "@/lib/auth";
import { computePlan } from "@/lib/data";
import { regeneratePlanNotes } from "@/lib/notes";

export const maxDuration = 60;

export const GET = handle(async () => {
  const u = await requireUser();
  return computePlan(u.id);
});

/** Update study time. The schedule is recomputed instantly from current mastery. */
export const PUT = handle(async (req) => {
  const u = await requireUser();
  const b = await req.json();
  const days = Math.min(60, Math.max(1, Math.round(Number(b.days) || 5)));
  const hours = Math.min(16, Math.max(0.5, Number(b.hoursPerDay) || 2));
  await q(
    `insert into settings (user_id,days,hours_per_day) values ($1,$2,$3) on conflict (user_id) do update set days=excluded.days, hours_per_day=excluded.hours_per_day`,
    [u.id, days, hours]
  );
  return computePlan(u.id);
});

export const POST = handle(async () => {
  const u = await requireUser();
  await regeneratePlanNotes(u.id);
  return computePlan(u.id);
});
