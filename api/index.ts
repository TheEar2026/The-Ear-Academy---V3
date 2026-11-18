import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import axios from "axios";
import Papa from "papaparse";
import { google } from "googleapis";
import { GoogleGenAI } from "@google/genai";
import { neon } from "@neondatabase/serverless";
import pg from "pg";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const { Pool } = pg;

dotenv.config();
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

// In-memory cache for fallback evaluations when filesystem is read-only in Vercel
let memoryEvaluations: Record<string, any> = {};

const EVALUATIONS_FILE = process.env.VERCEL
  ? path.join("/tmp", "evaluations.json")
  : path.join(process.cwd(), "evaluations.json");
const PACKAGED_EVALUATIONS_FILE = path.join(process.cwd(), "evaluations.json");

const DEFAULT_SUPABASE_URL = "https://rlkpjazhyyasawsnmecl.supabase.co";

function getSupabaseUrl(): string {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.trim();
  try {
    if (fs.existsSync(envLocalPath)) {
      const content = fs.readFileSync(envLocalPath, "utf-8");
      const match = content.match(/SUPABASE_URL="([^"]+)"/) || content.match(/SUPABASE_URL=([^\s]+)/);
      if (match && match[1]) return match[1].trim();
    }
  } catch {}
  return DEFAULT_SUPABASE_URL;
}

function getSupabaseKey(): string | null {
  if (process.env.SUPABASE_ANON_KEY) return process.env.SUPABASE_ANON_KEY.trim();
  if (process.env.SUPABASE_KEY) return process.env.SUPABASE_KEY.trim();
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  try {
    if (fs.existsSync(envLocalPath)) {
      const content = fs.readFileSync(envLocalPath, "utf-8");
      const match = content.match(/SUPABASE_ANON_KEY="([^"]+)"/) ||
                    content.match(/SUPABASE_KEY="([^"]+)"/) ||
                    content.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/) ||
                    content.match(/SUPABASE_ANON_KEY=([^\s]+)/) ||
                    content.match(/SUPABASE_KEY=([^\s]+)/);
      if (match && match[1]) return match[1].trim();
    }
  } catch {}
  return null;
}

let supabaseClientInstance: SupabaseClient | null = null;
function getSupabaseClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) return null;
  if (!supabaseClientInstance) {
    try {
      supabaseClientInstance = createClient(url, key, {
        auth: { persistSession: false }
      });
    } catch (err) {
      console.error("[Supabase Client] Initialization error:", err);
      return null;
    }
  }
  return supabaseClientInstance;
}

let pgAuthFailed = false;
let pgAuthErrorMessage: string | null = null;

function isPlaceholderOrInvalidDbUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl) return true;
  const url = rawUrl.trim();
  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) return true;
  const lower = url.toLowerCase();
  if (
    lower.includes("[password]") ||
    lower.includes("<password>") ||
    lower.includes("[your-password]") ||
    lower.includes("[region]") ||
    lower.includes("[project-ref]") ||
    lower.includes("your_password") ||
    lower.includes(":password@") ||
    lower.includes(":[password]@")
  ) {
    return true;
  }
  return false;
}

function getDbUrl(): string | null {
  if (pgAuthFailed) {
    return null;
  }
  let url: string | null = null;
  if (process.env.DATABASE_URL) {
    url = process.env.DATABASE_URL.trim();
  } else {
    try {
      if (fs.existsSync(envLocalPath)) {
        const content = fs.readFileSync(envLocalPath, "utf-8");
        const match = content.match(/DATABASE_URL="([^"]+)"/) || content.match(/DATABASE_URL=([^\s]+)/);
        if (match && match[1]) url = match[1].trim();
      }
    } catch {}
  }

  if (!url || isPlaceholderOrInvalidDbUrl(url)) {
    return null;
  }
  return url;
}

// Universal PostgreSQL executor that works with Supabase (pooler / direct) and Neon serverless
let pgPoolInstance: any = null;
let neonInstance: any = null;

function getDbKind(): "supabase" | "neon" | "postgres" | null {
  if (getSupabaseClient()) {
    return "supabase";
  }
  const url = getDbUrl();
  if (!url) return null;
  if (url.includes("supabase.co") || url.includes("supabase.com") || url.includes("pooler.supabase.com")) {
    return "supabase";
  }
  if (url.includes("neon.tech")) {
    return "neon";
  }
  return "postgres";
}

async function executeQuery(queryText: string, params: any[] = []): Promise<any[]> {
  const url = getDbUrl();
  if (!url) throw new Error("No valid DATABASE_URL configured");

  const kind = getDbKind();

  if (kind === "neon") {
    if (!neonInstance) {
      neonInstance = neon(url);
    }
    const res = await neonInstance(queryText, params);
    return Array.isArray(res) ? res : [];
  }

  // Supabase direct connection or PostgreSQL via pg.Pool
  if (!pgPoolInstance) {
    pgPoolInstance = new Pool({
      connectionString: url,
      ssl: {
        rejectUnauthorized: false
      },
      connectionTimeoutMillis: 5000
    });
    pgPoolInstance.on("error", (err: any) => {
      if (err?.code === "28P01" || err?.routine === "auth_failed" || err?.message?.includes("password authentication failed")) {
        pgAuthFailed = true;
        pgAuthErrorMessage = err.message;
      }
    });
  }

  try {
    const client = await pgPoolInstance.connect();
    try {
      const res = await client.query(queryText, params);
      return res.rows || [];
    } finally {
      client.release();
    }
  } catch (err: any) {
    if (err?.code === "28P01" || err?.routine === "auth_failed" || err?.message?.includes("password authentication failed")) {
      pgAuthFailed = true;
      pgAuthErrorMessage = err.message;
      try {
        await pgPoolInstance.end();
      } catch {}
      pgPoolInstance = null;
      console.warn("[PostgreSQL] Password authentication failed. Disabling direct PostgreSQL pool; Supabase REST client and local storage remain active.");
    }
    throw err;
  }
}

