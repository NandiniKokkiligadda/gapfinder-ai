/**
 * GENERATION LAYER. The only place that talks to the LLM (Groq via the Vercel AI SDK).
 * Callers must pass already-retrieved SOURCES in the prompt; the system prompts forbid outside knowledge.
 */
import { createGroq } from "@ai-sdk/groq";
import { generateText, streamText } from "ai";
import { z } from "zod";

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
export const model = () => groq(process.env.GROQ_MODEL || "llama-3.3-70b-versatile");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let err: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      err = e;
      const msg = String(e?.message || e);
      if (!/429|rate.?limit|overloaded|503|timeout/i.test(msg)) throw e;
      const m = msg.match(/try again in ([\d.]+)s/i);
      await sleep(m ? Math.min(15000, Number(m[1]) * 1000 + 300) : 1500 * 2 ** i);
    }
  }
  throw err;
}

function extractJSON(text: string): unknown {
  const fenced = text.replace(/```json|```/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(fenced.slice(start, end + 1));
}

/**
 * Structured generation that works on any Groq model: ask for JSON, parse, validate with Zod,
 * and re-ask once with the validation error if the output is malformed.
 */
export async function generateJSON<S extends z.ZodTypeAny>(opts: {
  schema: S;
  system: string;
  prompt: string;
  shape: string; // human-readable JSON example shown to the model
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<z.infer<S>> {
  const system = `${opts.system}\n\nReturn ONLY one valid JSON object, no markdown, no commentary. Shape:\n${opts.shape}`;
  let prompt = opts.prompt;
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const { text } = await withRetry(() =>
      generateText({
        model: model(),
        system,
        prompt: lastErr ? `${prompt}\n\nYour previous reply was invalid (${lastErr}). Return corrected JSON only.` : prompt,
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxOutputTokens ?? 2000,
      })
    );
    try {
      return opts.schema.parse(extractJSON(text));
    } catch (e: any) {
      lastErr = String(e?.message || e).slice(0, 200);
    }
  }
  throw new Error("The AI returned malformed output repeatedly. Please try again.");
}

export function streamAnswer(system: string, prompt: string) {
  return streamText({ model: model(), system, prompt, temperature: 0.2, maxOutputTokens: 700 });
}

export const GROUNDING_RULES = `You are a study assistant that may use ONLY the text inside the SOURCES block. You have no other knowledge for this task. Never add facts, numbers, names or definitions that are not in the SOURCES. If the SOURCES do not contain what is needed, say so instead of guessing.`;
