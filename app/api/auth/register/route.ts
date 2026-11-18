import bcrypt from "bcryptjs";
import { q } from "@/lib/db";
import { handle, startSession, HttpError } from "@/lib/auth";

export const POST = handle(async (req) => {
  const { email, password, name } = await req.json();
  const e = String(email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(e)) throw new HttpError(400, "Enter a valid email.");
  if (String(password || "").length < 6) throw new HttpError(400, "Password must be at least 6 characters.");
  const exists = await q(`select 1 from users where email=$1`, [e]);
  if (exists.length) throw new HttpError(409, "That email is already registered.");
  const hash = await bcrypt.hash(String(password), 10);
  const r = await q<{ id: number }>(`insert into users (email,name,password_hash) values ($1,$2,$3) returning id`, [e, String(name || e.split("@")[0]), hash]);
  await startSession(r[0].id);
  return { ok: true };
});
