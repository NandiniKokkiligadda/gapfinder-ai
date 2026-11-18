"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type Doc = { id: number; kind: string; filename: string; chunks: number };
const KINDS: [string, string][] = [["syllabus", "Syllabus"], ["textbook", "Textbook chapter"], ["notes", "Notes"], ["paper", "Past question paper"]];

export default function Materials() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [kind, setKind] = useState("syllabus");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const load = () => api("/api/materials").then((d) => setDocs(d.documents)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function upload() {
    setErr(""); setMsg(""); setBusy("upload");
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      const f = file.current?.files?.[0];
      if (f) fd.set("file", f);
      if (text.trim()) fd.set("text", text);
      const r = await api("/api/materials", { method: "POST", body: fd });
      setMsg(`Added — split into ${r.chunks} searchable sections.`);
      setText(""); if (file.current) file.current.value = "";
      load();
    } catch (e: any) { setErr(e.message); }
    setBusy("");
  }

  async function sample() {
    setErr(""); setMsg(""); setBusy("sample");
    try { await api("/api/sample", { method: "POST" }); setMsg("Sample Biology material loaded. Next: build the topic map."); load(); }
    catch (e: any) { setErr(e.message); }
    setBusy("");
  }

  return (
    <>
      <h1>1 · Upload your material</h1>
      <p className="sub">Syllabus, textbook chapters, notes and past papers (PDF or text). Everything later is grounded in these files only.</p>

      <div className="card">
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input ref={file} type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" />
        </div>
        <p className="small muted">…or paste text instead:</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste syllabus / notes / questions here" />
        <p className="row">
          <button className="btn" onClick={upload} disabled={!!busy}>{busy === "upload" ? "Reading…" : "Upload"}</button>
          <button className="btn ghost" onClick={sample} disabled={!!busy}>{busy === "sample" ? "Loading…" : "Try with sample Biology material"}</button>
        </p>
        {msg && <p className="ok">{msg}</p>}
        {err && <p className="err">{err}</p>}
        <p className="small muted">Tip: after changing uploads, rebuild the topic map (step 2). Scanned/image-only PDFs have no text and are not supported.</p>
      </div>

      <div className="card">
        <b>Your files</b>
        {!docs.length && <p className="muted">Nothing uploaded yet.</p>}
        {docs.map((d) => (
          <div key={d.id} className="sess">
            <span className="badge b-untested">{d.kind}</span>
            <span style={{ flex: 1 }}>{d.filename} <span className="muted small">· {d.chunks} sections</span></span>
            <button className="btn ghost" onClick={async () => { await api(`/api/materials?id=${d.id}`, { method: "DELETE" }); load(); }}>Remove</button>
          </div>
        ))}
      </div>
    </>
  );
}
