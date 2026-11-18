import { q } from "@/lib/db";
import { handle, requireUser } from "@/lib/auth";
import { ingestText, Kind } from "@/lib/ingest";
import { SAMPLE_DOCS } from "@/lib/sample";

export const POST = handle(async () => {
  const u = await requireUser();
  await q(`delete from documents where user_id=$1`, [u.id]);
  await q(`delete from topics where user_id=$1`, [u.id]);
  await q(`delete from attempts where user_id=$1`, [u.id]);
  for (const d of SAMPLE_DOCS) await ingestText(u.id, d.kind as Kind, d.filename, [d.text], false);
  return { ok: true };
});
