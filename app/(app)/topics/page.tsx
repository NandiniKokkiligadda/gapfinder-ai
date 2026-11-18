"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type T = { id: number; name: string; subtopics: string[]; examCount: number; chunks: number; questions: string[] };

export default function Topics() {
  const [topics, setTopics] = useState<T[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/topics").then((d) => setTopics(d.topics)).catch((e) => setErr(e.message)); }, []);

  async function build() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const d = await api("/api/topics", { method: "POST" });
      setTopics(d.topics);
      setMsg(`Built ${d.topics.length} topics and mapped ${d.paperQuestions} past-paper questions. (Rebuilding resets earlier quiz history.)`);
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  const max = Math.max(1, ...topics.map((t) => t.examCount));
  return (
    <>
      <h1>2 · Topic map</h1>
      <p className="sub">Your syllabus broken into topics, with each past-paper question linked to a topic so you can see what the exam asks most.</p>
      <p className="row">
        <button className="btn" onClick={build} disabled={busy}>{busy ? "Building… (≈20s)" : topics.length ? "Rebuild topic map" : "Build topic map"}</button>
        {msg && <span className="ok">{msg}</span>}
      </p>
      {err && <p className="err">{err}</p>}
      {topics.map((t) => (
        <div className="card" key={t.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>{t.name}</b>
            <span className="small muted">{t.chunks} matched sections · {t.examCount} past-paper question{t.examCount === 1 ? "" : "s"}</span>
          </div>
          <div className="bar" style={{ margin: "8px 0" }}><i style={{ width: `${(100 * t.examCount) / max}%`, background: "var(--brand)" }} /></div>
          {t.subtopics.length > 0 && <p className="small muted">Subtopics: {t.subtopics.join(" · ")}</p>}
          {t.questions.length > 0 && (
            <details><summary className="small">Past-paper questions on this topic</summary>
              <ul className="small">{t.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </details>
          )}
        </div>
      ))}
    </>
  );
}
