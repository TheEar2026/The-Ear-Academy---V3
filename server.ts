import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import Papa from "papaparse";
import { google } from "googleapis";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const app = express();
const PORT = 3000;

app.use(express.json());

// API Route to fetch Google Sheets data
app.get("/api/data/:type?", async (req, res) => {
  const type = req.params.type || 'current';
  const sheetId = type === 'legacy' ? process.env.LEGACY_SHEET_ID : process.env.GOOGLE_SHEET_ID;

  console.log(`[Sync] Fetching ${type} data. Sheet ID: ${sheetId ? 'Present' : 'Missing'}`);

  if (!sheetId) {
    console.warn(`[Sync] ${type} Sheet ID is missing. Providing demo data.`);
    
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
      },
      {
        "Timestamp": new Date(Date.now() - 172800000).toISOString(),
        "School": "Manchester Arts",
        "ID": "CUR-003",
        "Customer": "Charlie Davis",
        "Type": "Classroom",
        "Course Name": "Ear Training 101",
        "Rating": 2,
        "Please select any facet(s) you didn't enjoy": "Instructions, Complexity",
        "Feedback": "Disappointing. I was overwhelmed and the instructions were confusing.",
        "What did you enjoy?": "The initial warm-up was alright."
      },
      {
        "Timestamp": new Date(Date.now() - 259200000).toISOString(),
        "School": "London School of Music",
        "ID": "CUR-004",
        "Customer": "Diana Prince",
        "Type": "Classroom",
        "Course Name": "Rhythm Mastery",
        "Rating": 5,
        "Please select any facet(s) you didn't enjoy": "",
        "Feedback": "Loved it! Like something clicked today. Can't wait for the next one.",
        "What did you enjoy?": "Everything was engaging and fun."
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
      },
      {
        "Timestamp": "2023-10-12T09:00:00Z",
        "School": "West Side Music",
        "ID": "LEG-002",
        "Customer": "Fiona Apple",
        "Type": "Instrumental",
        "Course Name": "Piano Grade 1",
        "Rating": 1,
        "Please select any facet(s) you didn't enjoy": "Everything",
        "Feedback": "Not really happy. Too hard and not what I expected.",
        "What did you enjoy?": "Nothing specific."
      }
    ];

    return res.json({ 
      data: demoData, 
      source: "demo", 
      type, 
      configured: false,
      message: "Using demo data because no Sheet ID is configured. Connect your Google Sheet in Settings."
    });
  }

  // CSV Export Method (Works for public sheets)
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
        error: `The ${type} Google Sheet is not public. Please set 'Anyone with the link can view' in the Share settings.`,
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

// API Route for individual submission AI summary
app.post("/api/ai/summary", async (req, res) => {
  const { prompt, config } = req.body;
  
  if (!process.env.GEMINI_API_KEY) {
    console.warn("[AI] GEMINI_API_KEY missing. Returning simulated response.");
    
    // Simple heuristic-based simulation for the individual summary
    const lowercasePrompt = prompt.toLowerCase();
    
    let sentiment = "NEUTRAL";
    let score = 50;
    let summary = "The student provided moderate feedback about their experience.";
    let reasoning = "Determined based on balanced keywords in the feedback (Simulated).";

    if (lowercasePrompt.includes("amazing") || lowercasePrompt.includes("loved") || lowercasePrompt.includes("excellent")) {
      sentiment = "POSITIVE";
      score = 95;
      summary = "The student is highly enthusiastic and loved the interactive elements of the course.";
    } else if (lowercasePrompt.includes("confusing") || lowercasePrompt.includes("too hard") || lowercasePrompt.includes("disappointing")) {
      sentiment = "CRITICAL";
      score = 25;
      summary = "The student expressed frustration with the complexity or instructions provided.";
    }

    const simulatedResult = {
      summary,
      sentiment,
      score,
      reasoning
    };

    return res.json({ text: JSON.stringify(simulatedResult) });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: config
    });
    res.json({ text: response.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API Route for course level AI summary
app.post("/api/ai/course-summary", async (req, res) => {
  const { prompt, config } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    console.warn("[AI] GEMINI_API_KEY missing. Returning simulated course summary.");
    
    const simulatedCourseResult = {
      summary: "Across all submissions, students generally show a high level of engagement, with occasional mentions of technical difficulty or pace. Most enjoy the interactive rhythm components (Simulated Summary).",
      improvements: [
        "Provide more introductory material for complex rhythm games",
        "Offer adjusted pacing options for different skill levels",
        "Enable more peer-to-peer feedback opportunities"
      ]
    };

    return res.json({ text: JSON.stringify(simulatedCourseResult) });
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: config
    });
    res.json({ text: response.text });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// API Route to update sentiment in Google Sheet
app.post("/api/update-sentiment", async (req: any, res: any) => {
  const { submissionId, sentiment, summary, type } = req.body;
  let sheetId = type === 'legacy' ? process.env.LEGACY_SHEET_ID : process.env.GOOGLE_SHEET_ID;
  const serviceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccount || !sheetId) {
    return res.status(400).json({ error: "Google Service Account or Sheet ID not configured for updates." });
  }

  try {
    if (sheetId.includes('/d/')) {
      sheetId = sheetId.split('/d/')[1].split('/')[0];
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceAccount),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "A1:Z1", 
    });

    const headers = headerResponse.data.values?.[0];
    if (!headers) throw new Error("Could not read headers from sheet.");

    const idIndex = headers.findIndex(h => ["Submission ID", "ID", "Ref"].some(s => h.toLowerCase().includes(s.toLowerCase())));
    const aiSentimentIndex = headers.findIndex(h => ["AI Sentiment", "Sentiment Label", "AI Tag"].some(s => h.toLowerCase().includes(s.toLowerCase())));
    const aiSummaryIndex = headers.findIndex(h => ["AI Summary", "Summary"].some(s => h.toLowerCase().includes(s.toLowerCase())));

    const idColChar = String.fromCharCode(65 + idIndex);
    const idResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${idColChar}:${idColChar}`,
    });

    const idColumn = idResponse.data.values;
    let rowIndex = -1;
    if (idColumn) {
      for (let i = 0; i < idColumn.length; i++) {
        if (String(idColumn[i][0]) === String(submissionId)) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (rowIndex === -1) throw new Error(`Submission ID '${submissionId}' not found in sheet.`);

    const updates = [
      { range: `${String.fromCharCode(65 + aiSentimentIndex)}${rowIndex}`, values: [[sentiment]] },
      { range: `${String.fromCharCode(65 + aiSummaryIndex)}${rowIndex}`, values: [[summary]] }
    ];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { data: updates, valueInputOption: "RAW" }
    });

    res.json({ success: true, rowIndex });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Middleware for serving frontend
async function main() {
  if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.NODE_ENV !== "production" || (process.env.SERVERLESS !== "1" && process.env.VERCEL !== "1")) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

main();

export default app;
