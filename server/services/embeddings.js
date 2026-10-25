import { createHash } from 'node:crypto';
import { config } from '../config.js';

const cache = new Map();
const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.embeddingModel}:embedContent`;

export async function embed(text, taskType) {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('embed(text, taskType) requires non-empty text.');
  if (!['RETRIEVAL_DOCUMENT', 'RETRIEVAL_QUERY'].includes(taskType)) {
    throw new TypeError('taskType must be RETRIEVAL_DOCUMENT or RETRIEVAL_QUERY.');
  }
  const cacheKey = createHash('sha256').update(text + taskType).digest('hex');
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let lastError;
  for (const key of config.geminiApiKeys) {
    const masked = `${key.slice(0, 15)}...${key.slice(-4)}`;
    let response;
    try {
      const url = `${endpoint}?key=${encodeURIComponent(key)}`;
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          model: `models/${config.embeddingModel}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: config.embeddingDims
        })
      });
    } catch (error) {
      console.warn(`[Embeddings] Network error with key ${masked}: ${error.message}`);
      lastError = error;
      continue;
    }

    if (response.ok) {
      const data = await response.json();
      const values = data.embedding?.values;
      if (!Array.isArray(values) || values.length !== config.embeddingDims) {
        throw new Error(`Gemini returned an invalid embedding dimension (expected ${config.embeddingDims}).`);
      }
      cache.set(cacheKey, values);
      return values;
    }

    const detail = await response.text().catch(() => '');
    lastError = new Error(`Gemini embeddings request failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    if (response.status !== 429 && response.status < 500) throw lastError;
  }

  throw lastError ?? new Error('Gemini embeddings failed: no Gemini API keys are configured.');
}
