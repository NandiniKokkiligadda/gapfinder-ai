/**
 * Splits extracted text into retrieval chunks and remembers WHERE each chunk came from
 * (chapter › section, page). That location is what becomes the citation.
 */

export type RawChunk = { section: string; page: number | null; text: string };

type Line = { text: string; page: number | null };

const CHAPTER_RE = /^(chapter|unit|module|part|topic|lesson)\s+([0-9]+|[ivxl]+)\b/i;
const SECTION_RE = /^\d+(\.\d+)+[.)]?\s+\S/;
const NUMBERED_RE = /^\d+[.)]\s+[A-Z]/;

function headingLevel(line: string): 0 | 1 | 2 {
  const t = line.trim();
  if (t.length < 3 || t.length > 90) return 0;
  if (/^#{1,2}\s+/.test(t)) return 1;
  if (/^#{3,6}\s+/.test(t)) return 2;
  if (CHAPTER_RE.test(t)) return 1;
  if (SECTION_RE.test(t) && !/[.?!:;,]$/.test(t)) return 2;
  if (NUMBERED_RE.test(t) && t.length < 70 && !/[.?!:;,]$/.test(t)) return 1;
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && t.length < 60 && t === t.toUpperCase() && !/[.?!]$/.test(t)) return 1;
  return 0;
}

function splitLong(text: string, max: number): string[] {
  if (text.length <= max * 1.5) return [text];
  return text.split(/(?<=[.!?])\s+/);
}

export function chunkPages(pages: string[], opts: { maxChars?: number; paged?: boolean; headings?: boolean } = {}): RawChunk[] {
  const maxChars = opts.maxChars ?? 900;
  const paged = opts.paged ?? pages.length > 1;
  const useHeadings = opts.headings ?? true;

  const lines: Line[] = [];
  pages.forEach((p, i) => {
    for (const raw of p.replace(/\r/g, "").split("\n")) {
      const t = raw.trim();
      for (const piece of t ? splitLong(t, maxChars) : [""]) {
        lines.push({ text: piece, page: paged ? i + 1 : null });
      }
    }
  });

  const out: RawChunk[] = [];
  let chapter = "";
  let section = "";
  let buf: string[] = [];
  let bufLen = 0;
  let bufPage: number | null = null;

  const label = () => [chapter, section].filter(Boolean).join(" › ") || "Introduction";
  const flush = () => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    if (text.length >= 40) out.push({ section: label(), page: bufPage, text });
    else if (text && out.length) out[out.length - 1].text += " " + text;
    buf = [];
    bufLen = 0;
    bufPage = null;
  };

  for (const ln of lines) {
    if (!ln.text) {
      if (bufLen >= maxChars * 0.6) flush();
      continue;
    }
    const lvl = useHeadings ? headingLevel(ln.text) : 0;
    if (lvl) {
      flush();
      const clean = ln.text.replace(/^#+\s*/, "").trim();
      if (lvl === 1) {
        chapter = clean;
        section = "";
      } else section = clean;
      continue;
    }
    if (bufPage === null) bufPage = ln.page;
    buf.push(ln.text);
    bufLen += ln.text.length + 1;
    if (bufLen >= maxChars) flush();
  }
  flush();
  return out;
}
