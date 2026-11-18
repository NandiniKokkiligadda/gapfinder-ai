import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

export const DEMO_EMAIL = "demo@gapfinder.ai";
export const DEMO_PASSWORD = "demo123";

let _sql: ReturnType<typeof neon> | null = null;
function client() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set. Add your Neon connection string to the environment.");
    _sql = neon(url);
  }
  return _sql;
}

const SCHEMA = [
  `create table if not exists users (
    id serial primary key,
    email text unique not null,
    name text not null,
    password_hash text not null,
    created_at timestamptz default now()
  )`,
  `create table if not exists documents (
    id serial primary key,
    user_id int not null references users(id) on delete cascade,
    kind text not null,
    filename text not null,
    created_at timestamptz default now()
  )`,
  `create table if not exists chunks (
    id serial primary key,
    user_id int not null references users(id) on delete cascade,
    document_id int not null references documents(id) on delete cascade,
    idx int not null,
    section text not null,
    page int,
    text text not null,
    topic_id int
  )`,
  `create index if not exists chunks_user_idx on chunks(user_id)`,
  `create table if not exists topics (
    id serial primary key,
    user_id int not null references users(id) on delete cascade,
    name text not null,
    subtopics jsonb not null default '[]',
    keywords jsonb not null default '[]',
    position int not null default 0,
    exam_count int not null default 0
  )`,
  `create table if not exists paper_questions (
    id serial primary key,
    user_id int not null references users(id) on delete cascade,
    text text not null,
    topic_id int references topics(id) on delete set null,
    chunk_id int
  )`,
  `create table if not exists attempts (
    id serial primary key,
    user_id int not null references users(id) on delete cascade,
    status text not null default 'open',
    correct int not null default 0,
    total int not null default 0,
    created_at timestamptz default now()
  )`,
  `create table if not exists attempt_answers (
    id serial primary key,
    attempt_id int not null references attempts(id) on delete cascade,
    topic_id int not null references topics(id) on delete cascade,
    subtopic text,
    question text not null,
    options jsonb not null,
    correct_index int not null,
    chosen_index int,
    is_correct boolean,
    citation text not null,
    evidence text,
    explanation text
  )`,
  `create table if not exists topic_results (
    attempt_id int not null references attempts(id) on delete cascade,
    topic_id int not null references topics(id) on delete cascade,
    correct int not null,
    total int not null,
    reason text,
    primary key (attempt_id, topic_id)
  )`,
  `create table if not exists topic_notes (
    user_id int not null references users(id) on delete cascade,
    topic_id int not null references topics(id) on delete cascade,
    note text not null,
    primary key (user_id, topic_id)
  )`,
  `create table if not exists settings (
    user_id int primary key references users(id) on delete cascade,
    days int not null default 5,
    hours_per_day real not null default 2
  )`,
];

let ready: Promise<void> | null = null;
export function ensureSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const sql = client();
      for (const stmt of SCHEMA) await sql.query(stmt);
      const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
      await sql.query(
        `insert into users (email, name, password_hash) values ($1, $2, $3) on conflict (email) do nothing`,
        [DEMO_EMAIL, "Demo Student", hash]
      );
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

/** Run a parameterised query (creates the schema and demo user on first use). */
export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  await ensureSchema();
  return (await client().query(text, params)) as unknown as T[];
}
