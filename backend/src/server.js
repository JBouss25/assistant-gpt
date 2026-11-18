import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { loadConfig } from './config.js';
import { requireAuth } from './auth.js';
import { createStore } from './store.js';
import { createChatRouter } from './routes/chat.js';

const config = loadConfig();
const store = createStore(config);
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // derrière Cloudflare / Nginx : IP réelle pour le rate limit

app.use(
  cors({
    origin(origin, callback) {
      // Requêtes sans Origin (curl, santé) acceptées ; sinon liste blanche stricte.
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
  }),
);
app.use(express.json({ limit: '32kb' }));

app.use(
  '/api',
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Trop de requêtes, réessayez plus tard' },
  }),
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/chat', requireAuth(config.jwtSecret), createChatRouter({ config, store }));

app.use((_req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

app.use((err, _req, res, _next) => {
  console.error('[server] erreur non gérée :', err);
  res.status(500).json({ error: 'Erreur interne' });
});

app.listen(config.port, () => {
  console.log(`API assistant IA à l'écoute sur le port ${config.port}`);
});
