/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { VocabularyItem, Question, Language, FluencySituation, FluencyEvaluation } from "../types";
import { HSK1_DATA } from "../data/hsk1";
import { HSK2_DATA } from "../data/hsk2";
import { HSK3_DATA } from "../data/hsk3";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function fetchVocabulary(level: string, language: Language): Promise<VocabularyItem[]> {
  // Check for local HSK data
  if (language === 'Chinese' && (level.startsWith('HSK 1') || level.startsWith('HSK 2') || level.startsWith('HSK 3'))) {
    const isHSK1 = level.startsWith('HSK 1');
    const isHSK2 = level.startsWith('HSK 2');
    const hskData = isHSK1 ? HSK1_DATA : isHSK2 ? HSK2_DATA : HSK3_DATA;
    const lessonMatch = level.match(/Bài (\d+)/);
    const lessonNum = lessonMatch ? parseInt(lessonMatch[1]) : null;
    
    let baseWords: Partial<VocabularyItem>[] = [];
    if (lessonNum && hskData[lessonNum]) {
      baseWords = hskData[lessonNum];
    } else {
      const basicNum = 1;
      baseWords = hskData[basicNum].slice(0, 10);
    }

    if (baseWords.length > 0) {
      return baseWords.map((item, idx) => ({
        id: `hsk${isHSK1 ? 1 : isHSK2 ? 2 : 3}-l${lessonNum || 1}-${idx}`,
        word: item.word!,
        pronunciation: item.pronunciation!,
        meaning: item.meaning!,
        partOfSpeech: item.partOfSpeech || 'n.',
        grammar: item.grammar || `Cấu trúc HSK ${isHSK1 ? 1 : isHSK2 ? 2 : 3}`,
        language: 'Chinese',
        examples: [
          { target: `我喜欢 ${item.word}`, vietnamese: `Tôi thích ${item.meaning}` },
          { target: `这是 ${item.word}`, vietnamese: `Đây là ${item.meaning}` }
        ],
        mistakeCount: 0,
        level: level,
        status: 'Chưa thuộc'
      }));
    }
  }

  let contextPrompt = "";
  if (language === 'Chinese') {
    contextPrompt = `Generate a list of 10 vocabulary words for HSK level ${level}.`;
  } else if (language === 'TOEIC') {
    contextPrompt = `Generate a list of 10 vocabulary words for TOEIC exam, topic or level: ${level}. Focus on workplace communication, logistics, and business context.`;
  } else if (language === 'IELTS') {
    contextPrompt = `Generate a list of 10 vocabulary words for IELTS exam, band or topic: ${level}. Focus on academic vocabulary, formal expressions, and complex topics.`;
  } else {
    contextPrompt = `Generate a list of 10 vocabulary words for English topic: ${level} (Marketing/E-commerce).`;
  }

  const prompt = `${contextPrompt}
       Format as JSON array of objects with fields: word, pronunciation (IPA for English/IELTS/TOEIC, Pinyin for Chinese), meaning (Vietnamese), partOfSpeech, grammar, examples (array of 2 objects with keys 'target' and 'vietnamese').`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            pronunciation: { type: Type.STRING },
            meaning: { type: Type.STRING },
            partOfSpeech: { type: Type.STRING },
            grammar: { type: Type.STRING },
            examples: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  target: { type: Type.STRING },
                  vietnamese: { type: Type.STRING }
                }
              }
            }
          },
          required: ["word", "pronunciation", "meaning", "partOfSpeech", "grammar", "examples"]
        }
      }
    }
  });

  const data = JSON.parse(response.text || "[]");
  return data.map((item: any) => ({
    ...item,
    id: Math.random().toString(36).substr(2, 9),
    mistakeCount: 0
  }));
}

