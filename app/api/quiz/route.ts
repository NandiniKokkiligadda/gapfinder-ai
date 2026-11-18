import { handle, requireUser } from "@/lib/auth";
import { generateQuiz, loadOpenQuiz, submitQuiz } from "@/lib/quiz";
import { regeneratePlanNotes } from "@/lib/notes";

export const maxDuration = 60;

export const GET = handle(async () => {
  const u = await requireUser();
  return { quiz: await loadOpenQuiz(u.id) };
});

export const POST = handle(async (req) => {
  const u = await requireUser();
  const body = await req.json().catch(() => ({}));
  const per = Math.min(4, Math.max(1, Number(body.perTopic) || 3));
  return { quiz: await generateQuiz(u.id, per) };
});

export const PUT = handle(async (req) => {
  const u = await requireUser();
  const { attemptId, answers } = await req.json();
  const result = await submitQuiz(u.id, Number(attemptId), answers || {});
  await regeneratePlanNotes(u.id).catch((e) => console.error(e)); // plan updates itself after every attempt
  return result;
});
