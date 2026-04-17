import express from "express";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import Papa from "papaparse";
import { google } from "googleapis";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// Initialize AI lazily or safely
let ai: any = null;
try {
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
} catch (e) {
  console.error("AI Initialization failed:", e);
}

const app = express();
const PORT = 3000;

app.use(express.json());

// API Route to fetch Google Sheets data
app.get("/api/data/:type?", async (req, res) => {
  const type = req.params.type || 'current';
  const sheetId = type === 'legacy' ? process.env.LEGACY_SHEET_ID : process.env.GOOGLE_SHEET_ID;

  if (!sheetId) {
    const demoData = type === 'current' ? [
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
    ] : [
      {
        "Timestamp": "2023-11-15T10:00:00Z",
        "School": "Old Town High",
        "ID": "LEG-001",
        "Customer": "Edward Norton",
        "Type": "Classroom",
        "Course Name": "Legacy Theory",
        "Rating": 4,
        "Please select any facet(s) you didn't enjoy": "",
        "Feedback": "Really enjoyable course. More confident now.",
        "What did you enjoy?": "The structured approach."
      }
    ];

    return res.json({ 
      data: demoData, 
      source: "demo", 
      type, 
      configured: false,
      message: "Using demo data because no Sheet ID is configured."
    });
  }

  try {
    let cleanSheetId = sheetId.trim();
    if (cleanSheetId.includes('/d/')) {
      cleanSheetId = cleanSheetId.split('/d/')[1].split('/')[0];
    }
    const csvUrl = `https://docs.google.com/spreadsheets/d/${cleanSheetId}/export?format=csv`;
    const response = await axios.get(csvUrl, { timeout: 15000 });
    let csvData = response.data;

    if (typeof csvData === 'string' && (csvData.includes('<!DOCTYPE html>') || csvData.includes('<html'))) {
      return res.status(403).json({
        error: `The ${type} Google Sheet is not public.`,
        setupRequired: true,
        configured: true
      });
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

    res.json({ data: parsed.data, source: "csv", type, configured: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message, configured: true });
  }
});

// API Route to check configuration status
app.get("/api/status", (req, res) => {
  res.json({
    currentConfigured: !!process.env.GOOGLE_SHEET_ID,
    legacyConfigured: !!process.env.LEGACY_SHEET_ID,
    writeConfigured: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    aiConfigured: !!process.env.GEMINI_API_KEY
  });
});

// AI Routes
app.post("/api/ai/summary", async (req, res) => {
  const { prompt, config } = req.body;
  
  if (!process.env.GEMINI_API_KEY || !ai) {
    console.log("[Server] Using simulated AI summary (No key)");
    const lowercasePrompt = prompt.toLowerCase();
    let sentiment = "NEUTRAL";
    let score = 50;
    let summary = "The student provided moderate feedback.";
    if (lowercasePrompt.includes("amazing") || lowercasePrompt.includes("loved")) {
      sentiment = "POSITIVE"; score = 95; summary = "Highly enthusiastic feedback.";
    } else if (lowercasePrompt.includes("confusing") || lowercasePrompt.includes("too hard")) {
      sentiment = "CRITICAL"; score = 25; summary = "Feedback mentions issues with complexity.";
    }
    return res.json({ text: JSON.stringify({ summary, sentiment, score, reasoning: "Simulated (API Key Missing)" }) });
  }

  try {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: config
    });
    res.json({ text: result.text });
  } catch (error: any) {
    console.error("[Server] AI Summary Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/ai/course-summary", async (req, res) => {
  const { prompt, config } = req.body;

  if (!process.env.GEMINI_API_KEY || !ai) {
    console.log("[Server] Using simulated course summary (No key)");
    return res.json({ text: JSON.stringify({ summary: "Simulated course summary generated because no AI key is provided.", improvements: ["Add more interactive quizzes", "Slow down the pace of Unit 2"] }) });
  }

  try {
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: config
    });
    res.json({ text: result.text });
  } catch (error: any) {
    console.error("[Server] AI Course Summary Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/update-sentiment", async (req: any, res: any) => {
  const { submissionId, sentiment, summary, type } = req.body;
  let sheetId = type === 'legacy' ? process.env.LEGACY_SHEET_ID : process.env.GOOGLE_SHEET_ID;
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccount || !sheetId) return res.status(400).json({ error: "Configuration missing." });

  try {
    if (sheetId.includes('/d/')) sheetId = sheetId.split('/d/')[1].split('/')[0];
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceAccount),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    const headerResponse = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: "A1:Z1" });
    const headers = headerResponse.data.values?.[0];
    if (!headers) throw new Error("Headers missing.");
    const idIndex = headers.findIndex(h => ["ID", "Submission ID"].some(s => h.toLowerCase().includes(s.toLowerCase())));
    const aiSentIdx = headers.findIndex(h => ["AI Sentiment"].some(s => h.toLowerCase().includes(s.toLowerCase())));
    const aiSumIdx = headers.findIndex(h => ["AI Summary"].some(s => h.toLowerCase().includes(s.toLowerCase())));
    const idResponse = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: `${String.fromCharCode(65 + idIndex)}:${String.fromCharCode(65 + idIndex)}` });
    const idColumn = idResponse.data.values;
    let rowIndex = -1;
    if (idColumn) rowIndex = idColumn.findIndex(row => String(row[0]) === String(submissionId)) + 1;
    if (rowIndex === 0) throw new Error("ID not found.");
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

// Production static serving (Only if NOT on Vercel)
// Vercel handles static serving via zero-config/vercel.json
if ((process.env.NODE_ENV === "production") && !process.env.VERCEL) {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Dev server and standalone listening
async function startServer() {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    // Dynamic import to avoid loading Vite in production lambda
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Dev] Server running on http://localhost:${PORT}`);
    });
  } else if (!process.env.VERCEL) {
    // Standalone production start
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Prod] Server running on http://localhost:${PORT}`);
    });
  }
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});

export default app;
