import express from "express";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import Papa from "papaparse";
import { google } from "googleapis";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

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
  const lowercase = prompt.toLowerCase();
  
  const isPositive = lowercase.includes("amazing") || 
                     lowercase.includes("loved it") || 
                     lowercase.includes("really enjoyed") || 
                     lowercase.includes("better than expected") ||
                     lowercase.includes("more confident") ||
                     lowercase.includes("clicked") ||
                     lowercase.includes("5 stars") ||
                     lowercase.includes("rating: 5") ||
                     lowercase.includes("rating: 4");
                     
  const isNegative = lowercase.includes("confusing") || 
                     lowercase.includes("too hard") || 
                     lowercase.includes("didn't enjoy") || 
                     lowercase.includes("disappointing") || 
                     lowercase.includes("overwhelmed") ||
                     lowercase.includes("too fast") ||
                     lowercase.includes("rating: 1") ||
                     lowercase.includes("rating: 2");

  let sentiment = "NEUTRAL";
  let score = 55;
  let summary = "The student provided balanced feedback, noting productive elements in the session alongside areas needing pacing clarity.";
  let reasoning = "Balanced feedback reflecting standard engagement with minor points for adjustment.";

  if (isPositive && !isNegative) {
    sentiment = "POSITIVE";
    score = 92;
    summary = "The student expressed strong enthusiasm for the lesson, highlighting increased confidence and enjoyable music-making activities.";
    reasoning = "High satisfaction markers and positive response to exercises.";
  } else if (isNegative) {
    sentiment = "CRITICAL";
    score = 28;
    summary = "The student experienced difficulty with the lesson flow or content complexity, citing specific friction points that impacted their learning.";
    reasoning = "Critical sentiment signals indicating frustration or excessive difficulty.";
  }

  return { summary, sentiment, score, reasoning };
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

const app = express();
const PORT = 3000;

app.use(express.json());

// Helper function to fetch and parse Google Sheet CSV
async function fetchAndParseSheet(sheetId: string, sheetCategory: string = 'General') {
  let cleanSheetId = sheetId.trim();
  if (cleanSheetId.includes('/d/')) {
    cleanSheetId = cleanSheetId.split('/d/')[1].split('/')[0];
  }
  const csvUrl = `https://docs.google.com/spreadsheets/d/${cleanSheetId}/export?format=csv`;
  const response = await axios.get(csvUrl, { timeout: 15000 });
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

// API Route to fetch Google Sheets data
app.get("/api/data/:type?", async (req, res) => {
  const type = req.params.type || 'current';

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
app.get("/api/status", (req, res) => {
  const classroomSheetId = process.env.LEGACY_CLASSROOM_SHEET_ID || "1GFIn6sf9j9DEbhseJRzg-NSOW7Rhxj4SBeloKVwMklQ";
  const instrumentalSheetId = process.env.LEGACY_SHEET_ID || "17101J4-5MlMmbvw1-s-7I3IFENERImyRWsIkZgtJa1s";
  res.json({
    currentConfigured: !!process.env.GOOGLE_SHEET_ID,
    legacyConfigured: !!classroomSheetId || !!instrumentalSheetId,
    legacyInstrumentalConfigured: !!instrumentalSheetId,
    legacyClassroomConfigured: !!classroomSheetId,
    writeConfigured: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    aiConfigured: !!process.env.GEMINI_API_KEY
  });
});

// AI Routes
app.post("/api/ai/summary", async (req, res) => {
  const { prompt, config } = req.body;
  const gemini = getGeminiClient();
  
  if (gemini) {
    try {
      const result = await gemini.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: config
      });
      if (result && result.text) {
        return res.json({ text: result.text, source: "gemini" });
      }
    } catch (error: any) {
      console.warn("[Server] Gemini API summary call encountered an issue, serving fallback:", error?.message || error);
    }
  }

  // Graceful heuristic fallback
  const fallback = generateFallbackSubmissionSummary(prompt || "");
  return res.json({ 
    text: JSON.stringify(fallback),
    source: "heuristic",
    note: "Generated via local heuristic rule engine"
  });
});

app.post("/api/ai/course-summary", async (req, res) => {
  const { prompt, config } = req.body;
  const gemini = getGeminiClient();

  if (gemini) {
    try {
      const result = await gemini.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
        config: config
      });
      if (result && result.text) {
        return res.json({ text: result.text, source: "gemini" });
      }
    } catch (error: any) {
      console.warn("[Server] Gemini API course summary call encountered an issue, serving fallback:", error?.message || error);
    }
  }

  // Graceful heuristic fallback
  const fallback = generateFallbackCourseSummary(prompt || "");
  return res.json({ 
    text: JSON.stringify(fallback),
    source: "heuristic",
    note: "Generated via local heuristic rule engine"
  });
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
