import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import routes from './routes';
import { errorHandler } from './middleware/auth.middleware';

dotenv.config();

const app = express();

// ─── Trust Proxy (Render terminates TLS at edge) ──────────────────────────────

app.set('trust proxy', 1);

// ─── Security Headers ─────────────────────────────────────────────────────────

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: [
          "'self'",
          'https://visionvirtuepartnership.com',
          'https://www.visionvirtuepartnership.com',
          'https://vision-virtue.github.io',
        ],
      },
    },
  }),
);

// ─── CORS ─────────────────────────────────────────────────────────────────────

const allowedOrigins = [
  'https://vision-virtue.github.io',
  'https://visionvirtuepartnership.com',
  'https://www.visionvirtuepartnership.com',
  // Local dev server (dev.sh serves on :8000). Always allowed so the
  // workflow of "edit locally, hit live backend" works without redeploys.
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Blocked origin: ${origin}`);
        callback(new Error(`CORS policy does not allow origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Customer-Key', 'X-Admin-Pin', 'X-Investor-Key'],
  }),
);

// ─── Rate Limiting ────────────────────────────────────────────────────────────

// Global: 100 requests per 15 minutes per IP
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
  }),
);

// Stricter limit on auth endpoints (brute-force protection)
app.use(
  '/api/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many auth requests, please try again later.' } },
  }),
);

// Strict limit on customer key auth (prevents key enumeration / brute-force).
// Tightened P1: 5 attempts / 15 min / IP (was 20). Combined with per-key
// lockout in auth.security.ts (5 consecutive failures on a single key → 1h lock).
app.use(
  '/api/customer/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many auth requests, please try again later.' } },
  }),
);

// Same protection for the investor key gate.
app.use(
  '/api/investor/auth',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many auth requests, please try again later.' } },
  }),
);

// Stricter limit on AI chat endpoints (cost protection)
app.use(
  '/api/chat',
  rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many chat requests, please slow down.' } },
  }),
);

// ─── Body Parsers ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Session ──────────────────────────────────────────────────────────────────

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-in-production-please',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes — just for OAuth flow
    },
  }),
);

// ─── Request Logging ──────────────────────────────────────────────────────────

app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();
  const { method, path: reqPath, query } = req;
  const queryStr = Object.keys(query).length ? ` ?${new URLSearchParams(query as Record<string, string>).toString()}` : '';
  console.log(`[${new Date().toISOString()}] ${method} ${reqPath}${queryStr}`);
  void start;
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api', routes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
    },
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

app.use(errorHandler);

export default app;