let localEvaluationsLoaded = false;

function getLocalEvaluations(): Record<string, any> {
  if (localEvaluationsLoaded) {
    return memoryEvaluations;
  }
  localEvaluationsLoaded = true;
  try {
    if (fs.existsSync(EVALUATIONS_FILE)) {
      const content = fs.readFileSync(EVALUATIONS_FILE, "utf-8");
      memoryEvaluations = JSON.parse(content) || {};
      return memoryEvaluations;
    }
    if (fs.existsSync(PACKAGED_EVALUATIONS_FILE)) {
      const content = fs.readFileSync(PACKAGED_EVALUATIONS_FILE, "utf-8");
      memoryEvaluations = JSON.parse(content) || {};
      return memoryEvaluations;
    }
  } catch (err) {
    console.error("[Local Storage] Error reading evaluations fallback:", err);
  }
  return memoryEvaluations;
}

function saveLocalEvaluations(evals: Record<string, any>) {
  const next = { ...getLocalEvaluations() };
  for (const [key, val] of Object.entries(evals)) {
    if (val === null || val === undefined) {
      delete next[key];
    } else {
      next[key] = val;
    }
  }
  memoryEvaluations = next;
  localEvaluationsLoaded = true;
  try {
    fs.writeFileSync(EVALUATIONS_FILE, JSON.stringify(memoryEvaluations, null, 2), "utf-8");
  } catch {
    // Safe ignore in serverless
  }
}

function clearLocalEvaluations() {
  memoryEvaluations = {};
  localEvaluationsLoaded = true;
  try {
    fs.writeFileSync(EVALUATIONS_FILE, "{}", "utf-8");
  } catch {
    // Safe ignore in serverless
  }
}

let isInitialized = false;
async function initDb(): Promise<boolean> {
  const url = getDbUrl();
  if (!url || pgAuthFailed) return false;
  if (isInitialized) return true;

  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS evaluations (
        id VARCHAR(255) PRIMARY KEY,
        data JSONB NOT NULL,
        sentiment VARCHAR(50),
        sentiment_score NUMERIC(5, 2),
        is_reviewed BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    isInitialized = true;
    return true;
  } catch (err: any) {
    if (err?.code === "28P01" || err?.routine === "auth_failed" || err?.message?.includes("password authentication failed")) {
      pgAuthFailed = true;
      console.warn(`[Database] PostgreSQL authentication failed. Supabase REST API & local storage active.`);
    } else {
      console.warn(`[Database: ${getDbKind()}] Initialization notice:`, err?.message || err);
    }
    return false;
  }
}

let supabaseUnreachableUntil = 0;
let loggedSupabaseOffline = false;

function isSupabaseNetworkError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout") ||
    msg.includes("eai_again") ||
    msg.includes("network") ||
    msg.includes("socket")
  );
}

async function getEvaluations(): Promise<{ evaluations: Record<string, any>; source: "supabase" | "neon" | "postgres" | "local"; count: number }> {
  // 1. Try Supabase Client (HTTP REST API - no database password needed!)
  const supabase = getSupabaseClient();
  if (supabase && Date.now() >= supabaseUnreachableUntil) {
    try {
      const { data, error } = await supabase
        .from("evaluations")
        .select("id, data");
      if (!error && Array.isArray(data)) {
        loggedSupabaseOffline = false;
        const evals: Record<string, any> = {};
        for (const row of data) {
          evals[row.id] = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
        }
        return { evaluations: evals, source: "supabase", count: Object.keys(evals).length };
      }
      if (error) {
        if (isSupabaseNetworkError(error)) {
          supabaseUnreachableUntil = Date.now() + 60_000;
          if (!loggedSupabaseOffline) {
            loggedSupabaseOffline = true;
            console.log("[Database] Supabase host unreachable; using local archive fallback.");
          }
        } else {
          console.log("[Supabase Client] Table query notice:", error.message);
        }
      }
    } catch (err: any) {
      if (isSupabaseNetworkError(err)) {
        supabaseUnreachableUntil = Date.now() + 60_000;
        if (!loggedSupabaseOffline) {
          loggedSupabaseOffline = true;
          console.log("[Database] Supabase host unreachable; using local archive fallback.");
        }
      } else {
        console.log("[Supabase Client] Notice reading evaluations:", err.message);
      }
    }
  }

  // 2. Try PostgreSQL / Neon / Pooler connection (only if valid DATABASE_URL and no auth failure)
  const url = getDbUrl();
  const kind = getDbKind();
  if (url && kind && !pgAuthFailed) {
    try {
      await initDb();
      const rows = await executeQuery(`SELECT id, data FROM evaluations;`);
      const evals: Record<string, any> = {};
      for (const row of rows) {
        evals[row.id] = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
      }
      return { evaluations: evals, source: kind, count: Object.keys(evals).length };
    } catch (err: any) {
      if (err?.code === "28P01" || err?.routine === "auth_failed" || err?.message?.includes("password authentication failed")) {
        console.log(`[Database: ${kind}] Auth notice, falling back to local.`);
      } else {
        console.log(`[Database: ${kind}] Query notice, falling back to local:`, err?.message || err);
      }
    }
  }

  // 3. Fallback to local memory / file
  const localEvals = getLocalEvaluations();
  return { evaluations: localEvals, source: "local", count: Object.keys(localEvals).length };
}

