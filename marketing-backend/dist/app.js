"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const routes_1 = __importDefault(require("./routes"));
const auth_middleware_1 = require("./middleware/auth.middleware");
dotenv_1.default.config();
const app = (0, express_1.default)();
// ─── Trust Proxy (Render terminates TLS at edge) ──────────────────────────────
app.set('trust proxy', 1);
// ─── Security Headers ─────────────────────────────────────────────────────────
app.use((0, helmet_1.default)({
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
}));
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
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) {
            callback(null, true);
            return;
        }
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            console.warn(`[CORS] Blocked origin: ${origin}`);
            callback(new Error(`CORS policy does not allow origin: ${origin}`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Customer-Key', 'X-Admin-Pin', 'X-Investor-Key'],
}));
// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Global: 100 requests per 15 minutes per IP
app.use((0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later.' } },
}));
// Stricter limit on auth endpoints (brute-force protection)
app.use('/api/auth', (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many auth requests, please try again later.' } },
}));
// Stricter limit on customer key auth (prevents key enumeration / brute-force)
app.use('/api/customer/auth', (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many auth requests, please try again later.' } },
}));
// Same protection for the investor key gate.
app.use('/api/investor/auth', (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many auth requests, please try again later.' } },
}));
// Stricter limit on AI chat endpoints (cost protection)
app.use('/api/chat', (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many chat requests, please slow down.' } },
}));
// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
// ─── Session ──────────────────────────────────────────────────────────────────
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || 'change-this-in-production-please',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000, // 10 minutes — just for OAuth flow
    },
}));
// ─── Request Logging ──────────────────────────────────────────────────────────
app.use((req, _res, next) => {
    const start = Date.now();
    const { method, path: reqPath, query } = req;
    const queryStr = Object.keys(query).length ? ` ?${new URLSearchParams(query).toString()}` : '';
    console.log(`[${new Date().toISOString()}] ${method} ${reqPath}${queryStr}`);
    void start;
    next();
});
// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', routes_1.default);
// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({
        error: {
            code: 'NOT_FOUND',
            message: 'The requested endpoint does not exist',
        },
    });
});
// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(auth_middleware_1.errorHandler);
exports.default = app;
