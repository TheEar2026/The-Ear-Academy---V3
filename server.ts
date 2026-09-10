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

// Fallback heuristic for individual student submission with weighted scoring & aspects
function generateFallbackSubmissionSummary(prompt: string) {
  // Extract only the submission data portion if available, to avoid matching words in the classification guide
  let dataSection = prompt;
  if (prompt.includes("Submission Data:")) {
    dataSection = prompt.split("Submission Data:")[1] || prompt;
  }
  const lowercase = dataSection.toLowerCase();
  
  // 1. Rating factor (40% weight)
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

  // 2. Facet balance factor (30% weight)
  let facetFactor = 0.5; // default mild positive if clean
  if (lowercase.includes("i enjoyed all") || lowercase.includes("none") || lowercase.includes("n/a")) {
    facetFactor = 1.0;
  } else if (lowercase.includes("didn't enjoy") || lowercase.includes("felt lost") || lowercase.includes("felt off")) {
    facetFactor = -0.75;
  }

  // 3. Text tone / Confidence factor (30% weight)
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

  // Composite calculation
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
  // Ordered models to try: primary -> fast flash alias -> lightweight flash
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
          // Brief pause before retry
          await new Promise((resolve) => setTimeout(resolve, 600));
          continue; // Retry once on same model
        }
        // If transient failed twice or not transient, break to next candidate model
        break;
      }
    }
  }
  return null;
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
    const text = await generateContentWithRetry(gemini, prompt, config);
    if (text) {
      return res.json({ text, source: "gemini" });
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
    const text = await generateContentWithRetry(gemini, prompt, config);
    if (text) {
      return res.json({ text, source: "gemini" });
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
