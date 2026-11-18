"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";

type Q = { id: number; topicId: number; topicName: string; question: string; options: string[]; citation: string };
type Result = {
  correct: number; total: number;
  topics: { topicId: number; topicName: string; correct: number; total: number; reason: string }[];
  review: { id: number; topicName: string; question: string; options: string[]; correctIndex: number; chosenIndex: number | null; isCorrect: boolean; explanation: string; citation: string; evidence: string }[];
};

export default function Quiz() {
  const [quiz, setQuiz] = useState<{ attemptId: number; questions: Q[] } | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { api("/api/quiz").then((d) => setQuiz(d.quiz)).catch((e) => setErr(e.message)); }, []);

  async function start() {
    setBusy("gen"); setErr(""); setResult(null); setAnswers({});
    try { setQuiz((await api("/api/quiz", { json: { perTopic: 3 } })).quiz); } catch (e: any) { setErr(e.message); }
    setBusy("");
  }
  async function submit() {
    if (!quiz) return;
    setBusy("sub"); setErr("");
    try { setResult(await api("/api/quiz", { method: "PUT", json: { attemptId: quiz.attemptId, answers } })); setQuiz(null); }
    catch (e: any) { setErr(e.message); }
    setBusy("");
  }

  if (result) {
    return (
      <>
        <h1>Result: {result.correct} / {result.total}</h1>
        <p className="sub">Your gap report and revision plan have been updated.</p>
        <p className="row">
          <Link className="btn" href="/report">See gap report</Link>
          <Link className="btn ghost" href="/plan">See revision plan</Link>
          <button className="btn ghost" onClick={start} disabled={!!busy}>Take another quiz</button>
        </p>
        <div className="card">
          {result.review.map((r, i) => (
            <div className="q" key={r.id}>
              <div className="small muted">{i + 1}. {r.topicName} · {r.isCorrect ? <span className="ok">Correct</span> : <span className="err">{r.chosenIndex === null ? "Skipped" : "Wrong"}</span>}</div>
              <b>{r.question}</b>
              {r.options.map((o, j) => (
                <div key={j} className={`opt ${j === r.correctIndex ? "right" : j === r.chosenIndex ? "wrong" : ""}`} style={{ cursor: "default" }}>{o}</div>
              ))}
              <p className="small">{r.explanation}</p>
              <div className="cite">{r.citation}</div>
              <div className="small muted">“{r.evidence}”</div>
            </div>
          ))}
        </div>
      </>
    );
  }

  const answered = quiz ? Object.keys(answers).length : 0;
  return (
    <>
      <h1>3 · Diagnostic quiz</h1>
      <p className="sub">Questions are generated only from passages retrieved out of your own material, and each shows its source.</p>
      {err && <p className="err">{err}</p>}
      {!quiz && (
        <button className="btn" onClick={start} disabled={!!busy}>{busy ? "Generating grounded questions… (≈20–40s)" : "Generate diagnostic quiz"}</button>
      )}
      {quiz && (
        <>
          <div className="card">
            {quiz.questions.map((q, i) => (
              <div className="q" key={q.id}>
                <div className="small muted">{i + 1}. {q.topicName}</div>
                <b>{q.question}</b>
                {q.options.map((o, j) => (
                  <button key={j} className={`opt ${answers[q.id] === j ? "sel" : ""}`} onClick={() => setAnswers({ ...answers, [q.id]: j })}>{o}</button>
                ))}
                <div className="cite">Source: {q.citation}</div>
              </div>
            ))}
          </div>
          <p className="row">
            <button className="btn" onClick={submit} disabled={!!busy}>{busy ? "Checking answers…" : `Submit (${answered}/${quiz.questions.length} answered)`}</button>
            <button className="btn ghost" onClick={start} disabled={!!busy}>New questions</button>
          </p>
        </>
      )}
    </>
  );
}