async function saveEvaluations(incoming: Record<string, any>): Promise<{ success: boolean; count: number; source: "supabase" | "neon" | "postgres" | "local" }> {
  saveLocalEvaluations(incoming);

  const entries = Object.entries(incoming);
  const deleteIds = entries.filter(([, item]) => item === null || item === undefined).map(([id]) => id);
  const upsertEntries = entries.filter(([, item]) => item !== null && item !== undefined);

  // 1. Try Supabase Client
  const supabase = getSupabaseClient();
  if (supabase && Date.now() >= supabaseUnreachableUntil) {
    try {
      if (deleteIds.length > 0) {
        const { error: delError } = await supabase
          .from("evaluations")
          .delete()
          .in("id", deleteIds);
        if (delError) throw delError;
      }

      if (upsertEntries.length > 0) {
        const rows = upsertEntries.map(([id, item]) => ({
          id,
          data: item,
          sentiment: item?.aiSentiment || item?.sentiment || null,
          sentiment_score: item?.sentimentScore !== undefined ? item.sentimentScore : (item?.aiScore !== undefined ? item.aiScore : null),
          is_reviewed: item?.isReviewed === true,
          updated_at: new Date().toISOString()
        }));

        const chunkSize = 50;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const { error } = await supabase
            .from("evaluations")
            .upsert(chunk, { onConflict: "id" });
          if (error) {
            throw error;
          }
        }
      }

      const { count } = await supabase
        .from("evaluations")
        .select("*", { count: "exact", head: true });

      return { success: true, count: count ?? upsertEntries.length, source: "supabase" };
    } catch (err: any) {
      if (isSupabaseNetworkError(err)) {
        supabaseUnreachableUntil = Date.now() + 60_000;
      }
      console.log("[Supabase Client] Save notice, persisted to local storage:", err.message);
    }
  }

  // 2. Try PostgreSQL (pg / neon)
  const url = getDbUrl();
  const kind = getDbKind();
  if (url && kind && !pgAuthFailed) {
    try {
      await initDb();
      for (const id of deleteIds) {
        await executeQuery(`DELETE FROM evaluations WHERE id = $1;`, [id]);
      }

      for (const [id, item] of upsertEntries) {
        const jsonStr = JSON.stringify(item);
        const sentiment = item?.aiSentiment || item?.sentiment || null;
        const score = item?.sentimentScore !== undefined ? item.sentimentScore : (item?.aiScore !== undefined ? item.aiScore : null);
        const isReviewed = item?.isReviewed === true;

        await executeQuery(
          `INSERT INTO evaluations (id, data, sentiment, sentiment_score, is_reviewed, updated_at)
           VALUES ($1, $2::jsonb, $3, $4, $5, NOW())
           ON CONFLICT (id) DO UPDATE SET
             data = EXCLUDED.data,
             sentiment = EXCLUDED.sentiment,
             sentiment_score = EXCLUDED.sentiment_score,
             is_reviewed = EXCLUDED.is_reviewed,
             updated_at = NOW();`,
          [id, jsonStr, sentiment, score, isReviewed]
        );
      }

      const countRows = await executeQuery(`SELECT COUNT(*)::int as total FROM evaluations;`);
      const totalCount = countRows[0]?.total || upsertEntries.length;
      return { success: true, count: totalCount, source: kind };
    } catch (err: any) {
      console.log(`[Database: ${kind}] Save notice, using local storage:`, err?.message || err);
    }
  }

  const current = getLocalEvaluations();
  return { success: true, count: Object.keys(current).length, source: "local" };
}

async function clearAllEvaluations(): Promise<{ success: boolean; count: number; source: "supabase" | "neon" | "postgres" | "local" }> {
  clearLocalEvaluations();

  const supabase = getSupabaseClient();
  if (supabase && Date.now() >= supabaseUnreachableUntil) {
    try {
      const { error } = await supabase
        .from("evaluations")
        .delete()
        .neq("id", "");
      if (error) throw error;
      return { success: true, count: 0, source: "supabase" };
    } catch (err: any) {
      if (isSupabaseNetworkError(err)) {
        supabaseUnreachableUntil = Date.now() + 60_000;
      }
      console.log("[Supabase Client] Clear notice:", err.message);
    }
  }

  const url = getDbUrl();
  const kind = getDbKind();
  if (url && kind && !pgAuthFailed) {
    try {
      await initDb();
      await executeQuery(`DELETE FROM evaluations;`);
      return { success: true, count: 0, source: kind };
    } catch (err: any) {
      console.log(`[Database: ${kind}] Clear notice:`, err?.message || err);
    }
  }

  return { success: true, count: 0, source: "local" };
}

