"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type Msg = { role: "user" | "assistant"; content: string; sources?: { id: string; citation: string }[] };

export default function Explain() {
  const [topics, setTopics] = useState<{ id: number; name: string }[]>([]);
  const [topicId, setTopicId] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { api("/api/topics").then((d) => setTopics(d.topics)).catch(() => {}); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    const history = msgs;
    setInput(""); setBusy(true);
    setMsgs([...history, { role: "user", content: question }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, topicId: topicId || null, history }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed");
      let sources: Msg["sources"] = [];
      try { sources = JSON.parse(decodeURIComponent(res.headers.get("X-Sources") || "[]")); } catch {}
      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...history, { role: "user", content: question }, { role: "assistant", content: acc, sources }]);
      }
    } catch (e: any) {
      setMsgs([...history, { role: "user", content: question }, { role: "assistant", content: `⚠ ${e.message}` }]);
    }
    setBusy(false);
  }

  return (
    <>
      <h1>Explain this topic</h1>
      <p className="sub">Answers come only from your uploaded material. If it isn&apos;t there, the assistant says so.</p>
      <div className="row">
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)}>
          <option value="">All topics</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="chat">
        {!msgs.length && <p className="muted">Try: “Explain the light reaction” or “Why does the left ventricle have a thick wall?”</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role === "user" ? "u" : "a"}`}>
            {m.content || "…"}
            {m.sources && m.sources.length > 0 && (
              <div className="cite" style={{ marginTop: 8 }}>
                {m.sources.map((s) => <div key={s.id}>[{s.id}] {s.citation}</div>)}
              </div>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={send}>
        <input style={{ flex: 1, minWidth: 200 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a topic from your material…" />
        <button className="btn" disabled={busy}>{busy ? "…" : "Ask"}</button>
      </form>
    </>
  );
}