export async function generateTest(words: VocabularyItem[], language: Language, type?: 'multiple-choice' | 'translation' | 'ordering'): Promise<Question[]> {
  const wordsJson = JSON.stringify(words);
  let targetName = "";
  if (language === 'Chinese') targetName = 'HSK (Chinese)';
  else if (language === 'TOEIC') targetName = 'TOEIC Exam';
  else if (language === 'IELTS') targetName = 'IELTS Exam';
  else targetName = 'Specialized English';
  
  const typeConstraint = type 
    ? `exactly 10 questions of type '${type}'`
    : `exactly:
    - 5 multiple choice questions (options: array of 4 strings)
    - 5 translation questions (target language to Vietnamese or vice versa)
    - 5 word ordering questions (scrambled words to full sentences)`;

  const prompt = `Based strictly on these ${targetName} words: ${wordsJson}, generate a test with ${typeConstraint}.
    
    Language Rules:
    - If language is 'Chinese', ensures questions use Simplified Chinese characters.
    - If language is 'English', 'TOEIC', or 'IELTS', ensures questions use appropriate exam context.
    - All translations should be between the target language (${language}) and Vietnamese.
    
    Format as JSON array of objects with fields: type, question, options (optional), answer, explanation.
    
    Specifics for 'ordering' type:
    - If language is 'Chinese', the 'question' should be a string of words or characters separated by spaces (e.g., "我 喜欢 学习 汉语").
    - For English/TOEIC/IELTS, the 'question' should be words separated by spaces.
    - The 'answer' must be the correctly ordered full sentence.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ["multiple-choice", "translation", "ordering"] },
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            answer: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ["type", "question", "answer", "explanation"]
        }
      }
    }
  });

  return JSON.parse(response.text || "[]");
}

export async function processNewWord(input: string): Promise<VocabularyItem> {
  const prompt = `Based on this user input: "${input}" (Format: [Word] - [HSK Level/English Topic]), 
    generate a complete vocabulary item for an application called "My Growth Vault".
    
    Specific Requirements:
    1. Determine if the word fits best into: [Marketing], [Daily], or [Work].
    2. Create a "Copywriting Challenge" caption (01 sentence) in Vietnamese. 
       - Style: "Phụ Kiện Sóc Nâu" (chất, trendy, lifestyle) or Professional Portfolio.
       - Use grammar structures relevant to the HSK level if applicable.
    
    Format as JSON object with fields: 
    word, pronunciation, meaning, partOfSpeech, grammar, 
    examples (array of 2 objects with keys 'target' and 'vietnamese'),
    label (one of: 'Marketing', 'Daily', 'Work'),
    caption (the string caption).`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          word: { type: Type.STRING },
          pronunciation: { type: Type.STRING },
          meaning: { type: Type.STRING },
          partOfSpeech: { type: Type.STRING },
          grammar: { type: Type.STRING },
          label: { type: Type.STRING, enum: ['Marketing', 'Daily', 'Work'] },
          caption: { type: Type.STRING },
          examples: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                target: { type: Type.STRING },
                vietnamese: { type: Type.STRING }
              }
            }
          }
        },
        required: ["word", "pronunciation", "meaning", "partOfSpeech", "grammar", "examples", "label", "caption"]
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    ...data,
    id: Math.random().toString(36).substr(2, 9),
    mistakeCount: 0
  };
}

export async function generateListeningTest(words: VocabularyItem[], language: Language): Promise<Question[]> {
  const wordsJson = JSON.stringify(words);
  let targetName = "";
  if (language === 'Chinese') targetName = 'HSK (Chinese)';
  else if (language === 'TOEIC') targetName = 'TOEIC Exam';
  else if (language === 'IELTS') targetName = 'IELTS Exam';
  else targetName = 'Specialized English';
  
  const prompt = `Based strictly on these ${targetName} words: ${wordsJson}, generate a listening test with exactly 5 questions.
    For each question:
    - Set 'type' to 'listening'
    - 'audioText': The text that will be spoken in ${language}. 
    - 'question': Instruction in Vietnamese like 'Nghe và chọn từ đúng' or 'Nghe và điền từ còn thiếu'.
    - 'answer': The correct text to match or fill.
    - 'options': (Optional, for multiple choice) a list of 4 similar sounding or related words in ${language}.
    - 'explanation': Brief note in Vietnamese on pronunciation or usage.
    
    Format as JSON array of objects with fields: type, question, audioText, options, answer, explanation.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ["listening"] },
            question: { type: Type.STRING },
            audioText: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            answer: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ["type", "question", "audioText", "answer", "explanation"]
        }
      }
    }
  });

  return JSON.parse(response.text || "[]");
}

