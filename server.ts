import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import Papa from "papaparse";
import { google } from "googleapis";

dotenv.config();

async function startServer() {
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
      // Sanitize sheetId in case the user pasted the full URL
      let cleanSheetId = sheetId.trim();
      if (cleanSheetId.includes('/d/')) {
        cleanSheetId = cleanSheetId.split('/d/')[1].split('/')[0];
      }
      console.log(`[Sync] Cleaned Sheet ID: ${cleanSheetId}`);

      const csvUrl = `https://docs.google.com/spreadsheets/d/${cleanSheetId}/export?format=csv`;
      console.log(`[Sync] Requesting CSV from: ${csvUrl}`);
      
      const response = await axios.get(csvUrl, { timeout: 15000 });
      console.log(`[Sync] Google responded with status: ${response.status}`);
      
      let csvData = response.data;

      // Check if the response is actually HTML (Google often returns a login page if not public)
      if (typeof csvData === 'string' && (csvData.includes('<!DOCTYPE html>') || csvData.includes('<html'))) {
        console.error(`[Sync] Received HTML instead of CSV for ${type}. Likely the sheet is not public.`);
        return res.status(403).json({
          error: `The ${type} Google Sheet is not public. Please set 'Anyone with the link can view' in the Share settings.`,
          setupRequired: true,
          configured: true
        });
      }

      // Pre-process CSV to remove leading empty lines which can break header detection
      if (typeof csvData === 'string') {
        csvData = csvData.replace(/^[\s,]+(\r\n|\n|\r)/gm, '');
      }

      const parsed = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: 'greedy',
        dynamicTyping: true,
        transformHeader: (h) => h.trim()
      });

      console.log(`[Sync] Parsed ${parsed.data.length} rows. First row keys: ${parsed.data.length > 0 ? Object.keys(parsed.data[0]).join(', ') : 'None'}`);

      if (parsed.errors.length > 0) {
        console.error("[Sync] CSV Parsing errors:", parsed.errors);
        if (parsed.data.length === 0) {
          return res.status(500).json({ 
            error: "Failed to parse spreadsheet data. Please check the sheet format.",
            details: parsed.errors,
            configured: true
          });
        }
      }

      res.json({ data: parsed.data, source: "csv", type, configured: true });
    } catch (error: any) {
      console.error(`[Sync] Error fetching ${type} Google Sheets data:`, error.message);
      
      let errorMessage = error.message;
      let status = 500;

      if (error.response) {
        status = error.response.status;
        console.error(`[Sync] Google API returned error status: ${status}`);
        if (status === 401 || status === 403) {
          errorMessage = `The ${type} Google Sheet is private or inaccessible (Status ${status}). Please ensure it is shared as 'Anyone with the link can view'.`;
        } else if (status === 404) {
          errorMessage = `The ${type} Google Sheet ID appears to be invalid (Status 404). Please check the ID in your environment variables.`;
        }
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = "The request to Google Sheets timed out. Please try again.";
      }
      
      res.status(status === 401 ? 403 : status).json({ 
        error: errorMessage, 
        setupRequired: status === 401 || status === 403 || status === 404,
        configured: true
      });
    }
  });

  // API Route to check configuration status
  app.get("/api/status", (req, res) => {
    res.json({
      currentConfigured: !!process.env.GOOGLE_SHEET_ID,
      legacyConfigured: !!process.env.LEGACY_SHEET_ID,
      writeConfigured: !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    });
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
      // Sanitize sheetId
      if (sheetId.includes('/d/')) {
        sheetId = sheetId.split('/d/')[1].split('/')[0];
      }

      const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(serviceAccount),
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });
      
      // 1. Get headers to find columns
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: "A1:Z1", 
      });

      const headers = headerResponse.data.values?.[0];
      if (!headers) throw new Error("Could not read headers from sheet.");

      const findHeaderIndex = (search: string[]) => {
        return headers.findIndex(h => search.some(s => h.toLowerCase().includes(s.toLowerCase())));
      };

      const idIndex = findHeaderIndex(["Submission ID", "ID", "Ref"]);
      const aiSentimentIndex = findHeaderIndex(["AI Sentiment", "Sentiment Label", "AI Tag"]);
      const aiSummaryIndex = findHeaderIndex(["AI Summary", "Summary"]);

      if (idIndex === -1) throw new Error("Required 'Submission ID' column not found in sheet.");
      if (aiSentimentIndex === -1 || aiSummaryIndex === -1) {
        throw new Error("Sheet must contain 'AI Sentiment' and 'AI Summary' columns to save updates.");
      }

      // 2. Find the row index (this is slower for large sheets, but okay for moderate ones)
      // For very large sheets, we'd want to use a specific column range search
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

      // 3. Update the specific cells
      const updates = [];
      const getColChar = (idx: number) => String.fromCharCode(65 + idx); // Simple A-Z support

      updates.push({
        range: `${getColChar(aiSentimentIndex)}${rowIndex}`,
        values: [[sentiment]]
      });
      updates.push({
        range: `${getColChar(aiSummaryIndex)}${rowIndex}`,
        values: [[summary]]
      });

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          data: updates,
          valueInputOption: "RAW"
        }
      });

      console.log(`[Sheets] Successfully updated row ${rowIndex} for submission ${submissionId}`);
      res.json({ success: true, rowIndex });
    } catch (error: any) {
      console.error("[Sheets Update Error]", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
