/**
 * RETRIEVAL LAYER (no LLM involved).
 * Okapi BM25 over the student's own chunks. Deterministic, explainable, free.
 * Everything the LLM is later allowed to "know" comes out of this function.
 */

const STOP = new Set(
  "a an the and or but if then of to in on at by for with from as is are was were be been being this that these those it its into than so such not no do does did can could should would will may might about which who whom what when where why how also each other their there they them he she his her we you your i our us over under between within without per via etc eg ie".split(
    " "
  )
);

function stem(t: string): string {
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ed")) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith("es")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);
}

export type Doc = { id: number; text: string };
export type Hit = { id: number; score: number; coverage: number };

/** Returns up to k docs with score > 0, best first. `coverage` = share of distinct query terms found in the doc. */
export function bm25(docs: Doc[], query: string, k = 5): Hit[] {
  const qTerms = Array.from(new Set(tokenize(query)));
  if (!qTerms.length || !docs.length) return [];

  const tokenized = docs.map((d) => tokenize(d.text));
  const N = docs.length;
  const avgLen = tokenized.reduce((a, t) => a + t.length, 0) / N || 1;

  const df = new Map<string, number>();
  for (const toks of tokenized) {
    for (const term of new Set(toks)) df.set(term, (df.get(term) || 0) + 1);
  }

  const k1 = 1.5;
  const b = 0.75;
  const hits: Hit[] = [];

  tokenized.forEach((toks, i) => {
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    let matched = 0;
    for (const term of qTerms) {
      const f = tf.get(term) || 0;
      if (!f) continue;
      matched++;
      const n = df.get(term) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * toks.length) / avgLen));
    }
    if (score > 0) hits.push({ id: docs[i].id, score, coverage: matched / qTerms.length });
  });

  return hits.sort((a, b2) => b2.score - a.score).slice(0, k);
}

/** Share of `claim` tokens that also appear in `source` (used to verify quoted evidence is really in the chunk). */
export function supportRatio(claim: string, source: string): number {
  const c = Array.from(new Set(tokenize(claim)));
  if (!c.length) return 0;
  const s = new Set(tokenize(source));
  return c.filter((t) => s.has(t)).length / c.length;
}
