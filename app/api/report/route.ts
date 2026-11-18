import { handle, requireUser } from "@/lib/auth";
import { loadTopicStates } from "@/lib/data";

export const GET = handle(async () => {
  const u = await requireUser();
  const topics = await loadTopicStates(u.id);
  const order = { weak: 0, medium: 1, untested: 2, strong: 3 } as const;
  topics.sort((a, b) => order[a.status] - order[b.status] || (a.mastery ?? 0) - (b.mastery ?? 0));
  return {
    topics,
    counts: {
      weak: topics.filter((t) => t.status === "weak").length,
      medium: topics.filter((t) => t.status === "medium").length,
      strong: topics.filter((t) => t.status === "strong").length,
      untested: topics.filter((t) => t.status === "untested").length,
    },
  };
});
