import express from 'express';
import { config } from './config.js';
import { ensureMediaDirs } from './media/media-store.js';
import { cors, errorHandler, requestControls } from './middleware/request.js';
import { createPracticeRouter, deleteMeasure } from './routes/practice.js';
import { clearProgress, createSongRouter } from './routes/songs.js';

export async function createApp() {
    await ensureMediaDirs();
    const app = express();
    app.use(requestControls());
    app.use(cors);
    app.use(express.json({ limit: `${config.maxJsonBody}b` }));
    app.use('/images', express.static(config.imagesDir));
    app.use('/audio', express.static(config.audioDir));
    app.use('/songs', createSongRouter());
    app.use('/songs', createPracticeRouter());
    app.post('/songs/:id/clear-progress', clearProgress);
    app.post('/songs/:id/measures/:measureNumber/clear-progress', (req, res) => clearProgress(req, res, Number(req.params.measureNumber)));
    app.delete('/songs/:id/measures/:measureNumber', deleteMeasure);
    app.use(errorHandler);
    return app;
}

export { config };
