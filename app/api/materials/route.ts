import { q } from "@/lib/db";
import { handle, requireUser, HttpError } from "@/lib/auth";
import { extractPages, ingestText, KINDS, Kind } from "@/lib/ingest";

export const maxDuration = 60;

export const GET = handle(async () => {
  const u = await requireUser();
  const docs = await q<any>(
    `select d.id, d.kind, d.filename, count(c.id)::int as chunks from documents d left join chunks c on c.document_id=d.id where d.user_id=$1 group by d.id order by d.id`,
    [u.id]
  );
  return { documents: docs };
});

export const POST = handle(async (req) => {
  const u = await requireUser();
  const form = await req.formData();
  const kind = String(form.get("kind")) as Kind;
  if (!KINDS.includes(kind)) throw new HttpError(400, "Pick a material type.");
  const file = form.get("file");
  const pasted = String(form.get("text") || "").trim();
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) throw new HttpError(400, "File too large (max 8 MB).");
    const { pages, paged } = await extractPages(file);
    return ingestText(u.id, kind, file.name, pages, paged);
  }
  if (pasted) return ingestText(u.id, kind, `Pasted ${kind}`, [pasted], false);
  throw new HttpError(400, "Choose a file or paste text.");
});

export const DELETE = handle(async (req) => {
  const u = await requireUser();
  const id = Number(new URL(req.url).searchParams.get("id"));
  await q(`delete from documents where id=$1 and user_id=$2`, [id, u.id]);
  return { ok: true };
});
