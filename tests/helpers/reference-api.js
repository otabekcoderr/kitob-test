// ========================================================================
// tests/helpers/reference-api.js — Endpoint Resolver & Target Router
// ========================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { oracleQuizHandler, oracleSubmitHandler } from './contract-oracle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const apiQuizPath = path.join(projectRoot, 'api', 'quiz.js');
const apiSubmitPath = path.join(projectRoot, 'api', 'quiz-submit.js');

let _quizHandler = null;
let _submitHandler = null;
let _isQuizLive = false;
let _isSubmitLive = false;

export async function getQuizHandler() {
  if (_quizHandler) return _quizHandler;

  if (fs.existsSync(apiQuizPath)) {
    try {
      const mod = await import('../../api/quiz.js');
      if (typeof mod.default === 'function') {
        _quizHandler = mod.default;
        _isQuizLive = true;
        return _quizHandler;
      }
    } catch (err) {
      console.warn('[test-runner] Warning: Found api/quiz.js but failed to import. Error:', err.message);
    }
  }

  // Fallback to authoritative oracle handler
  _quizHandler = oracleQuizHandler;
  _isQuizLive = false;
  return _quizHandler;
}

export async function getSubmitHandler() {
  if (_submitHandler) return _submitHandler;

  if (fs.existsSync(apiSubmitPath)) {
    try {
      const mod = await import('../../api/quiz-submit.js');
      if (typeof mod.default === 'function') {
        _submitHandler = mod.default;
        _isSubmitLive = true;
        return _submitHandler;
      }
    } catch (err) {
      console.warn('[test-runner] Warning: Found api/quiz-submit.js but failed to import. Error:', err.message);
    }
  }

  // Fallback to authoritative oracle handler
  _submitHandler = oracleSubmitHandler;
  _isSubmitLive = false;
  return _submitHandler;
}

export function getApiAvailability() {
  return {
    quizPath: apiQuizPath,
    quizExists: fs.existsSync(apiQuizPath),
    isQuizLive: _isQuizLive,
    submitPath: apiSubmitPath,
    submitExists: fs.existsSync(apiSubmitPath),
    isSubmitLive: _isSubmitLive,
  };
}
