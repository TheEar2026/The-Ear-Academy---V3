/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  BarChart3, 
  Database, 
  Settings, 
  Calendar, 
  RefreshCw, 
  TrendingUp, 
  AlertTriangle, 
  Search, 
  ChevronRight,
  X,
  MessageSquare,
  School as SchoolIcon,
  Hash,
  Clock,
  ExternalLink,
  Loader2,
  Sparkles,
  RotateCcw,
  Check,
  ShieldAlert
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";

// Types
interface Submission {
  timestamp: string;
  school: string;
  id: string;
  customer: string;
  type: string;
  sentimentScore: number;
  sentiment: string;
  sentimentColor: string;
  sentimentBasis: string[];
  answers: { question: string; answer: string }[];
  rawData: any;
  courseName: string;
  aiSummary?: string;
  aiSentiment?: string;
  originalSentiment?: string;
  originalSentimentScore?: number;
  originalSentimentColor?: string;
  originalSentimentBasis?: string[];
  isAIEvaluated?: boolean;
  isReviewed?: boolean;
  source: 'current' | 'legacy';
  refId: string;
}

interface DashboardStats {
  csat: number;
  avgSentimentScore: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  reviewedCount: number;
  sentimentTrend: any[];
  distribution: any[];
}

// Logo Component
const Logo = ({ className = "" }: { className?: string }) => (
  <div className={`flex flex-col items-center justify-center ${className}`}>
    <svg viewBox="0 0 400 200" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text x="145" y="60" className="font-sans font-normal" fontSize="24" fill="#a68a4c">the</text>
      <text x="60" y="140" className="font-sans font-black" fontSize="120" fill="#a68a4c" letterSpacing="-4">ear</text>
      <text x="120" y="185" className="font-sans font-bold" fontSize="32" fill="#a68a4c" letterSpacing="12">ACADEMY</text>
    </svg>
  </div>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [legacySubmissions, setLegacySubmissions] = useState<Submission[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [legacyStats, setLegacyStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [configStatus, setConfigStatus] = useState({ currentConfigured: false, legacyConfigured: false });
  const [aiLoading, setAiLoading] = useState(false);
  const [isDisputing, setIsDisputing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [courseSummaries, setCourseSummaries] = useState<Record<string, { summary: string; improvements: string[]; loading: boolean }>>({});

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), []);

  const groupedSubmissions = useMemo(() => {
    const groups: Record<string, Submission[]> = {};
    submissions.forEach(s => {
      const date = new Date(s.timestamp);
      const monthKey = isNaN(date.getTime()) 
        ? 'Unknown' 
        : date.toLocaleString('default', { month: 'long', year: 'numeric' });
      
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(s);
    });
    
    return Object.keys(groups)
      .sort((a, b) => {
        if (a === 'Unknown') return 1;
        if (b === 'Unknown') return -1;
        return new Date(a).getTime() - new Date(b).getTime();
      })
      .reduce((acc, key) => {
        acc[key] = groups[key];
        return acc;
      }, {} as Record<string, Submission[]>);
  }, [submissions]);

  const CLASSIFICATION_GUIDE = `
    You are a CSAT scoring and sentiment analysis engine for The Ear Academy.
    
    ## Scoring rules
    - CSAT % = (total positive responses ÷ total submissions) × 100
    - Positive response → counts toward the score
    - Neutral response → does not count toward the score
    - Negative response → does not count toward the score

    ## Score benchmarks
    - 80–100% → Excellent
    - 60–79%  → Good
    - 40–59%  → Needs improvement
    - 0–39%   → Critical

    ## Classification guide
    - POSITIVE: "Amazing", "Loved it", "Really enjoyed it", "Better than expected", "I was good throughout", "Like something clicked", "More confident", "Yes — there were definitely moments", "Can't wait", "Yeah, I'm in", "I enjoyed all of the facets", 4-5 stars.
    - NEUTRAL: "It was okay", "Pretty good", "Some parts I liked", "Mixed", "Not sure", "Hard to pick", "It surprised me", "Kind of — glimpses of it", "We'll see", "Pretty much the same as before", 3 stars, 1 facet not enjoyed.
    - NEGATIVE: "Confusing", "Too hard", "Didn't enjoy it", "Disappointing", "Overwhelmed", "Honestly, not that excited", "Not really", 1-2 stars, 2+ facets not enjoyed.
  `;

  useEffect(() => {
    if (selectedSubmission && !selectedSubmission.aiSummary) {
      generateAISummary(selectedSubmission);
    }
  }, [selectedSubmission]);

  const generateAISummary = async (submission: Submission) => {
    setAiLoading(true);
    try {
      const prompt = `
        Analyze the following student feedback submission and provide a concise summary of their experience.
        Use the provided Classification Guide to determine the sentiment.
        
        ${CLASSIFICATION_GUIDE}
        
        Submission Data:
        ${submission.answers.map(a => `${a.question}: ${a.answer}`).join('\n')}
        
        Return the result in JSON format with the following structure:
        {
          "summary": "A 2-3 sentence summary of the student's feedback",
          "sentiment": "POSITIVE, NEUTRAL, or CRITICAL",
          "score": 0-100,
          "reasoning": "Brief explanation based on the guide"
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              sentiment: { type: Type.STRING },
              score: { type: Type.NUMBER },
              reasoning: { type: Type.STRING }
            },
            required: ["summary", "sentiment", "score", "reasoning"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      const sentimentMap: Record<string, { color: string }> = {
        'POSITIVE': { color: 'text-secondary-fixed bg-secondary-fixed/10 ring-secondary-fixed/20' },
        'NEUTRAL': { color: 'text-primary bg-primary/10 ring-primary/20' },
        'CRITICAL': { color: 'text-tertiary-container bg-tertiary-container/10 ring-tertiary-container/20' }
      };

      const aiData = sentimentMap[result.sentiment] || sentimentMap['NEUTRAL'];

      const updateSubmission = (prev: Submission) => {
        const updated = {
          ...prev,
          sentiment: result.sentiment,
          sentimentScore: result.score / 100, // Normalize to 0-1
          sentimentColor: aiData.color,
          aiSummary: result.summary,
          aiSentiment: result.sentiment,
          sentimentBasis: [result.reasoning],
          isAIEvaluated: true
        };
        return updated;
      };

      setSelectedSubmission(prev => {
        if (!prev || prev.id !== submission.id) return prev;
        return updateSubmission(prev);
      });

      setSubmissions(prev => {
        if (prev.some(s => s.id === submission.id)) {
          const updated = prev.map(s => s.id === submission.id ? updateSubmission(s) : s);
          setStats(calculateStats(updated));
          return updated;
        }
        return prev;
      });

      setLegacySubmissions(prev => {
        if (prev.some(s => s.id === submission.id)) {
          const updated = prev.map(s => s.id === submission.id ? updateSubmission(s) : s);
          setLegacyStats(calculateStats(updated));
          return updated;
        }
        return prev;
      });
    } catch (err) {
      console.error("AI Generation Error:", err);
    } finally {
      setAiLoading(false);
    }
  };

  const persistEvaluation = (submissionId: string, data: Partial<Submission> | null) => {
    try {
      const stored = localStorage.getItem('feedback_evaluations');
      const evaluations = stored ? JSON.parse(stored) : {};
      
      if (data === null) {
        delete evaluations[submissionId];
      } else {
        evaluations[submissionId] = {
          ...evaluations[submissionId],
          ...data
        };
      }
      
      localStorage.setItem('feedback_evaluations', JSON.stringify(evaluations));
    } catch (e) {
      console.error("Failed to persist evaluation", e);
    }
  };

  const revertAISentiment = (submission: Submission) => {
    const revert = (prev: Submission) => ({
      ...prev,
      sentiment: prev.originalSentiment || prev.sentiment,
      sentimentScore: prev.originalSentimentScore !== undefined ? prev.originalSentimentScore : prev.sentimentScore,
      sentimentColor: prev.originalSentimentColor || prev.sentimentColor,
      sentimentBasis: prev.originalSentimentBasis || [],
      aiSummary: undefined,
      aiSentiment: undefined,
      isAIEvaluated: false,
      isReviewed: false
    });

    persistEvaluation(submission.id, null);

    setSelectedSubmission(prev => {
      if (!prev || prev.id !== submission.id) return prev;
      return revert(prev);
    });

    setSubmissions(prev => {
      if (prev.some(s => s.id === submission.id)) {
        const updated = prev.map(s => s.id === submission.id ? revert(s) : s);
        setStats(calculateStats(updated));
        return updated;
      }
      return prev;
    });

    setLegacySubmissions(prev => {
      if (prev.some(s => s.id === submission.id)) {
        const updated = prev.map(s => s.id === submission.id ? revert(s) : s);
        setLegacyStats(calculateStats(updated));
        return updated;
      }
      return prev;
    });
  };

  const manuallyUpdateSentiment = (submission: Submission, newSentiment: string) => {
    const sentimentMap: Record<string, { color: string, score: number }> = {
      'POSITIVE': { color: 'text-secondary-fixed bg-secondary-fixed/10 ring-secondary-fixed/20', score: 1 },
      'NEUTRAL': { color: 'text-primary bg-primary/10 ring-primary/20', score: 0 },
      'CRITICAL': { color: 'text-tertiary-container bg-tertiary-container/10 ring-tertiary-container/20', score: 0 }
    };

    const data = sentimentMap[newSentiment];
    if (!data) return;

    const updateData = {
      sentiment: newSentiment,
      sentimentScore: data.score,
      sentimentColor: data.color,
      isAIEvaluated: true,
      aiSentiment: newSentiment,
      isReviewed: true
    };

    const update = (prev: Submission) => ({
      ...prev,
      ...updateData
    });

    persistEvaluation(submission.id, updateData);

    setSelectedSubmission(prev => {
      if (!prev || prev.id !== submission.id) return prev;
      return update(prev);
    });

    setSubmissions(prev => {
      if (prev.some(s => s.id === submission.id)) {
        const updated = prev.map(s => s.id === submission.id ? update(s) : s);
        setStats(calculateStats(updated));
        return updated;
      }
      return prev;
    });

    setLegacySubmissions(prev => {
      if (prev.some(s => s.id === submission.id)) {
        const updated = prev.map(s => s.id === submission.id ? update(s) : s);
        setLegacyStats(calculateStats(updated));
        return updated;
      }
      return prev;
    });
    
    setIsDisputing(false);
  };

  const markAsReviewed = (submission: Submission) => {
    const updateData = {
      isReviewed: true
    };

    const update = (prev: Submission) => ({
      ...prev,
      ...updateData
    });

    persistEvaluation(submission.id, updateData);

    setSelectedSubmission(prev => {
      if (!prev || prev.id !== submission.id) return prev;
      return update(prev);
    });

    setSubmissions(prev => {
      return prev.map(s => s.id === submission.id ? update(s) : s);
    });

    setLegacySubmissions(prev => {
      return prev.map(s => s.id === submission.id ? update(s) : s);
    });
    
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const generateCourseSummary = async (courseName: string, courseSubmissions: Submission[]) => {
    setCourseSummaries(prev => ({
      ...prev,
      [courseName]: { ...prev[courseName], loading: true }
    }));

    try {
      const prompt = `
        Analyze all student feedback for the course "${courseName}". 
        There are ${courseSubmissions.length} submissions in total.
        
        Consolidated Feedback Data:
        ${courseSubmissions.map(s => s.answers.map(a => `${a.question}: ${a.answer}`).join(' | ')).join('\n---\n')}
        
        Provide a consolidated report including:
        1. A summary of how students generally feel about the course.
        2. Specific areas for improvement based on the feedback.
        
        Return the result in JSON format with the following structure:
        {
          "summary": "Consolidated summary of student feelings",
          "improvements": ["Improvement 1", "Improvement 2", ...]
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              improvements: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["summary", "improvements"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      setCourseSummaries(prev => ({
        ...prev,
        [courseName]: { 
          summary: result.summary, 
          improvements: result.improvements, 
          loading: false 
        }
      }));
    } catch (err) {
      console.error(`AI Course Summary Error (${courseName}):`, err);
      setCourseSummaries(prev => ({
        ...prev,
        [courseName]: { ...prev[courseName], loading: false }
      }));
    }
  };

  // Robust fuzzy value extractor for complex headers
  const getFuzzyVal = (row: any, possibleNames: string[]) => {
    if (!row) return null;
    const keys = Object.keys(row);
    
    // 1. Try exact match first
    for (const name of possibleNames) {
      if (row[name] !== undefined) return row[name];
    }

    // 2. Try normalized match (lowercase, no special chars)
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const normalizedPossible = possibleNames.map(normalize);

    const matchKey = keys.find(k => normalizedPossible.includes(normalize(k)));
    if (matchKey) return row[matchKey];

    // 3. Try partial match
    const partialMatchKey = keys.find(k => 
      normalizedPossible.some(p => normalize(k).includes(p) || p.includes(normalize(k)))
    );
    
    return partialMatchKey ? row[partialMatchKey] : null;
  };

  const processSheetData = (rawData: any[], source: 'current' | 'legacy') => {
    return rawData.map((row: any, index: number) => {
      const rowString = JSON.stringify(row).toLowerCase();
      const rating = parseInt(getFuzzyVal(row, ['Rating', 'Score', 'CSAT']) || '0') || 0;
      const rawSentiment = (getFuzzyVal(row, ['Sentiment', 'Sentiment Tag', 'Feedback Type', 'Status']) || '').toString().toUpperCase();
      
      // Count facets not enjoyed
      const facetsNotEnjoyed = (getFuzzyVal(row, ["Please select any facet(s) you didn't enjoy"]) || '').toString();
      const facetsNotEnjoyedCount = facetsNotEnjoyed ? facetsNotEnjoyed.split(',').filter(Boolean).length : 0;

      let sentiment = 'NEUTRAL';
      let sentimentColor = 'text-primary bg-primary/10 ring-primary/20';
      let sentimentScore = 0; // Default for neutral/negative

      // Classification Logic based on User Guide
      
      // 1. NEGATIVE SIGNALS (Highest priority)
      const isNegative = 
        facetsNotEnjoyedCount >= 2 ||
        rowString.includes('confusing') ||
        rowString.includes('too hard') ||
        rowString.includes("didn't enjoy it") ||
        rowString.includes('disappointing') ||
        rowString.includes('overwhelmed') ||
        rowString.includes('honestly, not that excited') ||
        rowString.includes('not really') ||
        rowString.includes('too fast') ||
        rowString.includes("didn't get the instructions") ||
        rowString.includes('too slow') ||
        rowString.includes("didn't help me understand") ||
        (rating > 0 && rating <= 2) ||
        rawSentiment.includes('NEGATIVE') || 
        rawSentiment.includes('CRITICAL');

      // 2. POSITIVE SIGNALS
      const isPositive = 
        rowString.includes('amazing') ||
        rowString.includes('loved it') ||
        rowString.includes('really enjoyed it') ||
        rowString.includes('better than expected') ||
        rowString.includes('i was good throughout') ||
        rowString.includes('like something clicked') ||
        rowString.includes('more confident') ||
        rowString.includes('yes — there were definitely moments') ||
        rowString.includes("can't wait") ||
        rowString.includes("yeah, i'm in") ||
        rowString.includes('i enjoyed all of the facets') ||
        rowString.includes('engaging and fun') ||
        rowString.includes('really helpful') ||
        rowString.includes('my favourite part') ||
        (rating >= 4) ||
        rawSentiment.includes('POSITIVE');

      // 3. NEUTRAL SIGNALS
      const isNeutralExplicit = 
        facetsNotEnjoyedCount === 1 ||
        rowString.includes('it was okay') ||
        rowString.includes('pretty good') ||
        rowString.includes('some parts i liked') ||
        rowString.includes('mixed') ||
        rowString.includes('not sure') ||
        rowString.includes('hard to pick') ||
        rowString.includes('it surprised me') ||
        rowString.includes('kind of — glimpses of it') ||
        rowString.includes("we'll see") ||
        rowString.includes('pretty much the same as before') ||
        (rating === 3);

      if (isNegative) {
        sentiment = 'CRITICAL';
        sentimentColor = 'text-tertiary-container bg-tertiary-container/10 ring-tertiary-container/20';
        sentimentScore = 0; // Negative doesn't count toward score
      } else if (isPositive) {
        sentiment = 'POSITIVE';
        sentimentColor = 'text-secondary-fixed bg-secondary-fixed/10 ring-secondary-fixed/20';
        sentimentScore = 1; // Only positive counts
      } else if (isNeutralExplicit) {
        sentiment = 'NEUTRAL';
        sentimentColor = 'text-primary bg-primary/10 ring-primary/20';
        sentimentScore = 0; // Neutral doesn't count toward score
      }

      const questions = Object.keys(row).filter(key => 
        !['Timestamp', 'School Name', 'School', 'Submission ID', 'ID', 'Customer Name', 'Customer', 'Rating', 'Score', 'Sentiment', 'Sentiment Tag', 'Form Type', 'Type'].some(reserved => 
          key.toLowerCase().replace(/[^a-z0-9]/g, '') === reserved.toLowerCase().replace(/[^a-z0-9]/g, '')
        )
      ).slice(0, 9);

      const sentimentBasis: string[] = [];
      if (facetsNotEnjoyedCount >= 2) sentimentBasis.push(`the student reported ${facetsNotEnjoyedCount} facets not enjoyed (Threshold: 2+)`);
      if (rowString.includes('confusing')) sentimentBasis.push('the feedback mentioned feeling "Confusing"');
      if (rowString.includes('too hard')) sentimentBasis.push('the student reported content was "Too hard"');
      if (rowString.includes('overwhelmed')) sentimentBasis.push('the student mentioned feeling "Overwhelmed"');
      if (rowString.includes('honestly, not that excited')) sentimentBasis.push('the student expressed lack of excitement for future content');
      if (rowString.includes('not really')) sentimentBasis.push('the student reported "Not really" regarding music-making');
      if (rating > 0 && rating <= 2) sentimentBasis.push(`a low rating of ${rating} stars was provided`);
      
      if (rowString.includes('amazing') || rowString.includes('loved it')) sentimentBasis.push('the student expressed high enthusiasm (Amazing/Loved it)');
      if (rowString.includes('i was good throughout')) sentimentBasis.push('the student reported no frustration throughout the unit');
      if (rowString.includes('yes — there were definitely moments')) sentimentBasis.push('the student confirmed positive music-making moments');
      if (rowString.includes("can't wait") || rowString.includes("yeah, i'm in")) sentimentBasis.push('the student showed high excitement for upcoming content');
      if (rowString.includes('i enjoyed all of the facets')) sentimentBasis.push('the student explicitly enjoyed all facets');
      if (rating >= 4) sentimentBasis.push(`a high rating of ${rating} stars was provided`);

      if (facetsNotEnjoyedCount === 1) sentimentBasis.push('the student reported 1 facet not enjoyed (Neutral)');
      if (rowString.includes('it was okay') || rowString.includes('pretty good')) sentimentBasis.push('the feedback was neutral/moderate (Okay/Pretty good)');
      if (rowString.includes('kind of — glimpses of it')) sentimentBasis.push('the student reported "glimpses" of music-making (Neutral)');
      if (rowString.includes("we'll see")) sentimentBasis.push('the student was neutral/undecided about future content');
      if (rating === 3) sentimentBasis.push('a moderate rating of 3 stars was provided');

      // Guarantee unique ID generation per submission log by always including index
      const sheetId = getFuzzyVal(row, ['Submission ID', 'ID', 'Ref']);
      const processedId = `${source}-idx-${index}${sheetId ? `-${sheetId}` : ''}`;
      
      // Check if this row already contains AI data from the sheet (if we were to read it back)
      const existingAISentiment = getFuzzyVal(row, ['AI Sentiment', 'Sentiment Label', 'AI Tag']);
      const existingAISummary = getFuzzyVal(row, ['AI Summary', 'Summary']);

      return {
        timestamp: getFuzzyVal(row, ['Timestamp', 'Date', 'Time', 'Submission Date']) || 'N/A',
        school: getFuzzyVal(row, ['School Name', 'School', 'Location', 'Teacher Name & School Name']) || 'N/A',
        id: processedId,
        customer: getFuzzyVal(row, ['Customer Name', 'Customer', 'Student', 'Name']) || 'Anonymous',
        type: getFuzzyVal(row, ['Form Type', 'Type', 'Category']) || 'Classroom',
        courseName: getFuzzyVal(row, ['Course Name', 'Course', 'Unit']) || 'General',
        sentimentScore: existingAISentiment ? (existingAISentiment === 'POSITIVE' ? 1 : 0) : sentimentScore,
        sentiment: existingAISentiment || sentiment,
        sentimentColor: existingAISentiment ? 
          (existingAISentiment === 'POSITIVE' ? 'text-secondary-fixed bg-secondary-fixed/10 ring-secondary-fixed/20' : 
           existingAISentiment === 'CRITICAL' ? 'text-tertiary-container bg-tertiary-container/10 ring-tertiary-container/20' : 
           'text-primary bg-primary/10 ring-primary/20') : sentimentColor,
        sentimentBasis: existingAISummary ? [existingAISummary] : sentimentBasis,
        answers: questions.map(q => ({ question: q, answer: row[q] || 'No answer provided' })),
        rawData: row,
        aiSentiment: existingAISentiment,
        aiSummary: existingAISummary,
        isAIEvaluated: !!existingAISentiment,
        originalSentiment: sentiment,
        originalSentimentScore: sentimentScore,
        originalSentimentColor: sentimentColor,
        originalSentimentBasis: sentimentBasis,
        source: source,
        refId: `#${String(index + 1).padStart(3, '0')}`
      };
    });
  };

  const calculateStats = (processed: Submission[]) => {
    const totalSubmissions = processed.length || 1;
    
    const positive = processed.filter(s => s.sentiment === 'POSITIVE').length;
    const neutral = processed.filter(s => s.sentiment === 'NEUTRAL').length;
    const negative = processed.filter(s => s.sentiment === 'CRITICAL' || s.sentiment === 'NEGATIVE').length;
    const reviewed = processed.filter(s => s.isReviewed).length;

    // CSAT % = (total positive responses ÷ total submissions) × 100
    const csatScore = Math.round((positive / totalSubmissions) * 100);

    const totalPoints = processed.reduce((acc, s) => acc + s.sentimentScore, 0);
    const avgPoints = totalPoints / totalSubmissions;
    
    const classroomCount = processed.filter(s => s.type.toLowerCase().includes('classroom')).length;
    const instrumentalCount = processed.filter(s => s.type.toLowerCase().includes('instrumental')).length;
    const total = processed.length || 1;

    return {
      csat: csatScore,
      avgSentimentScore: Number(avgPoints.toFixed(2)),
      positiveCount: positive,
      neutralCount: neutral,
      negativeCount: negative,
      reviewedCount: reviewed,
      sentimentTrend: processed.slice(-7).map(s => ({ 
        name: s.timestamp.split(',')[0], 
        value: Math.round(s.sentimentScore * 100) 
      })),
      distribution: [
        { name: 'Classroom', value: Math.round((classroomCount / total) * 100), color: '#a68a4c' },
        { name: 'Instrumental', value: Math.round((instrumentalCount / total) * 100), color: '#00e1ab' },
      ]
    };
  };

  const fetchData = async (type: 'current' | 'legacy' = 'current') => {
    console.log(`[Frontend] Fetching ${type} data...`);
    if (type === 'current') setLoading(true);
    else setLegacyLoading(true);

    try {
      const response = await fetch(`/api/data/${type}`);
      const result = await response.json();

      console.log(`[Frontend] ${type} response:`, result);

      if (!response.ok) {
        console.error(`[Frontend] ${type} fetch failed:`, result.error);
        if (result.setupRequired && type === 'current' && !isDemo) {
          setSetupRequired(true);
          setLoading(false);
          return;
        }
        throw new Error(result.error || `Server error: ${response.status}`);
      }

      if (result.source === 'demo') {
        setIsDemo(true);
      }

      const processed = processSheetData(result.data || [], type);
      
      // Merge with persisted evaluations
      let mergedData = processed;
      try {
        const stored = localStorage.getItem('feedback_evaluations');
        if (stored) {
          const evaluations = JSON.parse(stored);
          mergedData = processed.map(s => {
            if (evaluations[s.id]) {
              return { ...s, ...evaluations[s.id] };
            }
            return s;
          });
        }
      } catch (e) {
        console.error("Error merging persisted evaluations", e);
      }
      
      console.log(`[Frontend] Processed ${mergedData.length} ${type} submissions (merged with local overrides).`);
      const computedStats = calculateStats(mergedData);

      if (type === 'current') {
        setSubmissions(mergedData);
        setStats(computedStats);
        setError(null);
      } else {
        setLegacySubmissions(mergedData);
        setLegacyStats(computedStats);
        setLegacyError(null);
      }
    } catch (err: any) {
      if (type === 'current') setError(err.message);
      else setLegacyError(err.message);
    } finally {
      if (type === 'current') setLoading(false);
      else setLegacyLoading(false);
    }
  };

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/status');
        const status = await response.json();
        setConfigStatus(status);
      } catch (e) {
        console.error("Failed to check config status", e);
      }
    };

    checkStatus();
    fetchData('current');
    fetchData('legacy');
  }, []);

  const filteredSubmissions = submissions.filter(s => 
    s.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.school.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (setupRequired) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-8">
        <div className="glass max-w-lg p-10 rounded-3xl text-center space-y-8">
          <div className="w-32 h-32 mx-auto mb-4">
            <Logo />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-headline font-black">Connect Your Data</h2>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              You've added the Sheet ID, but we need one more step to access the data.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 text-left">
            <div className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant/10 space-y-3">
              <h4 className="text-xs font-headline font-bold uppercase tracking-widest text-primary">Setup Instructions</h4>
              <p className="text-xs text-on-surface-variant">
                1. Open your Google Sheet.<br />
                2. Click <b>Share</b> (top right).<br />
                3. Change General Access to <b>"Anyone with the link"</b>.<br />
                4. Set role to <b>Viewer</b>.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <button 
              onClick={fetchData}
              className="w-full bg-primary text-on-primary py-4 rounded-xl font-headline font-bold uppercase tracking-wider hover:opacity-90 transition-all shadow-lg shadow-primary/20"
            >
              Check Connection Again
            </button>
            <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">
              Check your connection to continue
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-[100px] flex flex-col items-center py-8 bg-surface-container-low border-r border-outline-variant/10 z-50">
        <div className="mb-12 px-4 w-full">
          <Logo className="w-full" />
        </div>
        
        <nav className="flex flex-col gap-8 flex-1">
          {[
            { id: 'Overview', icon: LayoutDashboard, label: 'Overview' },
            { id: 'Sentiment', icon: BarChart3, label: 'Sentiment' },
            { id: 'Logs', icon: Database, label: 'Logs' },
            { id: 'Legacy', icon: Clock, label: 'Legacy' },
            { id: 'Settings', icon: Settings, label: 'Settings' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-1 transition-all duration-300 group ${
                activeTab === item.id 
                  ? 'text-primary' 
                  : 'text-on-surface-variant opacity-60 hover:opacity-100 hover:text-primary'
              }`}
            >
              <div className={`relative p-2 rounded-lg transition-colors ${activeTab === item.id ? 'bg-primary/10' : ''}`}>
                <item.icon size={24} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                {activeTab === item.id && (
                  <motion.div 
                    layoutId="active-pill"
                    className="absolute -left-4 top-0 bottom-0 w-1 bg-primary rounded-r-full"
                  />
                )}
              </div>
              <span className="text-[10px] font-headline font-bold uppercase tracking-widest">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto">
          <img 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAm6GW7d1C7rA9I69vEFEBCjKjCKxWOw9iBLocPs-6QvW4sx4nK0cSLk8nffDG7RDvO3fV2KUUdE1f-TNYcgYOM8Tydl7hEezgP7Mb6WM1cG2E9lbB6kDj4Qrzyn2DmX-99pIEw06k-u2Modqukkszr1DoFal9Pc2JMEyppGVy-6w8yHEBpWA4dgqKltqZYyvIBLDF59rroy_f2rAjtwFKhwceX3oukBnTD2ddV8-vJVRNSJk1XLrTOclNqmhpRO5knsKP36pqL-f0" 
            alt="User" 
            className="w-10 h-10 rounded-full border-2 border-outline-variant/30 hover:border-primary/50 transition-colors cursor-pointer"
            referrerPolicy="no-referrer"
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-[100px] flex-1 flex flex-col">
        {/* Demo Banner */}
        <AnimatePresence>
          {isDemo && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-primary/20 border-b border-primary/20 px-12 py-2 flex items-center justify-between overflow-hidden"
            >
              <div className="flex items-center gap-2 text-primary">
                <Sparkles size={14} />
                <span className="text-[10px] font-headline font-bold uppercase tracking-widest">
                  Viewing Demo Data: Connect your Google Sheet in Settings to see real feedback
                </span>
              </div>
              <button 
                onClick={() => setActiveTab('Settings')}
                className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline flex items-center gap-1"
              >
                Go to Settings <ChevronRight size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <header className="sticky top-0 h-20 px-12 flex justify-between items-center bg-surface/80 backdrop-blur-xl z-40 border-b border-outline-variant/10">
          <Logo className="h-12 w-auto" />
          
          <div className="flex items-center gap-8">
            <nav className="hidden md:flex items-center gap-8">
              {[
                { id: 'Overview', label: 'Overview' },
                { id: 'Sentiment', label: 'Sentiment Analysis' },
                { id: 'Logs', label: 'Submission Logs' },
                { id: 'Legacy', label: 'Legacy Data' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`text-sm font-headline font-bold tracking-wide transition-colors relative py-2 ${
                    activeTab === tab.id ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div layoutId="header-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-surface-container-low px-4 py-2 rounded-lg border border-outline-variant/10 cursor-pointer hover:bg-surface-container transition-colors">
                <Calendar size={14} className="text-on-surface-variant" />
                <span className="text-xs font-headline font-bold text-on-surface-variant uppercase">Last 30 Days</span>
              </div>
              <button 
                onClick={fetchData}
                disabled={loading}
                className="bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-2 rounded-lg text-sm font-headline font-bold uppercase tracking-wider flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Refresh
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="p-12 space-y-12 max-w-[1600px] mx-auto w-full">
          {loading && submissions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
              <Loader2 size={48} className="text-primary animate-spin" />
              <p className="text-on-surface-variant font-headline font-bold animate-pulse">Syncing with Google Sheets...</p>
            </div>
          ) : error ? (
            <div className="glass p-12 rounded-3xl text-center space-y-4 border-tertiary-container/20">
              <AlertTriangle size={48} className="text-tertiary-container mx-auto" />
              <h2 className="text-xl font-headline font-black">Sync Error</h2>
              <p className="text-on-surface-variant max-w-md mx-auto">{error}</p>
              <button onClick={fetchData} className="text-primary font-bold hover:underline">Try again</button>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === 'Overview' && (
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-12"
                >
                  {/* KPI Cards */}
                  <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {/* CSAT Score */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass p-8 rounded-2xl relative overflow-hidden group flex flex-col items-center text-center border-2 border-primary/20 shadow-2xl shadow-primary/5"
                    >
                      <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors duration-500" />
                      <div className="absolute -right-10 -top-10 w-48 h-48 bg-primary/20 rounded-full blur-3xl group-hover:bg-primary/30 transition-all duration-500" />
                      
                      <h3 className="relative z-10 text-on-surface-variant text-[10px] font-headline font-black uppercase tracking-[0.3em] mb-10">Overall CSAT Score</h3>
                      
                      <div className="relative z-10 flex flex-col items-center">
                        <div className="relative w-52 h-52">
                          {/* Glow effect */}
                          <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl animate-pulse" />
                          
                          <svg className="w-full h-full transform -rotate-90 relative z-10" viewBox="0 0 100 100">
                            <circle className="text-surface-container-high" cx="50" cy="50" r="44" fill="transparent" stroke="currentColor" strokeWidth="4" />
                            <circle 
                              className="text-primary" 
                              cx="50" cy="50" r="44" fill="transparent" stroke="currentColor" strokeWidth="10" 
                              strokeDasharray={276.46} 
                              strokeDashoffset={276.46 * (1 - (stats?.csat || 0) / 100)}
                              strokeLinecap="round"
                              style={{ filter: 'drop-shadow(0 0 8px rgba(166, 138, 76, 0.6))' }}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                            <motion.div
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: "spring", stiffness: 200, damping: 15 }}
                              className="flex flex-col items-center"
                            >
                              <span className="text-6xl font-headline font-black text-primary drop-shadow-lg">
                                {stats?.csat || 0}%
                              </span>
                              <span className="text-[10px] font-black uppercase tracking-[0.2em] mt-2 text-on-surface/40">
                                Satisfaction
                              </span>
                            </motion.div>
                          </div>
                        </div>
                        <div className="mt-8 px-6 py-2 rounded-full bg-primary/10 border border-primary/20">
                          <span className="text-xs font-headline font-bold text-primary uppercase tracking-widest">
                            {(() => {
                              const score = stats?.csat || 0;
                              if (score >= 90) return "World Class Experience";
                              if (score >= 75) return "Strong Performance";
                              if (score >= 50) return "Healthy Engagement";
                              return "Attention Required";
                            })()}
                          </span>
                        </div>
                      </div>
                    </motion.div>

                    {/* Positive Feedback */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="glass p-8 rounded-2xl relative overflow-hidden group"
                    >
                      <h3 className="text-on-surface-variant text-xs font-headline font-bold uppercase tracking-widest mb-6">Positive Feedback</h3>
                      <div className="flex items-end justify-between">
                        <div>
                          <span className="block text-secondary-fixed text-4xl font-headline font-black">{stats?.positiveCount.toLocaleString() || 0}</span>
                          <span className="text-on-surface-variant text-xs font-medium">Verified Submissions</span>
                        </div>
                        <div className="flex items-end gap-1.5 h-12">
                          {[0.3, 0.5, 0.8, 0.6, 1].map((opacity, i) => (
                            <div 
                              key={i} 
                              className="w-2 rounded-full transition-all duration-500 group-hover:scale-y-110" 
                              style={{ 
                                height: `${opacity * 100}%`, 
                                backgroundColor: '#36ffc4', 
                                opacity: opacity,
                                boxShadow: i === 4 ? '0 0 12px #36ffc4' : 'none'
                              }} 
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>

                    {/* Neutral Feedback */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="glass p-8 rounded-2xl relative overflow-hidden group"
                    >
                      <h3 className="text-on-surface-variant text-xs font-headline font-bold uppercase tracking-widest mb-6">Neutral Feedback</h3>
                      <div className="flex items-end justify-between">
                        <div>
                          <span className="block text-primary text-4xl font-headline font-black">{stats?.neutralCount.toLocaleString() || 0}</span>
                          <span className="text-on-surface-variant text-xs font-medium">Mixed Signals</span>
                        </div>
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                          <MessageSquare size={24} className="text-primary fill-primary/20" />
                        </div>
                      </div>
                    </motion.div>

                    {/* Negative Feedback */}
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="glass p-8 rounded-2xl relative overflow-hidden group"
                    >
                      <h3 className="text-on-surface-variant text-xs font-headline font-bold uppercase tracking-widest mb-6">Review Progress</h3>
                      <div className="flex items-end justify-between">
                        <div>
                          <span className="block text-secondary-fixed text-4xl font-headline font-black">{stats?.reviewedCount || 0}</span>
                          <span className="text-on-surface-variant text-xs font-medium">Evaluated / {submissions.length} Total</span>
                        </div>
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-secondary-fixed/10 group-hover:bg-secondary-fixed/20 transition-colors">
                          <Check size={24} className="text-secondary-fixed" />
                        </div>
                      </div>
                    </motion.div>
                  </section>

                  {/* Charts Section */}
                  <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Sentiment Trend */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                      className="lg:col-span-2 glass p-8 rounded-2xl"
                    >
                      <div className="flex justify-between items-center mb-10">
                        <div>
                          <h2 className="text-xl font-headline font-extrabold tracking-tight">Sentiment Trend</h2>
                          <p className="text-on-surface-variant text-sm font-medium">30-day volatility index</p>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-3 h-3 rounded-full bg-primary ring-4 ring-primary/10" />
                          <span className="w-3 h-3 rounded-full bg-secondary-fixed ring-4 ring-secondary-fixed/10" />
                        </div>
                      </div>
                      
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={stats?.sentimentTrend || []}>
                            <defs>
                              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#a68a4c" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#a68a4c" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(65, 71, 84, 0.1)" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fill: '#c1c6d7', fontSize: 10, fontWeight: 600 }}
                              dy={10}
                            />
                            <YAxis hide />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: '#e2e2e6', 
                                border: 'none', 
                                borderRadius: '4px',
                                color: '#111316',
                                fontSize: '12px',
                                fontWeight: 'bold'
                              }}
                              itemStyle={{ color: '#111316' }}
                              cursor={{ stroke: '#a68a4c', strokeWidth: 2 }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="value" 
                              stroke="#a68a4c" 
                              strokeWidth={3}
                              fillOpacity={1} 
                              fill="url(#colorValue)" 
                              animationDuration={2000}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>

                    {/* Submission by Product Type */}
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4 }}
                      className="glass p-8 rounded-2xl flex flex-col"
                    >
                      <h2 className="text-xl font-headline font-extrabold tracking-tight mb-2">Submission by Product Type</h2>
                      <p className="text-on-surface-variant text-sm font-medium mb-10">Feedback by category</p>
                      
                      <div className="relative flex-1 flex items-center justify-center min-h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={stats?.distribution || []}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                              stroke="none"
                            >
                              {stats?.distribution.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-3xl font-headline font-black">{stats?.csat || 0}%</span>
                          <span className="text-[10px] font-headline font-bold text-on-surface-variant uppercase tracking-widest">Overall</span>
                        </div>
                      </div>

                      <div className="mt-10 space-y-3">
                        {stats?.distribution.map((item) => (
                          <div key={item.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                              <span className="text-sm font-semibold">{item.name}</span>
                            </div>
                            <span className="text-sm font-bold text-on-surface-variant">{item.value}%</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </section>

                  {/* Quick Log View */}
                  <section className="glass rounded-2xl overflow-hidden">
                    <div className="p-8 flex justify-between items-center">
                      <h2 className="text-xl font-headline font-extrabold tracking-tight">Recent Submissions</h2>
                      <button onClick={() => setActiveTab('Logs')} className="text-primary text-sm font-bold hover:underline">View All Logs</button>
                    </div>
                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <tbody className="divide-y divide-outline-variant/5">
                          {submissions.slice(0, 5).map((entry, i) => (
                            <tr key={`${entry.id}-${i}`} className="hover:bg-surface-container-low transition-colors">
                              <td className="px-8 py-4 text-sm font-bold">{entry.customer}</td>
                              <td className="px-8 py-4 text-sm text-on-surface-variant">{entry.school}</td>
                              <td className="px-8 py-4">
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ring-1 ${entry.sentimentColor}`}>
                                  {entry.sentiment}
                                </span>
                              </td>
                              <td className="px-8 py-4 text-right">
                                <button onClick={() => setSelectedSubmission(entry)} className="text-primary"><ChevronRight size={18} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </motion.div>
              )}

              {activeTab === 'Sentiment' && (
                <motion.div
                  key="sentiment"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-12"
                >
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    <div className="xl:col-span-2">
                      <div className="glass p-8 rounded-2xl h-full">
                      <div className="flex justify-between items-center mb-8">
                        <div>
                          <h2 className="text-xl font-headline font-extrabold tracking-tight">Sentiment Breakdown</h2>
                          <p className="text-on-surface-variant text-sm font-medium">Volume and intensity distribution</p>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                            <div className="w-2 h-2 rounded-full bg-secondary-fixed" /> Positive
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                            <div className="w-2 h-2 rounded-full bg-primary" /> Neutral
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                            <div className="w-2 h-2 rounded-full bg-tertiary-container" /> Critical
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Sentiment Mosaic */}
                        <div className="lg:col-span-2 space-y-6">
                          <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Sentiment Mosaic</h3>
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest opacity-60">
                                <div className="w-1.5 h-1.5 rounded-full bg-secondary-fixed" /> Positive
                              </div>
                              <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest opacity-60">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary" /> Neutral
                              </div>
                              <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest opacity-60">
                                <div className="w-1.5 h-1.5 rounded-full bg-tertiary-container" /> Critical
                              </div>
                            </div>
                          </div>
                          <div className="space-y-8 max-h-[400px] overflow-y-auto custom-scrollbar pr-4">
                            {Object.entries(groupedSubmissions).map(([month, monthSubs]) => (
                              <div key={`month-${month}`} className="space-y-3">
                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 border-b border-outline-variant/10 pb-1 flex justify-between">
                                  <span>{month}</span>
                                  <span>{(monthSubs as Submission[]).length} Submissions</span>
                                </h4>
                                <div className="flex flex-wrap gap-1.5">
                                  {(monthSubs as Submission[]).map((s, i) => (
                                    <motion.div
                                      key={`mosaic-${s.id}-${month}-${i}`}
                                      initial={{ scale: 0, opacity: 0 }}
                                      animate={{ scale: 1, opacity: 1 }}
                                      transition={{ delay: i * 0.005 }}
                                      whileHover={{ scale: 1.4, zIndex: 10 }}
                                      onClick={() => setSelectedSubmission(s)}
                                      className={`w-4 h-4 rounded-sm cursor-pointer transition-all duration-300 relative group/tile ${
                                        s.sentiment === 'POSITIVE' ? 'bg-secondary-fixed shadow-[0_0_10px_rgba(54,255,196,0.1)]' :
                                        s.sentiment === 'CRITICAL' ? 'bg-tertiary-container shadow-[0_0_10px_rgba(255,138,154,0.1)]' :
                                        'bg-primary shadow-[0_0_10px_rgba(166,138,76,0.1)]'
                                      }`}
                                    >
                                      {/* Custom Tooltip */}
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-3 bg-surface-container-highest rounded-xl shadow-2xl border border-outline-variant/20 opacity-0 group-hover/tile:opacity-100 pointer-events-none transition-all duration-200 z-50 scale-75 group-hover/tile:scale-100 origin-bottom">
                                        <div className="space-y-1.5">
                                          <p className="text-[10px] font-black uppercase tracking-widest text-primary truncate">{s.customer}</p>
                                          <p className="text-[9px] font-bold text-on-surface leading-tight line-clamp-1">{s.school}</p>
                                          <div className="flex justify-between items-center pt-1 border-t border-outline-variant/10">
                                            <span className="text-[8px] font-medium text-on-surface-variant">{s.timestamp}</span>
                                            <span className={`text-[8px] font-black uppercase ${s.sentiment === 'POSITIVE' ? 'text-secondary-fixed' : s.sentiment === 'CRITICAL' ? 'text-tertiary-container' : 'text-primary'}`}>
                                              {s.sentiment}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-surface-container-highest" />
                                      </div>
                                    </motion.div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-on-surface-variant font-medium italic">Each block represents a unique submission. Click for full details.</p>
                            <div className="flex items-center gap-4">
                              <div className="flex flex-col items-end">
                                <span className="text-[8px] font-black uppercase tracking-tighter text-secondary-fixed">Sentiment Pulse</span>
                                <div className="flex gap-0.5 h-2 items-end">
                                  {submissions.slice(-20).map((s, i) => (
                                    <div 
                                      key={i} 
                                      className={`w-1 rounded-full ${
                                        s.sentiment === 'POSITIVE' ? 'bg-secondary-fixed' : 
                                        s.sentiment === 'CRITICAL' ? 'bg-tertiary-container' : 
                                        'bg-primary'
                                      }`}
                                      style={{ height: `${20 + (s.sentimentScore * 80)}%` }}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Sentiment Intensity Gauge */}
                        <div className="space-y-6">
                          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">Intensity Distribution</h3>
                          <div className="space-y-6">
                            {[
                              { label: 'Positive', count: stats?.positiveCount || 0, color: 'bg-secondary-fixed', total: submissions.length, icon: Sparkles },
                              { label: 'Neutral', count: submissions.length - (stats?.positiveCount || 0) - (stats?.negativeCount || 0), color: 'bg-primary', total: submissions.length, icon: MessageSquare },
                              { label: 'Critical', count: stats?.negativeCount || 0, color: 'bg-tertiary-container', total: submissions.length, icon: AlertTriangle }
                            ].map((item) => (
                              <div key={item.label} className="group">
                                <div className="flex justify-between items-end mb-2">
                                  <div className="flex items-center gap-2">
                                    <item.icon size={14} className={item.color.replace('bg-', 'text-')} />
                                    <span className="text-xs font-black uppercase tracking-widest">{item.label}</span>
                                  </div>
                                  <span className="text-sm font-black">{Math.round((item.count / (item.total || 1)) * 100)}%</span>
                                </div>
                                <div className="relative h-3 bg-surface-container rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(item.count / (item.total || 1)) * 100}%` }}
                                    className={`h-full ${item.color} relative z-10`}
                                  />
                                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
                                </div>
                                <div className="flex justify-between mt-1">
                                  <span className="text-[10px] font-bold text-on-surface-variant">{item.count} Submissions</span>
                                  <span className="text-[10px] font-bold text-on-surface-variant">Intensity: {Math.round((submissions.filter(s => s.sentiment.toUpperCase() === item.label.toUpperCase()).reduce((acc, s) => acc + s.sentimentScore, 0) / (item.count || 1)) * 100)}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="glass p-8 rounded-2xl">
                      <div className="flex justify-between items-center mb-8">
                        <div>
                          <h2 className="text-xl font-headline font-extrabold tracking-tight">Submission by school</h2>
                          <p className="text-on-surface-variant text-sm font-medium">Performance by location</p>
                        </div>
                        <SchoolIcon size={20} className="text-on-surface-variant/50" />
                      </div>
                      
                      <div className="space-y-4 max-h-[480px] overflow-y-auto custom-scrollbar pr-2">
                        {Array.from(new Set(submissions.map(s => s.school)))
                          .map(school => {
                            const schoolSubs = submissions.filter(s => s.school === school);
                            const avgScore = schoolSubs.reduce((acc, s) => acc + s.sentimentScore, 0) / schoolSubs.length;
                            const percentage = Math.round(avgScore * 100);
                            
                            return { school, percentage, count: schoolSubs.length, avgScore };
                          })
                          .sort((a, b) => b.percentage - a.percentage)
                          .map((item, idx) => (
                            <motion.div 
                              key={item.school} 
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="p-5 bg-surface-container-low rounded-2xl border border-outline-variant/5 group hover:border-primary/30 transition-all hover:shadow-lg"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-xs font-black text-primary border border-outline-variant/10">
                                    {idx + 1}
                                  </div>
                                  <div>
                                    <span className="font-headline font-bold text-sm block">{item.school}</span>
                                    <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">{item.count} Submissions</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className={`text-lg font-black ${item.percentage >= 70 ? 'text-secondary-fixed' : item.percentage >= 40 ? 'text-primary' : 'text-tertiary-container'}`}>
                                    {item.percentage}%
                                  </span>
                                  <div className="text-[8px] font-black uppercase tracking-tighter opacity-40">Score</div>
                                </div>
                              </div>
                              <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden relative">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.max(5, item.percentage)}%` }}
                                  className={`h-full transition-all duration-1000 ${
                                    item.percentage >= 70 ? 'bg-secondary-fixed' : 
                                    item.percentage >= 40 ? 'bg-primary' : 
                                    'bg-tertiary-container'
                                  }`}
                                />
                              </div>
                            </motion.div>
                          ))
                        }
                      </div>
                    </div>
                  </div>

                  <div className="glass p-8 rounded-2xl">
                    <div className="flex justify-between items-end mb-10">
                      <div>
                        <h2 className="text-xl font-headline font-extrabold tracking-tight">Submissions by Course Name</h2>
                        <p className="text-on-surface-variant text-sm font-medium">Sentiment distribution per unit</p>
                      </div>
                      <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-secondary-fixed" /> Positive</div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-primary" /> Neutral</div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-tertiary-container" /> Critical</div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-4">
                      {Array.from(new Set(submissions.map(s => s.courseName))).map((course: string) => {
                        const courseSubs = submissions.filter(s => s.courseName === course);
                        const pos = courseSubs.filter(s => s.sentiment === 'POSITIVE').length;
                        const neg = courseSubs.filter(s => s.sentiment === 'CRITICAL').length;
                        const neu = courseSubs.length - pos - neg;
                        
                        const avgScore = courseSubs.reduce((acc, s) => acc + s.sentimentScore, 0) / courseSubs.length;
                        
                        // Donut calculation
                        const total = courseSubs.length;
                        const posP = (pos / total) * 100;
                        const neuP = (neu / total) * 100;
                        const negP = (neg / total) * 100;
                        
                        const courseSummary = courseSummaries[course];
                        
                        return (
                          <motion.div 
                            key={course} 
                            whileHover={{ x: 5 }}
                            className="p-6 bg-surface-container-low rounded-3xl border border-outline-variant/10 flex flex-col group transition-all hover:shadow-xl hover:shadow-primary/5"
                          >
                            <div className="flex flex-col md:flex-row items-center gap-8">
                              {/* Left: Chart & Title */}
                              <div className="flex items-center gap-6 min-w-[280px]">
                                <div className="relative w-20 h-20 flex-shrink-0">
                                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#36ffc4" strokeWidth="12" strokeDasharray={`${posP * 2.512} 251.2`} strokeDashoffset={0} strokeLinecap="round" className="transition-all duration-1000" />
                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#a68a4c" strokeWidth="12" strokeDasharray={`${neuP * 2.512} 251.2`} strokeDashoffset={-(posP * 2.512)} strokeLinecap="round" className="transition-all duration-1000" />
                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#ff8a9a" strokeWidth="12" strokeDasharray={`${negP * 2.512} 251.2`} strokeDashoffset={-((posP + neuP) * 2.512)} strokeLinecap="round" className="transition-all duration-1000" />
                                  </svg>
                                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-sm font-headline font-black leading-none">{total}</span>
                                  </div>
                                </div>
                                <div>
                                  <h4 className="font-headline font-black text-sm uppercase tracking-widest text-on-surface">{course}</h4>
                                  <p className="text-[10px] font-bold text-on-surface-variant uppercase mt-1">{total} Submissions</p>
                                </div>
                              </div>

                              {/* Middle: Stats & Button */}
                              <div className="flex-1 flex flex-col sm:flex-row items-center gap-8 w-full">
                                <div className="flex-1 w-full space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-on-surface-variant uppercase">Course Health</span>
                                    <span className={`text-xs font-black ${avgScore > 0 ? 'text-secondary-fixed' : 'text-tertiary-container'}`}>
                                      {avgScore > 0 ? '+' : ''}{avgScore.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-surface-container">
                                    <div className="h-full bg-secondary-fixed" style={{ width: `${posP}%` }} />
                                    <div className="h-full bg-primary" style={{ width: `${neuP}%` }} />
                                    <div className="h-full bg-tertiary-container" style={{ width: `${negP}%` }} />
                                  </div>
                                </div>

                                <button 
                                  onClick={() => generateCourseSummary(course, courseSubs)}
                                  disabled={courseSummary?.loading}
                                  className="px-6 py-3 rounded-2xl bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
                                >
                                  {courseSummary?.loading ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Sparkles size={14} />
                                  )}
                                  {courseSummary?.summary ? 'Refresh AI' : 'Generate AI Report'}
                                </button>
                              </div>
                            </div>

                            <AnimatePresence>
                              {courseSummary?.summary && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-6 pt-6 border-t border-outline-variant/10 grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    <div className="lg:col-span-2 space-y-2">
                                      <div className="flex items-center gap-2 text-primary">
                                        <Sparkles size={12} />
                                        <p className="text-[10px] font-black uppercase tracking-tighter">Consolidated AI Summary</p>
                                      </div>
                                      <p className="text-sm text-on-surface-variant leading-relaxed italic">
                                        "{courseSummary.summary}"
                                      </p>
                                    </div>
                                    <div className="space-y-3">
                                      <p className="text-[10px] font-black text-primary uppercase tracking-tighter">Actionable Improvements</p>
                                      <ul className="space-y-2">
                                        {courseSummary.improvements.map((imp, idx) => (
                                          <li key={idx} className="text-[11px] text-on-surface-variant flex items-start gap-2 bg-surface-container/30 p-2 rounded-lg border border-outline-variant/5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary/50 mt-1.5 flex-shrink-0" />
                                            <span>{imp}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'Legacy' && (
                <motion.div
                  key="legacy"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-12"
                >
                  {legacyLoading ? (
                    <div className="flex flex-col items-center justify-center h-[40vh] space-y-4">
                      <Loader2 size={48} className="text-primary animate-spin" />
                      <p className="text-on-surface-variant font-headline font-bold">Loading Legacy Archive...</p>
                    </div>
                  ) : legacyError ? (
                    <div className="glass p-12 rounded-3xl text-center space-y-4 border-tertiary-container/20">
                      <AlertTriangle size={48} className="text-tertiary-container mx-auto" />
                      <h2 className="text-xl font-headline font-black">Legacy Sync Error</h2>
                      <p className="text-on-surface-variant max-w-md mx-auto">{legacyError}</p>
                      <button onClick={() => fetchData('legacy')} className="text-primary font-bold hover:underline">Try again</button>
                    </div>
                  ) : !configStatus.legacyConfigured ? (
                    <div className="glass p-12 rounded-3xl text-center space-y-4">
                      <Database size={48} className="text-on-surface-variant mx-auto opacity-20" />
                      <h2 className="text-xl font-headline font-black">Legacy Data Not Connected</h2>
                      <p className="text-on-surface-variant max-w-md mx-auto">Please provide a <b>LEGACY_SHEET_ID</b> in the environment variables to view archived data.</p>
                    </div>
                  ) : (
                    <>
                      {/* KPI Cards */}
                      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {/* CSAT Score */}
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="glass p-8 rounded-2xl relative overflow-hidden group flex flex-col items-center text-center border-2 border-primary/20 shadow-2xl shadow-primary/5"
                        >
                          <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors duration-500" />
                          <div className="absolute -right-10 -top-10 w-48 h-48 bg-primary/20 rounded-full blur-3xl group-hover:bg-primary/30 transition-all duration-500" />
                          
                          <h3 className="relative z-10 text-on-surface-variant text-[10px] font-headline font-black uppercase tracking-[0.3em] mb-10">Legacy CSAT Score</h3>
                          
                          <div className="relative z-10 flex flex-col items-center">
                            <div className="relative w-52 h-52">
                              {/* Glow effect */}
                              <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl animate-pulse" />
                              
                              <svg className="w-full h-full transform -rotate-90 relative z-10" viewBox="0 0 100 100">
                                <circle className="text-surface-container-high" cx="50" cy="50" r="44" fill="transparent" stroke="currentColor" strokeWidth="4" />
                                <circle 
                                  className="text-primary" 
                                  cx="50" cy="50" r="44" fill="transparent" stroke="currentColor" strokeWidth="10" 
                                  strokeDasharray={276.46} 
                                  strokeDashoffset={276.46 * (1 - (legacyStats?.csat || 0) / 100)}
                                  strokeLinecap="round"
                                  style={{ filter: 'drop-shadow(0 0 8px rgba(166, 138, 76, 0.6))' }}
                                />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                                <motion.div
                                  initial={{ scale: 0.5, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                  className="flex flex-col items-center"
                                >
                                  <span className="text-6xl font-headline font-black text-primary drop-shadow-lg">
                                    {legacyStats?.csat || 0}%
                                  </span>
                                  <span className="text-[10px] font-black uppercase tracking-[0.2em] mt-2 text-on-surface/40">
                                    Historical
                                  </span>
                                </motion.div>
                              </div>
                            </div>
                            <div className="mt-8 px-6 py-2 rounded-full bg-primary/10 border border-primary/20">
                              <span className="text-xs font-headline font-bold text-primary uppercase tracking-widest">
                                Legacy Performance
                              </span>
                            </div>
                          </div>
                        </motion.div>

                        {/* Positive Feedback */}
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className="glass p-8 rounded-2xl relative overflow-hidden group"
                        >
                          <h3 className="text-on-surface-variant text-xs font-headline font-bold uppercase tracking-widest mb-6">Archive Positive</h3>
                          <div className="flex items-end justify-between">
                            <div>
                              <span className="block text-secondary-fixed text-4xl font-headline font-black">{legacyStats?.positiveCount.toLocaleString() || 0}</span>
                              <span className="text-on-surface-variant text-xs font-medium">Historical Positive</span>
                            </div>
                            <div className="flex items-end gap-1.5 h-12">
                              {[0.3, 0.5, 0.8, 0.6, 1].map((opacity, i) => (
                                <div 
                                  key={i} 
                                  className="w-2 rounded-full transition-all duration-500 group-hover:scale-y-110" 
                                  style={{ 
                                    height: `${opacity * 100}%`, 
                                    backgroundColor: '#36ffc4', 
                                    opacity: opacity,
                                    boxShadow: i === 4 ? '0 0 12px #36ffc4' : 'none'
                                  }} 
                                />
                              ))}
                            </div>
                          </div>
                        </motion.div>

                        {/* Neutral Feedback */}
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                          className="glass p-8 rounded-2xl relative overflow-hidden group"
                        >
                          <h3 className="text-on-surface-variant text-xs font-headline font-bold uppercase tracking-widest mb-6">Archive Neutral</h3>
                          <div className="flex items-end justify-between">
                            <div>
                              <span className="block text-primary text-4xl font-headline font-black">{legacyStats?.neutralCount.toLocaleString() || 0}</span>
                              <span className="text-on-surface-variant text-xs font-medium">Mixed Signals</span>
                            </div>
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                              <MessageSquare size={24} className="text-primary fill-primary/20" />
                            </div>
                          </div>
                        </motion.div>

                        {/* Archive Review Progress */}
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className="glass p-8 rounded-2xl relative overflow-hidden group"
                        >
                          <h3 className="text-on-surface-variant text-xs font-headline font-bold uppercase tracking-widest mb-6">Archive Reviewed</h3>
                          <div className="flex items-end justify-between">
                            <div>
                              <span className="block text-secondary-fixed text-4xl font-headline font-black">{legacyStats?.reviewedCount || 0}</span>
                              <span className="text-on-surface-variant text-xs font-medium">{legacySubmissions.length} Historical Records</span>
                            </div>
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-secondary-fixed/10 group-hover:bg-secondary-fixed/20 transition-colors">
                              <Check size={24} className="text-secondary-fixed" />
                            </div>
                          </div>
                        </motion.div>
                      </section>

                      {/* Charts Section */}
                      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Sentiment Trend */}
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.3 }}
                          className="lg:col-span-2 glass p-8 rounded-2xl"
                        >
                          <div className="flex justify-between items-center mb-10">
                            <div>
                              <h2 className="text-xl font-headline font-extrabold tracking-tight">Legacy Sentiment Trend</h2>
                              <p className="text-on-surface-variant text-sm font-medium">Historical volatility index</p>
                            </div>
                            <div className="flex gap-2">
                              <span className="w-3 h-3 rounded-full bg-primary ring-4 ring-primary/10" />
                              <span className="w-3 h-3 rounded-full bg-secondary-fixed ring-4 ring-secondary-fixed/10" />
                            </div>
                          </div>
                          
                          <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={legacyStats?.sentimentTrend || []}>
                                <defs>
                                  <linearGradient id="colorValueLegacy" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a68a4c" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#a68a4c" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(65, 71, 84, 0.1)" />
                                <XAxis 
                                  dataKey="name" 
                                  axisLine={false} 
                                  tickLine={false} 
                                  tick={{ fill: '#c1c6d7', fontSize: 10, fontWeight: 600 }}
                                  dy={10}
                                />
                                <YAxis hide />
                                <Tooltip 
                                  contentStyle={{ 
                                    backgroundColor: '#e2e2e6', 
                                    border: 'none', 
                                    borderRadius: '4px',
                                    color: '#111316',
                                    fontSize: '12px',
                                    fontWeight: 'bold'
                                  }}
                                  itemStyle={{ color: '#111316' }}
                                  cursor={{ stroke: '#a68a4c', strokeWidth: 2 }}
                                />
                                <Area 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke="#a68a4c" 
                                  strokeWidth={3}
                                  fillOpacity={1} 
                                  fill="url(#colorValueLegacy)" 
                                  animationDuration={2000}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </motion.div>

                        {/* Submission by Product Type */}
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.4 }}
                          className="glass p-8 rounded-2xl flex flex-col"
                        >
                          <h2 className="text-xl font-headline font-extrabold tracking-tight mb-2">Legacy Submission by Type</h2>
                          <p className="text-on-surface-variant text-sm font-medium mb-10">Historical category mix</p>
                          
                          <div className="relative flex-1 flex items-center justify-center min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={legacyStats?.distribution || []}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={5}
                                  dataKey="value"
                                  stroke="none"
                                >
                                  {legacyStats?.distribution.map((entry, index) => (
                                    <Cell key={`cell-legacy-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-3xl font-headline font-black">{legacyStats?.csat || 0}%</span>
                              <span className="text-[10px] font-headline font-bold text-on-surface-variant uppercase tracking-widest">Archive</span>
                            </div>
                          </div>

                          <div className="mt-10 space-y-3">
                            {legacyStats?.distribution.map((item) => (
                              <div key={item.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                                  <span className="text-sm font-semibold">{item.name}</span>
                                </div>
                                <span className="text-sm font-bold text-on-surface-variant">{item.value}%</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      </section>

                      <section className="glass rounded-2xl overflow-hidden">
                        <div className="p-8">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                            <div>
                              <div className="flex items-center gap-4">
                                <h2 className="text-xl font-headline font-extrabold tracking-tight">Legacy Archive</h2>
                                {legacySubmissions.length > 0 && (
                                  <div className="px-3 py-1 bg-secondary-fixed/10 text-secondary-fixed rounded-full text-[10px] font-black uppercase tracking-widest border border-secondary-fixed/20">
                                    {legacyStats?.reviewedCount || 0}/{legacySubmissions.length} Evaluated
                                  </div>
                                )}
                              </div>
                              <p className="text-on-surface-variant text-sm font-medium">Historical feedback records</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => fetchData('legacy')}
                                disabled={legacyLoading}
                                className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-primary/20 transition-all disabled:opacity-50 border border-primary/20"
                              >
                                <RefreshCw size={12} className={legacyLoading ? 'animate-spin' : ''} />
                                Sync Data
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="w-full overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[1200px]">
                            <thead>
                              <tr className="bg-surface-container-high/50 border-b border-outline-variant/10">
                                {[
                                  'Reference',
                                  'Actions',
                                  'Course Name',
                                  'Sentiment Tag',
                                  'Teacher Name & School Name',
                                  'Product Type',
                                  'Submission Date'
                                ].map((header) => (
                                  <th key={header} className="px-8 py-4 text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant whitespace-nowrap">
                                    {header}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/5">
                              {legacySubmissions.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="px-8 py-20 text-center">
                                    <div className="flex flex-col items-center gap-2 opacity-40">
                                      <Search size={32} />
                                      <p className="text-sm font-medium">No legacy records found in the connected sheet.</p>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                legacySubmissions.map((entry) => (
                                  <tr key={entry.id} className="hover:bg-surface-container-low transition-colors">
                                    <td className="px-8 py-6 text-[10px] font-black font-mono text-primary opacity-60">
                                      {entry.refId}
                                    </td>
                                    <td className="px-8 py-6">
                                      <div className="flex items-center gap-3">
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${entry.isReviewed ? 'bg-secondary-fixed border-secondary-fixed text-on-secondary-fixed' : 'border-outline-variant'}`}>
                                          {entry.isReviewed && <Check size={10} strokeWidth={4} />}
                                        </div>
                                        <button onClick={() => setSelectedSubmission(entry)} className="text-primary hover:underline font-bold text-xs">Details</button>
                                      </div>
                                    </td>
                                    <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[200px]">{getFuzzyVal(entry.rawData, ['Course Name']) || 'N/A'}</td>
                                    <td className="px-8 py-6 text-sm min-w-[180px]">
                                      <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded ring-1 ${entry.sentimentColor}`}>
                                          {entry.sentiment}
                                        </span>
                                        <span className="text-[10px] font-bold text-on-surface-variant opacity-60">
                                          ({entry.sentimentScore > 0 ? '+' : ''}{entry.sentimentScore.toFixed(1)})
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-8 py-6 text-sm font-bold min-w-[250px]">{getFuzzyVal(entry.rawData, ['Teacher Name & School Name']) || entry.school}</td>
                                    <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[150px]">{entry.type}</td>
                                    <td className="px-8 py-6 text-sm text-on-surface-variant whitespace-nowrap">{getFuzzyVal(entry.rawData, ['Submission Date']) || entry.timestamp}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </>
                  )}
                </motion.div>
              )}

              {activeTab === 'Logs' && (
                <motion.div
                  key="logs"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <section className="glass rounded-2xl overflow-hidden">
                    <div className="p-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-4">
                          <h2 className="text-xl font-headline font-extrabold tracking-tight">Full Submission Log</h2>
                          {submissions.length > 0 && (
                            <div className="px-3 py-1 bg-secondary-fixed/10 text-secondary-fixed rounded-full text-[10px] font-black uppercase tracking-widest border border-secondary-fixed/20">
                              {stats?.reviewedCount || 0}/{submissions.length} Evaluated
                            </div>
                          )}
                        </div>
                        <p className="text-on-surface-variant text-sm font-medium">Complete history of student feedback</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                        <button 
                          onClick={() => fetchData('current')}
                          disabled={loading}
                          className="px-6 py-2.5 bg-primary/10 text-primary rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                          Sync Data
                        </button>
                        <button 
                          onClick={() => {
                            const headers = ['Timestamp', 'School', 'ID', 'Customer', 'Type', 'Sentiment', 'Score'];
                            const rows = filteredSubmissions.map(s => [
                              s.timestamp, s.school, s.id, s.customer, s.type, s.sentiment, s.sentimentScore
                            ]);
                            const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
                            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                            const link = document.createElement("a");
                            const url = URL.createObjectURL(blob);
                            link.setAttribute("href", url);
                            link.setAttribute("download", `submissions_${new Date().toISOString().split('T')[0]}.csv`);
                            link.style.visibility = 'hidden';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="px-6 py-2.5 bg-surface-container-high rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-surface-container transition-colors flex items-center gap-2"
                        >
                          <ExternalLink size={14} />
                          Export CSV
                        </button>
                        <div className="relative w-full sm:w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={18} />
                          <input 
                            type="text" 
                            placeholder="Search submissions..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-surface-container px-10 py-2.5 rounded-xl border border-outline-variant/10 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[3000px]">
                        <thead>
                          <tr className="bg-surface-container-high/50 border-b border-outline-variant/10">
                            {[
                              'Reference',
                              'Actions',
                              'Course Name',
                              'Sentiment Tag',
                              'School',
                              'Submission Date',
                              'Now that you\'ve been through all 7 facets — how was the whole experience?',
                              'Looking back across all 7 facets — which one stood out most for you?',
                              'What made it stand out?',
                              'Was there a point during the unit where you felt lost or frustrated? Tap the facet where it happened — or tap \'I was good throughout\' to move on.',
                              'What felt off?',
                              'Finish this sentence: By the end of this unit, I felt...',
                              'At any point during the unit, did it feel like you were actually making music — not just learning about it?',
                              'You\'ve got 5 more playgrounds ahead — how are you feeling about that?',
                              'Anything about the unit you want us to know? Drop it here'
                            ].map((header) => (
                              <th key={header} className="px-8 py-4 text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant whitespace-nowrap">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/5">
                          {filteredSubmissions.map((entry) => (
                            <tr key={entry.id} className="hover:bg-surface-container-low transition-colors">
                              <td className="px-8 py-6 text-[10px] font-black font-mono text-primary opacity-60">
                                {entry.refId}
                              </td>
                              <td className="px-8 py-6">
                                <div className="flex items-center gap-3">
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${entry.isReviewed ? 'bg-secondary-fixed border-secondary-fixed text-on-secondary-fixed' : 'border-outline-variant'}`}>
                                    {entry.isReviewed && <Check size={10} strokeWidth={4} />}
                                  </div>
                                  <button onClick={() => setSelectedSubmission(entry)} className="text-primary hover:underline font-bold text-xs">Details</button>
                                </div>
                              </td>
                              <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[200px]">{getFuzzyVal(entry.rawData, ['Course Name']) || 'N/A'}</td>
                              <td className="px-8 py-6 text-sm min-w-[180px]">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded ring-1 ${entry.sentimentColor}`}>
                                    {entry.sentiment}
                                  </span>
                                  <span className="text-[10px] font-bold text-on-surface-variant opacity-60">
                                    ({entry.sentimentScore > 0 ? '+' : ''}{entry.sentimentScore.toFixed(1)})
                                  </span>
                                </div>
                              </td>
                              <td className="px-8 py-6 text-sm font-bold min-w-[250px]">{entry.school}</td>
                              <td className="px-8 py-6 text-sm text-on-surface-variant whitespace-nowrap">{getFuzzyVal(entry.rawData, ['Submission Date', 'Timestamp']) || entry.timestamp}</td>
                              <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['Now that you\'ve been through all 7 facets — how was the whole experience?']) || 'N/A'}</td>
                              <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['Looking back across all 7 facets — which one stood out most for you?']) || 'N/A'}</td>
                              <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['What made it stand out?']) || 'N/A'}</td>
                              <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[400px]">{getFuzzyVal(entry.rawData, ['Was there a point during the unit where you felt lost or frustrated? Tap the facet where it happened — or tap \'I was good throughout\' to move on.']) || 'N/A'}</td>
                              <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['What felt off?']) || 'N/A'}</td>
                              <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['Finish this sentence: By the end of this unit, I felt...']) || 'N/A'}</td>
                              <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['At any point during the unit, did it feel like you were actually making music — not just learning about it?']) || 'N/A'}</td>
                              <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['You\'ve got 5 more playgrounds ahead — how are you feeling about that?']) || 'N/A'}</td>
                              <td className="px-8 py-6 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['Anything about the unit you want us to know? Drop it here']) || 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </motion.div>
              )}

              {activeTab === 'Settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-2xl mx-auto space-y-8"
                >
                  <div className="glass p-8 rounded-3xl space-y-6">
                    <h2 className="text-2xl font-headline font-black">Connection Settings</h2>
                    <div className="space-y-4">
                      <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Google Sheet Status</label>
                        <div className="flex items-center gap-2 text-secondary-fixed">
                          <div className="w-2 h-2 rounded-full bg-secondary-fixed" />
                          <span className="text-sm font-bold">Connected & Syncing</span>
                        </div>
                      </div>
                      <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Current Sheet ID</label>
                        <p className="text-sm font-bold">{configStatus.currentConfigured ? '✅ Configured' : '❌ Missing'}</p>
                      </div>
                      <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Legacy Sheet ID</label>
                        <p className="text-sm font-bold">{configStatus.legacyConfigured ? '✅ Configured' : '❌ Missing'}</p>
                      </div>
                      <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Data Source</label>
                        <p className="text-sm font-mono text-on-surface truncate">Google Sheets CSV Export</p>
                      </div>
                      <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Last Sync</label>
                        <p className="text-sm font-bold">{new Date().toLocaleTimeString()}</p>
                      </div>
                    </div>
                    <button 
                      onClick={fetchData}
                      className="w-full py-4 bg-surface-container-high rounded-xl font-bold hover:bg-surface-container transition-colors"
                    >
                      Force Re-sync
                    </button>
                  </div>

                  <div className="glass p-8 rounded-3xl border-tertiary-container/10">
                    <h3 className="text-lg font-headline font-bold mb-4">Danger Zone</h3>
                    <p className="text-sm text-on-surface-variant mb-6">Disconnecting will stop all real-time updates to this dashboard.</p>
                    <button className="px-6 py-3 border border-tertiary-container text-tertiary-container rounded-xl text-sm font-bold hover:bg-tertiary-container/10 transition-colors">
                      Disconnect Sheet
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Submission Detail Modal */}
      <AnimatePresence>
        {selectedSubmission && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setSelectedSubmission(null);
                setIsDisputing(false);
                setIsSaved(false);
              }}
              className="absolute inset-0 bg-surface/80 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-surface-container-high rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-outline-variant/20"
            >
              {/* Modal Header */}
              <div className="p-8 border-b border-outline-variant/10 flex justify-between items-start bg-surface-container-highest/30">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-headline font-black tracking-tight">{selectedSubmission.customer}</h2>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ring-1 ${selectedSubmission.sentimentColor}`}>
                      {selectedSubmission.sentiment}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-on-surface-variant font-medium">
                    <div className="flex items-center gap-1.5">
                      <SchoolIcon size={14} />
                      {selectedSubmission.school}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Hash size={14} />
                      ID: {selectedSubmission.id}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock size={14} />
                      {selectedSubmission.timestamp}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setSelectedSubmission(null);
                    setIsDisputing(false);
                    setIsSaved(false);
                  }}
                  className="p-2 hover:bg-surface-container rounded-full transition-colors text-on-surface-variant hover:text-on-surface"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {/* Sentiment Basis Summary */}
                <div className="p-6 bg-surface-container rounded-2xl border border-outline-variant/10">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${selectedSubmission.sentiment === 'POSITIVE' ? 'bg-secondary-fixed' : selectedSubmission.sentiment === 'CRITICAL' ? 'bg-tertiary-container' : 'bg-primary'}`} />
                      <h3 className="text-sm font-headline font-bold uppercase tracking-widest">Sentiment Basis Summary</h3>
                    </div>
                    {aiLoading && (
                      <div className="flex items-center gap-2 text-primary animate-pulse">
                        <Sparkles size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">AI Analyzing...</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-6">
                      {selectedSubmission.aiSummary ? (
                        <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 h-full flex flex-col justify-center">
                          <div className="flex items-center gap-2 mb-4 text-primary">
                            <Sparkles size={18} />
                            <p className="text-xs font-headline font-bold uppercase tracking-widest">AI Summary</p>
                          </div>
                          <p className="text-base text-on-surface leading-relaxed italic font-medium">
                            "{selectedSubmission.aiSummary}"
                          </p>
                          <div className="mt-6 flex flex-wrap items-center gap-3">
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">AI Sentiment:</span>
                            <span className={`text-[10px] font-black uppercase px-3 py-1 rounded ring-1 ${
                              selectedSubmission.aiSentiment === 'POSITIVE' ? 'text-secondary-fixed ring-secondary-fixed/20 bg-secondary-fixed/5' : 
                              selectedSubmission.aiSentiment === 'CRITICAL' ? 'text-tertiary-container ring-tertiary-container/20 bg-tertiary-container/5' : 
                              'text-primary ring-primary/20 bg-primary/5'
                            }`}>
                              {selectedSubmission.aiSentiment}
                            </span>
                            
                            {selectedSubmission.isAIEvaluated && (
                              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-primary/20 border border-primary/30 text-[8px] font-black text-primary uppercase tracking-tighter">
                                <Sparkles size={8} />
                                AI Verified
                              </div>
                            )}
                            
                            <div className="flex flex-wrap gap-2 ml-auto">
                              <button 
                                onClick={() => markAsReviewed(selectedSubmission)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${
                                  selectedSubmission.isReviewed 
                                    ? 'bg-secondary-fixed/20 text-secondary-fixed border-secondary-fixed/40' 
                                    : 'bg-surface-container-highest hover:bg-surface-container-high text-on-surface border-outline-variant/20'
                                }`}
                              >
                                {selectedSubmission.isReviewed ? <Check size={14} /> : <Check size={14} className="opacity-40" />}
                                {selectedSubmission.isReviewed ? 'Submission Saved' : 'Save Submission'}
                              </button>

                              <button 
                                onClick={() => setIsDisputing(!isDisputing)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border ${
                                  isDisputing 
                                    ? 'bg-tertiary-container text-on-tertiary-container border-tertiary-container' 
                                    : 'bg-surface-container-highest hover:bg-surface-container-high text-on-surface border-outline-variant/20'
                                }`}
                              >
                                <ShieldAlert size={14} />
                                Dispute AI
                              </button>

                              <button 
                                onClick={() => revertAISentiment(selectedSubmission)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-surface-container-high text-[10px] font-bold uppercase tracking-widest transition-colors border border-outline-variant/20"
                                title="Restore original sentiment"
                              >
                                <RotateCcw size={14} />
                                Reverse
                              </button>
                            </div>
                          </div>

                          {isDisputing && (
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              className="mt-6 pt-6 border-t border-outline-variant/10"
                            >
                              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-4">Select Correct Sentiment</p>
                              <div className="flex gap-3">
                                {['POSITIVE', 'NEUTRAL', 'CRITICAL'].map((label) => (
                                  <button
                                    key={label}
                                    onClick={() => manuallyUpdateSentiment(selectedSubmission, label)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                                      selectedSubmission.sentiment === label
                                        ? 'bg-primary text-on-primary border-primary'
                                        : 'bg-surface-container-low border-outline-variant/10 hover:border-primary/40'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </div>
                      ) : (
                        <div className="p-6 bg-surface-container-low rounded-2xl border border-outline-variant/5 h-full flex items-center justify-center italic text-on-surface-variant text-sm">
                          AI analysis is being generated...
                        </div>
                      )}
                    </div>

                    <div className="p-6 bg-surface-container-low rounded-2xl border border-outline-variant/10 flex flex-col">
                      <p className="text-xs font-headline font-bold text-on-surface-variant uppercase tracking-widest mb-4">Scoring Impact</p>
                      <div className="flex items-baseline gap-3 mb-6">
                        <span className={`text-5xl font-headline font-black ${selectedSubmission.sentimentScore > 0 ? 'text-secondary-fixed' : 'text-primary'}`}>
                          {selectedSubmission.sentimentScore > 0 ? '+' : ''}{selectedSubmission.sentimentScore.toFixed(1)}
                        </span>
                        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest opacity-60">Points contributed to CSAT</span>
                      </div>
                      
                      <div className="mt-auto pt-6 border-t border-outline-variant/10 space-y-3">
                        <p className="text-sm leading-relaxed text-on-surface-variant">
                          This submission was classified as <span className={`font-black uppercase ${selectedSubmission.sentimentColor.split(' ')[0]}`}>{selectedSubmission.sentiment}</span> because {
                            selectedSubmission.sentimentBasis && selectedSubmission.sentimentBasis.length > 0 
                              ? selectedSubmission.sentimentBasis.join(', and ') + '.'
                              : 'it did not meet specific positive or negative thresholds defined in the classification guide.'
                          }
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-tighter text-on-surface-variant opacity-40">
                          Based on The Ear Academy Classification Guide
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {selectedSubmission.answers.map((item, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant/5 hover:border-primary/20 transition-all group"
                    >
                      <div className="flex items-start gap-4">
                        <div className="mt-1 p-2 rounded-lg bg-primary/5 text-primary group-hover:bg-primary/10 transition-colors">
                          <MessageSquare size={16} />
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-xs font-headline font-bold uppercase tracking-widest text-on-surface-variant">
                            Question {i + 1}
                          </h4>
                          <p className="text-sm font-bold text-on-surface leading-snug">
                            {item.question}
                          </p>
                          <div className="pt-2">
                            <p className="text-sm text-on-surface-variant leading-relaxed italic">
                              "{item.answer}"
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-outline-variant/10 bg-surface-container-highest/30 flex justify-end gap-4">
                <button 
                  onClick={() => {
                    setSelectedSubmission(null);
                    setIsDisputing(false);
                    setIsSaved(false);
                  }}
                  className="px-6 py-2.5 rounded-xl text-sm font-headline font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all"
                >
                  Close View
                </button>
                <button className="bg-primary text-on-primary px-6 py-2.5 rounded-xl text-sm font-headline font-bold uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/20">
                  Export PDF
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
