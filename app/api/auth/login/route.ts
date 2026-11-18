import bcrypt from "bcryptjs";
import { q } from "@/lib/db";
import { handle, startSession, HttpError } from "@/lib/auth";

export const POST = handle(async (req) => {
  const { email, password } = await req.json();
  const rows = await q<any>(`select id, email, name, password_hash from users where email=$1`, [String(email || "").trim().toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(String(password || ""), u.password_hash))) throw new HttpError(401, "Wrong email or password.");
  await startSession(u.id);
  return { ok: true, name: u.name };
});