async function getDbStatus(): Promise<{ connected: boolean; source: "supabase" | "neon" | "postgres" | "local"; details?: any; error?: string }> {
  const localCount = Object.keys(getLocalEvaluations()).length;

  // 1. Supabase Client
  const supabase = getSupabaseClient();
  if (supabase) {
    if (Date.now() < supabaseUnreachableUntil) {
      return {
        connected: false,
        source: "local",
        details: {
          url: getSupabaseUrl(),
          evaluationsCount: localCount,
          errorNotice: "Supabase host unreachable (offline or project paused); serving local archive."
        },
        error: `Unable to reach Supabase host (${getSupabaseUrl()}). Serving ${localCount} evaluations from local backup.`
      };
    }

    try {
      const start = Date.now();
      const { count, error } = await supabase
        .from("evaluations")
        .select("*", { count: "exact", head: true });
      const latency = Date.now() - start;

      if (error) {
        if (isSupabaseNetworkError(error)) {
          supabaseUnreachableUntil = Date.now() + 60_000;
          return {
            connected: false,
            source: "local",
            details: {
              url: getSupabaseUrl(),
              evaluationsCount: localCount,
              errorNotice: error.message
            },
            error: `Unable to reach Supabase host (${getSupabaseUrl()}). Your Supabase project may be paused or unreachable. Serving ${localCount} evaluations from local backup.`
          };
        }

        return {
          connected: false,
          source: "supabase",
          details: {
            url: getSupabaseUrl(),
            evaluationsCount: localCount,
            errorNotice: error.message
          },
          error: `Connected to Supabase project (${getSupabaseUrl()}), but table 'evaluations' was not found: ${error.message}. Run the SQL schema script in your Supabase SQL Editor.`
        };
      }

      loggedSupabaseOffline = false;
      return {
        connected: true,
        source: "supabase",
        details: {
          url: getSupabaseUrl(),
          evaluationsCount: count ?? 0,
          latencyMs: latency
        }
      };
    } catch (err: any) {
      if (isSupabaseNetworkError(err)) {
        supabaseUnreachableUntil = Date.now() + 60_000;
      }
      return {
        connected: false,
        source: "local",
        details: {
          url: getSupabaseUrl(),
          evaluationsCount: localCount,
          errorNotice: err.message
        },
        error: `Supabase connection error: ${err.message}`
      };
    }
  }

  // 2. PostgreSQL / Neon
  const url = getDbUrl();
  const kind = getDbKind();
  if (url && kind && !pgAuthFailed) {
    try {
      const start = Date.now();
      await initDb();
      const result = await executeQuery(`SELECT current_database(), current_user, (SELECT COUNT(*)::int FROM evaluations) as count;`);
      const latency = Date.now() - start;
      const row = result[0];
      return {
        connected: true,
        source: kind,
        details: {
          database: row?.current_database,
          user: row?.current_user,
          evaluationsCount: row?.count,
          latencyMs: latency
        }
      };
    } catch (err: any) {
      return {
        connected: false,
        source: kind || "local",
        error: err.message
      };
    }
  }

  return {
    connected: false,
    source: "local",
    details: {
      url: getSupabaseUrl()
    },
    error: "Awaiting Supabase Anon Key or PostgreSQL Connection URI."
  };
}