export async function searchVocabulary(query: string, context?: { language: Language, level: string }): Promise<any> {
  let prompt = "";
  let responseSchema: any = {};

  if (!context) {
    // Global Search: 3 columns [Vietnamese] | [English] | [Chinese]
    prompt = `Search for the word or phrase: "${query}". 
    Create a comprehensive result showing the word in Vietnamese, English, and Chinese (with Pinyin for Chinese).
    Format as a JSON object with: 
    - vietnamese: { word: string, definition: string }
    - english: { word: string, definition: string, pronunciation: string }
    - chinese: { word: string, pinyin: string, definition: string }
    - examples: array of objects with { en: string, zh: string, vi: string }`;
    
    responseSchema = {
      type: Type.OBJECT,
      properties: {
        vietnamese: {
          type: Type.OBJECT,
          properties: { word: { type: Type.STRING }, definition: { type: Type.STRING } },
          required: ["word", "definition"]
        },
        english: {
          type: Type.OBJECT,
          properties: { word: { type: Type.STRING }, definition: { type: Type.STRING }, pronunciation: { type: Type.STRING } },
          required: ["word", "definition", "pronunciation"]
        },
        chinese: {
          type: Type.OBJECT,
          properties: { word: { type: Type.STRING }, pinyin: { type: Type.STRING }, definition: { type: Type.STRING } },
          required: ["word", "pinyin", "definition"]
        },
        examples: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { en: { type: Type.STRING }, zh: { type: Type.STRING }, vi: { type: Type.STRING } }
          }
        }
      },
      required: ["vietnamese", "english", "chinese"]
    };
  } else {
    // Local Search: Filter within specific library
    prompt = `Search for the word "${query}" specifically within the ${context.language} context (Level/Topic: ${context.level}).
    If the word is relevant to ${context.language} and likely to be in a ${context.level} library, return its details.
    If the word is NOT relevant to ${context.language} ${context.level} (e.g. searching 'Marketing' in a 'Daily' Chinese library), set 'notInDataset' field to true.
    
    Format as JSON object with fields: 
    word, pronunciation, meaning, partOfSpeech, grammar, examples (array), notInDataset (boolean).`;
    
    responseSchema = {
      type: Type.OBJECT,
      properties: {
        word: { type: Type.STRING },
        pronunciation: { type: Type.STRING },
        meaning: { type: Type.STRING },
        partOfSpeech: { type: Type.STRING },
        grammar: { type: Type.STRING },
        notInDataset: { type: Type.BOOLEAN },
        examples: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { target: { type: Type.STRING }, vietnamese: { type: Type.STRING } }
          }
        }
      },
      required: ["word", "meaning", "notInDataset"]
    };
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: responseSchema
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function generateFluencySituation(language: Language, level: string): Promise<FluencySituation> {
  const prompt = `Generate a short oral communication scenario (prompt) for a language learner.
    Language: ${language}
    Level/Topic: ${level}
    
    The scenario should be a situation where the user needs to speak.
    Format as a JSON object with:
    - scenario: Description of the situation in Vietnamese.
    - instruction: What the user should say or do in Vietnamese.
    - context: The setting or role play context in ${language}.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scenario: { type: Type.STRING },
          instruction: { type: Type.STRING },
          context: { type: Type.STRING }
        },
        required: ["scenario", "instruction", "context"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function evaluateFluencyResponse(language: Language, situation: FluencySituation, userResponse: string): Promise<FluencyEvaluation> {
  const prompt = `Evaluate the following language learner's response.
    Language: ${language}
    Situation Scenario: ${situation.scenario}
    Context: ${situation.context}
    User's Response: "${userResponse}"
    
    Feedback should be in Vietnamese and cover:
    1. Accuracy (Grammar/Vocabulary)
    2. Naturalness (How a native would say it)
    
    The 'suggestedVersion' should be in a professional, high-impact "Marketing English" style where appropriate.
    
    Format as a JSON object with:
    - feedback: Detailed feedback in Vietnamese.
    - suggestedVersion: A more natural and polished version in ${language}.
    - isNatural: Boolean true if it was already quite natural.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          feedback: { type: Type.STRING },
          suggestedVersion: { type: Type.STRING },
          isNatural: { type: Type.BOOLEAN }
        },
        required: ["feedback", "suggestedVersion", "isNatural"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}
