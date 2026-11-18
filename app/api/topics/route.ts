import { handle, requireUser } from "@/lib/auth";
import { buildTopicMap, loadTopicMap } from "@/lib/topics";

export const maxDuration = 60;

export const GET = handle(async () => {
  const u = await requireUser();
  return { topics: await loadTopicMap(u.id) };
});

export const POST = handle(async () => {
  const u = await requireUser();
  const r = await buildTopicMap(u.id);
  return { ...r, topics: await loadTopicMap(u.id) };
});
