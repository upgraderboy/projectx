import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}. Set it in .env (see .env.example).`);
  return value;
}

function keyList(name) {
  return (process.env[name] ?? '').split(',').map((key) => key.trim()).filter(Boolean);
}

const dimensions = Number.parseInt(process.env.EMBEDDING_DIMS ?? '768', 10);
if (!Number.isInteger(dimensions) || dimensions < 1) {
  throw new Error('EMBEDDING_DIMS must be a positive integer (768 for the configured Gemini model).');
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.');
}

export const config = Object.freeze({
  mongodbUri: process.env.smaran_MONGODB_URI?.trim() || process.env.MONGODB_URI?.trim() || required('MONGODB_URI'),
  dbName: required('DB_NAME'),
  jwtSecret,
  appUrl: process.env.APP_URL?.trim() || 'http://localhost:5173',
  groqApiKeys: keyList('GROQ_API_KEYS'),
  geminiApiKeys: keyList('GEMINI_API_KEYS'),
  openrouterApiKeys: keyList('OPENROUTER_API_KEYS'),
  fastModel: process.env.FAST_MODEL?.trim() || 'openai/gpt-oss-20b',
  smartModel: process.env.SMART_MODEL?.trim() || 'openai/gpt-oss-120b',
  geminiFastModel: process.env.GEMINI_FAST_MODEL?.trim() || 'gemini-3.5-flash-lite',
  geminiSmartModel: process.env.GEMINI_SMART_MODEL?.trim() || 'gemini-3.8-flash',
  openrouterFastModel: process.env.OPENROUTER_FAST_MODEL?.trim() || 'meta-llama/llama-3.3-70b-instruct:free',
  openrouterSmartModel: process.env.OPENROUTER_SMART_MODEL?.trim() || 'openai/gpt-oss-120b',
  embeddingModel: process.env.EMBEDDING_MODEL?.trim() || 'gemini-embedding-001',
  embeddingDims: dimensions,
  demoUserId: process.env.DEMO_USER_ID?.trim() || 'demo-user',
  demoProjectId: process.env.DEMO_PROJECT_ID?.trim() || 'quickbite',
  recallSimilarityThreshold: 0.55
});

if (config.geminiApiKeys.length === 0) {
  throw new Error('Missing required environment variable: GEMINI_API_KEYS. At least one Gemini key is needed for embeddings.');
}