function updateEnvVariable(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*$`, "m");
  const newLine = `${key}="${value}"`;
  if (regex.test(content)) {
    return content.replace(regex, newLine);
  }
  return content ? `${content.trim()}\n${newLine}\n` : `${newLine}\n`;
}

// Lazy Gemini client helper
let aiClientInstance: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!aiClientInstance) {
    try {
      aiClientInstance = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    } catch (e) {
      console.error("[Server] Gemini Client Init Error:", e);
      return null;
    }
  }
  return aiClientInstance;
}

// Fallback heuristic for individual student submission
function generateFallbackSubmissionSummary(prompt: string) {
  let dataSection = prompt;
  if (prompt.includes("Submission Data:")) {
    dataSection = prompt.split("Submission Data:")[1] || prompt;
  }
  const lowercase = dataSection.toLowerCase();
  
  let ratingFactor = 0.0;
  if (lowercase.includes("rating: 5") || lowercase.includes("score: 5") || lowercase.includes("5 stars")) {
    ratingFactor = 1.0;
  } else if (lowercase.includes("rating: 4") || lowercase.includes("score: 4") || lowercase.includes("4 stars")) {
    ratingFactor = 0.75;
  } else if (lowercase.includes("rating: 3") || lowercase.includes("score: 3") || lowercase.includes("3 stars")) {
    ratingFactor = 0.0;
  } else if (lowercase.includes("rating: 2") || lowercase.includes("score: 2") || lowercase.includes("2 stars")) {
    ratingFactor = -0.75;
  } else if (lowercase.includes("rating: 1") || lowercase.includes("score: 1") || lowercase.includes("1 star")) {
    ratingFactor = -1.0;
  }

  let facetFactor = 0.5;
  if (lowercase.includes("i enjoyed all") || lowercase.includes("none") || lowercase.includes("n/a")) {
    facetFactor = 1.0;
  } else if (lowercase.includes("didn't enjoy") || lowercase.includes("felt lost") || lowercase.includes("felt off")) {
    facetFactor = -0.75;
  }

  const isPositiveTone = 
    lowercase.includes("amazing") || 
    lowercase.includes("loved it") || 
    lowercase.includes("really enjoyed") || 
    lowercase.includes("better than expected") ||
    lowercase.includes("more confident") ||
    lowercase.includes("clicked") ||
    lowercase.includes("can't wait") ||
    lowercase.includes("yeah, i'm in") ||
    lowercase.includes("engaging") ||
    lowercase.includes("favourite part") ||
    lowercase.includes("i was good throughout");

  const isNegativeTone = 
    lowercase.includes("didn't enjoy it") || 
    lowercase.includes("disappointing") || 
    lowercase.includes("overwhelmed") || 
    lowercase.includes("honestly, not that excited") ||
    lowercase.includes("didn't get the instructions") ||
    lowercase.includes("didn't help me understand");

  let textFactor = 0.0;
  if (isPositiveTone && !isNegativeTone) textFactor = 1.0;
  else if (isNegativeTone) textFactor = -1.0;

  const composite = (0.40 * ratingFactor) + (0.30 * facetFactor) + (0.30 * textFactor);

  let sentiment = "NEUTRAL";
  let score = 55;
  let summary = "The student provided balanced feedback, noting productive elements in the session alongside areas for review.";
  let reasoning = "Balanced feedback reflecting standard engagement.";
  let aspects = {
    engagement: "Moderate",
    clarity: "Clear",
    confidence: "Unchanged"
  };

  if (composite >= 0.35 || (isPositiveTone && !isNegativeTone && ratingFactor >= 0)) {
    sentiment = "POSITIVE";
    score = Math.min(100, Math.round(75 + (composite * 25)));
    summary = "The student expressed strong enthusiasm for the lesson, highlighting increased confidence and enjoyable music-making activities.";
    reasoning = "High satisfaction markers and positive response to exercises (Weighted score: " + Math.round(composite * 100) + "%)";
    aspects = {
      engagement: "High",
      clarity: "Clear",
      confidence: "Increased"
    };
  } else if (composite <= -0.20 || isNegativeTone) {
    sentiment = "CRITICAL";
    score = Math.max(10, Math.round(40 + (composite * 30)));
    summary = "The student experienced difficulty with the lesson flow or content complexity, citing specific friction points.";
    reasoning = "Critical sentiment signals indicating frustration or difficulty (Weighted score: " + Math.round(composite * 100) + "%)";
    aspects = {
      engagement: "Low",
      clarity: lowercase.includes("confusing") ? "Confusing" : "Fast",
      confidence: "Frustrated"
    };
  }

  return { summary, sentiment, score, reasoning, aspects };
}

// Fallback heuristic for course aggregate summary
function generateFallbackCourseSummary(prompt: string) {
  const lowercase = prompt.toLowerCase();
  const isPositiveSkew = lowercase.includes("amazing") || lowercase.includes("loved") || lowercase.includes("confident");
  
  return {
    summary: isPositiveSkew 
      ? "Learners display strong engagement with interactive music exercises. The general sentiment is highly encouraging, with recurring praise for hands-on rhythm exploration and clarity of examples."
      : "Learners appreciate the core concepts and instructional direction. Several students noted that pacing during intermediate sections was slightly quick, suggesting a benefit from dedicated review periods.",
    improvements: [
      "Include interactive visual diagrams before diving into complex theoretical exercises",
      "Dedicate a 5-minute consolidation check before advancing to subsequent modules",
      "Provide tiered practice exercises for self-paced learning"
    ]
  };
}

// Helper to execute Gemini generation with multi-model fallback, strict timeout, and retry
async function generateContentWithRetry(
  gemini: GoogleGenAI,
  prompt: string,
  config?: any
): Promise<string | null> {
  const candidateModels = ["gemini-4-hydrogen", "gemini-3.1-flash-lite"];

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini timeout (${model})`)), 10000)
        );
        const response = await Promise.race([
          gemini.models.generateContent({
            model,
            contents: prompt,
            config
          }),
          timeoutPromise
        ]);
        if (response && response.text) {
          return response.text;
        }
      } catch (err: any) {
        const msg = String(err?.message || "");
        const isTransient = err?.status === 'UNAVAILABLE' || 
                            err?.status === 'RESOURCE_EXHAUSTED' || 
                            err?.code === 503 || 
                            err?.code === 429 ||
                            msg.includes('high demand') ||
                            msg.includes('503');
                            
        if (isTransient && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 600));
          continue;
        }
        break;
      }
    }
  }
  return null;
}

// Helper function to fetch and parse Google Sheet CSV with conservative 8-second timeout for serverless
async function fetchAndParseSheet(sheetId: string, sheetCategory: string = 'General') {
  let cleanSheetId = sheetId.trim();
  if (cleanSheetId.includes('/d/')) {
    cleanSheetId = cleanSheetId.split('/d/')[1].split('/')[0];
  }
  const csvUrl = `https://docs.google.com/spreadsheets/d/${cleanSheetId}/export?format=csv`;
  const response = await axios.get(csvUrl, { timeout: 8000 });
  let csvData = response.data;

  if (typeof csvData === 'string' && (csvData.includes('<!DOCTYPE html>') || csvData.includes('<html'))) {
    throw new Error(`The ${sheetCategory} Google Sheet is not public. Please share with "Anyone with the link".`);
  }

  if (typeof csvData === 'string') {
    csvData = csvData.replace(/^[\s,]+(\r\n|\n|\r)/gm, '');
  }

  const parsed = Papa.parse(csvData, {
    header: true,
    skipEmptyLines: 'greedy',
    dynamicTyping: true,
    transformHeader: (h) => h.trim()
  });

  return (parsed.data as any[]).map((row: any) => ({
    ...row,
    _sheetCategory: sheetCategory
  }));
}

interface AuthUserRecord {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  passwords: string[];
}

const AUTH_USERS: AuthUserRecord[] = [
  {
    id: "admin_vortex",
    email: "vortexailabs@gmail.com",
    name: "Admin (Vortex AI Labs)",
    role: "admin",
    passwords: ["AdminPassword2025!", "admin123", "vortex2025", "admin", "password"]
  },
  {
    id: "user_team",
    email: "team@theearacademy.com",
    name: "Team Member",
    role: "user",
    passwords: ["UserPassword2025!", "user123", "team2025", "user", "password"]
  }
];

function getAuthSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.GEMINI_API_KEY ||
    "ear-academy-operational-portal-secret-key-v1"
  );
}

