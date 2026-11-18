import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { q } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const COOKIE = "gf_session";
const secret = () => process.env.SESSION_SECRET || "dev-only-secret-change-me";
const sign = (v: string) => createHmac("sha256", secret()).update(v).digest("hex");

export async function startSession(userId: number) {
  const value = `${userId}.${sign(String(userId))}`;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export type User = { id: number; email: string; name: string };

export async function getUser(): Promise<User | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, sig] = raw.split(".");
  if (!id || !sig) return null;
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const rows = await q<User>("select id, email, name from users where id = $1", [Number(id)]);
  return rows[0] ?? null;
}

export async function requireUser(): Promise<User> {
  const u = await getUser();
  if (!u) throw new HttpError(401, "Please log in.");
  return u;
}

/** Wraps a route handler: JSON in/out, consistent error shape, friendly AI rate-limit message. */
export function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      const r = await fn(req);
      return r instanceof Response ? r : Response.json(r);
    } catch (e: any) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      const msg = String(e?.message || e);
      if (/429|rate.?limit/i.test(msg))
        return Response.json({ error: "The free AI quota is busy. Wait ~20 seconds and try again." }, { status: 429 });
      if (/GROQ_API_KEY|api key/i.test(msg))
        return Response.json({ error: "GROQ_API_KEY is missing or invalid on the server." }, { status: 500 });
      return Response.json({ error: msg.slice(0, 300) }, { status: 500 });
    }
  };
}
