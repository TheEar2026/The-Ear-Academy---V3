import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

// Load environment from .env and .env.local
dotenv.config();
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const EVALUATIONS_FILE = process.env.VERCEL
  ? path.join("/tmp", "evaluations.json")
  : path.join(process.cwd(), "evaluations.json");
const PACKAGED_EVALUATIONS_FILE = path.join(process.cwd(), "evaluations.json");

function getDbUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  if (fs.existsSync(envLocalPath)) {
    try {
      const content = fs.readFileSync(envLocalPath, "utf-8");
      const match = content.match(/DATABASE_URL="([^"]+)"/) || content.match(/DATABASE_URL=([^\s]+)/);
      if (match && match[1]) return match[1].trim();
    } catch {
      // ignore
    }
  }
  return null;
}

let sqlInstance: ReturnType<typeof neon> | null = null;
function getSql() {
  const url = getDbUrl();
  if (!url) return null;
  if (!sqlInstance) {
    try {
      sqlInstance = neon(url);
    } catch (e) {
      console.error("[Neon DB] Client initialization error:", e);
      return null;
    }
  }
  return sqlInstance;
}

// Local file fallback helpers
function getLocalEvaluations(): Record<string, any> {
  try {
    if (fs.existsSync(EVALUATIONS_FILE)) {
      const content = fs.readFileSync(EVALUATIONS_FILE, "utf-8");
      return JSON.parse(content) || {};
    }
    if (fs.existsSync(PACKAGED_EVALUATIONS_FILE)) {
      const content = fs.readFileSync(PACKAGED_EVALUATIONS_FILE, "utf-8");
      return JSON.parse(content) || {};
    }
  } catch (err) {
    console.error("[Local Storage] Error reading evaluations fallback:", err);
  }
  return {};
}

function saveLocalEvaluations(evals: Record<string, any>) {
  try {
    fs.writeFileSync(EVALUATIONS_FILE, JSON.stringify(evals, null, 2), "utf-8");
  } catch (err) {
    // In serverless read-only environments, this is expected if /tmp isn't used
    console.warn("[Local Storage] Notice: Could not persist local fallback file (harmless in serverless):", err);
  }
}

let isInitialized = false;
export async function initDb(): Promise<boolean> {
  const sql = getSql();
  if (!sql) return false;
  if (isInitialized) return true;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS evaluations (
        id VARCHAR(255) PRIMARY KEY,
        data JSONB NOT NULL,
        sentiment VARCHAR(50),
        sentiment_score NUMERIC(5, 2),
        is_reviewed BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    isInitialized = true;
    console.log("[Neon DB] Connected and evaluations table ready.");
    return true;
  } catch (err) {
    console.error("[Neon DB] Initialization error:", err);
    return false;
  }
}

// Fetch all evaluations
export async function getEvaluations(): Promise<{ evaluations: Record<string, any>; source: "neon" | "local"; count: number }> {
  const sql = getSql();
  if (sql) {
    try {
      await initDb();
      const rows = (await sql`SELECT id, data FROM evaluations;`) as any[];
      const evals: Record<string, any> = {};
      for (const row of rows) {
        evals[row.id] = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      }
      return { evaluations: evals, source: "neon", count: Object.keys(evals).length };
    } catch (err) {
      console.error("[Neon DB] Error reading evaluations from Neon, falling back to local:", err);
    }
  }
  const localEvals = getLocalEvaluations();
  return { evaluations: localEvals, source: "local", count: Object.keys(localEvals).length };
}

// Save or update evaluations
export async function saveEvaluations(incoming: Record<string, any>): Promise<{ success: boolean; count: number; source: "neon" | "local" }> {
  // Always update local cache file for offline redundancy
  const localCurrent = getLocalEvaluations();
  Object.entries(incoming).forEach(([id, val]) => {
    if (val === null) {
      delete localCurrent[id];
    } else if (typeof val === "object") {
      localCurrent[id] = { ...(localCurrent[id] || {}), ...(val as object) };
    }
  });
  saveLocalEvaluations(localCurrent);

  const sql = getSql();
  if (sql) {
    try {
      await initDb();
      for (const [id, val] of Object.entries(incoming)) {
        if (val === null) {
          await sql`DELETE FROM evaluations WHERE id = ${id};`;
        } else if (typeof val === "object") {
          const item = val as any;
          const sentiment = item.sentiment || item.aiSentiment || null;
          const sentimentScore = typeof item.sentimentScore === "number" ? item.sentimentScore : null;
          const isReviewed = Boolean(item.isReviewed);
          const dataJson = JSON.stringify(item);

          await sql`
            INSERT INTO evaluations (id, data, sentiment, sentiment_score, is_reviewed, updated_at)
            VALUES (${id}, ${dataJson}::jsonb, ${sentiment}, ${sentimentScore}, ${isReviewed}, NOW())
            ON CONFLICT (id) DO UPDATE SET
              data = evaluations.data || EXCLUDED.data,
              sentiment = COALESCE(EXCLUDED.sentiment, evaluations.sentiment),
              sentiment_score = COALESCE(EXCLUDED.sentiment_score, evaluations.sentiment_score),
              is_reviewed = COALESCE(EXCLUDED.is_reviewed, evaluations.is_reviewed),
              updated_at = NOW();
          `;
        }
      }

      const countRes = (await sql`SELECT COUNT(*)::int as count FROM evaluations;`) as any[];
      const count = countRes[0]?.count ?? Object.keys(localCurrent).length;
      return { success: true, count, source: "neon" };
    } catch (err) {
      console.error("[Neon DB] Failed to save evaluations to Neon:", err);
    }
  }

  return { success: true, count: Object.keys(localCurrent).length, source: "local" };
}

// Health and connection check
export async function getDbStatus(): Promise<{ connected: boolean; source: string; details?: any; error?: string }> {
  const sql = getSql();
  if (!sql) {
    return { connected: false, source: "local", error: "DATABASE_URL not configured" };
  }
  try {
    const startTime = Date.now();
    const result = (await sql`
      SELECT current_database() as db, current_user as user, version() as pg_version, NOW() as now;
    `) as any[];
    const countRes = (await sql`SELECT COUNT(*)::int as count FROM evaluations;`) as any[];
    const latencyMs = Date.now() - startTime;
    return {
      connected: true,
      source: "neon",
      details: {
        database: result[0]?.db,
        user: result[0]?.user,
        evaluationsCount: countRes[0]?.count,
        latencyMs,
      }
    };
  } catch (err: any) {
    return { connected: false, source: "local", error: err?.message || String(err) };
  }
}
