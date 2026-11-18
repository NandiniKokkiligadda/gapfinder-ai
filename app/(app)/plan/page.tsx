"use client";
import { useEffect, useState } from "react";
import { api, LABEL, pct } from "@/lib/client";

type Session = { topicId: number; name: string; minutes: number; status: keyof typeof LABEL; mastery: number | null; priority: number };
type PlanData = {
  settings: { days: number; hoursPerDay: number };
  plan: { days: { day: number; minutes: number; sessions: Session[] }[]; skipped: { topicId: number; name: string }[]; totalMinutes: number };
  notes: Record<number, string>;
};

export default function Plan() {
  const [d, setD] = useState<PlanData | null>(null);
  const [days, setDays] = useState(5);
  const [hours, setHours] = useState(2);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");

  const apply = (x: PlanData) => { setD(x); setDays(x.settings.days); setHours(x.settings.hoursPerDay); };
  useEffect(() => { api("/api/plan").then(apply).catch((e) => setErr(e.message)); }, []);

  async function save() {
    setBusy("save"); setErr("");
    try { apply(await api("/api/plan", { method: "PUT", json: { days, hoursPerDay: hours } })); } catch (e: any) { setErr(e.message); }
    setBusy("");
  }
  async function notes() {
    setBusy("notes"); setErr("");
    try { apply(await api("/api/plan", { method: "POST" })); } catch (e: any) { setErr(e.message); }
    setBusy("");
  }

  return (
    <>
      <h1>5 · Revision plan</h1>
      <p className="sub">Ordered by (1 − mastery) × exam importance, then fitted into your available time. It recalculates after every quiz.</p>
      <div className="card row">
        <label>Days available <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
        <label>Hours per day <input type="number" min={0.5} max={16} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} /></label>
        <button className="btn" onClick={save} disabled={!!busy}>{busy === "save" ? "Updating…" : "Update plan"}</button>
        <button className="btn ghost" onClick={notes} disabled={!!busy}>{busy === "notes" ? "Writing tips…" : "Refresh study tips"}</button>
      </div>
      {err && <p className="err">{err}</p>}
      {d && !d.plan.days.length && <p className="muted">Build the topic map first (step 2).</p>}
      {d?.plan.days.map((day) => (
        <div className="card day" key={day.day}>
          <div className="row" style={{ justifyContent: "space-between" }}><b>Day {day.day}</b><span className="small muted">{day.minutes} min</span></div>
          {day.sessions.map((s, i) => (
            <div className="sess" key={i}>
              <span className="mins">{s.minutes}m</span>
              <div style={{ flex: 1 }}>
                <b>{s.name}</b> <span className={`badge b-${s.status}`}>{LABEL[s.status]} {pct(s.mastery)}</span>
                {d.notes[s.topicId] && <div className="small">{d.notes[s.topicId]}</div>}
              </div>
            </div>
          ))}
        </div>
      ))}
      {d && d.plan.skipped.length > 0 && (
        <p className="small muted">Not enough time for: {d.plan.skipped.map((s) => s.name).join(", ")}. Add study time to include them.</p>
      )}
      {d && d.plan.days.length > 0 && <p className="small muted">After studying, take another diagnostic quiz — the plan re-prioritises automatically.</p>}
    </>
  );
}
