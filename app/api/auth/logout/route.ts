import { handle, endSession } from "@/lib/auth";

export const POST = handle(async () => {
  await endSession();
  return { ok: true };
});
