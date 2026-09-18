/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef, ChangeEvent } from 'react';
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
  ShieldAlert,
  BookOpen,
  Sliders,
  HelpCircle,
  Layers,
  CheckCircle2,
  Award,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  Filter,
  ChevronDown,
  Eye,
  EyeOff,
  Cloud,
  UploadCloud,
  DownloadCloud,
  Share2,
  Copy
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

// Types
interface Submission {
  timestamp: string;
  school: string;
  id: string;
  customer: string;
  type: string;
  sheetCategory?: string;
  sentimentScore: number;
  sentiment: string;
  sentimentColor: string;
  sentimentBasis: string[];
  answers: { question: string; answer: string }[];
  rawData: any;
  courseName: string;
  aiSummary?: string;
  aiSentiment?: string;
  aspects?: {
    engagement?: string;
    clarity?: string;
    confidence?: string;
  };
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

// Parse submission timestamp robustly across formats
const parseSubmissionDate = (dateStr: string): number => {
  if (!dateStr || dateStr === 'N/A' || dateStr === 'Unknown' || dateStr === 'Unknown Date') return 0;
  
  const trimmed = dateStr.trim();
  
  // 1. Standard ISO / string parse
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed) && parsed > 0) return parsed;

  // 2. Format: dd/mm/yyyy or dd/mm/yyyy hh:mm[:ss] or mm/dd/yyyy
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (dmyMatch) {
    const p1 = parseInt(dmyMatch[1], 10);
    const p2 = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    
    // Determine whether p1 is day or month
    let day = p1;
    let month = p2 - 1;
    if (p1 <= 12 && p2 > 12) {
      day = p2;
      month = p1 - 1;
    }
    const d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  // 3. Format: yyyy/mm/dd or yyyy-mm-dd
  const ymdMatch = trimmed.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
    const min = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const sec = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    const d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) return d.getTime();
  }

  return 0;
};

