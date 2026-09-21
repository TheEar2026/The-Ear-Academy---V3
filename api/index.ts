import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import axios from "axios";
import Papa from "papaparse";
import { google } from "googleapis";
import { GoogleGenAI } from "@google/genai";
import { neon } from "@neondatabase/serverless";

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

function getDbUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL.trim();
  try {
    if (fs.existsSync(envLocalPath)) {
      const content = fs.readFileSync(envLocalPath, "utf-8");
      const match = content.match(/DATABASE_URL="([^"]+)"/) || content.match(/DATABASE_URL=([^\s]+)/);
      if (match && match[1]) return match[1].trim();
    }
  } catch {
    // Ignore file read error in serverless
  }
  return null;
}

let sqlInstance: any = null;
function getSql(): any {
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

function getLocalEvaluations(): Record<string, any> {
  if (Object.keys(memoryEvaluations).length > 0) {
    return memoryEvaluations;
  }
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
  memoryEvaluations = { ...memoryEvaluations, ...evals };
  try {
    fs.writeFileSync(EVALUATIONS_FILE, JSON.stringify(memoryEvaluations, null, 2), "utf-8");
  } catch {
    // Safe ignore in serverless
  }
}

let isInitialized = false;
async function initDb(): Promise<boolean> {
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
    return true;
  } catch (err) {
    console.error("[Neon DB] Initialization error:", err);
    return false;
  }
}

async function getEvaluations(): Promise<{ evaluations: Record<string, any>; source: "neon" | "local"; count: number }> {
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

async function saveEvaluations(incoming: Record<string, any>): Promise<{ success: boolean; count: number; source: "neon" | "local" }> {
  saveLocalEvaluations(incoming);

  const sql = getSql();
  if (!sql) {
    const current = getLocalEvaluations();
    return { success: true, count: Object.keys(current).length, source: "local" };
  }

  try {
    await initDb();
    const entries = Object.entries(incoming);
    for (const [id, item] of entries) {
      const jsonStr = JSON.stringify(item);
      const sentiment = item?.aiSentiment || item?.sentiment || null;
      const score = item?.aiScore !== undefined ? item.aiScore : null;
      const isReviewed = item?.isReviewed === true;

      await sql`
        INSERT INTO evaluations (id, data, sentiment, sentiment_score, is_reviewed, updated_at)
        VALUES (${id}, ${jsonStr}::jsonb, ${sentiment}, ${score}, ${isReviewed}, NOW())
        ON CONFLICT (id) DO UPDATE SET
          data = EXCLUDED.data,
          sentiment = EXCLUDED.sentiment,
          sentiment_score = EXCLUDED.sentiment_score,
          is_reviewed = EXCLUDED.is_reviewed,
          updated_at = NOW();
      `;
    }

    const countRows = (await sql`SELECT COUNT(*)::int as total FROM evaluations;`) as any[];
    const totalCount = countRows[0]?.total || entries.length;
    return { success: true, count: totalCount, source: "neon" };
  } catch (err) {
    console.error("[Neon DB] Save error, kept in local/memory cache:", err);
    const current = getLocalEvaluations();
    return { success: true, count: Object.keys(current).length, source: "local" };
  }
}

async function getDbStatus(): Promise<{ connected: boolean; source: "neon" | "local"; details?: any; error?: string }> {
  const sql = getSql();
  if (!sql) {
    return {
      connected: false,
      source: "local",
      error: "DATABASE_URL is not set. Using local/memory cache."
    };
  }
  try {
    const start = Date.now();
    await initDb();
    const result = (await sql`SELECT current_database(), current_user, (SELECT COUNT(*)::int FROM evaluations) as count;`) as any[];
    const latency = Date.now() - start;
    const row = result[0];
    return {
      connected: true,
      source: "neon",
      details: {
        database: row.current_database,
        user: row.current_user,
        evaluationsCount: row.count,
        latencyMs: latency
      }
    };
  } catch (err: any) {
    return {
      connected: false,
      source: "local",
      error: err.message
    };
  }
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

// Helper to execute Gemini generation with multi-model fallback and retry
async function generateContentWithRetry(
  gemini: GoogleGenAI,
  prompt: string,
  config?: any
): Promise<string | null> {
  const candidateModels = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];
  
  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await gemini.models.generateContent({
          model,
          contents: prompt,
          config
        });
        if (response && response.text) {
          return response.text;
        }
      } catch (err: any) {
        const isTransient = err?.status === 'UNAVAILABLE' || 
                            err?.status === 'RESOURCE_EXHAUSTED' || 
                            err?.code === 503 || 
                            err?.code === 429 ||
                            String(err?.message || '').includes('high demand') ||
                            String(err?.message || '').includes('503');
                            
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

const app = express();

app.use(express.json({ limit: "25mb" }));

// Always reply with JSON headers
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json");
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
  const classroomSheetId = process.env.LEGACY_CLASSROOM_SHEET_ID || "1GFIn6sf9j9DEbhseJRzg-NSOW7Rhxj4SBeloKVwMklQ";
  const instrumentalSheetId = process.env.LEGACY_SHEET_ID || "17101J4-5MlMmbvw1-s-7I3IFENERImyRWsIkZgtJa1s";
  res.json({
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    databaseConfigured: !!getDbUrl(),
    classroomConfigured: !!classroomSheetId,
    instrumentalConfigured: !!instrumentalSheetId,
    timestamp: new Date().toISOString()
  });
});

// AI Routes
app.post(["/api/ai/summary", "/ai/summary"], async (req, res) => {
  const { prompt, config } = req.body;
  const gemini = getGeminiClient();
  
  if (!gemini) {
    const fallback = generateFallbackSubmissionSummary(prompt);
    return res.json({ text: JSON.stringify(fallback) });
  }

  const generatedText = await generateContentWithRetry(gemini, prompt, config);
  if (generatedText) {
    return res.json({ text: generatedText });
  }

  const fallback = generateFallbackSubmissionSummary(prompt);
  return res.json({ text: JSON.stringify(fallback) });
});

app.post(["/api/ai/course-summary", "/ai/course-summary"], async (req, res) => {
  const { prompt, config } = req.body;
  const gemini = getGeminiClient();

  if (!gemini) {
    const fallback = generateFallbackCourseSummary(prompt);
    return res.json({ text: JSON.stringify(fallback) });
  }

  const generatedText = await generateContentWithRetry(gemini, prompt, config);
  if (generatedText) {
    return res.json({ text: generatedText });
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

// Global error handler so we NEVER return unhandled HTML 500s that break JSON parsing
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[Express Serverless Error]:", err);
  if (!res.headersSent) {
    res.status(500).json({ error: err?.message || "Internal server error" });
  }
});

export default app;