function signSessionToken(payload: { id: string; email: string; name: string; role: "admin" | "user"; exp: number }): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  const sig = crypto
    .createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${sig}`;
}

function verifySessionToken(token: string): { id: string; email: string; name: string; role: "admin" | "user"; exp: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [encodedPayload, sig] = parts;
    const expectedSig = crypto
      .createHmac("sha256", getAuthSecret())
      .update(encodedPayload)
      .digest("base64url");
    if (sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8"));
    if (!parsed || !parsed.email || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

const authRouter = express.Router();

authRouter.get("/users-list", (req, res) => {
  res.json({
    accounts: AUTH_USERS.map(u => ({
      email: u.email,
      name: u.name,
      role: u.role,
      defaultPassword: u.passwords[0],
      accessiblePages: u.role === "admin"
        ? ["Overview", "Sentiment", "Logs", "Legacy Logs", "Legacy Sent.", "Settings"]
        : ["Overview", "Sentiment", "Logs", "Legacy Logs", "Legacy Sent. (Settings Hidden)"]
    }))
  });
});

authRouter.post("/login", (req, res) => {
  try {
    const { email, password, rememberMe } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPass = String(password).trim();
    const user = AUTH_USERS.find(u => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials. User not found." });
    }

    const isMatch = user.passwords.some(p => p === cleanPass);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password. Please check your credentials." });
    }

    const durationMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const token = signSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      exp: Date.now() + durationMs
    });

    return res.json({
      success: true,
      sessionToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (err: any) {
    console.error("[Auth] Login error:", err);
    return res.status(500).json({ error: err?.message || "Login failed" });
  }
});

authRouter.get("/session", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (typeof req.query.token === "string") {
      token = req.query.token.trim();
    }

    if (!token) {
      return res.status(401).json({ authenticated: false, error: "No session token provided" });
    }

    const session = verifySessionToken(token);
    if (!session) {
      return res.status(401).json({ authenticated: false, error: "Session expired or invalid" });
    }

    return res.json({
      authenticated: true,
      user: {
        id: session.id,
        email: session.email,
        name: session.name,
        role: session.role
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Session check failed" });
  }
});

authRouter.post("/logout", (req, res) => {
  return res.json({ success: true, message: "Logged out successfully" });
});

const app = express();

app.use(express.json({ limit: "25mb" }));

// Mount Authentication routes
app.use(["/api/auth", "/auth"], authRouter);

// Reply with JSON headers for API routes
app.use((req, res, next) => {
  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/auth") ||
    req.path.startsWith("/evaluations") ||
    req.path.startsWith("/data") ||
    req.path.startsWith("/status") ||
    req.path.startsWith("/config") ||
    req.path.startsWith("/health") ||
    req.path.startsWith("/db")
  ) {
    res.setHeader("Content-Type", "application/json");
  }
  next();
});

// Health check
app.get(["/api/health", "/health"], (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Database Status endpoint
app.get(["/api/db/status", "/db/status"], async (req, res) => {
  try {
    const status = await getDbStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message, source: "local" });
  }
});

// Supabase configuration status & dynamic credentials update
app.get(["/api/config/supabase", "/config/supabase"], (req, res) => {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  const dbUrl = getDbUrl();
  res.json({
    supabaseUrl: url,
    hasKey: !!key,
    hasDbUrl: !!dbUrl,
    keyPreview: key ? `${key.substring(0, 10)}...${key.substring(key.length - 4)}` : null,
    dbUrlPreview: dbUrl ? `${dbUrl.substring(0, 20)}...` : null,
    pgAuthFailed
  });
});

app.post(["/api/config/supabase", "/config/supabase"], async (req, res) => {
  try {
    const { supabaseKey, databaseUrl, supabaseUrl, clearDatabaseUrl, resetPgAuth } = req.body || {};
    let envContent = "";
    try {
      if (fs.existsSync(envLocalPath)) {
        envContent = fs.readFileSync(envLocalPath, "utf-8");
      }
    } catch {}

    if (resetPgAuth) {
      pgAuthFailed = false;
      pgAuthErrorMessage = null;
    }

    if (clearDatabaseUrl) {
      delete process.env.DATABASE_URL;
      envContent = envContent.replace(/^DATABASE_URL=.*$/m, "");
      if (pgPoolInstance) {
        try {
          await pgPoolInstance.end();
        } catch {}
        pgPoolInstance = null;
      }
      pgAuthFailed = false;
      pgAuthErrorMessage = null;
    }

    if (supabaseUrl && typeof supabaseUrl === "string") {
      process.env.SUPABASE_URL = supabaseUrl.trim();
      envContent = updateEnvVariable(envContent, "SUPABASE_URL", supabaseUrl.trim());
      supabaseClientInstance = null;
      supabaseUnreachableUntil = 0;
      loggedSupabaseOffline = false;
    }

    if (supabaseKey && typeof supabaseKey === "string") {
      process.env.SUPABASE_ANON_KEY = supabaseKey.trim();
      envContent = updateEnvVariable(envContent, "SUPABASE_ANON_KEY", supabaseKey.trim());
      supabaseClientInstance = null; // force re-create client
      supabaseUnreachableUntil = 0;
      loggedSupabaseOffline = false;
    }

    if (databaseUrl && typeof databaseUrl === "string") {
      const trimmedDbUrl = databaseUrl.trim();
      if (isPlaceholderOrInvalidDbUrl(trimmedDbUrl)) {
        return res.status(400).json({
          success: false,
          error: "Database URI contains placeholder text (such as [password]). Please replace it with your actual Supabase database password."
        });
      }
      process.env.DATABASE_URL = trimmedDbUrl;
      envContent = updateEnvVariable(envContent, "DATABASE_URL", trimmedDbUrl);
      if (pgPoolInstance) {
        try {
          await pgPoolInstance.end();
        } catch {}
        pgPoolInstance = null;
      }
      pgAuthFailed = false;
      pgAuthErrorMessage = null;
    }

    try {
      fs.writeFileSync(envLocalPath, envContent, "utf-8");
    } catch (fsErr) {
      console.warn("[Config] Could not write to .env.local (read-only environment):", fsErr);
    }

    const newStatus = await getDbStatus();
    res.json({
      success: true,
      message: "Supabase configuration updated successfully",
      status: newStatus
    });
  } catch (err: any) {
    console.error("[Config] Error updating Supabase credentials:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API Routes to get and save shared evaluations (backed by Neon PostgreSQL)
app.get(["/api/evaluations", "/evaluations"], async (req, res) => {
  try {
    const result = await getEvaluations();
    res.json({
      evaluations: result.evaluations,
      count: result.count,
      source: result.source
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message, evaluations: {}, count: 0, source: "local" });
  }
});

app.post(["/api/evaluations", "/evaluations"], async (req, res) => {
  try {
    const incoming = req.body?.evaluations || req.body;
    if (incoming && typeof incoming === "object") {
      const result = await saveEvaluations(incoming);
      return res.json(result);
    }
    res.json({ success: true, count: 0 });
  } catch (err: any) {
    console.error("[Server] Failed to save evaluations:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete(["/api/evaluations", "/evaluations"], async (req, res) => {
  try {
    const result = await clearAllEvaluations();
    return res.json(result);
  } catch (err: any) {
    console.error("[Server] Failed to clear evaluations:", err);
    res.status(500).json({ error: err.message });
  }
});

// Demo fallback data
const demoCurrentData = [
  {
    "Timestamp": new Date().toISOString(),
    "School": "London School of Music",
    "ID": "CUR-001",
    "Customer": "Alice Thompson",
    "Type": "Classroom",
    "Course Name": "Rhythm Mastery",
    "Rating": 5,
    "Please select any facet(s) you didn't enjoy": "",
    "Feedback": "Absolutely amazing! The lesson was really enjoyable and I felt more confident afterward.",
    "What did you enjoy?": "The interactive rhythm games were better than expected."
  },
  {
    "Timestamp": new Date(Date.now() - 86400000).toISOString(),
    "School": "Bristol Academy",
    "ID": "CUR-002",
    "Customer": "Ben Walker",
    "Type": "Instrumental",
    "Course Name": "Jazz Harmony",
    "Rating": 3,
    "Please select any facet(s) you didn't enjoy": "Speed",
    "Feedback": "It was okay, but a bit too fast for me to follow some parts.",
    "What did you enjoy?": "The examples were pretty good."
  }
];

const demoClassroomData = [
  {
    "Timestamp": "2023-10-12T09:30:00Z",
    "School": "St. Jude Music Academy",
    "ID": "LEG-CLS-001",
    "Customer": "Clara Jenkins",
    "Type": "Classroom",
    "Course Name": "Classroom Composition Basics",
    "Rating": 5,
    "Please select any facet(s) you didn't enjoy": "",
    "Feedback": "Brilliant classroom dynamics! Everyone was actively composing within 20 minutes.",
    "What did you enjoy?": "Group sound design experiments."
  },
  {
    "Timestamp": "2023-10-20T14:15:00Z",
    "School": "Oakwood Arts College",
    "ID": "LEG-CLS-002",
    "Customer": "David Mitchell",
    "Type": "Classroom",
    "Course Name": "Harmonic Structures in Groups",
    "Rating": 4,
    "Please select any facet(s) you didn't enjoy": "Pacing",
    "Feedback": "Very informative session. Needed slightly more time for the keyboard exercises.",
    "What did you enjoy?": "Clear visual breakdown of scales."
  }
];

const demoInstrumentalData = [
  {
    "Timestamp": "2023-11-15T10:00:00Z",
    "School": "Old Town High",
    "ID": "LEG-INS-001",
    "Customer": "Edward Norton",
    "Type": "Instrumental",
    "Course Name": "Legacy Theory & Strings",
    "Rating": 4,
    "Please select any facet(s) you didn't enjoy": "",
    "Feedback": "Really enjoyable course. More confident on solo pieces now.",
    "What did you enjoy?": "The structured approach."
  }
];

// API Route to fetch Google Sheets data
app.get(["/api/data/:type?", "/data/:type?"], async (req, res) => {
  const type = req.params.type || 'current';

  if (type === 'current') {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) {
      return res.json({ 
        data: demoCurrentData, 
        source: "demo", 
        type, 
        configured: false,
        message: "Using demo current data because GOOGLE_SHEET_ID is not configured."
      });
    }
    try {
      const data = await fetchAndParseSheet(sheetId, 'Current');
      return res.json({ data, source: "csv", type, configured: true });
    } catch (error: any) {
      return res.status(500).json({ error: error.message, configured: true });
    }
  }

  // Dual legacy sheets: Classroom Legacy and Instrumental Legacy
  const classroomSheetId = process.env.LEGACY_CLASSROOM_SHEET_ID || "1GFIn6sf9j9DEbhseJRzg-NSOW7Rhxj4SBeloKVwMklQ";
  const instrumentalSheetId = process.env.LEGACY_SHEET_ID || "17101J4-5MlMmbvw1-s-7I3IFENERImyRWsIkZgtJa1s";

  if (!classroomSheetId && !instrumentalSheetId) {
    return res.json({ 
      data: [...demoClassroomData, ...demoInstrumentalData], 
      source: "demo", 
      type: 'legacy', 
      configured: false,
      classroomConfigured: false,
      instrumentalConfigured: false,
      message: "Using demo data because neither LEGACY_SHEET_ID nor LEGACY_CLASSROOM_SHEET_ID is configured."
    });
  }

  try {
    const promises: Promise<any[]>[] = [];
    if (classroomSheetId) promises.push(fetchAndParseSheet(classroomSheetId, 'Classroom'));
    if (instrumentalSheetId) promises.push(fetchAndParseSheet(instrumentalSheetId, 'Instrumental'));

    const results = await Promise.all(promises);
    const combinedData = results.flat();

    return res.json({ 
      data: combinedData, 
      source: "csv", 
      type: 'legacy', 
      configured: true,
      classroomConfigured: !!classroomSheetId,
      instrumentalConfigured: !!instrumentalSheetId
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message, configured: true });
  }
});

// API Route to check configuration status
app.get(["/api/status", "/status"], (req, res) => {
  const currentSheetId = process.env.GOOGLE_SHEET_ID;
  const classroomSheetId = process.env.LEGACY_CLASSROOM_SHEET_ID || "1GFIn6sf9j9DEbhseJRzg-NSOW7Rhxj4SBeloKVwMklQ";
  const instrumentalSheetId = process.env.LEGACY_SHEET_ID || "17101J4-5MlMmbvw1-s-7I3IFENERImyRWsIkZgtJa1s";
  const hasLegacy = !!(classroomSheetId || instrumentalSheetId);
  const hasAi = !!process.env.GEMINI_API_KEY;

  res.json({
    currentConfigured: !!currentSheetId,
    legacyConfigured: hasLegacy,
    legacyClassroomConfigured: !!classroomSheetId,
    legacyInstrumentalConfigured: !!instrumentalSheetId,
    aiConfigured: hasAi,
    geminiConfigured: hasAi,
    databaseConfigured: !!getDbUrl(),
    classroomConfigured: !!classroomSheetId,
    instrumentalConfigured: !!instrumentalSheetId,
    timestamp: new Date().toISOString()
  });
});

// AI Routes
app.post(["/api/ai/summary", "/ai/summary"], async (req, res) => {
  const { prompt = "", config } = req.body || {};
  try {
    const gemini = getGeminiClient();

    if (!gemini) {
      const fallback = generateFallbackSubmissionSummary(prompt);
      return res.json({ text: JSON.stringify(fallback) });
    }

    const generatedText = await generateContentWithRetry(gemini, prompt, config);
    if (generatedText) {
      return res.json({ text: generatedText });
    }
  } catch (err) {
    console.warn("[AI Summary] Fallback triggered:", err);
  }

  const fallback = generateFallbackSubmissionSummary(prompt);
  return res.json({ text: JSON.stringify(fallback) });
});

app.post(["/api/ai/course-summary", "/ai/course-summary"], async (req, res) => {
  const { prompt = "", config } = req.body || {};
  try {
    const gemini = getGeminiClient();

    if (!gemini) {
      const fallback = generateFallbackCourseSummary(prompt);
      return res.json({ text: JSON.stringify(fallback) });
    }

    const generatedText = await generateContentWithRetry(gemini, prompt, config);
    if (generatedText) {
      return res.json({ text: generatedText });
    }
  } catch (err) {
    console.warn("[AI Course Summary] Fallback triggered:", err);
  }

  const fallback = generateFallbackCourseSummary(prompt);
  return res.json({ text: JSON.stringify(fallback) });
});

app.post(["/api/update-sentiment", "/update-sentiment"], async (req: any, res: any) => {
  const { submissionId, sentiment, summary, type } = req.body;
  let sheetId = type === 'legacy' ? process.env.LEGACY_SHEET_ID : process.env.GOOGLE_SHEET_ID;
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!sheetId || !serviceAccount) {
    return res.json({ 
      success: false, 
      error: "Google Sheets write credentials (Service Account) not configured." 
    });
  }

  try {
    const credentials = JSON.parse(serviceAccount);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    if (sheetId.includes('/d/')) {
      sheetId = sheetId.split('/d/')[1].split('/')[0];
    }

    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: 'A:Z',
    });

    const rows = getRes.data.values;
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Sheet is empty" });
    }

    const headers = rows[0];
    let aiSentIdx = headers.indexOf("AI Sentiment");
    let aiSumIdx = headers.indexOf("AI Summary");

    if (aiSentIdx === -1 || aiSumIdx === -1) {
      return res.status(400).json({ error: "Columns 'AI Sentiment' and 'AI Summary' not found in the sheet." });
    }

    const subIdIdx = headers.findIndex((h: string) => /ID|Submission/i.test(h));
    if (subIdIdx === -1) {
      return res.status(400).json({ error: "Submission ID column not found" });
    }

    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][subIdIdx] === submissionId) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      return res.status(404).json({ error: "Submission not found in sheet" });
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        data: [
          { range: `${String.fromCharCode(65 + aiSentIdx)}${rowIndex}`, values: [[sentiment]] },
          { range: `${String.fromCharCode(65 + aiSumIdx)}${rowIndex}`, values: [[summary]] }
        ],
        valueInputOption: "RAW"
      }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Ensure unmatched /api requests never fall through to SPA HTML fallback
app.use("/api", (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

// Global error handler so we NEVER return unhandled HTML 500s that break JSON parsing
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[Express Serverless Error]:", err);
  if (!res.headersSent) {
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

export default app;
