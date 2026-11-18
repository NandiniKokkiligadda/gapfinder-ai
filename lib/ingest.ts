/** Upload -> text extraction -> chunking -> stored with citation metadata. */
import { q } from "./db";
import { chunkPages } from "./chunk";
import { HttpError } from "./auth";

export const KINDS = ["syllabus", "textbook", "notes", "paper"] as const;
export type Kind = (typeof KINDS)[number];

export async function extractPages(file: File): Promise<{ pages: string[]; paged: boolean }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: false });
    return { pages: Array.isArray(text) ? text : [text], paged: true };
  }
  return { pages: [await file.text()], paged: false };
}

export async function ingestText(userId: number, kind: Kind, filename: string, pages: string[], paged: boolean) {
  const chunks = chunkPages(pages, { paged, headings: kind !== "paper" });
  if (!chunks.length) throw new HttpError(400, `No readable text found in ${filename}. Scanned PDFs are not supported; upload a text-based PDF or .txt.`);
  const doc = await q<{ id: number }>(`insert into documents (user_id,kind,filename) values ($1,$2,$3) returning id`, [userId, kind, filename]);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    await q(`insert into chunks (user_id,document_id,idx,section,page,text) values ($1,$2,$3,$4,$5,$6)`, [userId, doc[0].id, i, c.section, c.page, c.text]);
  }
  return { id: doc[0].id, chunks: chunks.length };
}
