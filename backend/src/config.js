import 'dotenv/config';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

if (!supabaseUrl || !supabaseKey || allowedOrigins.length === 0) {
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ALLOWED_ORIGINS must be set in backend/.env');
}

export const config = {
    port: process.env.PORT || 3000,
    dataDir: join(rootDir, 'data'),
    imagesDir: join(rootDir, 'data', 'images'),
    audioDir: join(rootDir, 'data', 'audio'),
    maxJsonBody: 48 * 1024 * 1024,
    maxImageBytes: 10 * 1024 * 1024,
    maxAudioBytes: 25 * 1024 * 1024,
    maxMeasures: 1000,
    maxTempo: 400,
    maxEventBatch: 100,
    maxTitleLength: 200,
    maxSubtitleLength: 300,
    maxComposerLength: 200,
    progressWindowSize: 50,
    decayRatePerDay: 0.98,
    daySeconds: 24 * 60 * 60,
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 120,
    allowedOrigins,
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
});