// Format date as concise month + day, e.g. "Sep 18"
const formatSubmissionDate = (dateStr: string): string => {
  if (!dateStr || dateStr === 'N/A' || dateStr === 'Unknown' || dateStr === 'Unknown Date') return 'N/A';
  const trimmed = dateStr.trim();

  // Check if it's already in a short format like "Sep 18"
  if (/^[A-Za-z]{3}\s+\d{1,2}$/.test(trimmed)) {
    return trimmed;
  }

  const time = parseSubmissionDate(trimmed);
  if (time > 0) {
    const d = new Date(time);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  // Fallback regex extract for "YYYY-MM-DD" or "DD/MM/YYYY" or "YYYY-MM-DD HH:mm:ss"
  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  // If split by space or comma, take the first date part
  const firstPart = trimmed.split(/[\s,T]+/)[0];
  return firstPart || trimmed;
};

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
  const [hideCurrentPages, setHideCurrentPages] = useState<boolean>(() => {
    try {
      return localStorage.getItem('hide_current_pages') === 'true';
    } catch {
      return false;
    }
  });

  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const isHidden = localStorage.getItem('hide_current_pages') === 'true';
      return isHidden ? 'LegacySentiment' : 'Overview';
    } catch {
      return 'Overview';
    }
  });
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);

  const toggleHideCurrentPages = () => {
    const nextVal = !hideCurrentPages;
    setHideCurrentPages(nextVal);
    try {
      localStorage.setItem('hide_current_pages', String(nextVal));
    } catch (e) {
      console.error('Failed to save hide_current_pages to localStorage', e);
    }
    if (nextVal && ['Overview', 'Sentiment', 'Logs'].includes(activeTab)) {
      setActiveTab('LegacySentiment');
    }
  };
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [legacySubmissions, setLegacySubmissions] = useState<Submission[]>([]);
  const [legacySubFilter, setLegacySubFilter] = useState<'all' | 'classroom' | 'instrumental'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Date sorting and range filtering states (default to newest first)
  const [dateSortOrder, setDateSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | '7days' | '30days' | '90days' | 'thisYear'>('all');
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [legacyStats, setLegacyStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [configStatus, setConfigStatus] = useState({ 
    currentConfigured: false, 
    legacyConfigured: false, 
    legacyClassroomConfigured: false, 
    legacyInstrumentalConfigured: false, 
    aiConfigured: false 
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [isDisputing, setIsDisputing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [courseSummaries, setCourseSummaries] = useState<Record<string, { summary: string; improvements: string[]; loading: boolean }>>({});
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState<string>('');
  const [serverEvaluationCount, setServerEvaluationCount] = useState<number>(0);

  // Close date dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target as Node)) {
        setIsDateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const groupedSubmissions = useMemo(() => {
    const groups: Record<string, Submission[]> = {};
    submissions.forEach(s => {
      const time = parseSubmissionDate(s.timestamp);
      const date = time > 0 ? new Date(time) : new Date(s.timestamp);
      const monthKey = isNaN(date.getTime()) 
        ? 'Unknown Date' 
        : date.toLocaleString('default', { month: 'long', year: 'numeric' });
      
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(s);
    });
    
    // Sort submissions inside each month based on dateSortOrder
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => {
        const timeA = parseSubmissionDate(a.timestamp);
        const timeB = parseSubmissionDate(b.timestamp);
        if (timeA === 0 && timeB === 0) return 0;
        if (timeA === 0) return 1;
        if (timeB === 0) return -1;
        return dateSortOrder === 'newest' ? timeB - timeA : timeA - timeB;
      });
    });

    return Object.keys(groups)
      .sort((a, b) => {
        if (a === 'Unknown Date') return 1;
        if (b === 'Unknown Date') return -1;
        const timeA = new Date(a).getTime();
        const timeB = new Date(b).getTime();
        return dateSortOrder === 'newest' ? timeB - timeA : timeA - timeB;
      })
      .reduce((acc, key) => {
        acc[key] = groups[key];
        return acc;
      }, {} as Record<string, Submission[]>);
  }, [submissions, dateSortOrder]);

  const CLASSIFICATION_GUIDE = `
    You are the Senior CSAT & Sentiment Analysis Engine for The Ear Academy.
    
    ## Weighted Multi-Factor Scoring Rubric
    Evaluate student feedback holistically across 3 core dimensions:
    1. Star Rating (40% Weight): 5 Stars (+1.0), 4 Stars (+0.75), 3 Stars (0.0), 2 Stars (-0.75), 1 Star (-1.0).
    2. Facet Balance (30% Weight): 0 facets disliked or "None" (+1.0), 1 facet disliked (0.0), 2+ facets disliked (-1.0).
    3. Qualitative Tone & Confidence (30% Weight): 
       - Positive (+1.0): "Amazing", "Loved it", "Really enjoyed it", "Better than expected", "I was good throughout", "Like something clicked", "More confident", "Yes — definitely moments", "Can't wait", "Yeah, I'm in".
       - Neutral (0.0): "It was okay", "Pretty good", "Some parts I liked", "Mixed", "Not sure", "Surprised me", "Glimpses of it", "We'll see".
       - Friction/Critical (-1.0): "Didn't enjoy it", "Disappointing", "Overwhelmed", "Honestly, not that excited", "Didn't get instructions", "Didn't help me understand", "Confusing", "Too hard", "Too fast".

    ## Boundary Edge Cases (Few-Shot Rules)
    - Constructive Enthusiasm (Rating 4-5 stars, enjoyed lessons, mentions wanting extra time on one part) -> Classify as POSITIVE.
    - Mixed Experience (Rating 3 stars, okay feedback, glimpses of making music) -> Classify as NEUTRAL.
    - Actionable Friction (Rating 1-2 stars, OR 2+ facets disliked, OR explicit frustration/disappointment) -> Classify as CRITICAL.
    - Negation Guard: Words like "none", "not confusing", "wasn't too hard", "no issues" MUST NOT trigger critical flags.
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
        Use the provided Classification Guide to determine the sentiment, score, and key aspects.
        
        ${CLASSIFICATION_GUIDE}
        
        Submission Data:
        ${submission.answers.map(a => `${a.question}: ${a.answer}`).join('\n')}
        
        Return the result in JSON format with the following structure:
        {
          "summary": "A 2-sentence summary of the student's feedback focusing on what resonated and any constructive feedback.",
          "sentiment": "POSITIVE, NEUTRAL, or CRITICAL",
          "score": 0-100,
          "reasoning": "Brief explanation citing specific triggers from the rubric",
          "aspects": {
            "engagement": "High, Moderate, or Low",
            "clarity": "Clear, Paced Well, Fast, or Confusing",
            "confidence": "Increased, Unchanged, or Frustrated"
          }
        }
      `;

      const response = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                sentiment: { type: "string" },
                score: { type: "number" },
                reasoning: { type: "string" },
                aspects: {
                  type: "object",
                  properties: {
                    engagement: { type: "string" },
                    clarity: { type: "string" },
                    confidence: { type: "string" }
                  }
                }
              },
              required: ["summary", "sentiment", "score", "reasoning"]
            }
          }
        })
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`AI Server Error: ${text.slice(0, 100)}`);
      }

      let result: any = {};
      if (data.text) {
        try {
          const cleaned = data.text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
          result = JSON.parse(cleaned);
        } catch (e) {
          result = {
            summary: data.text,
            sentiment: "NEUTRAL",
            score: 50,
            reasoning: "Analysis generated from feedback evaluation."
          };
        }
      }
      
      const sentiment = (result.sentiment || 'NEUTRAL').toUpperCase();
      const sentimentMap: Record<string, { color: string }> = {
        'POSITIVE': { color: 'text-secondary-fixed bg-secondary-fixed/10 ring-secondary-fixed/20' },
        'NEUTRAL': { color: 'text-primary bg-primary/10 ring-primary/20' },
        'CRITICAL': { color: 'text-tertiary-container bg-tertiary-container/10 ring-tertiary-container/20' }
      };

      const aiData = sentimentMap[sentiment] || sentimentMap['NEUTRAL'];
      const finalScore = typeof result.score === 'number' ? result.score / 100 : (sentiment === 'POSITIVE' ? 1 : 0);

      const updateSubmission = (prev: Submission) => {
        const updated: Submission = {
          ...prev,
          sentiment: sentiment,
          sentimentScore: finalScore,
          sentimentColor: aiData.color,
          aiSummary: result.summary || 'Summary evaluated.',
          aiSentiment: sentiment,
          aspects: result.aspects || prev.aspects,
          sentimentBasis: result.reasoning ? [result.reasoning] : prev.sentimentBasis,
          isAIEvaluated: true
        };
        return updated;
      };

      persistEvaluation(submission.id, {
        sentiment: sentiment,
        sentimentScore: finalScore,
        sentimentColor: aiData.color,
        aiSummary: result.summary || 'Summary evaluated.',
        aiSentiment: sentiment,
        aspects: result.aspects,
        sentimentBasis: result.reasoning ? [result.reasoning] : submission.sentimentBasis,
        isAIEvaluated: true
      });

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
      console.error("[Frontend] AI Summary Error:", err);
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

      // Asynchronously mirror to server evaluations endpoint so any user or boss sees it
      fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluations: {
            [submissionId]: data
          }
        })
      }).then(r => r.json()).then(j => {
        if (j.count) setServerEvaluationCount(j.count);
      }).catch(err => console.warn('Failed to sync evaluation to server:', err));
    } catch (e) {
      console.error("Failed to persist evaluation", e);
    }
  };

  const syncEvaluationsToServer = async (explicitAlert = false) => {
    setSyncStatus('syncing');
    try {
      const stored = localStorage.getItem('feedback_evaluations');
      const evaluations = stored ? JSON.parse(stored) : {};
      const count = Object.keys(evaluations).length;

      const res = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluations })
      });

      if (!res.ok) throw new Error(`Server responded with ${res.status}`);
      const json = await res.json();
      const updatedCount = json.count || count;
      setServerEvaluationCount(updatedCount);
      setSyncStatus('synced');
      setSyncMessage(`Successfully synced ${updatedCount} evaluated records to the server! When your boss or anyone opens this link, they will see your exact evaluated stats and CSAT score.`);
      setTimeout(() => {
        setSyncStatus('idle');
      }, 5000);
    } catch (e: any) {
      console.error('Failed to sync to server', e);
      setSyncStatus('error');
      setSyncMessage('Failed to sync evaluations to server. Please try again.');
      setTimeout(() => setSyncStatus('idle'), 5000);
    }
  };

  const exportEvaluationsBackup = () => {
    try {
      const stored = localStorage.getItem('feedback_evaluations') || '{}';
      const blob = new Blob([stored], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ear-academy-ai-evaluations-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Failed to export evaluations backup", e);
    }
  };

  const importEvaluationsBackup = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object') {
          localStorage.setItem('feedback_evaluations', JSON.stringify(parsed));
          await syncEvaluationsToServer(true);
          await fetchData('legacy');
          await fetchData('current');
        }
      } catch (err) {
        console.error("Failed to import evaluations backup", err);
      }
    };
    reader.readAsText(file);
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
    const nextReviewedState = !submission.isReviewed;
    const updateData = {
      sentiment: submission.sentiment,
      sentimentScore: submission.sentimentScore,
      sentimentColor: submission.sentimentColor,
      aiSummary: submission.aiSummary,
      aiSentiment: submission.aiSentiment,
      sentimentBasis: submission.sentimentBasis,
      isAIEvaluated: submission.isAIEvaluated,
      isReviewed: nextReviewedState
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
      const updated = prev.map(s => s.id === submission.id ? update(s) : s);
      setStats(calculateStats(updated));
      return updated;
    });

    setLegacySubmissions(prev => {
      const updated = prev.map(s => s.id === submission.id ? update(s) : s);
      setLegacyStats(calculateStats(updated));
      return updated;
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

      const response = await fetch('/api/ai/course-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                summary: { type: "string" },
                improvements: { 
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: ["summary", "improvements"]
            }
          }
        })
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`AI Server Error: ${text.slice(0, 100)}`);
      }

      let result: any = {};
      if (data.text) {
        try {
          const cleaned = data.text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
          result = JSON.parse(cleaned);
        } catch (e) {
          result = {
            summary: data.text,
            improvements: ["Review module pacing based on learner feedback", "Incorporate additional interactive exercises"]
          };
        }
      }

      setCourseSummaries(prev => ({
        ...prev,
        [courseName]: { 
          summary: result.summary || "Course summary successfully evaluated.", 
          improvements: Array.isArray(result.improvements) && result.improvements.length > 0 
            ? result.improvements 
            : ["Review module pacing based on learner feedback", "Incorporate additional interactive exercises"], 
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
      const rating = parseInt(getFuzzyVal(row, ['Rating', 'Score', 'CSAT']) || '0') || 0;
      const rawSentiment = (getFuzzyVal(row, ['Sentiment', 'Sentiment Tag', 'Feedback Type', 'Status']) || '').toString().toUpperCase();
      
      const reservedKeys = [
        '_sheetCategory', 'rawData', 'id', 'refId', 'isReviewed', 'aiSentiment', 'aiSummary', 'isAIEvaluated',
        'timestamp', 'school', 'customer', 'type', 'coursename', 'course name', 'sentiment', 'sentiment tag',
        'submission id', 'rating', 'score'
      ];
      const questions = Object.keys(row).filter(key => 
        !reservedKeys.some(r => key.toLowerCase().replace(/[^a-z0-9]/g, '') === r.toLowerCase().replace(/[^a-z0-9]/g, ''))
      );

      // Extract only student response values to avoid false matching on question headers
      const answersOnly = questions.map(q => String(row[q] || '')).join(' ').toLowerCase();

      // Count facets not enjoyed specifically from the answer
      const facetsRaw = (getFuzzyVal(row, ["Please select any facet(s) you didn't enjoy"]) || '').toString().trim();
      const isNoneFacet = !facetsRaw || 
                          facetsRaw.toLowerCase() === 'none' || 
                          facetsRaw.toLowerCase() === 'n/a' || 
                          facetsRaw.toLowerCase().includes('enjoyed all');
      const facetsNotEnjoyedCount = isNoneFacet ? 0 : facetsRaw.split(',').map(s => s.trim()).filter(Boolean).length;

      // 1. Rating factor (40% weight)
      let ratingWeight = 0.0;
      if (rating === 5) ratingWeight = 1.0;
      else if (rating === 4) ratingWeight = 0.75;
      else if (rating === 3) ratingWeight = 0.0;
      else if (rating === 2) ratingWeight = -0.75;
      else if (rating === 1) ratingWeight = -1.0;

      // 2. Facets factor (30% weight)
      let facetsWeight = isNoneFacet || facetsNotEnjoyedCount === 0 ? 1.0 : (facetsNotEnjoyedCount === 1 ? 0.0 : -1.0);

      // 3. Text tone / Confidence signals (30% weight)
      const hasExplicitNegativeWord = 
        answersOnly.includes('didn\'t enjoy it') ||
        answersOnly.includes('disappointing') ||
        answersOnly.includes('overwhelmed') ||
        answersOnly.includes('honestly, not that excited') ||
        (answersOnly.includes('not really') && !answersOnly.includes('not really difficult') && !answersOnly.includes('not really confusing')) ||
        answersOnly.includes('didn\'t get the instructions') ||
        answersOnly.includes('didn\'t help me understand') ||
        (answersOnly.includes('confusing') && !answersOnly.includes('not confusing') && !answersOnly.includes('never confusing') && !answersOnly.includes('nothing confusing') && !answersOnly.includes('no confusing')) ||
        (answersOnly.includes('too hard') && !answersOnly.includes('not too hard') && !answersOnly.includes('wasn\'t too hard')) ||
        (answersOnly.includes('too fast') && !answersOnly.includes('not too fast')) ||
        (answersOnly.includes('too slow') && !answersOnly.includes('not too slow'));

      const hasExplicitPositiveWord = 
        answersOnly.includes('amazing') ||
        answersOnly.includes('loved it') ||
        answersOnly.includes('really enjoyed') ||
        answersOnly.includes('better than expected') ||
        answersOnly.includes('i was good throughout') ||
        answersOnly.includes('like something clicked') ||
        answersOnly.includes('more confident') ||
        answersOnly.includes('yes — there were definitely moments') ||
        answersOnly.includes("can't wait") ||
        answersOnly.includes("yeah, i'm in") ||
        answersOnly.includes('i enjoyed all of the facets') ||
        answersOnly.includes('engaging and fun') ||
        answersOnly.includes('really helpful') ||
        answersOnly.includes('my favourite part') ||
        answersOnly.includes('brilliant') ||
        answersOnly.includes('great');

      let textWeight = 0.0;
      if (hasExplicitPositiveWord && !hasExplicitNegativeWord) textWeight = 1.0;
      else if (hasExplicitNegativeWord) textWeight = -1.0;

      // Weighted Composite Score:
      const composite = (0.40 * ratingWeight) + (0.30 * facetsWeight) + (0.30 * textWeight);

      let sentiment = 'NEUTRAL';
      let sentimentColor = 'text-primary bg-primary/10 ring-primary/20';
      let sentimentScore = 0; // Default for neutral/negative

      if (rawSentiment.includes('POSITIVE') || (composite >= 0.35 && !hasExplicitNegativeWord) || (rating >= 4 && !hasExplicitNegativeWord && facetsNotEnjoyedCount < 2)) {
        sentiment = 'POSITIVE';
        sentimentColor = 'text-secondary-fixed bg-secondary-fixed/10 ring-secondary-fixed/20';
        sentimentScore = 1;
      } else if (rawSentiment.includes('NEGATIVE') || rawSentiment.includes('CRITICAL') || composite <= -0.20 || facetsNotEnjoyedCount >= 2 || (rating > 0 && rating <= 2)) {
        sentiment = 'CRITICAL';
        sentimentColor = 'text-tertiary-container bg-tertiary-container/10 ring-tertiary-container/20';
        sentimentScore = 0;
      } else {
        sentiment = 'NEUTRAL';
        sentimentColor = 'text-primary bg-primary/10 ring-primary/20';
        sentimentScore = 0;
      }

      // Aspect Dimensions
      const aspects = {
        engagement: (sentiment === 'POSITIVE' || hasExplicitPositiveWord) ? 'High' : (sentiment === 'CRITICAL' ? 'Low' : 'Moderate'),
        clarity: answersOnly.includes('confusing') ? 'Confusing' : (answersOnly.includes('too fast') ? 'Fast' : 'Clear / Paced Well'),
        confidence: (answersOnly.includes('more confident') || answersOnly.includes('clicked') || answersOnly.includes('actually making music')) ? 'Increased' : (answersOnly.includes('frustrated') || answersOnly.includes('lost') ? 'Frustrated' : 'Unchanged')
      };

      const sentimentBasis: string[] = [];
      if (facetsNotEnjoyedCount >= 2) sentimentBasis.push(`Reported ${facetsNotEnjoyedCount} facets not enjoyed (Threshold: 2+)`);
      else if (facetsNotEnjoyedCount === 1) sentimentBasis.push(`Reported 1 facet not enjoyed (Moderate/Constructive)`);
      else if (isNoneFacet) sentimentBasis.push(`Enjoyed all facets / No friction reported`);

      if (rating > 0 && rating <= 2) sentimentBasis.push(`Low rating of ${rating} stars provided`);
      else if (rating >= 4) sentimentBasis.push(`High rating of ${rating} stars provided`);
      else if (rating === 3) sentimentBasis.push(`Moderate rating of 3 stars provided`);

      if (hasExplicitNegativeWord && sentiment === 'CRITICAL') sentimentBasis.push('Student reported friction or pacing difficulty');
      if (answersOnly.includes('amazing') || answersOnly.includes('loved it')) sentimentBasis.push('Student expressed high enthusiasm (Amazing/Loved it)');
      if (answersOnly.includes('really enjoyed') || answersOnly.includes('more confident')) sentimentBasis.push('Student reported increased confidence & enjoyment');
      if (answersOnly.includes('i was good throughout')) sentimentBasis.push('Student reported smooth learning with no frustration');
      if (answersOnly.includes('yes — there were definitely moments')) sentimentBasis.push('Student confirmed positive music-making moments');
      if (answersOnly.includes("can't wait") || answersOnly.includes("yeah, i'm in")) sentimentBasis.push('Student showed high excitement for upcoming content');

      if (sentimentBasis.length === 0) {
        sentimentBasis.push(sentiment === 'POSITIVE' ? 'High overall student satisfaction' : 'Standard feedback submission');
      }

      // Guarantee unique ID generation per submission log by always including index
      const sheetId = getFuzzyVal(row, ['Submission ID', 'ID', 'Ref']);
      const processedId = `${source}-idx-${index}${sheetId ? `-${sheetId}` : ''}`;
      
      // Check if this row already contains AI data from the sheet
      const existingAISentiment = getFuzzyVal(row, ['AI Sentiment', 'Sentiment Label', 'AI Tag']);
      const existingAISummary = getFuzzyVal(row, ['AI Summary', 'Summary']);

      const sheetCategory = (row._sheetCategory as string) || (
        getFuzzyVal(row, ['Form Type', 'Type', 'Category'])?.toLowerCase().includes('classroom') ? 'Classroom' : 
        getFuzzyVal(row, ['Form Type', 'Type', 'Category'])?.toLowerCase().includes('instrumental') ? 'Instrumental' : 
        (source === 'current' ? 'Current' : 'General')
      );

      return {
        timestamp: getFuzzyVal(row, ['Timestamp', 'Date', 'Time', 'Submission Date']) || 'N/A',
        school: getFuzzyVal(row, ['School Name', 'School', 'Location', 'Teacher Name & School Name']) || 'N/A',
        id: processedId,
        customer: getFuzzyVal(row, ['Customer Name', 'Customer', 'Student', 'Name']) || 'Anonymous',
        type: getFuzzyVal(row, ['Form Type', 'Type', 'Category']) || (sheetCategory === 'Classroom' ? 'Classroom' : 'General'),
        sheetCategory,
        courseName: getFuzzyVal(row, ['Course Name', 'Course', 'Unit']) || 'General',
        sentimentScore: existingAISentiment ? (existingAISentiment === 'POSITIVE' ? 1 : 0) : sentimentScore,
        sentiment: existingAISentiment || sentiment,
        sentimentColor: existingAISentiment ? 
          (existingAISentiment === 'POSITIVE' ? 'text-secondary-fixed bg-secondary-fixed/10 ring-secondary-fixed/20' : 
           existingAISentiment === 'CRITICAL' ? 'text-tertiary-container bg-tertiary-container/10 ring-tertiary-container/20' : 
           'text-primary bg-primary/10 ring-primary/20') : sentimentColor,
        sentimentBasis: existingAISummary ? [existingAISummary] : sentimentBasis,
        aspects,
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
        name: formatSubmissionDate(s.timestamp), 
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
      const text = await response.text();
      
      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        console.error(`[Frontend] Failed to parse ${type} response as JSON:`, text);
        throw new Error(`Server returned non-JSON response: ${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`);
      }

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
      
      // Merge with persisted evaluations: fetch server evaluations + local cache
      let serverEvaluations: Record<string, any> = {};
      try {
        const evalRes = await fetch('/api/evaluations');
        if (evalRes.ok) {
          const evalJson = await evalRes.json();
          serverEvaluations = evalJson.evaluations || {};
          if (evalJson.count !== undefined) {
            setServerEvaluationCount(evalJson.count);
          }
        }
      } catch (err) {
        console.warn("[Frontend] Failed to fetch server evaluations", err);
      }

      let localEvaluations: Record<string, any> = {};
      try {
        const stored = localStorage.getItem('feedback_evaluations');
        if (stored) {
          localEvaluations = JSON.parse(stored);
        }
      } catch (e) {
        console.error("Error reading persisted evaluations from localStorage", e);
      }

      const localCount = Object.keys(localEvaluations).length;
      const serverCount = Object.keys(serverEvaluations).length;

      // If user has local evaluations not yet saved on server, auto-sync so all visitors/boss see them
      if (localCount > 0 && localCount >= serverCount) {
        fetch('/api/evaluations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ evaluations: localEvaluations })
        }).then(r => r.json()).then(j => {
          if (j.count) setServerEvaluationCount(j.count);
        }).catch(e => console.warn('Auto-sync to server background error:', e));
      }

      // Merge evaluations (local overrides or supplements server)
      const combinedEvaluations = { ...serverEvaluations, ...localEvaluations };

      // Also persist back to localStorage so if the boss opens the link, their local cache also has it
      if (Object.keys(combinedEvaluations).length > 0) {
        try {
          localStorage.setItem('feedback_evaluations', JSON.stringify(combinedEvaluations));
        } catch (e) {}
      }

      const mergedData = processed.map(s => {
        if (combinedEvaluations[s.id]) {
          return { ...s, ...combinedEvaluations[s.id] };
        }
        return s;
      });
      
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
        const text = await response.text();
        try {
          const status = JSON.parse(text);
          setConfigStatus(status);
        } catch (e) {
          console.error("Failed to parse status response:", text);
        }
      } catch (e) {
        console.error("Failed to check config status", e);
      }
    };

    checkStatus();
    fetchData('current');
    fetchData('legacy');
  }, []);

  const filteredSubmissions = useMemo(() => {
    let items = submissions.filter(s => 
      s.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.school.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.courseName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Apply Date Range Filter if active
    if (dateRangeFilter !== 'all') {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      let cutoff = 0;
      if (dateRangeFilter === '7days') cutoff = now - 7 * dayMs;
      else if (dateRangeFilter === '30days') cutoff = now - 30 * dayMs;
      else if (dateRangeFilter === '90days') cutoff = now - 90 * dayMs;
      else if (dateRangeFilter === 'thisYear') cutoff = new Date(new Date().getFullYear(), 0, 1).getTime();

      if (cutoff > 0) {
        items = items.filter(s => {
          const time = parseSubmissionDate(s.timestamp);
          return time === 0 || time >= cutoff;
        });
      }
    }

    // Sort by submission date (latest first by default)
    return [...items].sort((a, b) => {
      const timeA = parseSubmissionDate(a.timestamp);
      const timeB = parseSubmissionDate(b.timestamp);
      if (timeA === 0 && timeB === 0) return 0;
      if (timeA === 0) return 1;
      if (timeB === 0) return -1;
      return dateSortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });
  }, [submissions, searchTerm, dateSortOrder, dateRangeFilter]);

  const filteredLegacySubmissions = useMemo(() => {
    let items = legacySubmissions;
    if (legacySubFilter === 'classroom') {
      items = items.filter(s => 
        s.sheetCategory === 'Classroom' || 
        s.type.toLowerCase().includes('classroom') ||
        s.courseName.toLowerCase().includes('classroom')
      );
    } else if (legacySubFilter === 'instrumental') {
      items = items.filter(s => 
        s.sheetCategory === 'Instrumental' || 
        s.type.toLowerCase().includes('instrumental')
      );
    }
    if (searchTerm) {
      items = items.filter(s =>
        s.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.school.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.courseName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply Date Range Filter if active
    if (dateRangeFilter !== 'all') {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      let cutoff = 0;
      if (dateRangeFilter === '7days') cutoff = now - 7 * dayMs;
      else if (dateRangeFilter === '30days') cutoff = now - 30 * dayMs;
      else if (dateRangeFilter === '90days') cutoff = now - 90 * dayMs;
      else if (dateRangeFilter === 'thisYear') cutoff = new Date(new Date().getFullYear(), 0, 1).getTime();

      if (cutoff > 0) {
        items = items.filter(s => {
          const time = parseSubmissionDate(s.timestamp);
          return time === 0 || time >= cutoff;
        });
      }
    }

    // Sort by submission date (latest first by default)
    return [...items].sort((a, b) => {
      const timeA = parseSubmissionDate(a.timestamp);
      const timeB = parseSubmissionDate(b.timestamp);
      if (timeA === 0 && timeB === 0) return 0;
      if (timeA === 0) return 1;
      if (timeB === 0) return -1;
      return dateSortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });
  }, [legacySubmissions, legacySubFilter, searchTerm, dateSortOrder, dateRangeFilter]);

  const activeLegacyStats = useMemo(() => {
    return calculateStats(filteredLegacySubmissions);
  }, [filteredLegacySubmissions]);

  const groupedLegacySubmissions = useMemo(() => {
    const groups: Record<string, Submission[]> = {};
    filteredLegacySubmissions.forEach(s => {
      const time = parseSubmissionDate(s.timestamp);
      const date = time > 0 ? new Date(time) : new Date(s.timestamp);
      const monthKey = isNaN(date.getTime()) 
        ? 'Unknown Date' 
        : date.toLocaleString('default', { month: 'long', year: 'numeric' });
      
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(s);
    });
    
    // Sort submissions inside each month based on dateSortOrder
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => {
        const timeA = parseSubmissionDate(a.timestamp);
        const timeB = parseSubmissionDate(b.timestamp);
        if (timeA === 0 && timeB === 0) return 0;
        if (timeA === 0) return 1;
        if (timeB === 0) return -1;
        return dateSortOrder === 'newest' ? timeB - timeA : timeA - timeB;
      });
    });

    return Object.keys(groups)
      .sort((a, b) => {
        if (a === 'Unknown Date') return 1;
        if (b === 'Unknown Date') return -1;
        const timeA = new Date(a).getTime();
        const timeB = new Date(b).getTime();
        return dateSortOrder === 'newest' ? timeB - timeA : timeA - timeB;
      })
      .reduce((acc, key) => {
        acc[key] = groups[key];
        return acc;
      }, {} as Record<string, Submission[]>);
  }, [filteredLegacySubmissions, dateSortOrder]);

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
        
        <nav className="flex flex-col gap-7 flex-1">
          {[
            { id: 'Overview', icon: LayoutDashboard, label: 'Overview', isStandard: true },
            { id: 'Sentiment', icon: BarChart3, label: 'Sentiment', isStandard: true },
            { id: 'Logs', icon: Database, label: 'Logs', isStandard: true },
            { id: 'Legacy', icon: Clock, label: 'Legacy Logs', isStandard: false },
            { id: 'LegacySentiment', icon: Sparkles, label: 'Legacy Sent.', isStandard: false },
            { id: 'Settings', icon: Settings, label: 'Settings', isStandard: false },
          ]
            .filter((item) => !hideCurrentPages || !item.isStandard)
            .map((item) => (
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
          {(isDemo || !configStatus.aiConfigured) && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-primary/20 border-b border-primary/20 px-12 py-2 flex items-center justify-between overflow-hidden"
            >
              <div className="flex items-center gap-2 text-primary">
                <Sparkles size={14} />
                <span className="text-[10px] font-headline font-bold uppercase tracking-widest">
                  {isDemo && !configStatus.aiConfigured 
                    ? "Viewing Demo Data & Simulated AI: Connect Google Sheets and Gemini API in Settings"
                    : !configStatus.aiConfigured
                      ? "Simulated AI Active: Add your GEMINI_API_KEY in Settings for real analysis"
                      : "Viewing Demo Data: Connect your Google Sheet in Settings to see real feedback"}
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
                { id: 'Overview', label: 'Overview', isStandard: true },
                { id: 'Sentiment', label: 'Sentiment Analysis', isStandard: true },
                { id: 'Logs', label: 'Submission Logs', isStandard: true },
                { id: 'Legacy', label: 'Legacy Logs', isStandard: false },
                { id: 'LegacySentiment', label: 'Legacy Sentiment', isStandard: false },
              ]
                .filter((tab) => !hideCurrentPages || !tab.isStandard)
                .map((tab) => (
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
              <button 
                onClick={() => setIsGuideModalOpen(true)}
                className="flex items-center gap-2 bg-surface-container-low px-4 py-2 rounded-lg border border-outline-variant/10 text-on-surface-variant hover:text-primary hover:border-primary/40 hover:bg-surface-container transition-all cursor-pointer text-xs font-headline font-bold uppercase tracking-wider"
                title="View CSAT & Sentiment Classification Rubric"
              >
                <BookOpen size={14} className="text-primary" />
                <span>Classification Guide</span>
              </button>
              {/* Date Scope & Sort Filter Dropdown */}
              <div className="relative" ref={dateDropdownRef}>
                <button 
                  onClick={() => setIsDateDropdownOpen(prev => !prev)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-headline font-bold uppercase transition-all cursor-pointer ${
                    dateRangeFilter !== 'all' || dateSortOrder === 'oldest'
                      ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                      : 'bg-surface-container-low border-outline-variant/10 text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                  }`}
                  title="Filter and Sort by Submission Date"
                >
                  <Calendar size={14} className={dateRangeFilter !== 'all' || dateSortOrder === 'oldest' ? 'text-primary' : 'text-on-surface-variant'} />
                  <span>
                    {dateRangeFilter === 'all' ? 'All Time' :
                     dateRangeFilter === '7days' ? 'Last 7 Days' :
                     dateRangeFilter === '30days' ? 'Last 30 Days' :
                     dateRangeFilter === '90days' ? 'Last 90 Days' : 'This Year'}
                  </span>
                  <span className="text-[10px] opacity-70 px-1.5 py-0.5 rounded bg-surface-container-high">
                    {dateSortOrder === 'newest' ? 'Latest' : 'Oldest'}
                  </span>
                  <ChevronDown size={12} className={`transition-transform duration-200 ${isDateDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isDateDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-72 p-4 rounded-2xl bg-surface-container-highest/95 backdrop-blur-2xl border border-outline-variant/20 shadow-2xl z-50 space-y-4"
                    >
                      {/* Sort Direction */}
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2 flex items-center gap-1.5">
                          <ArrowUpDown size={11} />
                          <span>Sort Order</span>
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              setDateSortOrder('newest');
                              setIsDateDropdownOpen(false);
                            }}
                            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition-all ${
                              dateSortOrder === 'newest'
                                ? 'bg-primary text-on-primary border-primary shadow-md'
                                : 'bg-surface-container/60 border-outline-variant/10 text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                            }`}
                          >
                            <ArrowDown size={14} className="mb-1" />
                            <span>Latest First</span>
                            <span className="text-[9px] opacity-70 font-normal">Newest &rarr; Old</span>
                          </button>
                          <button
                            onClick={() => {
                              setDateSortOrder('oldest');
                              setIsDateDropdownOpen(false);
                            }}
                            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-bold transition-all ${
                              dateSortOrder === 'oldest'
                                ? 'bg-primary text-on-primary border-primary shadow-md'
                                : 'bg-surface-container/60 border-outline-variant/10 text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                            }`}
                          >
                            <ArrowUp size={14} className="mb-1" />
                            <span>Oldest First</span>
                            <span className="text-[9px] opacity-70 font-normal">Old &rarr; Newest</span>
                          </button>
                        </div>
                      </div>

                      {/* Date Range Scope */}
                      <div className="border-t border-outline-variant/10 pt-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-1.5">
                          <Filter size={11} />
                          <span>Date Range Filter</span>
                        </p>
                        <div className="space-y-1">
                          {[
                            { id: 'all', label: 'All Time (Full Archive)' },
                            { id: '7days', label: 'Last 7 Days' },
                            { id: '30days', label: 'Last 30 Days' },
                            { id: '90days', label: 'Last 90 Days' },
                            { id: 'thisYear', label: 'This Year (2026)' },
                          ].map((item) => (
                            <button
                              key={item.id}
                              onClick={() => {
                                setDateRangeFilter(item.id as any);
                                setIsDateDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                                dateRangeFilter === item.id
                                  ? 'bg-primary/20 text-primary border border-primary/30 font-extrabold'
                                  : 'text-on-surface-variant hover:bg-surface-container/60 hover:text-on-surface'
                              }`}
                            >
                              <span>{item.label}</span>
                              {dateRangeFilter === item.id && <Check size={14} className="text-primary" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-headline font-extrabold tracking-tight">Recent Submissions</h2>
                        <span className="text-xs px-2.5 py-1 rounded-full bg-surface-container-high font-headline font-bold text-on-surface-variant flex items-center gap-1.5">
                          {dateSortOrder === 'newest' ? <ArrowDown size={12} className="text-primary" /> : <ArrowUp size={12} className="text-primary" />}
                          {dateSortOrder === 'newest' ? 'Latest First' : 'Oldest First'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setDateSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
                          className="px-3 py-1.5 rounded-lg border border-outline-variant/10 text-xs font-bold text-on-surface-variant hover:text-primary hover:bg-surface-container-low transition-all flex items-center gap-1.5"
                          title="Toggle sort order"
                        >
                          <ArrowUpDown size={12} />
                          <span>Sort: {dateSortOrder === 'newest' ? 'Newest' : 'Oldest'}</span>
                        </button>
                        <button onClick={() => setActiveTab('Logs')} className="text-primary text-sm font-bold hover:underline">View All Logs</button>
                      </div>
                    </div>
                    <div className="w-full overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-outline-variant/10 text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant/60">
                            <th className="px-8 py-3">Student</th>
                            <th className="px-8 py-3">School</th>
                            <th className="px-8 py-3">Date</th>
                            <th className="px-8 py-3">Sentiment</th>
                            <th className="px-8 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/5">
                          {filteredSubmissions.slice(0, 6).map((entry, i) => (
                            <tr key={`${entry.id}-${i}`} className="hover:bg-surface-container-low transition-colors">
                              <td className="px-8 py-4 text-sm font-bold">{entry.customer}</td>
                              <td className="px-8 py-4 text-sm text-on-surface-variant">{entry.school}</td>
                              <td className="px-8 py-4 text-xs font-mono text-on-surface-variant/80 whitespace-nowrap">
                                {formatSubmissionDate(entry.timestamp)}
                              </td>
                              <td className="px-8 py-4">
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ring-1 ${entry.sentimentColor}`}>
                                  {entry.sentiment}
                                </span>
                              </td>
                              <td className="px-8 py-4 text-right">
                                <button onClick={() => setSelectedSubmission(entry)} className="text-primary hover:opacity-80 p-1 rounded"><ChevronRight size={18} /></button>
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
                                            <span className="text-[8px] font-medium text-on-surface-variant">{formatSubmissionDate(s.timestamp)}</span>
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
                  ) : !configStatus.legacyConfigured && !configStatus.legacyClassroomConfigured && !configStatus.legacyInstrumentalConfigured ? (
                    <div className="glass p-12 rounded-3xl text-center space-y-6">
                      <Database size={48} className="text-on-surface-variant mx-auto opacity-20" />
                      <div>
                        <h2 className="text-xl font-headline font-black">Legacy Data Sheets Not Connected</h2>
                        <p className="text-on-surface-variant max-w-md mx-auto mt-2">To view archived data, you can connect your Legacy Classroom and Instrumental Google Sheets:</p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
                        <div className="p-4 rounded-xl bg-surface-container/50 border border-outline-variant/20">
                          <p className="text-[10px] font-black uppercase text-primary mb-1">Sheet 1: Classroom Legacy Jotform</p>
                          <p className="text-xs font-medium">Sheet ID: <code>1GFIn6sf9j9DEbhseJRzg-NSOW7Rhxj4SBeloKVwMklQ</code> (<b>LEGACY_CLASSROOM_SHEET_ID</b>)</p>
                        </div>
                        <div className="p-4 rounded-xl bg-surface-container/50 border border-outline-variant/20">
                          <p className="text-[10px] font-black uppercase text-primary mb-1">Sheet 2: Instrumental - Legacy Jotform</p>
                          <p className="text-xs font-medium">Sheet ID: <code>17101J4-5MlMmbvw1-s-7I3IFENERImyRWsIkZgtJa1s</code> (<b>LEGACY_SHEET_ID</b>)</p>
                        </div>
                        <div className="p-4 rounded-xl bg-surface-container/50 border border-outline-variant/20">
                          <p className="text-[10px] font-black uppercase text-primary mb-1">Google Sheets Sharing</p>
                          <p className="text-xs font-medium">In Sheets: File &gt; Share &gt; Set to "Anyone with the link can view".</p>
                        </div>
                        <div className="p-4 rounded-xl bg-surface-container/50 border border-outline-variant/20">
                          <p className="text-[10px] font-black uppercase text-primary mb-1">Sync</p>
                          <p className="text-xs font-medium">Click Sync Data to load the combined legacy historical logs.</p>
                        </div>
                      </div>

                      <div className="pt-4">
                        <button 
                          onClick={() => fetchData('legacy')} 
                          className="px-6 py-3 bg-primary text-on-primary rounded-full font-black uppercase tracking-widest text-xs hover:scale-105 transition-transform"
                        >
                          Check Connection
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Sub-Category Stream Switcher */}
                      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-headline font-black uppercase tracking-widest text-on-surface-variant mr-1">Archive Stream:</span>
                          {[
                            { id: 'all', label: 'All Legacy Archives', count: legacySubmissions.length, icon: Database },
                            { id: 'classroom', label: 'Classroom Legacy Jotform', count: legacySubmissions.filter(s => s.sheetCategory === 'Classroom' || s.type.toLowerCase().includes('classroom') || s.courseName.toLowerCase().includes('classroom')).length, icon: SchoolIcon, env: 'LEGACY_CLASSROOM_SHEET_ID', configured: configStatus.legacyClassroomConfigured },
                            { id: 'instrumental', label: 'Instrumental - Legacy Jotform', count: legacySubmissions.filter(s => s.sheetCategory === 'Instrumental' || s.type.toLowerCase().includes('instrumental')).length, icon: LayoutDashboard, env: 'LEGACY_SHEET_ID', configured: configStatus.legacyInstrumentalConfigured },
                          ].map((tab) => {
                            const isSelected = legacySubFilter === tab.id;
                            return (
                              <button
                                key={tab.id}
                                onClick={() => setLegacySubFilter(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-headline font-bold transition-all ${
                                  isSelected
                                    ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                                    : 'bg-surface-container-high/60 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                }`}
                              >
                                <tab.icon size={14} />
                                <span>{tab.label}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  isSelected ? 'bg-black/20 text-on-primary' : 'bg-surface-container text-on-surface-variant'
                                }`}>
                                  {tab.count}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${configStatus.legacyClassroomConfigured ? 'bg-secondary-fixed/10 text-secondary-fixed border-secondary-fixed/20' : 'bg-surface-container text-on-surface-variant border-outline-variant/20'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${configStatus.legacyClassroomConfigured ? 'bg-secondary-fixed' : 'bg-on-surface-variant/40'}`} />
                              Classroom: {configStatus.legacyClassroomConfigured ? 'Connected' : 'Simulated'}
                            </span>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${configStatus.legacyInstrumentalConfigured ? 'bg-secondary-fixed/10 text-secondary-fixed border-secondary-fixed/20' : 'bg-surface-container text-on-surface-variant border-outline-variant/20'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${configStatus.legacyInstrumentalConfigured ? 'bg-secondary-fixed' : 'bg-on-surface-variant/40'}`} />
                              Instrumental: {configStatus.legacyInstrumentalConfigured ? 'Connected' : 'Simulated'}
                            </span>
                          </div>
                          <button
                            onClick={() => setActiveTab('LegacySentiment')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary text-xs font-bold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all"
                          >
                            <Sparkles size={12} />
                            <span>Legacy Sentiment</span>
                          </button>
                          <button
                            onClick={() => fetchData('legacy')}
                            disabled={legacyLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 border border-primary/20"
                          >
                            <RefreshCw size={12} className={legacyLoading ? 'animate-spin' : ''} />
                            Sync Archive
                          </button>
                          <button
                            onClick={() => syncEvaluationsToServer(true)}
                            disabled={syncStatus === 'syncing'}
                            title="Push your evaluated stats to the cloud server so your boss sees the exact same 43% CSAT score"
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all border ${
                              syncStatus === 'synced'
                                ? 'bg-secondary-fixed/20 text-secondary-fixed border-secondary-fixed/40'
                                : 'bg-secondary-fixed/10 text-secondary-fixed hover:bg-secondary-fixed/20 border-secondary-fixed/20'
                            }`}
                          >
                            <Cloud size={12} className={syncStatus === 'syncing' ? 'animate-bounce' : ''} />
                            <span>
                              {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'synced' ? 'Synced to Cloud!' : 'Sync to Shared Link'}
                            </span>
                          </button>
                        </div>
                      </div>

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
                          
                          <h3 className="relative z-10 text-on-surface-variant text-[10px] font-headline font-black uppercase tracking-[0.3em] mb-10">
                            {legacySubFilter === 'classroom' ? 'Classroom CSAT Score' : legacySubFilter === 'instrumental' ? 'Instrumental CSAT Score' : 'Legacy CSAT Score'}
                          </h3>
                          
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
                                  strokeDashoffset={276.46 * (1 - (activeLegacyStats?.csat || 0) / 100)}
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
                                    {activeLegacyStats?.csat || 0}%
                                  </span>
                                  <span className="text-[10px] font-black uppercase tracking-[0.2em] mt-2 text-on-surface/40">
                                    {legacySubFilter === 'classroom' ? 'Classroom' : legacySubFilter === 'instrumental' ? 'Instrumental' : 'Historical'}
                                  </span>
                                </motion.div>
                              </div>
                            </div>
                            <div className="mt-8 px-6 py-2 rounded-full bg-primary/10 border border-primary/20">
                              <span className="text-xs font-headline font-bold text-primary uppercase tracking-widest">
                                {legacySubFilter === 'classroom' ? 'Classroom Performance' : legacySubFilter === 'instrumental' ? 'Instrumental Performance' : 'Legacy Performance'}
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
                              <span className="block text-secondary-fixed text-4xl font-headline font-black">{activeLegacyStats?.positiveCount.toLocaleString() || 0}</span>
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
                              <span className="block text-primary text-4xl font-headline font-black">{activeLegacyStats?.neutralCount.toLocaleString() || 0}</span>
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
                          <h3 className="text-on-surface-variant text-xs font-headline font-bold uppercase tracking-widest mb-6">Archive Filter Count</h3>
                          <div className="flex items-end justify-between">
                            <div>
                              <span className="block text-secondary-fixed text-4xl font-headline font-black">{filteredLegacySubmissions.length}</span>
                              <span className="text-on-surface-variant text-xs font-medium">of {legacySubmissions.length} Total Records</span>
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
                              <p className="text-on-surface-variant text-sm font-medium">Historical volatility index ({legacySubFilter})</p>
                            </div>
                            <div className="flex gap-2">
                              <span className="w-3 h-3 rounded-full bg-primary ring-4 ring-primary/10" />
                              <span className="w-3 h-3 rounded-full bg-secondary-fixed ring-4 ring-secondary-fixed/10" />
                            </div>
                          </div>
                          
                          <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={activeLegacyStats?.sentimentTrend || []}>
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
                          <h2 className="text-xl font-headline font-extrabold tracking-tight mb-2">Legacy Submission Mix</h2>
                          <p className="text-on-surface-variant text-sm font-medium mb-10">Historical category mix</p>
                          
                          <div className="relative flex-1 flex items-center justify-center min-h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={activeLegacyStats?.distribution || []}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={5}
                                  dataKey="value"
                                  stroke="none"
                                >
                                  {activeLegacyStats?.distribution.map((entry, index) => (
                                    <Cell key={`cell-legacy-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-3xl font-headline font-black">{activeLegacyStats?.csat || 0}%</span>
                              <span className="text-[10px] font-headline font-bold text-on-surface-variant uppercase tracking-widest">Archive</span>
                            </div>
                          </div>

                          <div className="mt-10 space-y-3">
                            {activeLegacyStats?.distribution.map((item) => (
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
                          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
                            <div>
                              <div className="flex items-center gap-4">
                                <h2 className="text-xl font-headline font-extrabold tracking-tight">
                                  {legacySubFilter === 'classroom' ? 'Classroom Legacy Jotform Archive' : legacySubFilter === 'instrumental' ? 'Instrumental - Legacy Jotform Archive' : 'All Legacy Archive'}
                                </h2>
                                {filteredLegacySubmissions.length > 0 && (
                                  <div className="px-3 py-1 bg-secondary-fixed/10 text-secondary-fixed rounded-full text-[10px] font-black uppercase tracking-widest border border-secondary-fixed/20">
                                    {activeLegacyStats?.reviewedCount || 0}/{filteredLegacySubmissions.length} Evaluated
                                  </div>
                                )}
                              </div>
                              <p className="text-on-surface-variant text-sm font-medium mt-1">
                                {legacySubFilter === 'classroom' 
                                  ? 'All 18 Google Sheet columns from Classroom Legacy Jotform'
                                  : legacySubFilter === 'instrumental'
                                  ? 'All 15 Google Sheet columns from Instrumental - Legacy Jotform'
                                  : 'Historical feedback records aggregated across connected legacy sheets'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                              <button
                                onClick={() => setDateSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all ${
                                  dateSortOrder === 'newest'
                                    ? 'bg-primary/10 border-primary/30 text-primary'
                                    : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant'
                                }`}
                                title="Click to toggle submission date sorting"
                              >
                                {dateSortOrder === 'newest' ? <ArrowDown size={13} className="text-primary" /> : <ArrowUp size={13} className="text-primary" />}
                                <span>{dateSortOrder === 'newest' ? 'Latest First' : 'Oldest First'}</span>
                              </button>
                              <div className="relative flex-1 lg:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" size={16} />
                                <input 
                                  type="text" 
                                  placeholder="Search archive..."
                                  value={searchTerm}
                                  onChange={(e) => setSearchTerm(e.target.value)}
                                  className="w-full bg-surface-container-low pl-9 pr-4 py-2 rounded-xl border border-outline-variant/10 focus:outline-none focus:ring-2 focus:ring-primary/50 text-xs transition-all"
                                />
                              </div>
                              <button 
                                onClick={() => {
                                  const headers = legacySubFilter === 'classroom' ? [
                                    'Reference', 'Sheet Source', 'Course Name', 'Sentiment Tag', 'Teacher Name & School Name', 'Product Type', 'Submission Date',
                                    'Unit Taught', 'Most Successful Lesson', 'Why Most Successful', 'Lessons Not Well Received', 'Lesson Delivery Difficulty',
                                    'What Would You Change', 'Children Responded Positively', 'Challenge Level Appropriate', 'What Needs To Change',
                                    'Resources Sufficient', 'Resource Needs', 'Aligned With Effective Learning', 'Engaged With Provision Independently', 'Most Engaged Provision Activities'
                                  ] : legacySubFilter === 'instrumental' ? [
                                    'Reference', 'Sheet Source', 'Course Name', 'Sentiment Tag', 'Teacher Name & School Name', 'Product Type', 'Submission Date',
                                    'Which Playground did you just finish?', 'Which facet did you enjoy the most?', 'Why did you enjoy that facet the most?',
                                    "Please select any facet(s) you didn't enjoy", "How could we improve the facet(s) you didn't enjoy?",
                                    'Was the difficulty of the course right for you?', 'Engaging Rating', 'Helpful Rating', 'Helped apply knowledge Rating', 'Any other comments?'
                                  ] : [
                                    'Reference', 'Sheet Source', 'Course Name', 'Sentiment Tag', 'Teacher Name & School Name', 'Product Type', 'Submission Date', 'Score'
                                  ];

                                  const rows = filteredLegacySubmissions.map(s => {
                                    if (legacySubFilter === 'classroom') {
                                      return [
                                        s.refId, s.sheetCategory || s.type, getFuzzyVal(s.rawData, ['Coursename', 'Course Name']) || s.courseName, s.sentiment,
                                        getFuzzyVal(s.rawData, ['Teacher Name & School Name']) || s.school, s.type, getFuzzyVal(s.rawData, ['Submission Date']) || s.timestamp,
                                        getFuzzyVal(s.rawData, ['Unit Taught']) || '', getFuzzyVal(s.rawData, ['Most Successful Lesson']) || '',
                                        getFuzzyVal(s.rawData, ['Why Most Successful']) || '', getFuzzyVal(s.rawData, ['Lessons Not Well Received']) || '',
                                        getFuzzyVal(s.rawData, ['Lesson Delivery Difficulty']) || '', getFuzzyVal(s.rawData, ['What Would You Change']) || '',
                                        getFuzzyVal(s.rawData, ['Children Responded Positively']) || '', getFuzzyVal(s.rawData, ['Challenge Level Appropriate']) || '',
                                        getFuzzyVal(s.rawData, ['What Needs To Change']) || '', getFuzzyVal(s.rawData, ['Resources Sufficient']) || '',
                                        getFuzzyVal(s.rawData, ['Resource Needs']) || '', getFuzzyVal(s.rawData, ['Aligned With Effective Learning']) || '',
                                        getFuzzyVal(s.rawData, ['Engaged With Provision Independently']) || '', getFuzzyVal(s.rawData, ['Most Engaged Provision Activities']) || ''
                                      ];
                                    } else {
                                      return [
                                        s.refId, s.sheetCategory || s.type, getFuzzyVal(s.rawData, ['Coursename', 'Course Name']) || s.courseName, s.sentiment,
                                        getFuzzyVal(s.rawData, ['Teacher Name & School Name']) || s.school, s.type, getFuzzyVal(s.rawData, ['Submission Date']) || s.timestamp, s.sentimentScore
                                      ];
                                    }
                                  });

                                  const csvContent = [headers, ...rows].map(e => e.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(",")).join("\n");
                                  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                                  const link = document.createElement("a");
                                  const url = URL.createObjectURL(blob);
                                  link.setAttribute("href", url);
                                  link.setAttribute("download", `legacy_${legacySubFilter}_${new Date().toISOString().split('T')[0]}.csv`);
                                  link.style.visibility = 'hidden';
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                }}
                                className="flex items-center gap-1.5 px-3 py-2 bg-surface-container-high rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-surface-container transition-colors border border-outline-variant/10"
                              >
                                <ExternalLink size={13} />
                                Export CSV
                              </button>
                              <button 
                                onClick={() => fetchData('legacy')}
                                disabled={legacyLoading}
                                className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-primary/20 transition-all disabled:opacity-50 border border-primary/20"
                              >
                                <RefreshCw size={13} className={legacyLoading ? 'animate-spin' : ''} />
                                Sync Data
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="w-full overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[3200px]">
                            <thead>
                              <tr className="bg-surface-container-high/50 border-b border-outline-variant/10">
                                {legacySubFilter === 'classroom' ? [
                                  'Reference',
                                  'Actions',
                                  'Sheet Source',
                                  'Course Name',
                                  'Sentiment Tag',
                                  'Teacher Name & School Name',
                                  'Product Type',
                                  'Submission Date',
                                  'Unit Taught',
                                  'Most Successful Lesson',
                                  'Why Most Successful',
                                  'Lessons Not Well Received',
                                  'Lesson Delivery Difficulty',
                                  'What Would You Change',
                                  'Children Responded Positively',
                                  'Challenge Level Appropriate',
                                  'What Needs To Change',
                                  'Resources Sufficient',
                                  'Resource Needs',
                                  'Aligned With Effective Learning',
                                  'Engaged With Provision Independently',
                                  'Most Engaged Provision Activities'
                                ].map((header) => (
                                  <th 
                                    key={header} 
                                    onClick={header === 'Submission Date' ? () => setDateSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest') : undefined}
                                    className={`px-6 py-4 text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant whitespace-nowrap ${header === 'Submission Date' ? 'cursor-pointer hover:text-primary transition-colors select-none' : ''}`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span>{header}</span>
                                      {header === 'Submission Date' && (
                                        <span className="text-primary">
                                          {dateSortOrder === 'newest' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                                        </span>
                                      )}
                                    </div>
                                  </th>
                                )) : legacySubFilter === 'instrumental' ? [
                                  'Reference',
                                  'Actions',
                                  'Sheet Source',
                                  'Course Name',
                                  'Sentiment Tag',
                                  'Teacher Name & School Name',
                                  'Product Type',
                                  'Submission Date',
                                  'Which Playground did you just finish?',
                                  'Which facet did you enjoy the most?',
                                  'Why did you enjoy that facet the most?',
                                  "Please select any facet(s) you didn't enjoy",
                                  "How could we improve the facet(s) you didn't enjoy?",
                                  'Was the difficulty of the course right for you?',
                                  "The interactive moments >> Engaging",
                                  "The interactive moments >> Helpful",
                                  "The interactive moments >> Helped apply knowledge",
                                  'Any other comments?'
                                ].map((header) => (
                                  <th 
                                    key={header} 
                                    onClick={header === 'Submission Date' ? () => setDateSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest') : undefined}
                                    className={`px-6 py-4 text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant whitespace-nowrap ${header === 'Submission Date' ? 'cursor-pointer hover:text-primary transition-colors select-none' : ''}`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span>{header}</span>
                                      {header === 'Submission Date' && (
                                        <span className="text-primary">
                                          {dateSortOrder === 'newest' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                                        </span>
                                      )}
                                    </div>
                                  </th>
                                )) : [
                                  'Reference',
                                  'Actions',
                                  'Sheet Source',
                                  'Course Name',
                                  'Sentiment Tag',
                                  'Teacher Name & School Name',
                                  'Product Type',
                                  'Submission Date',
                                  'Unit / Playground',
                                  'Key Highlights / Successful Elements',
                                  'Areas For Improvement / Issues',
                                  'Curriculum & Difficulty Fit',
                                  'Resources / Engagement Notes'
                                ].map((header) => (
                                  <th 
                                    key={header} 
                                    onClick={header === 'Submission Date' ? () => setDateSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest') : undefined}
                                    className={`px-6 py-4 text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant whitespace-nowrap ${header === 'Submission Date' ? 'cursor-pointer hover:text-primary transition-colors select-none' : ''}`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span>{header}</span>
                                      {header === 'Submission Date' && (
                                        <span className="text-primary">
                                          {dateSortOrder === 'newest' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                                        </span>
                                      )}
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/5">
                              {filteredLegacySubmissions.length === 0 ? (
                                <tr>
                                  <td colSpan={22} className="px-8 py-20 text-center">
                                    <div className="flex flex-col items-center gap-2 opacity-40">
                                      <Search size={32} />
                                      <p className="text-sm font-medium">No legacy records found for the selected filter.</p>
                                    </div>
                                  </td>
                                </tr>
                              ) : (
                                filteredLegacySubmissions.map((entry) => {
                                  const isClassroom = entry.sheetCategory === 'Classroom' || entry.type.toLowerCase().includes('classroom');
                                  
                                  return (
                                    <tr key={entry.id} className="hover:bg-surface-container-low transition-colors">
                                      {/* Reference */}
                                      <td className="px-6 py-4 text-[10px] font-black font-mono text-primary opacity-60 whitespace-nowrap">
                                        {entry.refId}
                                      </td>

                                      {/* Actions */}
                                      <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${entry.isReviewed ? 'bg-secondary-fixed border-secondary-fixed text-on-secondary-fixed' : 'border-outline-variant'}`}>
                                            {entry.isReviewed && <Check size={10} strokeWidth={4} />}
                                          </div>
                                          <button onClick={() => setSelectedSubmission(entry)} className="text-primary hover:underline font-bold text-xs">Details</button>
                                        </div>
                                      </td>

                                      {/* Sheet Source Badge */}
                                      <td className="px-6 py-4 whitespace-nowrap min-w-[210px]">
                                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase px-3 py-1 rounded-full border whitespace-nowrap leading-none ${
                                          isClassroom
                                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                        }`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${isClassroom ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                          {isClassroom ? 'Classroom Legacy Jotform' : 'Instrumental - Legacy Jotform'}
                                        </span>
                                      </td>

                                      {/* Course Name */}
                                      <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[220px]">
                                        {getFuzzyVal(entry.rawData, ['Coursename', 'Course Name']) || entry.courseName}
                                      </td>

                                      {/* Sentiment Tag */}
                                      <td className="px-6 py-4 text-sm whitespace-nowrap min-w-[160px]">
                                        <div className="flex items-center gap-2">
                                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded ring-1 ${entry.sentimentColor}`}>
                                            {entry.sentiment}
                                          </span>
                                          <span className="text-[10px] font-bold text-on-surface-variant opacity-60">
                                            ({entry.sentimentScore > 0 ? '+' : ''}{entry.sentimentScore.toFixed(1)})
                                          </span>
                                        </div>
                                      </td>

                                      {/* Teacher Name & School Name */}
                                      <td className="px-6 py-4 text-sm font-bold min-w-[220px]">
                                        {getFuzzyVal(entry.rawData, ['Teacher Name & School Name', 'Teacher Name & School Name_1']) || entry.school || 'N/A'}
                                      </td>

                                      {/* Product Type */}
                                      <td className="px-6 py-4 text-sm text-on-surface-variant whitespace-nowrap min-w-[120px]">
                                        {getFuzzyVal(entry.rawData, ['Product Type', 'Type']) || entry.type}
                                      </td>

                                      {/* Submission Date */}
                                      <td className="px-6 py-4 text-sm text-on-surface-variant whitespace-nowrap min-w-[160px]">
                                        {formatSubmissionDate(getFuzzyVal(entry.rawData, ['Submission Date', 'Timestamp']) || entry.timestamp)}
                                      </td>

                                      {/* Mode-specific Google Sheet Columns */}
                                      {legacySubFilter === 'classroom' ? (
                                        <>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[200px]">{getFuzzyVal(entry.rawData, ['Unit Taught']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[250px]">{getFuzzyVal(entry.rawData, ['Most Successful Lesson']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['Why Most Successful']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[250px]">{getFuzzyVal(entry.rawData, ['Lessons Not Well Received']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[250px]">{getFuzzyVal(entry.rawData, ['Lesson Delivery Difficulty']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['What Would You Change']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[220px]">{getFuzzyVal(entry.rawData, ['Children Responded Positively']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[220px]">{getFuzzyVal(entry.rawData, ['Challenge Level Appropriate']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['What Needs To Change']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[200px]">{getFuzzyVal(entry.rawData, ['Resources Sufficient']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[250px]">{getFuzzyVal(entry.rawData, ['Resource Needs']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[250px]">{getFuzzyVal(entry.rawData, ['Aligned With Effective Learning']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[250px]">{getFuzzyVal(entry.rawData, ['Engaged With Provision Independently']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['Most Engaged Provision Activities']) || 'N/A'}</td>
                                        </>
                                      ) : legacySubFilter === 'instrumental' ? (
                                        <>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[200px]">{getFuzzyVal(entry.rawData, ['Which Playground did you just finish?']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[250px]">{getFuzzyVal(entry.rawData, ['Which facet did you enjoy the most?']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['Why did you enjoy that facet the most?']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[250px]">{getFuzzyVal(entry.rawData, ["Please select any facet(s) you didn't enjoy"]) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ["How could we improve the facet(s) you didn't enjoy?"]) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[200px]">{getFuzzyVal(entry.rawData, ['Was the difficulty of the course right for you?']) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[180px]">{getFuzzyVal(entry.rawData, ["The interactive moments in the 'Learn' steps were... >> Engaging"]) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[180px]">{getFuzzyVal(entry.rawData, ["The interactive moments in the 'Learn' steps were... >> Helpful"]) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[180px]">{getFuzzyVal(entry.rawData, ["The interactive moments in the 'Learn' steps were... >> Helped apply knowledge"]) || 'N/A'}</td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[300px]">{getFuzzyVal(entry.rawData, ['Any other comments?']) || 'N/A'}</td>
                                        </>
                                      ) : (
                                        <>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[200px]">
                                            {isClassroom ? (getFuzzyVal(entry.rawData, ['Unit Taught']) || 'N/A') : (getFuzzyVal(entry.rawData, ['Which Playground did you just finish?']) || 'N/A')}
                                          </td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[300px]">
                                            {isClassroom ? (getFuzzyVal(entry.rawData, ['Most Successful Lesson', 'Why Most Successful']) || 'N/A') : (getFuzzyVal(entry.rawData, ['Which facet did you enjoy the most?', 'Why did you enjoy that facet the most?']) || 'N/A')}
                                          </td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[300px]">
                                            {isClassroom ? (getFuzzyVal(entry.rawData, ['Lessons Not Well Received', 'What Would You Change']) || 'N/A') : (getFuzzyVal(entry.rawData, ["Please select any facet(s) you didn't enjoy", "How could we improve the facet(s) you didn't enjoy?"]) || 'N/A')}
                                          </td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[250px]">
                                            {isClassroom ? (getFuzzyVal(entry.rawData, ['Challenge Level Appropriate', 'Lesson Delivery Difficulty']) || 'N/A') : (getFuzzyVal(entry.rawData, ['Was the difficulty of the course right for you?']) || 'N/A')}
                                          </td>
                                          <td className="px-6 py-4 text-sm text-on-surface-variant min-w-[300px]">
                                            {isClassroom ? (getFuzzyVal(entry.rawData, ['Resources Sufficient', 'Most Engaged Provision Activities']) || 'N/A') : (getFuzzyVal(entry.rawData, ['Any other comments?']) || 'N/A')}
                                          </td>
                                        </>
                                      )}
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </>
                  )}
                </motion.div>
              )}

              {activeTab === 'LegacySentiment' && (
                <motion.div
                  key="legacy-sentiment"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-12"
                >
                  {legacyLoading ? (
                    <div className="flex flex-col items-center justify-center h-[40vh] space-y-4">
                      <Loader2 size={48} className="text-primary animate-spin" />
                      <p className="text-on-surface-variant font-headline font-bold">Analyzing Legacy Sentiment Archive...</p>
                    </div>
                  ) : legacyError ? (
                    <div className="glass p-12 rounded-3xl text-center space-y-4 border-tertiary-container/20">
                      <AlertTriangle size={48} className="text-tertiary-container mx-auto" />
                      <h2 className="text-xl font-headline font-black">Legacy Sync Error</h2>
                      <p className="text-on-surface-variant max-w-md mx-auto">{legacyError}</p>
                      <button onClick={() => fetchData('legacy')} className="text-primary font-bold hover:underline">Try again</button>
                    </div>
                  ) : !configStatus.legacyConfigured && !configStatus.legacyClassroomConfigured && !configStatus.legacyInstrumentalConfigured ? (
                    <div className="glass p-12 rounded-3xl text-center space-y-6">
                      <Sparkles size={48} className="text-on-surface-variant mx-auto opacity-20" />
                      <div>
                        <h2 className="text-xl font-headline font-black">Legacy Data Sheets Not Connected</h2>
                        <p className="text-on-surface-variant max-w-md mx-auto mt-2">To view historical sentiment intelligence, connect your Legacy Classroom and Instrumental Google Sheets:</p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left max-w-2xl mx-auto">
                        <div className="p-4 rounded-xl bg-surface-container/50 border border-outline-variant/20">
                          <p className="text-[10px] font-black uppercase text-primary mb-1">Sheet 1: Classroom Legacy Jotform</p>
                          <p className="text-xs font-medium">Sheet ID: <code>1GFIn6sf9j9DEbhseJRzg-NSOW7Rhxj4SBeloKVwMklQ</code> (<b>LEGACY_CLASSROOM_SHEET_ID</b>)</p>
                        </div>
                        <div className="p-4 rounded-xl bg-surface-container/50 border border-outline-variant/20">
                          <p className="text-[10px] font-black uppercase text-primary mb-1">Sheet 2: Instrumental - Legacy Jotform</p>
                          <p className="text-xs font-medium">Sheet ID: <code>17101J4-5MlMmbvw1-s-7I3IFENERImyRWsIkZgtJa1s</code> (<b>LEGACY_SHEET_ID</b>)</p>
                        </div>
                      </div>

                      <div className="pt-4">
                        <button 
                          onClick={() => fetchData('legacy')} 
                          className="px-6 py-3 bg-primary text-on-primary rounded-full font-black uppercase tracking-widest text-xs hover:scale-105 transition-transform"
                        >
                          Check Connection
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Sub-Category Stream Switcher & Controls */}
                      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/10">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-headline font-black uppercase tracking-widest text-on-surface-variant mr-1">Archive Stream:</span>
                          {[
                            { id: 'all', label: 'All Legacy Archives', count: legacySubmissions.length, icon: Database },
                            { id: 'classroom', label: 'Classroom Legacy Jotform', count: legacySubmissions.filter(s => s.sheetCategory === 'Classroom' || s.type.toLowerCase().includes('classroom') || s.courseName.toLowerCase().includes('classroom')).length, icon: SchoolIcon },
                            { id: 'instrumental', label: 'Instrumental - Legacy Jotform', count: legacySubmissions.filter(s => s.sheetCategory === 'Instrumental' || s.type.toLowerCase().includes('instrumental')).length, icon: LayoutDashboard },
                          ].map((tab) => {
                            const isSelected = legacySubFilter === tab.id;
                            return (
                              <button
                                key={tab.id}
                                onClick={() => setLegacySubFilter(tab.id as any)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-headline font-bold transition-all ${
                                  isSelected
                                    ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                                    : 'bg-surface-container-high/60 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                                }`}
                              >
                                <tab.icon size={14} />
                                <span>{tab.label}</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                  isSelected ? 'bg-black/20 text-on-primary' : 'bg-surface-container text-on-surface-variant'
                                }`}>
                                  {tab.count}
                                </span>
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setActiveTab('Legacy')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container-high text-on-surface hover:bg-surface-container text-xs font-bold rounded-xl transition-colors border border-outline-variant/10"
                          >
                            <Clock size={12} />
                            <span>Legacy Logs</span>
                          </button>
                          <button
                            onClick={() => fetchData('legacy')}
                            disabled={legacyLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold rounded-xl transition-colors disabled:opacity-50 border border-primary/20"
                          >
                            <RefreshCw size={12} className={legacyLoading ? 'animate-spin' : ''} />
                            Sync Archive
                          </button>
                          <button
                            onClick={() => syncEvaluationsToServer(true)}
                            disabled={syncStatus === 'syncing'}
                            title="Push your evaluated stats to the cloud server so your boss sees the exact same 43% CSAT score"
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all border ${
                              syncStatus === 'synced'
                                ? 'bg-secondary-fixed/20 text-secondary-fixed border-secondary-fixed/40'
                                : 'bg-secondary-fixed/10 text-secondary-fixed hover:bg-secondary-fixed/20 border-secondary-fixed/20'
                            }`}
                          >
                            <Cloud size={12} className={syncStatus === 'syncing' ? 'animate-bounce' : ''} />
                            <span>
                              {syncStatus === 'syncing' ? 'Syncing...' : syncStatus === 'synced' ? 'Synced to Cloud!' : 'Sync to Shared Link'}
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Top KPI Cards */}
                      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        {/* Legacy CSAT */}
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="glass p-8 rounded-2xl relative overflow-hidden group flex flex-col items-center text-center border-2 border-primary/20 shadow-2xl shadow-primary/5"
                        >
                          <div className="absolute inset-0 bg-primary/5 group-hover:bg-primary/10 transition-colors duration-500" />
                          <div className="absolute -right-10 -top-10 w-48 h-48 bg-primary/20 rounded-full blur-3xl group-hover:bg-primary/30 transition-all duration-500" />
                          
                          <h3 className="relative z-10 text-on-surface-variant text-[10px] font-headline font-black uppercase tracking-[0.3em] mb-8">
                            {legacySubFilter === 'classroom' ? 'Classroom Legacy CSAT' : legacySubFilter === 'instrumental' ? 'Instrumental Legacy CSAT' : 'Legacy CSAT Score'}
                          </h3>
                          
                          <div className="relative z-10 flex flex-col items-center">
                            <div className="relative w-44 h-44">
                              <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl animate-pulse" />
                              <svg className="w-full h-full transform -rotate-90 relative z-10" viewBox="0 0 100 100">
                                <circle className="text-surface-container-high" cx="50" cy="50" r="44" fill="transparent" stroke="currentColor" strokeWidth="4" />
                                <circle 
                                  className="text-primary" 
                                  cx="50" cy="50" r="44" fill="transparent" stroke="currentColor" strokeWidth="10" 
                                  strokeDasharray={276.46} 
                                  strokeDashoffset={276.46 * (1 - (activeLegacyStats?.csat || 0) / 100)}
                                  strokeLinecap="round"
                                  style={{ filter: 'drop-shadow(0 0 8px rgba(166, 138, 76, 0.6))' }}
                                />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                                <span className="text-5xl font-headline font-black text-primary drop-shadow-lg">
                                  {activeLegacyStats?.csat || 0}%
                                </span>
                                <span className="text-[9px] font-black uppercase tracking-[0.2em] mt-1 text-on-surface/40">
                                  Satisfaction
                                </span>
                              </div>
                            </div>
                          </div>
                        </motion.div>

                        {/* Positive */}
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className="glass p-8 rounded-2xl relative overflow-hidden group"
                        >
                          <h3 className="text-on-surface-variant text-xs font-headline font-bold uppercase tracking-widest mb-6">Archive Positive</h3>
                          <div className="flex items-end justify-between">
                            <div>
                              <span className="block text-secondary-fixed text-4xl font-headline font-black">{activeLegacyStats?.positiveCount.toLocaleString() || 0}</span>
                              <span className="text-on-surface-variant text-xs font-medium">Historical Positive</span>
                            </div>
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-secondary-fixed/10 group-hover:bg-secondary-fixed/20 transition-colors">
                              <Sparkles size={24} className="text-secondary-fixed" />
                            </div>
                          </div>
                        </motion.div>

                        {/* Neutral */}
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.15 }}
                          className="glass p-8 rounded-2xl relative overflow-hidden group"
                        >
                          <h3 className="text-on-surface-variant text-xs font-headline font-bold uppercase tracking-widest mb-6">Archive Neutral</h3>
                          <div className="flex items-end justify-between">
                            <div>
                              <span className="block text-primary text-4xl font-headline font-black">{activeLegacyStats?.neutralCount.toLocaleString() || 0}</span>
                              <span className="text-on-surface-variant text-xs font-medium">Mixed Signals</span>
                            </div>
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                              <MessageSquare size={24} className="text-primary fill-primary/20" />
                            </div>
                          </div>
                        </motion.div>

                        {/* Critical */}
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className="glass p-8 rounded-2xl relative overflow-hidden group"
                        >
                          <h3 className="text-on-surface-variant text-xs font-headline font-bold uppercase tracking-widest mb-6">Archive Critical</h3>
                          <div className="flex items-end justify-between">
                            <div>
                              <span className="block text-tertiary-container text-4xl font-headline font-black">{activeLegacyStats?.negativeCount.toLocaleString() || 0}</span>
                              <span className="text-on-surface-variant text-xs font-medium">Friction Points</span>
                            </div>
                            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-tertiary-container/10 group-hover:bg-tertiary-container/20 transition-colors">
                              <AlertTriangle size={24} className="text-tertiary-container" />
                            </div>
                          </div>
                        </motion.div>
                      </section>

                      {/* Main Sentiment Breakdown Row (Mosaic + Intensity & Schools) */}
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
                                  <div className="w-2 h-2 rounded-full bg-secondary-fixed" /> POSITIVE
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                                  <div className="w-2 h-2 rounded-full bg-primary" /> NEUTRAL
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest">
                                  <div className="w-2 h-2 rounded-full bg-tertiary-container" /> CRITICAL
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                              {/* Sentiment Mosaic */}
                              <div className="lg:col-span-2 space-y-6">
                                <div className="flex items-center justify-between">
                                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">SENTIMENT MOSAIC</h3>
                                  <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest opacity-60">
                                      <div className="w-1.5 h-1.5 rounded-full bg-secondary-fixed" /> POSITIVE
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest opacity-60">
                                      <div className="w-1.5 h-1.5 rounded-full bg-primary" /> NEUTRAL
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest opacity-60">
                                      <div className="w-1.5 h-1.5 rounded-full bg-tertiary-container" /> CRITICAL
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-8 max-h-[400px] overflow-y-auto custom-scrollbar pr-4">
                                  {Object.keys(groupedLegacySubmissions).length === 0 ? (
                                    <p className="text-xs text-on-surface-variant py-8 text-center italic">No legacy submissions found for this filter.</p>
                                  ) : (
                                    Object.entries(groupedLegacySubmissions).map(([month, monthSubs]) => (
                                      <div key={`legacy-month-${month}`} className="space-y-3">
                                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60 border-b border-outline-variant/10 pb-1 flex justify-between">
                                          <span>{month}</span>
                                          <span>{(monthSubs as Submission[]).length} SUBMISSIONS</span>
                                        </h4>
                                        <div className="flex flex-wrap gap-1.5">
                                          {(monthSubs as Submission[]).map((s, i) => (
                                            <motion.div
                                              key={`legacy-mosaic-${s.id}-${month}-${i}`}
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
                                                  <p className="text-[10px] font-black uppercase tracking-widest text-primary truncate">{s.customer || s.id}</p>
                                                  <p className="text-[9px] font-bold text-on-surface leading-tight line-clamp-1">{s.school || 'Unspecified School'}</p>
                                                  <div className="flex justify-between items-center pt-1 border-t border-outline-variant/10">
                                                    <span className="text-[8px] font-medium text-on-surface-variant">{formatSubmissionDate(s.timestamp)}</span>
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
                                    ))
                                  )}
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                  <p className="text-[10px] text-on-surface-variant font-medium italic">Each block represents a unique submission. Click for full details.</p>
                                  <div className="flex items-center gap-4">
                                    <div className="flex flex-col items-end">
                                      <span className="text-[8px] font-black uppercase tracking-tighter text-secondary-fixed">SENTIMENT PULSE</span>
                                      <div className="flex gap-0.5 h-2 items-end">
                                        {filteredLegacySubmissions.slice(-20).map((s, i) => (
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

                              {/* Intensity Distribution */}
                              <div className="space-y-6">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">INTENSITY DISTRIBUTION</h3>
                                <div className="space-y-6">
                                  {[
                                    { label: 'Positive', count: activeLegacyStats?.positiveCount || 0, color: 'bg-secondary-fixed', total: filteredLegacySubmissions.length, icon: Sparkles },
                                    { label: 'Neutral', count: Math.max(0, filteredLegacySubmissions.length - (activeLegacyStats?.positiveCount || 0) - (activeLegacyStats?.negativeCount || 0)), color: 'bg-primary', total: filteredLegacySubmissions.length, icon: MessageSquare },
                                    { label: 'Critical', count: activeLegacyStats?.negativeCount || 0, color: 'bg-tertiary-container', total: filteredLegacySubmissions.length, icon: AlertTriangle }
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
                                        <span className="text-[10px] font-bold text-on-surface-variant">
                                          Intensity: {Math.round((filteredLegacySubmissions.filter(s => s.sentiment.toUpperCase() === item.label.toUpperCase()).reduce((acc, s) => acc + s.sentimentScore, 0) / (item.count || 1)) * 100)}%
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Submission by school */}
                        <div className="glass p-8 rounded-2xl">
                          <div className="flex justify-between items-center mb-8">
                            <div>
                              <h2 className="text-xl font-headline font-extrabold tracking-tight">Submission by school</h2>
                              <p className="text-on-surface-variant text-sm font-medium">Performance by location</p>
                            </div>
                            <SchoolIcon size={20} className="text-on-surface-variant/50" />
                          </div>
                          
                          <div className="space-y-4 max-h-[480px] overflow-y-auto custom-scrollbar pr-2">
                            {Array.from(new Set(filteredLegacySubmissions.map(s => s.school || getFuzzyVal(s.rawData, ['Teacher Name & School Name', 'Teacher Name & School Name_1', 'School']) || 'N/A')))
                              .map(school => {
                                const schoolSubs = filteredLegacySubmissions.filter(s => (s.school || getFuzzyVal(s.rawData, ['Teacher Name & School Name', 'Teacher Name & School Name_1', 'School']) || 'N/A') === school);
                                const avgScore = schoolSubs.reduce((acc, s) => acc + s.sentimentScore, 0) / schoolSubs.length;
                                const percentage = Math.round(avgScore * 100);
                                
                                return { school, percentage, count: schoolSubs.length, avgScore };
                              })
                              .sort((a, b) => b.percentage - a.percentage || b.count - a.count)
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
                                        <span className="font-headline font-bold text-sm block truncate max-w-[150px]">{item.school}</span>
                                        <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider">{item.count} SUBMISSIONS</span>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <span className={`text-lg font-black ${item.percentage >= 70 ? 'text-secondary-fixed' : item.percentage >= 40 ? 'text-primary' : 'text-tertiary-container'}`}>
                                        {item.percentage}%
                                      </span>
                                      <div className="text-[8px] font-black uppercase tracking-tighter opacity-40">SCORE</div>
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

                      {/* Submissions by Course Name */}
                      <div className="glass p-8 rounded-2xl">
                        <div className="flex justify-between items-end mb-10">
                          <div>
                            <h2 className="text-xl font-headline font-extrabold tracking-tight">Submissions by Course Name</h2>
                            <p className="text-on-surface-variant text-sm font-medium">Sentiment distribution per unit</p>
                          </div>
                          <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest">
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-secondary-fixed" /> POSITIVE</div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-primary" /> NEUTRAL</div>
                            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-tertiary-container" /> CRITICAL</div>
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-4">
                          {Array.from(new Set(filteredLegacySubmissions.map(s => s.courseName || getFuzzyVal(s.rawData, ['Coursename', 'Course Name', 'Unit Taught']) || 'General Legacy'))).map((course: string) => {
                            const courseSubs = filteredLegacySubmissions.filter(s => (s.courseName || getFuzzyVal(s.rawData, ['Coursename', 'Course Name', 'Unit Taught']) || 'General Legacy') === course);
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
                                      <p className="text-[10px] font-bold text-on-surface-variant uppercase mt-1">{total} SUBMISSIONS</p>
                                    </div>
                                  </div>

                                  {/* Middle: Stats & Button */}
                                  <div className="flex-1 flex flex-col sm:flex-row items-center gap-8 w-full">
                                    <div className="flex-1 w-full space-y-2">
                                      <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-on-surface-variant uppercase">COURSE HEALTH</span>
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
                                      {courseSummary?.summary ? 'Refresh AI' : 'GENERATE AI REPORT'}
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
                      <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                        <button
                          onClick={() => setDateSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}
                          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all flex items-center gap-2 ${
                            dateSortOrder === 'newest' 
                              ? 'bg-primary/10 border-primary/30 text-primary' 
                              : 'bg-surface-container-high border-outline-variant/20 text-on-surface-variant'
                          }`}
                          title="Click to toggle submission date sorting"
                        >
                          {dateSortOrder === 'newest' ? <ArrowDown size={14} className="text-primary" /> : <ArrowUp size={14} className="text-primary" />}
                          <span>{dateSortOrder === 'newest' ? 'Latest First' : 'Oldest First'}</span>
                        </button>

                        <button 
                          onClick={() => fetchData('current')}
                          disabled={loading}
                          className="px-4 py-2 bg-primary/10 text-primary rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50"
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
                          className="px-4 py-2 bg-surface-container-high rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-surface-container transition-colors flex items-center gap-2"
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
                            className="w-full bg-surface-container px-10 py-2 rounded-xl border border-outline-variant/10 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm transition-all"
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
                              <th 
                                key={header} 
                                onClick={header === 'Submission Date' ? () => setDateSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest') : undefined}
                                className={`px-8 py-4 text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant whitespace-nowrap ${header === 'Submission Date' ? 'cursor-pointer hover:text-primary transition-colors select-none' : ''}`}
                              >
                                <div className="flex items-center gap-1.5">
                                  <span>{header}</span>
                                  {header === 'Submission Date' && (
                                    <span className="text-primary">
                                      {dateSortOrder === 'newest' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                                    </span>
                                  )}
                                </div>
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
                  {/* Page Visibility / View Controls */}
                  <div className="glass p-8 rounded-3xl space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-headline font-black flex items-center gap-3">
                          <span>Page Visibility</span>
                          <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${
                            hideCurrentPages 
                              ? 'bg-tertiary-container/10 text-tertiary-container border-tertiary-container/20' 
                              : 'bg-secondary-fixed/10 text-secondary-fixed border-secondary-fixed/20'
                          }`}>
                            {hideCurrentPages ? 'Current Views Hidden' : 'All Views Visible'}
                          </span>
                        </h2>
                        <p className="text-on-surface-variant text-sm font-medium mt-1">
                          Configure which sections appear in the navigation bar and sidebar.
                        </p>
                      </div>
                    </div>

                    <div className="p-6 bg-surface-container-low rounded-2xl border border-outline-variant/10 space-y-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-on-surface flex items-center gap-2">
                            {hideCurrentPages ? <EyeOff size={16} className="text-tertiary-container" /> : <Eye size={16} className="text-primary" />}
                            <span>Hide Overview, Sentiment, and Logs</span>
                          </p>
                          <p className="text-xs text-on-surface-variant leading-relaxed">
                            {hideCurrentPages 
                              ? 'Overview, Sentiment, and Logs are currently hidden from the sidebar & navigation. Tap below to restore them.' 
                              : 'Hide the standard 3 views (Overview, Sentiment Analysis, and Submission Logs) to focus strictly on Legacy Jotform archives.'}
                          </p>
                        </div>

                        <button
                          onClick={toggleHideCurrentPages}
                          className={`px-5 py-3 rounded-xl font-headline font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2.5 shadow-md flex-shrink-0 cursor-pointer ${
                            hideCurrentPages
                              ? 'bg-primary text-on-primary hover:bg-primary/90 hover:scale-[1.02]'
                              : 'bg-surface-container-highest text-on-surface border border-outline-variant/20 hover:border-primary/40 hover:text-primary hover:bg-surface-container'
                          }`}
                        >
                          {hideCurrentPages ? (
                            <>
                              <Eye size={15} />
                              <span>Show Overview, Sentiment & Logs</span>
                            </>
                          ) : (
                            <>
                              <EyeOff size={15} />
                              <span>Hide Overview, Sentiment & Logs</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Status breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-3 border-t border-outline-variant/10">
                        <div className={`p-3 rounded-xl border transition-all ${hideCurrentPages ? 'bg-surface-container-high/40 border-outline-variant/10 opacity-50' : 'bg-surface-container-high border-outline-variant/20'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">Overview</span>
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${hideCurrentPages ? 'bg-outline-variant/20 text-on-surface-variant' : 'bg-secondary-fixed/20 text-secondary-fixed'}`}>
                              {hideCurrentPages ? 'Hidden' : 'Visible'}
                            </span>
                          </div>
                        </div>

                        <div className={`p-3 rounded-xl border transition-all ${hideCurrentPages ? 'bg-surface-container-high/40 border-outline-variant/10 opacity-50' : 'bg-surface-container-high border-outline-variant/20'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">Sentiment</span>
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${hideCurrentPages ? 'bg-outline-variant/20 text-on-surface-variant' : 'bg-secondary-fixed/20 text-secondary-fixed'}`}>
                              {hideCurrentPages ? 'Hidden' : 'Visible'}
                            </span>
                          </div>
                        </div>

                        <div className={`p-3 rounded-xl border transition-all ${hideCurrentPages ? 'bg-surface-container-high/40 border-outline-variant/10 opacity-50' : 'bg-surface-container-high border-outline-variant/20'}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">Logs</span>
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${hideCurrentPages ? 'bg-outline-variant/20 text-on-surface-variant' : 'bg-secondary-fixed/20 text-secondary-fixed'}`}>
                              {hideCurrentPages ? 'Hidden' : 'Visible'}
                            </span>
                          </div>
                        </div>

                        <div className="p-3 rounded-xl border bg-surface-container-high border-outline-variant/20">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">Legacy Logs</span>
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-secondary-fixed/20 text-secondary-fixed">
                              Visible
                            </span>
                          </div>
                        </div>

                        <div className="p-3 rounded-xl border bg-surface-container-high border-outline-variant/20">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">Legacy Sent.</span>
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-secondary-fixed/20 text-secondary-fixed">
                              Visible
                            </span>
                          </div>
                        </div>

                        <div className="p-3 rounded-xl border bg-surface-container-high border-outline-variant/20">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold">Settings</span>
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                              Always
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="glass p-8 rounded-3xl space-y-6">
                    <h2 className="text-2xl font-headline font-black">Connection Status</h2>
                    <div className="space-y-4">
                      <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                        <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Configuration Status</label>
                        <div className="space-y-2 mt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Current Sheet</span>
                            <span className={`text-xs font-black p-1 px-2 rounded ${configStatus.currentConfigured ? 'bg-secondary-fixed/10 text-secondary-fixed' : 'bg-tertiary-container/10 text-tertiary-container'}`}>
                              {configStatus.currentConfigured ? 'CONNECTED' : 'NOT CONNECTED'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Classroom Legacy Sheet</span>
                            <span className={`text-xs font-black p-1 px-2 rounded ${configStatus.legacyClassroomConfigured ? 'bg-secondary-fixed/10 text-secondary-fixed' : 'bg-tertiary-container/10 text-tertiary-container'}`}>
                              {configStatus.legacyClassroomConfigured ? 'CONNECTED' : 'NOT CONNECTED'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Instrumental Legacy Sheet</span>
                            <span className={`text-xs font-black p-1 px-2 rounded ${configStatus.legacyInstrumentalConfigured ? 'bg-secondary-fixed/10 text-secondary-fixed' : 'bg-tertiary-container/10 text-tertiary-container'}`}>
                              {configStatus.legacyInstrumentalConfigured ? 'CONNECTED' : 'NOT CONNECTED'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">Combined Legacy Archive</span>
                            <span className={`text-xs font-black p-1 px-2 rounded ${configStatus.legacyConfigured ? 'bg-secondary-fixed/10 text-secondary-fixed' : 'bg-tertiary-container/10 text-tertiary-container'}`}>
                              {configStatus.legacyConfigured ? 'CONNECTED' : 'NOT CONNECTED'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium">AI Analysis Engine</span>
                            <span className={`text-xs font-black p-1 px-2 rounded ${configStatus.aiConfigured ? 'bg-secondary-fixed/10 text-secondary-fixed' : 'bg-tertiary-container/10 text-tertiary-container'}`}>
                              {configStatus.aiConfigured ? 'ACTIVE' : 'SIMULATED MODE'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Shared Team Persistence (Boss View) */}
                  <div className="glass p-8 rounded-3xl space-y-6 border border-secondary-fixed/20 shadow-xl shadow-secondary-fixed/5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Cloud className="text-secondary-fixed" size={20} />
                          <h2 className="text-xl font-headline font-black">Shared Team Persistence (Boss View)</h2>
                        </div>
                        <p className="text-on-surface-variant text-xs mt-1 leading-relaxed">
                          When you evaluate feedback with AI, evaluations are synced to the shared cloud server so that when you send the application link to your boss or colleagues, they see the exact same 43% CSAT score and evaluations.
                        </p>
                      </div>
                      <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-secondary-fixed/10 text-secondary-fixed border border-secondary-fixed/20 whitespace-nowrap self-start sm:self-center">
                        {serverEvaluationCount > 0 ? `${serverEvaluationCount} Synced to Cloud` : 'Ready to Sync'}
                      </span>
                    </div>

                    {syncMessage && (
                      <div className={`p-4 rounded-xl text-xs font-bold border flex items-center gap-2.5 ${
                        syncStatus === 'error' 
                          ? 'bg-tertiary-container/10 text-tertiary-container border-tertiary-container/20' 
                          : 'bg-secondary-fixed/10 text-secondary-fixed border-secondary-fixed/20'
                      }`}>
                        {syncStatus === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                        <span>{syncMessage}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                        <span className="block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Cloud Server Storage</span>
                        <span className="block text-2xl font-headline font-black text-secondary-fixed mt-1">
                          {serverEvaluationCount} records
                        </span>
                        <span className="text-[11px] text-on-surface-variant">Stored on server & visible to everyone</span>
                      </div>
                      <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/10">
                        <span className="block text-[10px] font-black uppercase tracking-wider text-on-surface-variant">Your Browser Storage</span>
                        <span className="block text-2xl font-headline font-black text-primary mt-1">
                          {(() => {
                            try {
                              return Object.keys(JSON.parse(localStorage.getItem('feedback_evaluations') || '{}')).length;
                            } catch {
                              return 0;
                            }
                          })()} records
                        </span>
                        <span className="text-[11px] text-on-surface-variant">Locally evaluated in your session</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        onClick={() => syncEvaluationsToServer(true)}
                        disabled={syncStatus === 'syncing'}
                        className="flex-1 min-w-[200px] py-3.5 px-4 bg-secondary-fixed text-on-secondary-fixed rounded-xl font-headline font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-secondary-fixed/10 hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        <UploadCloud size={16} className={syncStatus === 'syncing' ? 'animate-bounce' : ''} />
                        <span>{syncStatus === 'syncing' ? 'Pushing to Cloud...' : 'Push Evaluations to Cloud Link'}</span>
                      </button>

                      <button
                        onClick={() => {
                          if (navigator.clipboard) {
                            navigator.clipboard.writeText(window.location.href);
                            setSyncMessage("App link copied to clipboard! Anyone opening this link will now load the cloud-synced 43% CSAT stats.");
                            setTimeout(() => setSyncMessage(''), 5000);
                          }
                        }}
                        className="py-3.5 px-4 bg-surface-container-high hover:bg-surface-container text-on-surface rounded-xl font-headline font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-outline-variant/20 transition-all cursor-pointer"
                      >
                        <Copy size={16} />
                        <span>Copy Link for Boss</span>
                      </button>

                      <button
                        onClick={exportEvaluationsBackup}
                        title="Download backup file of evaluations"
                        className="py-3.5 px-4 bg-surface-container-high hover:bg-surface-container text-on-surface rounded-xl font-headline font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-outline-variant/20 transition-all cursor-pointer"
                      >
                        <DownloadCloud size={16} />
                        <span>Export Backup</span>
                      </button>

                      <label className="py-3.5 px-4 bg-surface-container-high hover:bg-surface-container text-on-surface rounded-xl font-headline font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-outline-variant/20 transition-all cursor-pointer">
                        <UploadCloud size={16} />
                        <span>Import Backup</span>
                        <input
                          type="file"
                          accept=".json"
                          onChange={importEvaluationsBackup}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="glass p-8 rounded-3xl space-y-6">
                    <h2 className="text-lg font-headline font-black">How to Connect Data</h2>
                    <div className="space-y-4">
                      <div className="flex gap-4 p-4 rounded-xl bg-surface-container-high/30">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black">1</div>
                        <p className="text-xs font-medium leading-loose">Open your Google Sheet and copy the long string of characters in the URL after <code>/d/</code>. This is your <b>Sheet ID</b>.</p>
                      </div>
                      <div className="flex gap-4 p-4 rounded-xl bg-surface-container-high/30">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black">2</div>
                        <p className="text-xs font-medium leading-loose">Click <b>Share</b> in Google Sheets and change "Restricted" to <b>"Anyone with the link"</b> (Viewer role is enough).</p>
                      </div>
                      <div className="flex gap-4 p-4 rounded-xl bg-surface-container-high/30">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black">3</div>
                        <p className="text-xs font-medium leading-loose">In Vercel Dashboard Settings, add <code>GOOGLE_SHEET_ID</code> and <code>LEGACY_SHEET_ID</code> environment variables.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => fetchData()}
                      className="w-full py-4 bg-primary text-on-primary rounded-xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] transition-transform"
                    >
                      Refresh Sync Now
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
                      {formatSubmissionDate(selectedSubmission.timestamp)}
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

                    <div className="p-6 bg-surface-container-low rounded-2xl border border-outline-variant/10 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs font-headline font-bold text-on-surface-variant uppercase tracking-widest">Scoring Impact</p>
                          <button 
                            onClick={() => setIsGuideModalOpen(true)}
                            className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1 uppercase tracking-wider"
                          >
                            <BookOpen size={10} />
                            View Rubric
                          </button>
                        </div>
                        <div className="flex items-baseline gap-3 mb-4">
                          <span className={`text-5xl font-headline font-black ${selectedSubmission.sentimentScore > 0 ? 'text-secondary-fixed' : 'text-primary'}`}>
                            {selectedSubmission.sentimentScore > 0 ? '+' : ''}{selectedSubmission.sentimentScore.toFixed(1)}
                          </span>
                          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-widest opacity-60">Points contributed to CSAT</span>
                        </div>

                        {/* Aspect Dimensions */}
                        {selectedSubmission.aspects && (
                          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-outline-variant/10">
                            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant/5">
                              <p className="text-[9px] font-headline font-bold text-on-surface-variant uppercase tracking-widest mb-1">Engagement</p>
                              <span className={`text-[11px] font-bold ${
                                selectedSubmission.aspects.engagement === 'High' ? 'text-secondary-fixed' :
                                selectedSubmission.aspects.engagement === 'Low' ? 'text-tertiary-container' : 'text-primary'
                              }`}>
                                {selectedSubmission.aspects.engagement || 'Moderate'}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant/5">
                              <p className="text-[9px] font-headline font-bold text-on-surface-variant uppercase tracking-widest mb-1">Clarity</p>
                              <span className={`text-[11px] font-bold ${
                                selectedSubmission.aspects.clarity === 'Confusing' ? 'text-tertiary-container' :
                                selectedSubmission.aspects.clarity === 'Fast' ? 'text-primary' : 'text-secondary-fixed'
                              }`}>
                                {selectedSubmission.aspects.clarity || 'Clear'}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant/5">
                              <p className="text-[9px] font-headline font-bold text-on-surface-variant uppercase tracking-widest mb-1">Confidence</p>
                              <span className={`text-[11px] font-bold ${
                                selectedSubmission.aspects.confidence === 'Increased' ? 'text-secondary-fixed' :
                                selectedSubmission.aspects.confidence === 'Frustrated' ? 'text-tertiary-container' : 'text-on-surface-variant'
                              }`}>
                                {selectedSubmission.aspects.confidence || 'Unchanged'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      <div className="pt-4 border-t border-outline-variant/10 space-y-2">
                        <p className="text-sm leading-relaxed text-on-surface-variant">
                          This submission was classified as <span className={`font-black uppercase ${selectedSubmission.sentimentColor.split(' ')[0]}`}>{selectedSubmission.sentiment}</span> because {
                            selectedSubmission.sentimentBasis && selectedSubmission.sentimentBasis.length > 0 
                              ? selectedSubmission.sentimentBasis.join(', and ') + '.'
                              : 'it did not meet specific positive or negative thresholds defined in the classification guide.'
                          }
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-tighter text-on-surface-variant opacity-40">
                          Based on The Ear Academy Weighted Composite Model
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

      {/* Classification Guide & Scoring Rubric Modal */}
      <AnimatePresence>
        {isGuideModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-surface-container-high rounded-3xl border border-outline-variant/20 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-highest/50">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                    <BookOpen size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-headline font-black text-on-surface">Classification Guide & Scoring Model</h2>
                    <p className="text-xs text-on-surface-variant font-medium">Standardized sentiment evaluation, CSAT scoring, and AI classification rubric</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsGuideModalOpen(false)}
                  className="p-2 hover:bg-surface-container rounded-full transition-colors text-on-surface-variant hover:text-on-surface"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {/* Mathematical Formula */}
                <div className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant/10 space-y-4">
                  <div className="flex items-center gap-2 text-primary">
                    <Sliders size={18} />
                    <h3 className="text-sm font-headline font-bold uppercase tracking-widest">Weighted Composite Formula</h3>
                  </div>
                  <p className="text-sm text-on-surface-variant leading-relaxed">
                    To eliminate single-keyword false alarms, student submissions are evaluated using a multi-factor weighted equation:
                  </p>
                  <div className="p-4 rounded-xl bg-surface-container font-mono text-xs text-primary border border-primary/20">
                    Score = (0.40 × Star Rating) + (0.30 × Facet Balance) + (0.30 × Qualitative Tone & Confidence)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-on-surface">Star Rating</span>
                        <span className="text-xs font-black text-primary">40% Weight</span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant">5★ (+1.0), 4★ (+0.75), 3★ (0.0), 2★ (-0.75), 1★ (-1.0)</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-on-surface">Facet Balance</span>
                        <span className="text-xs font-black text-primary">30% Weight</span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant">0 / None disliked (+1.0), 1 disliked (0.0), 2+ disliked (-1.0)</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/10">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-on-surface">Tone & Confidence</span>
                        <span className="text-xs font-black text-primary">30% Weight</span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant">Enthusiastic (+1.0), Neutral (0.0), Explicit Friction (-1.0)</p>
                    </div>
                  </div>
                </div>

                {/* Classification Categories */}
                <div className="space-y-4">
                  <h3 className="text-sm font-headline font-bold uppercase tracking-widest text-on-surface-variant">Sentiment Tier Definitions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Positive */}
                    <div className="p-5 rounded-2xl bg-secondary-fixed/5 border border-secondary-fixed/20 space-y-3">
                      <div className="flex items-center gap-2 text-secondary-fixed">
                        <CheckCircle2 size={18} />
                        <h4 className="text-sm font-headline font-bold uppercase tracking-wider">POSITIVE (Counts to CSAT)</h4>
                      </div>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        Composite Score &ge; 0.35 OR 4-5 Star rating without friction. Cites clear enjoyment, high engagement, or increased confidence.
                      </p>
                      <div className="text-[11px] font-mono text-secondary-fixed space-y-1 pt-1">
                        <div>• "Amazing", "Loved it", "Clicked"</div>
                        <div>• "More confident", "Can't wait"</div>
                        <div>• "I was good throughout"</div>
                      </div>
                    </div>

                    {/* Neutral */}
                    <div className="p-5 rounded-2xl bg-primary/5 border border-primary/20 space-y-3">
                      <div className="flex items-center gap-2 text-primary">
                        <Layers size={18} />
                        <h4 className="text-sm font-headline font-bold uppercase tracking-wider">NEUTRAL (Excluded from CSAT)</h4>
                      </div>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        Composite Score between -0.19 and +0.34. Mixed experience, moderate interest, or single constructive facet comment.
                      </p>
                      <div className="text-[11px] font-mono text-primary space-y-1 pt-1">
                        <div>• "It was okay", "Pretty good"</div>
                        <div>• "Kind of — glimpses of it"</div>
                        <div>• "We'll see", "Not sure"</div>
                      </div>
                    </div>

                    {/* Critical */}
                    <div className="p-5 rounded-2xl bg-tertiary-container/5 border border-tertiary-container/20 space-y-3">
                      <div className="flex items-center gap-2 text-tertiary-container">
                        <AlertTriangle size={18} />
                        <h4 className="text-sm font-headline font-bold uppercase tracking-wider">CRITICAL (Action Required)</h4>
                      </div>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        Composite Score &le; -0.20 OR 1-2 Stars OR 2+ facets disliked OR explicit frustration or difficulty understanding.
                      </p>
                      <div className="text-[11px] font-mono text-tertiary-container space-y-1 pt-1">
                        <div>• "Didn't enjoy it", "Overwhelmed"</div>
                        <div>• "Confusing", "Too hard", "Too fast"</div>
                        <div>• "Didn't get instructions"</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Aspect Dimensions & Negation Guards */}
                <div className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant/10 space-y-3">
                  <div className="flex items-center gap-2 text-on-surface">
                    <ShieldAlert size={18} className="text-secondary-fixed" />
                    <h3 className="text-sm font-headline font-bold uppercase tracking-widest">Negation Guard & Edge-Case Rules</h3>
                  </div>
                  <ul className="text-xs text-on-surface-variant space-y-2 list-disc list-inside leading-relaxed">
                    <li><strong className="text-on-surface">Header Isolation:</strong> Question titles are stripped before evaluating text to avoid false positives (e.g. evaluating a student answering "None" to a question with "confusing" in the title).</li>
                    <li><strong className="text-on-surface">Negation Handling:</strong> Phrases like "wasn't too hard", "not confusing", "no issues", and "enjoyed all facets" explicitly protect positive scores.</li>
                    <li><strong className="text-on-surface">Constructive Enthusiasm:</strong> A student who gave high ratings and enjoyed the material but requested extra time is classified as POSITIVE with constructive clarity aspect notes.</li>
                  </ul>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t border-outline-variant/10 bg-surface-container-highest/30 flex justify-end">
                <button 
                  onClick={() => setIsGuideModalOpen(false)}
                  className="bg-primary text-on-primary px-6 py-2.5 rounded-xl text-sm font-headline font-bold uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/20"
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
