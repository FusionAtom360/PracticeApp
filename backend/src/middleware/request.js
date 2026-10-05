import { randomUUID } from 'node:crypto';
import { config, supabase } from '../config.js';

export function requestControls() {
    const requestCounts = new Map();
    const cleanup = setInterval(() => {
        const cutoff = Date.now() - config.rateLimitWindowMs;
        for (const [key, entry] of requestCounts) {
            if (entry.startedAt < cutoff) requestCounts.delete(key);
        }
    }, config.rateLimitWindowMs);
    cleanup.unref();

    return (req, res, next) => {
        const requestId = randomUUID();
        req.requestId = requestId;
        res.setHeader('X-Request-Id', requestId);
        if (req.method === 'OPTIONS') return next();
        const now = Date.now();
        const key = req.ip || 'unknown';
        const entry = requestCounts.get(key);
        if (!entry || now - entry.startedAt >= config.rateLimitWindowMs) {
            requestCounts.set(key, { startedAt: now, count: 1 });
            return next();
        }
        entry.count += 1;
        if (entry.count > config.rateLimitMaxRequests) {
            res.setHeader('Retry-After', String(Math.ceil((config.rateLimitWindowMs - (now - entry.startedAt)) / 1000)));
            return res.status(429).json({ error: 'Too many requests', requestId });
        }
        next();
    };
}

export function cors(req, res, next) {
    const origin = req.get('Origin');
    if (origin && config.allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,X-Idempotency-Key');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
}

export async function requireAuth(req, res, next) {
    if (req.method === 'OPTIONS') return next();
    const header = req.get('Authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Authentication required', requestId: req.requestId });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
        return res.status(401).json({ error: 'Invalid or expired access token', requestId: req.requestId });
    }

    req.user = data.user;
    next();
}

export function errorHandler(error, req, res, next) {
    if (error?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Uploaded payload is too large', requestId: req.requestId });
    }
    next(error);
}
