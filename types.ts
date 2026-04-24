/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Language = 'Chinese' | 'English' | 'TOEIC' | 'IELTS';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  totalStudyTime: number;
  dailyGoal: number;
  currentStreak: number;
  fireStreak: number;
  lastActiveDate: string;
  isPremium: boolean;
  temporaryUnlocks?: string[]; // Array of level/topic IDs unlocked via fireStreak
}

export interface StudyLog {
  date: string;
  wordsLearned: string[]; // word IDs
  wordsReviewed: string[]; // word IDs
}

export interface VocabularyItem {
  id: string;
  word: string;
  pronunciation: string;
  meaning: string;
  partOfSpeech: string;
  grammar: string;
  language: Language;
  examples: {
    target: string;
    vietnamese: string;
  }[];
  level?: string;
  topic?: string;
  mistakeCount: number;
  label?: 'Marketing' | 'Daily' | 'Work';
  caption?: string;
  status?: 'Chưa thuộc' | 'Cần luyện tập' | 'Đã thuộc';
}

export interface Question {
  type: 'multiple-choice' | 'translation' | 'ordering' | 'listening';
  question: string;
  audioText?: string;
  options?: string[];
  answer: string;
  explanation: string;
}

export interface TestSuite {
  questions: Question[];
}

export interface FluencySituation {
  scenario: string;
  instruction: string;
  context: string;
}

export interface FluencyEvaluation {
  feedback: string;
  suggestedVersion: string;
  isNatural: boolean;
}
