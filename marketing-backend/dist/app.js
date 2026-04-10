"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_session_1 = __importDefault(require("express-session"));
const dotenv_1 = __importDefault(require("dotenv"));
const routes_1 = __importDefault(require("./routes"));
const auth_middleware_1 = require("./middleware/auth.middleware");
dotenv_1.default.config();
const app = (0, express_1.default)();
// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://vision-virtue.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));
// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// ─── Session ──────────────────────────────────────────────────────────────────
app.use((0, express_session_1.default)({
    secret: process.env.SESSION_SECRET || 'change-this-in-production-please',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 10 * 60 * 1000, // 10 minutes — just for OAuth flow
    },
}));
// ─── Request Logging ──────────────────────────────────────────────────────────
app.use((req, _res, next) => {
    const start = Date.now();
    const { method, path: reqPath, query } = req;
    const queryStr = Object.keys(query).length ? ` ?${new URLSearchParams(query).toString()}` : '';
    console.log(`[${new Date().toISOString()}] ${method} ${reqPath}${queryStr}`);
    next();
    // Note: response logging would require hooking res.on('finish')
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
