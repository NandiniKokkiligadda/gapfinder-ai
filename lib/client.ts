"use client";

export async function api<T = any>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const opts: RequestInit = { ...init };
  if (init?.json !== undefined) {
    opts.method = opts.method || "POST";
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(init.json);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== "undefined") window.location.href = "/login";
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const pct = (m: number | null) => (m === null ? "—" : `${Math.round(m * 100)}%`);

export const COLOR = { weak: "var(--weak)", medium: "var(--med)", strong: "var(--strong)", untested: "var(--muted)" } as const;
export const LABEL = { weak: "🔴 Weak", medium: "🟡 Medium", strong: "🟢 Strong", untested: "⚪ Untested" } as const;
