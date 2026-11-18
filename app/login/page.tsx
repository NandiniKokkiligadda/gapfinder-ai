"use client";
import { useState } from "react";
import { api } from "@/lib/client";

export default function Login() {
  const [email, setEmail] = useState("demo@gapfinder.ai");
  const [password, setPassword] = useState("demo123");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { json: { email, password, name } });
      window.location.href = "/";
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <h1 style={{ fontSize: 30 }}>
        Gap<span style={{ color: "var(--brand)" }}>Finder</span> AI
      </h1>
      <p className="sub">Find what you don&apos;t know. Upload your material, get a diagnosis, follow a plan.</p>
      <form className="card" onSubmit={submit}>
        {mode === "register" && (
          <p>
            <input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%" }} />
          </p>
        )}
        <p>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%" }} required />
        </p>
        <p>
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%" }} required />
        </p>
        {err && <p className="err">{err}</p>}
        <button className="btn" disabled={busy} style={{ width: "100%" }}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
        <p className="small muted" style={{ textAlign: "center" }}>
          {mode === "login" ? (
            <>
              Demo login is pre-filled: <b>demo@gapfinder.ai</b> / <b>demo123</b>.{" "}
              <a href="#" onClick={(e) => (e.preventDefault(), setMode("register"), setEmail(""), setPassword(""))} style={{ textDecoration: "underline" }}>
                Create account
              </a>
            </>
          ) : (
            <a href="#" onClick={(e) => (e.preventDefault(), setMode("login"))} style={{ textDecoration: "underline" }}>
              Back to log in
            </a>
          )}
        </p>
      </form>
    </div>
  );
}
