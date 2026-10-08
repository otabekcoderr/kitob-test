// ========================================================================
// api/quiz-check.js — Instant Single-Question Answer Verification API
// ========================================================================
// Verifies a student's answer immediately after selection, returning whether
// it is correct, the canonical correct answer, and the educational explanation.
// Answer keys are strictly NOT pre-delivered to the client in GET /api/quiz.
// ========================================================================

import { setCorsHeaders, sendJson, slugify } from './_utils.js';
import { getSupabaseAnon, getSupabaseAdmin, extractBearerToken } from './_supabase.js';
import { questions as staticQuestions, books as staticBooks } from '../js/data.js';

export default async function handler(req, res) {
  setCorsHeaders(req, res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, {
      success: false,
      error: 'Method Not Allowed. Only POST requests are supported.',
      code: 'METHOD_NOT_ALLOWED'
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return sendJson(res, 400, {
          success: false,
          error: 'Invalid JSON request body.',
          code: 'INVALID_JSON'
        });
      }
    }

    if (!body || typeof body !== 'object') {
      return sendJson(res, 400, {
        success: false,
        error: 'Missing required request body.',
        code: 'MISSING_BODY'
      });
    }

    const {
      questionId,
      selectedOption,
      bookId,
      questionText: incomingQuestionText
    } = body;

    if (!questionId) {
      return sendJson(res, 400, {
        success: false,
        error: 'Missing required field: questionId.',
        code: 'MISSING_QUESTION_ID'
      });
    }

    const targetQId = String(questionId).trim();
    const cleanQText = incomingQuestionText ? String(incomingQuestionText).trim().toLowerCase() : '';

    // 1. Resolve question from static dataset (0ms latency)
    let foundQ = null;
    if (Array.isArray(staticQuestions)) {
      foundQ = staticQuestions.find(q => q && String(q.id).trim() === targetQId);
      // Try matching by question text if not found by ID
      if (!foundQ && cleanQText) {
        foundQ = staticQuestions.find(q => q && String(q.question || q.text || '').trim().toLowerCase() === cleanQText);
      }
      // Try matching by bookId and question index if question ID has index suffix
      if (!foundQ && bookId) {
        const bookSlug = slugify(bookId);
        const bookQs = staticQuestions.filter(q => q && (String(q.bookId || q.book_id || '') === String(bookId) || slugify(q.bookId || q.book_id || '') === bookSlug));
        const indexMatch = targetQId.match(/(?:[_-]|^)(\d+)$/);
        if (indexMatch && bookQs.length > 0) {
          const num = parseInt(indexMatch[1], 10);
          if (num >= 1 && num <= bookQs.length) {
            foundQ = bookQs[num - 1];
          }
        }
      }
    }

    // 2. Fallback to Supabase questions if not in static dataset or if question is from DB
    if (!foundQ) {
      try {
        const token = extractBearerToken(req);
        const client = getSupabaseAdmin(token) || getSupabaseAnon();
        if (client) {
          const { data, error } = await client
            .from('questions')
            .select('id, bookId, question, options, correctAnswer, explanation')
            .eq('id', targetQId)
            .maybeSingle();
          if (!error && data) {
            foundQ = data;
          }
        }
      } catch (err) {
        console.warn('[api/quiz-check] Supabase question lookup warning:', err.message);
      }
    }

    // 3. Fallback to question_keys for explanation and correct answer if needed
    let correctAnswer = foundQ?.correct_answer ?? foundQ?.correctAnswer;
    let explanation = foundQ?.explanation || '';

    if (correctAnswer === undefined || correctAnswer === null) {
      try {
        const token = extractBearerToken(req);
        const adminClient = getSupabaseAdmin(token);
        if (adminClient) {
          const { data: keyRow } = await adminClient
            .from('question_keys')
            .select('correct_answer, explanation')
            .eq('question_id', targetQId)
            .maybeSingle();
          if (keyRow) {
            correctAnswer = keyRow.correct_answer;
            if (!explanation) explanation = keyRow.explanation || '';
          }
        }
      } catch (err) {
        console.warn('[api/quiz-check] Key lookup warning:', err.message);
      }
    }

    // 4. If found in DB but missing answer/explanation, cross-reference against static dataset by question text
    if (foundQ && (correctAnswer === undefined || correctAnswer === null) && Array.isArray(staticQuestions)) {
      const qText = String(foundQ.question || foundQ.text || '').trim().toLowerCase();
      if (qText) {
        const match = staticQuestions.find(q => q && String(q.question || q.text || '').trim().toLowerCase() === qText);
        if (match) {
          correctAnswer = match.correct_answer ?? match.correctAnswer;
          if (!explanation) explanation = match.explanation || '';
        }
      }
    }

    if (!foundQ) {
      return sendJson(res, 404, {
        success: false,
        error: 'Savol topilmadi.',
        code: 'QUESTION_NOT_FOUND'
      });
    }

    // Normalize options
    let options = [];
    if (Array.isArray(foundQ.options)) {
      options = foundQ.options;
    } else if (Array.isArray(foundQ.variants)) {
      options = foundQ.variants;
    } else if (foundQ.a && foundQ.b && foundQ.c && foundQ.d) {
      options = [foundQ.a, foundQ.b, foundQ.c, foundQ.d];
    } else if (typeof foundQ.options === 'string') {
      try { options = JSON.parse(foundQ.options); } catch { options = []; }
    }

    // Resolve authoritative correct answer text and index
    let correctOptionIndex = null;
    let correctAnswerText = '';

    if (typeof correctAnswer === 'number' && correctAnswer >= 0 && correctAnswer < options.length) {
      correctOptionIndex = correctAnswer;
      correctAnswerText = String(options[correctOptionIndex] ?? '');
    } else if (correctAnswer !== undefined && correctAnswer !== null) {
      correctAnswerText = String(correctAnswer).trim();
      correctOptionIndex = options.findIndex(opt =>
        String(opt).trim().toLowerCase() === correctAnswerText.toLowerCase()
      );
      if (correctOptionIndex === -1 && /^\d+$/.test(correctAnswerText)) {
        const idx = parseInt(correctAnswerText, 10);
        if (idx >= 0 && idx < options.length) {
          correctOptionIndex = idx;
          correctAnswerText = String(options[idx] ?? '');
        }
      }
      if (correctOptionIndex === -1) correctOptionIndex = null;
    }

    // Resolve student submitted selection
    let selectedOptionIndex = null;
    let selectedOptionText = null;

    if (selectedOption !== null && selectedOption !== undefined) {
      if (typeof selectedOption === 'number' && selectedOption >= 0 && selectedOption < options.length) {
        selectedOptionIndex = selectedOption;
        selectedOptionText = String(options[selectedOptionIndex] ?? '');
      } else if (typeof selectedOption === 'string') {
        const trimmed = selectedOption.trim();
        selectedOptionText = trimmed;
        selectedOptionIndex = options.findIndex(opt =>
          String(opt).trim().toLowerCase() === trimmed.toLowerCase()
        );
        if (selectedOptionIndex === -1 && /^\d+$/.test(trimmed)) {
          const idx = parseInt(trimmed, 10);
          if (idx >= 0 && idx < options.length) {
            selectedOptionIndex = idx;
            selectedOptionText = String(options[idx] ?? '');
          }
        }
        if (selectedOptionIndex === -1) selectedOptionIndex = null;
      }
    }

    // Evaluate correctness
    let isCorrect = false;
    if (selectedOptionIndex !== null && correctOptionIndex !== null) {
      isCorrect = (selectedOptionIndex === correctOptionIndex);
    } else if (selectedOptionText && correctAnswerText) {
      isCorrect = (selectedOptionText.trim().toLowerCase() === correctAnswerText.trim().toLowerCase());
    }

    return sendJson(res, 200, {
      success: true,
      questionId: targetQId,
      isCorrect,
      correctAnswer: correctAnswerText || (correctOptionIndex !== null ? String(options[correctOptionIndex] ?? '') : ''),
      correctOptionIndex,
      selectedOptionIndex,
      explanation: explanation || ''
    });

  } catch (error) {
    console.error('[api/quiz-check] Unhandled Error:', error);
    return sendJson(res, 500, {
      success: false,
      error: 'Javobni tekshirishda ichki server xatosi yuz berdi.'
    });
  }
}
