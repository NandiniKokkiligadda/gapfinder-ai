# GapFinder AI — find what the student doesn't know

A diagnosis-first study app. The student uploads a syllabus, textbook chapters / notes and past papers; the app builds a topic map, **tests** the student with questions grounded in their own material, produces a **gap report** (🔴 weak / 🟡 medium / 🟢 strong, with reasons), and a **revision plan** that re-prioritises after every quiz. Chat ("Explain this topic") is a supporting feature, not the main output.

**Stack:** Next.js 15 (App Router, TypeScript) · Vercel AI SDK (`ai`, `@ai-sdk/groq`) · Groq (`llama-3.3-70b-versatile`) · Neon Postgres · deployed on Vercel.

> Demo login: **demo@gapfinder.ai / demo123** (pre-filled on the login page; seeded automatically). On the *Materials* page click **"Try with sample Biology material"** to run the whole loop in about two minutes.

---

## The core loop

```
Upload → Topic map → Diagnostic quiz → Gap report → Revision plan → Re-test → Plan updates
```

| Feature (from the brief) | Where it is |
|---|---|
| Upload syllabus / notes / past papers (PDF or text) | `/materials`, `lib/ingest.ts`, `lib/chunk.ts` |
| Topic map from the syllabus + past-paper questions linked to topics (exam frequency) | `/topics`, `lib/topics.ts` |
| Diagnostic quiz with citations to the source section | `/quiz`, `lib/quiz.ts` |
| Answer evaluation: right/wrong **and why** | `submitQuiz()` in `lib/quiz.ts` |
| Gap report with weak/medium/strong and reasons | `/report`, `lib/mastery.ts`, `lib/data.ts` |
| Revision plan ordered by priority and available time, updates after each attempt | `/plan`, `buildPlan()` in `lib/mastery.ts` |
| Explain-this-topic assistant answering only from uploaded material | `/explain`, `app/api/chat/route.ts` |
| Progress dashboard across attempts | `/` (dashboard) |
| Login with demo credentials, saved data | `lib/auth.ts`, `lib/db.ts` (Neon) |

---

## Where retrieval is used, where generation is used, and how they are kept separate

This is the key design rule: **retrieval decides what the model is allowed to see; generation only writes from that; scoring and prioritisation are plain code.**

### 1. Retrieval (no LLM) — `lib/retrieval.ts`
- Uploaded files are split into chunks, each stored with its **location** (`file — Chapter › Section, page`). That location is the citation.
- Search is **BM25** (keyword relevance ranking) over the student's own chunks. It is deterministic, free and explainable. (Groq has no embeddings endpoint; BM25 works well on single-subject study material and keeps the app dependency-free. The `retrieve()` function is the single swap point if you want vector search later.)
- Retrieval is used to:
  1. tag every chunk with its best-matching **topic**;
  2. link every **past-paper question** to a topic (top chunks vote) → exam frequency per topic;
  3. pick the **passages for quiz generation** of each topic;
  4. pick the **passages for the plan's study tips**;
  5. pick the **passages for the Explain chat**, with a relevance gate (see below).

### 2. Generation (LLM) — `lib/llm.ts`
The LLM is called only with retrieved passages in a `SOURCES` block and a system prompt that forbids outside knowledge. It is used to:
- turn the syllabus text into a structured topic list;
- extract questions from the past-paper text;
- write multiple-choice questions from retrieved passages;
- explain why each answer is right/wrong;
- phrase the per-topic reason in the gap report;
- write short revision tips for each priority topic;
- answer chat questions.

### 3. Deterministic code (no LLM) — `lib/mastery.ts`
- **Grading** of MCQs (the LLM never decides correctness).
- **Mastery** per topic: recency-weighted accuracy (newest attempt weight 1, previous ½, then ¼…), so improvement shows quickly.
- **Weak / medium / strong**: `< 50%` / `50–79%` / `≥ 80%`.
- **Priority** = `(1 − mastery) × (0.4 + 0.6 × examWeight)`; untested topics are treated as mastery 40%.
- **Plan**: topics sorted by priority, minutes allocated proportionally, packed into the student's days × hours; if time is too short the lowest-priority topics are dropped and listed as "not enough time".
- So the **diagnosis is measurable and reproducible**; the LLM only adds explanations around the numbers.

### Guardrails that keep generation grounded
- **Evidence check:** every generated question must include a short quote copied from its source passage. The server verifies the quote's words really appear in that chunk (`supportRatio`) and **drops the question otherwise**.
- **Citation on every question** and every explanation (file, chapter › section, page for PDFs).
- **Chat relevance gate:** if retrieval finds no sufficiently matching passage, the LLM is **not called at all** and the app replies "This isn't covered in your uploaded material".
- Correct answers are never sent to the browser before submission.

---

## Run locally

```bash
npm install
cp .env.example .env.local      # fill in the 3 values below
npm run dev                     # http://localhost:3000
npm test                        # offline tests for mastery / plan / chunking / retrieval
```

| Variable | Where to get it |
|---|---|
| `GROQ_API_KEY` | free key at https://console.groq.com/keys |
| `DATABASE_URL` | free Postgres at https://neon.tech → copy the connection string |
| `SESSION_SECRET` | any long random string (`openssl rand -hex 32`) |
| `GROQ_MODEL` (optional) | defaults to `llama-3.3-70b-versatile` |

Tables and the demo user are created automatically on the first request — no migration step.

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Vercel → **Add New → Project** → import the repo (framework: Next.js, nothing to change).
3. Add the environment variables `GROQ_API_KEY`, `DATABASE_URL`, `SESSION_SECRET`.
4. Deploy, open the URL, log in with the demo credentials, click *Try with sample Biology material*.

## Project structure

```
app/
  login/                     login / register
  (app)/                     authenticated pages: dashboard, materials, topics, quiz, report, plan, explain
  api/                       route handlers (auth, materials, topics, quiz, report, plan, chat, progress, sample)
lib/
  retrieval.ts               BM25 retrieval + evidence-support check       (RETRIEVAL)
  chunk.ts                   chunking with chapter/section/page metadata
  llm.ts                     Groq calls, JSON validation (Zod), grounding rules   (GENERATION)
  topics.ts  quiz.ts  notes.ts   the AI pipelines that combine the two
  mastery.ts                 mastery, status, priority, schedule           (PLAIN CODE)
  data.ts  db.ts  auth.ts  ingest.ts  sample.ts
scripts/test-logic.ts        offline tests
```

## Known limitations / future work
- Scanned (image-only) PDFs are not supported (no OCR); use text PDFs or paste text.
- Quiz questions are multiple choice; open-ended answer grading is a natural next step.
- Free Groq limits can cause a short "busy" message during heavy use; requests auto-retry.
- Future: teacher class-level analytics, parent view, multi-subject, spaced-repetition reminders, vector search, LMS integration.
