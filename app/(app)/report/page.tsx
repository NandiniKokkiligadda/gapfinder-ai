"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, COLOR, LABEL, pct } from "@/lib/client";

type T = { id: number; name: string; status: keyof typeof COLOR; mastery: number | null; reason: string | null; examCount: number; history: { attemptId: number; pct: number }[] };

export default function Report() {
  const [d, setD] = useState<{ topics: T[]; counts: Record<string, number> } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/api/report").then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const tested = d.topics.some((t) => t.status !== "untested");

  return (
    <>
      <h1>4 · Gap report</h1>
      <p className="sub">Your diagnosis: what you actually don&apos;t know yet, and why. Mastery weights your latest attempts most.</p>
      {!tested && <p>No quiz taken yet. <Link href="/quiz" style={{ textDecoration: "underline" }}>Take the diagnostic quiz</Link>.</p>}
      <div className="stats">
        <div className="stat"><b style={{ color: "var(--weak)" }}>{d.counts.weak}</b>🔴 Weak</div>
        <div className="stat"><b style={{ color: "var(--med)" }}>{d.counts.medium}</b>🟡 Medium</div>
        <div className="stat"><b style={{ color: "var(--strong)" }}>{d.counts.strong}</b>🟢 Strong</div>
        <div className="stat"><b>{d.counts.untested}</b>⚪ Untested</div>
      </div>
      {d.topics.map((t) => (
        <div className="card" key={t.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>{t.name}</b>
            <span><span className={`badge b-${t.status}`}>{LABEL[t.status]}</span> <b>{pct(t.mastery)}</b></span>
          </div>
          <div className="bar" style={{ margin: "8px 0" }}><i style={{ width: t.mastery === null ? 0 : pct(t.mastery), background: COLOR[t.status] }} /></div>
          <p className="small" style={{ margin: 0 }}>{t.reason ?? "Not tested yet — appears in your next diagnostic quiz."}</p>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            {t.examCount > 0 ? `Asked ${t.examCount}× in past papers` : "Not found in past papers"}
            {t.history.length > 1 && ` · attempts: ${t.history.map((h) => h.pct + "%").join(" → ")}`}
          </p>
        </div>
      ))}
    </>
  );
}
