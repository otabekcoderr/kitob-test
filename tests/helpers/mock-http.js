// ========================================================================
// tests/helpers/mock-http.js — Vercel Serverless HTTP Request/Response Mock
// ========================================================================

/**
 * Creates a mock HTTP request object conforming to Node.js/Vercel serverless runtime.
 */
export function createMockReq({
  method = 'GET',
  url = '/',
  query = {},
  headers = {},
  body = null,
} = {}) {
  // Normalize header keys to lowercase
  const normalizedHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    normalizedHeaders[k.toLowerCase()] = String(v);
  }

  // If query is not explicitly provided, attempt to parse from url
  const parsedQuery = { ...query };
  let pathname = url;
  try {
    const parsed = new URL(url, 'http://localhost');
    pathname = parsed.pathname;
    parsed.searchParams.forEach((val, key) => {
      if (parsedQuery[key] === undefined) {
        parsedQuery[key] = val;
      }
    });
  } catch {}

  return {
    method: method.toUpperCase(),
    url,
    pathname,
    query: parsedQuery,
    headers: normalizedHeaders,
    body: body,
  };
}

/**
 * Creates a mock HTTP response object conforming to Node.js/Vercel serverless runtime.
 */
export function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let rawBody = '';
  let jsonBody = null;
  let isFinished = false;

  const res = {
    get statusCode() {
      return statusCode;
    },
    set statusCode(code) {
      statusCode = Number(code) || 200;
    },

    setHeader(name, value) {
      headers[String(name).toLowerCase()] = String(value);
      return res;
    },

    getHeader(name) {
      return headers[String(name).toLowerCase()];
    },

    hasHeader(name) {
      return headers[String(name).toLowerCase()] !== undefined;
    },

    removeHeader(name) {
      delete headers[String(name).toLowerCase()];
      return res;
    },

    status(code) {
      statusCode = Number(code) || 200;
      return res;
    },

    json(data) {
      if (!headers['content-type']) {
        headers['content-type'] = 'application/json; charset=utf-8';
      }
      jsonBody = data;
      rawBody = JSON.stringify(data);
      isFinished = true;
      return res;
    },

    send(data) {
      if (typeof data === 'object' && data !== null) {
        return res.json(data);
      }
      rawBody = String(data ?? '');
      try {
        jsonBody = JSON.parse(rawBody);
      } catch {
        jsonBody = null;
      }
      isFinished = true;
      return res;
    },

    end(data) {
      if (data !== undefined) {
        return res.send(data);
      }
      isFinished = true;
      return res;
    },

    // Inspect helpers for assertions
    _getStatusCode: () => statusCode,
    _getHeaders: () => ({ ...headers }),
    _getRawBody: () => rawBody,
    _getJson: () => {
      if (jsonBody !== null) return jsonBody;
      try {
        return JSON.parse(rawBody);
      } catch {
        return null;
      }
    },
    _isFinished: () => isFinished,
  };

  return res;
}
