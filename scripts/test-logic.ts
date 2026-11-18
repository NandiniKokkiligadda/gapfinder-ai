/** Offline sanity tests for the deterministic parts (no DB, no LLM). Run: npm test */
import assert from "node:assert/strict";
import { masteryFor, statusOf, buildPlan, priorityOf } from "../lib/mastery";
import { bm25, supportRatio } from "../lib/retrieval";
import { chunkPages } from "../lib/chunk";
import { SAMPLE_DOCS } from "../lib/sample";

// mastery: recency weighted, improvement shows
assert.equal(masteryFor([]), null);
const m1 = masteryFor([{ attemptId: 1, at: 1, correct: 0, total: 3 }])!;
const m2 = masteryFor([{ attemptId: 1, at: 1, correct: 0, total: 3 }, { attemptId: 2, at: 2, correct: 3, total: 3 }])!;
assert.equal(m1, 0);
assert.ok(m2 > 0.6 && m2 < 1, `improved mastery ${m2}`);
assert.equal(statusOf(0.3), "weak");
assert.equal(statusOf(0.6), "medium");
assert.equal(statusOf(0.9), "strong");
assert.equal(statusOf(null), "untested");
assert.ok(priorityOf(0.1, 1) > priorityOf(0.1, 0));
assert.ok(priorityOf(0.1, 0.5) > priorityOf(0.9, 0.5));

// plan: weakest + most exam-heavy first, fits the time budget
const topics = [
  { id: 1, name: "A strong", mastery: 0.95, examWeight: 1 },
  { id: 2, name: "B weak exam-heavy", mastery: 0.1, examWeight: 1 },
  { id: 3, name: "C weak rare", mastery: 0.1, examWeight: 0.1 },
  { id: 4, name: "D medium", mastery: 0.6, examWeight: 0.5 },
];
const plan = buildPlan(topics, 5, 2);
assert.equal(plan.order[0].topicId, 2);
assert.ok(plan.totalMinutes <= 5 * 120);
assert.ok(plan.days.length <= 5);
assert.ok(plan.days.every((d) => d.minutes <= 120));
const tiny = buildPlan(topics, 1, 0.5);
assert.ok(tiny.totalMinutes <= 30 && tiny.skipped.length > 0);
// plan updates after improvement
const improved = buildPlan(topics.map((t) => (t.id === 2 ? { ...t, mastery: 0.95 } : t)), 5, 2);
assert.notEqual(improved.order[0].topicId, 2);

// chunking keeps chapter/section for citations
const notes = SAMPLE_DOCS.find((d) => d.kind === "notes")!;
const chunks = chunkPages([notes.text], { paged: false });
assert.ok(chunks.length >= 12, `chunks ${chunks.length}`);
assert.ok(chunks.some((c) => c.section.includes("Chapter 1 Photosynthesis") && c.section.includes("1.1 Light Reaction")));

// retrieval finds the right passage
const docs = chunks.map((c, i) => ({ id: i, text: `${c.section}. ${c.text}` }));
const hit = bm25(docs, "Why does the left ventricle have a thick wall?", 1)[0];
assert.ok(chunks[hit.id].section.includes("Heart"), chunks[hit.id].section);
const off = bm25(docs, "Who won the football world cup in 2018", 1)[0];
assert.ok(!off || off.coverage < 0.34, "off-topic query must fail the coverage gate");
assert.ok(supportRatio("chlorophyll absorbs sunlight", chunks[0].text) > 0.6);
assert.ok(supportRatio("the moon is made of cheese", chunks[0].text) < 0.5);

console.log("All logic tests passed ✔");
