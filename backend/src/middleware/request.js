import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,X-Idempotency-Key');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
}

export function errorHandler(error, req, res, next) {
    if (error?.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Uploaded payload is too large', requestId: req.requestId });
    }
    next(error);
}
