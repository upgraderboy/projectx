import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { connect } from './db.js';
import chatRouter from './routes/chat.js';
import memoriesRouter from './routes/memories.js';
import sessionRouter from './routes/session.js';
import authRouter from './routes/auth.js';
import projectsRouter from './routes/projects.js';
import { startRealtime } from './services/realtime.js';
import { ensureDatabaseSetup } from './scripts/setup.js';

const app = express();
const currentDir = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(currentDir, '../web/dist');

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api', projectsRouter);
app.use('/api/projects/:projectId/chat', chatRouter);
app.use('/api/projects/:projectId/memories', memoriesRouter);
app.use('/api/projects/:projectId/session', sessionRouter);

app.get('/api/health', async (_req, res) => {
  try {
    const database = await connect();
    await database.command({ ping: 1 });
    res.json({
      status: 'ok', database: 'connected',
      providers: {
        groq: config.groqApiKeys.length > 0,
        gemini: config.geminiApiKeys.length > 0,
        openrouter: config.openrouterApiKeys.length > 0
      }
    });
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'unavailable', error: error.message });
  }
});

if (existsSync(webDist)) app.use(express.static(webDist));
if (existsSync(webDist)) app.get('*', (_req, res) => res.sendFile(resolve(webDist, 'index.html')));

app.use((error, _req, res, _next) => {
  console.error(`Request failed: ${error.message}`);
  const databaseUnavailable = [
    'MongoServerSelectionError',
    'MongoNetworkError',
    'MongoNetworkTimeoutError',
    'MongoTopologyClosedError'
  ].includes(error?.name) || /ECONNRESET|SSL routines|TLS alert/i.test(error?.message ?? '');
  if (databaseUnavailable) {
    return res.status(503).json({
      error: 'MongoDB Atlas is unreachable. Check that the cluster is running, this network can reach Atlas over TLS, and your current IP is on the Atlas IP Access List.'
    });
  }
  res.status(error.status ?? 500).json({ error: error.status ? error.message : 'The request could not be completed.' });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`Smaran.ai API listening on http://localhost:${port}`);
  startRealtime();
  connect().then((database) => {
    ensureDatabaseSetup(database, false).catch((err) => {
      console.warn(`Initial database indexing warning: ${err.message}`);
    });
  }).catch((err) => {
    console.warn(`Initial database connection warning: ${err.message}`);
  });
});
