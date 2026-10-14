export type Speaker = "interviewer" | "candidate";

export type Turn = {
  speaker: Speaker;
  text: string;
  kind?: "question" | "followup" | "closing";
  // Delivery data for spoken answers (absent when typed).
  durationSec?: number;
  spoken?: boolean;
};

export type InterviewType = "Behavioral" | "Technical" | "Mixed";
export type Difficulty = "Friendly" | "Standard" | "Tough";

export type Setup = {
  role: string;
  type: InterviewType;
  difficulty: Difficulty;
  totalQuestions: number;
  jobPosting: string;
};

export type Category = { name: string; score: number; comment: string };

export type QuestionFeedback = {
  question: string;
  score: number;
  strengths: string[];
  improvements: string[];
  betterAnswer: string;
};

export type Report = {
  overallScore: number;
  headline: string;
  summary: string;
  categories: Category[];
  questions: QuestionFeedback[];
  topTips: string[];
};

export type Delivery = {
  spokenAnswers: number;
  words: number;
  avgWpm: number | null;
  fillerCount: number;
  fillersPer100: number | null;
  topFillers: { word: string; count: number }[];
};

export type Session = {
  id: string;
  date: string;
  setup: Setup;
  turns: Turn[];
  report: Report;
  delivery: Delivery;
  demo: boolean;
};
