"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, COLOR, LABEL, pct } from "@/lib/client";

type Progress = {
  stage: { documents: number; topics: number; attempts: number; openQuiz: boolean };
  attempts: { n: number; id: number; correct: number; total: number; pct: number }[];
  topics: { id: number; name: string; status: keyof typeof COLOR; mastery: number | null; history: { attemptId: number; pct: number }[] }[];
};

function Chart({ data }: { data: Progress["attempts"] }) {
  const W = 560, H = 180, P = 28;
  if (!data.length) return <p className="muted">Take your first quiz to see progress here.</p>;
  const x = (i: number) => (data.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (data.length - 1));
  const y = (v: number) => H - P - (v * (H - 2 * P)) / 100;
  const pts = data.map((d, i) => `${x(i)},${y(d.pct)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Overall score per attempt">
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={P} x2={W - P} y1={y(g)} y2={y(g)} stroke="var(--line)" />
          <text x={4} y={y(g) + 4} fontSize="11" fill="var(--muted)">{g}%</text>
        </g>
      ))}
      <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="2.5" />
      {data.map((d, i) => (
        <g key={d.id}>
          <circle cx={x(i)} cy={y(d.pct)} r="5" fill="var(--brand)" />
          <text x={x(i)} y={y(d.pct) - 10} fontSize="12" textAnchor="middle" fill="var(--ink)">{d.pct}%</text>
          <text x={x(i)} y={H - 6} fontSize="11" textAnchor="middle" fill="var(--muted)">Attempt {d.n}</text>
        </g>
      ))}
    </svg>
  );
}

export default function Dashboard() {
  const [p, setP] = useState<Progress | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api("/api/progress").then(setP).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="err">{err}</p>;
  if (!p) return <p className="muted">Loading…</p>;

  const s = p.stage;
  const steps = [
    ["Upload material", "/materials", s.documents > 0],
    ["Build topic map", "/topics", s.topics > 0],
    ["Take diagnostic quiz", "/quiz", s.attempts > 0],
    ["Read gap report", "/report", s.attempts > 0],
    ["Follow revision plan", "/plan", s.attempts > 0],
  ] as const;

  return (
    <>
      <h1>Progress dashboard</h1>
      <p className="sub">Upload → Test → Find weak spots → Plan → Re-test → Plan updates.</p>

      <div className="steps" style={{ marginBottom: 16 }}>
        {steps.map(([label, href, done]) => (
          <Link key={label} href={href} className={`step ${done ? "done" : "todo"}`}>
            <div className="small muted">{done ? "✓ done" : "to do"}</div>
            <b>{label}</b>
          </Link>
        ))}
      </div>

      <div className="card">
        <b>Overall score per attempt</b>
        <Chart data={p.attempts} />
      </div>

      <div className="card">
        <b>Topic mastery across attempts</b>
        {!p.topics.length && <p className="muted">No topics yet.</p>}
        {p.topics.map((t) => (
          <div key={t.id} style={{ margin: "12px 0" }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span>{t.name}</span>
              <span className="small">
                {t.history.length ? t.history.map((h, i) => <span key={h.attemptId}>{i ? " → " : ""}{h.pct}%</span>) : <span className="muted">not tested</span>}
                {"  "}<span className={`badge b-${t.status}`}>{LABEL[t.status]}</span>
              </span>
            </div>
            <div className="bar"><i style={{ width: pct(t.mastery) === "—" ? 0 : pct(t.mastery), background: COLOR[t.status] }} /></div>
          </div>
        ))}
      </div>
    </>
  );
}
