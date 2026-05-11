import express from 'express';
import { readFile, writeFile, mkdir, unlink, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, 'data');
const imagesDir = join(dataDir, 'images');
const audioDir = join(dataDir, 'audio');
const backupsDir = join(dataDir, 'backups');
const dataFile = join(dataDir, 'songs.json');
const port = process.env.PORT || 3000;

let hasChanges = false;
const MAX_BACKUPS = 24;

async function ensureDataDirs() {
    await mkdir(dataDir, { recursive: true });
    await mkdir(imagesDir, { recursive: true });
    await mkdir(audioDir, { recursive: true });
    await mkdir(backupsDir, { recursive: true });
}

async function ensureDataFile() {
    await ensureDataDirs();

    try {
        await readFile(dataFile, 'utf8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            await writeFile(dataFile, JSON.stringify({ songs: [] }, null, 2));
        } else {
            throw err;
        }
    }
}

function normalizeMeasure(measure) {
    const elapsedTime = typeof measure?.elapsedTime === 'number'
        ? measure.elapsedTime
        : typeof measure?.timeElapsed === 'number'
            ? measure.timeElapsed
            : 0;

    return {
        ...measure,
        elapsedTime,
        timeElapsed: elapsedTime,
    };
}

function normalizeSong(song) {
    const elapsedTime = typeof song?.elapsedTime === 'number'
        ? song.elapsedTime
        : typeof song?.timeElapsed === 'number'
            ? song.timeElapsed
            : 0;

    return {
        ...song,
        elapsedTime,
        timeElapsed: elapsedTime,
        measures: Array.isArray(song?.measures)
            ? song.measures.map(normalizeMeasure)
            : song?.measures,
    };
}

async function createBackup() {
    try {
        const data = await readFile(dataFile, 'utf8');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = join(backupsDir, `songs-${timestamp}.json`);

        await writeFile(backupFile, data, 'utf8');
        console.log(`✓ Backup created: songs-${timestamp}.json`);

        // Clean up old backups
        await cleanupOldBackups();
    } catch (err) {
        console.error('✗ Failed to create backup:', err.message);
    }
}

async function cleanupOldBackups() {
    try {
        const files = await readdir(backupsDir);
        const backupFiles = files.filter((f) => f.startsWith('songs-') && f.endsWith('.json')).sort().reverse();

        if (backupFiles.length > MAX_BACKUPS) {
            const filesToDelete = backupFiles.slice(MAX_BACKUPS);
            for (const file of filesToDelete) {
                await unlink(join(backupsDir, file));
                console.log(`  └─ Deleted old backup: ${file}`);
            }
            console.log(`✓ Cleaned up ${filesToDelete.length} old backup(s)`);
        }
    } catch (err) {
        console.error('✗ Failed to cleanup backups:', err.message);
    }
}

async function startBackupScheduler() {
    // Run backup check every hour
    setInterval(async () => {
        if (hasChanges) {
            await createBackup();
            hasChanges = false;
        }
    }, 60 * 60 * 1000); // 1 hour in milliseconds

    console.log(`✓ Backup scheduler started (runs every 1 hour, keeps ${MAX_BACKUPS} backups)`);
}

function parseJsonFilePayload(file) {
    if (!file || typeof file !== 'object') {
        return null;
    }

    const name = typeof file.name === 'string' ? file.name : '';
    const data = typeof file.data === 'string' ? file.data : '';

    if (!name || !data) {
        return null;
    }

    return { name, data };
}

function getFileExtension(filename, fallbackExtension) {
    const match = typeof filename === 'string' ? filename.match(/\.([a-zA-Z0-9]+)$/) : null;

    if (match?.[1]) {
        return `.${match[1].toLowerCase()}`;
    }

    return fallbackExtension;
}

function serializeSong(req, song) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    return {
        ...song,
        imageUrl: typeof song.image === 'string' && song.image ? `${baseUrl}/images/${song.image}` : null,
        audioUrl: typeof song.audio === 'string' && song.audio ? `${baseUrl}/audio/${song.audio}` : null,
    };
}

async function safelyRemoveFile(directory, filename) {
    if (!filename) {
        return;
    }

    try {
        await unlink(join(directory, filename));
    } catch (err) {
        if (err?.code !== 'ENOENT') {
            throw err;
        }
    }
}

async function readSongs() {
    await ensureDataFile();
    const raw = await readFile(dataFile, 'utf8');
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed.songs) ? parsed.songs.map(normalizeSong) : [];
}

async function writeSongs(songs) {
    const normalizedSongs = Array.isArray(songs) ? songs.map(normalizeSong) : [];
    await writeFile(dataFile, JSON.stringify({ songs: normalizedSongs }, null, 2), 'utf8');
    hasChanges = true;
}

const app = express();

// Request logging middleware - logs all incoming requests
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
});

// CORS middleware - set first so headers apply to all responses
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://practiceapp-f1d1b.web.app');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }

    next();
});

app.use(express.json({ limit: '100mb' }));
app.use('/images', express.static(imagesDir));
app.use('/audio', express.static(audioDir));

app.get('/songs', async (req, res) => {
    try {
        const songs = await readSongs();
        console.log(`✓ Retrieved ${songs.length} songs from database`);
        res.json({ songs: songs.map((song) => serializeSong(req, song)) });
    } catch (err) {
        console.error('✗ Error retrieving songs:', err.message);
        res.status(500).json({ error: 'Failed to retrieve songs' });
    }
});

app.post('/songs', async (req, res) => {
    try {
        await ensureDataFile();

        const body = req.body;

        if (!body || !Array.isArray(body.songs)) {
            console.warn('✗ Invalid POST /songs request body');
            res.status(400).json({ error: 'Request body must be { songs: [] }' });
            return;
        }

        try {
            const normalizedSongs = body.songs.map(normalizeSong);
            await writeSongs(normalizedSongs);
            console.log(`✓ Updated songs database with ${normalizedSongs.length} songs`);
            res.json({ songs: normalizedSongs });
        } catch (err) {
            console.error('✗ Failed to write songs file:', err.message);
            res.status(500).json({ error: 'Failed to write songs' });
        }
    } catch (err) {
        console.error('✗ Error processing POST /songs:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/songs/create', async (req, res) => {
    try {
        const body = req.body ?? {};
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const subtitle = typeof body.subtitle === 'string' ? body.subtitle.trim() : '';
        const composer = typeof body.composer === 'string' ? body.composer.trim() : '';
        const measureCount = Number(body.measureCount);
        const initialTempo = Number(body.initialTempo);
        const targetTempo = Number(body.targetTempo);
        const imageFile = parseJsonFilePayload(body.imageFile);
        const audioFile = parseJsonFilePayload(body.audioFile);

        if (!title || !composer) {
            console.warn('✗ Song creation failed: missing title or composer');
            res.status(400).json({ error: 'Title and composer are required' });
            return;
        }

        if (!Number.isInteger(measureCount) || measureCount < 1) {
            console.warn('✗ Song creation failed: invalid measure count');
            res.status(400).json({ error: 'Number of measures must be a positive integer' });
            return;
        }

        if (!Number.isFinite(initialTempo) || !Number.isFinite(targetTempo)) {
            console.warn('✗ Song creation failed: invalid tempo values');
            res.status(400).json({ error: 'Initial tempo and target tempo must be numbers' });
            return;
        }

        await ensureDataDirs();

        const songs = await readSongs();
        const id = randomUUID();
        const imageId = randomUUID();
        const audioId = randomUUID();
        const imageFilename = imageFile ? `${imageId}${getFileExtension(imageFile.name, '.jpg')}` : '';
        const audioFilename = audioFile ? `${audioId}${getFileExtension(audioFile.name, '.mp3')}` : '';

        if (imageFile) {
            await writeFile(join(imagesDir, imageFilename), Buffer.from(imageFile.data, 'base64'));
            console.log(`  └─ Saved image: ${imageFilename}`);
        }

        if (audioFile) {
            await writeFile(join(audioDir, audioFilename), Buffer.from(audioFile.data, 'base64'));
            console.log(`  └─ Saved audio: ${audioFilename}`);
        }

        const song = {
            id,
            archived: false,
            title,
            subtitle,
            composer,
            image: imageFilename,
            audio: audioFilename,
            measureCount,
            elapsedTime: 0,
            timeElapsed: 0,
            measures: Array.from({ length: measureCount }, (_, index) => ({
                number: index + 1,
                initial: initialTempo,
                target: targetTempo,
                ignoreTempo: false,
                mode: 'stability',
                elapsedTime: 0,
                timeElapsed: 0,
                events: []
            })),
        };

        const updatedSongs = [...songs, song];
        await writeSongs(updatedSongs);

        console.log(`✓ Created song: "${title}" by ${composer} (${measureCount} measures, ID: ${id})`);

        res.status(201).json({
            song: serializeSong(req, song),
            songs: updatedSongs.map((entry) => serializeSong(req, entry)),
        });
    } catch (err) {
        console.error('✗ Failed to create song:', err.message);
        res.status(500).json({ error: 'Failed to create song' });
    }
});

app.post('/songs/:id/update', async (req, res) => {
    try {
        const songId = typeof req.params.id === 'string' ? req.params.id : '';
        const body = req.body ?? {};
        const songs = await readSongs();
        const songIndex = songs.findIndex((song) => song.id === songId);

        if (songIndex === -1) {
            console.warn(`✗ Update failed: Song not found (ID: ${songId})`);
            res.status(404).json({ error: 'Song not found' });
            return;
        }

        const existingSong = songs[songIndex];
        const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : existingSong.title;
        const subtitle = typeof body.subtitle === 'string' ? body.subtitle.trim() : existingSong.subtitle ?? '';
        const composer = typeof body.composer === 'string' && body.composer.trim() ? body.composer.trim() : existingSong.composer;
        const archived = typeof body.archived === 'boolean' ? body.archived : existingSong.archived ?? false;
        const imageFile = parseJsonFilePayload(body.imageFile);
        const audioFile = parseJsonFilePayload(body.audioFile);

        let nextImage = existingSong.image ?? '';
        let nextAudio = existingSong.audio ?? '';

        if (imageFile) {
            const imageId = randomUUID();
            nextImage = `${imageId}${getFileExtension(imageFile.name, '.jpg')}`;
            await writeFile(join(imagesDir, nextImage), Buffer.from(imageFile.data, 'base64'));
            await safelyRemoveFile(imagesDir, existingSong.image);
            console.log(`  └─ Updated image: ${nextImage}`);
        }

        if (audioFile) {
            const audioId = randomUUID();
            nextAudio = `${audioId}${getFileExtension(audioFile.name, '.mp3')}`;
            await writeFile(join(audioDir, nextAudio), Buffer.from(audioFile.data, 'base64'));
            await safelyRemoveFile(audioDir, existingSong.audio);
            console.log(`  └─ Updated audio: ${nextAudio}`);
        }

        const updatedSong = {
            ...existingSong,
            title,
            subtitle,
            composer,
            archived,
            image: nextImage,
            audio: nextAudio,
        };

        const updatedSongs = songs.slice();
        updatedSongs[songIndex] = updatedSong;
        await writeSongs(updatedSongs);

        console.log(`✓ Updated song: "${title}" by ${composer} (ID: ${songId})`);

        res.json({
            song: serializeSong(req, updatedSong),
            songs: updatedSongs.map((entry) => serializeSong(req, entry)),
        });
    } catch (err) {
        console.error('✗ Failed to update song:', err.message);
        res.status(500).json({ error: 'Failed to update song' });
    }
});

app.post('/songs/:id/measures/:measureNumber/events', async (req, res) => {
    try {
        const songId = typeof req.params.id === 'string' ? req.params.id : '';
        const body = req.body ?? {};
        const measureNumber = Number(req.params.measureNumber);
        const measureNumbersSource = Array.isArray(body.measureNumbers)
            ? body.measureNumbers
            : [measureNumber];
        const measureNumbers = Array.from(new Set(
            measureNumbersSource
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value > 0),
        ));
        const elapsedSeconds = Number.isFinite(Number(body.elapsedSeconds))
            ? Math.max(0, Math.ceil(Number(body.elapsedSeconds)))
            : 0;

        if (measureNumbers.length === 0) {
            console.warn('✗ Invalid measure number');
            res.status(400).json({ error: 'Measure number must be a positive integer' });
            return;
        }

        const outcome = body.outcome === 'success' || body.outcome === 'failure' ? body.outcome : null;
        const bpm = Number(body.bpm);
        const eventType = typeof body.type === 'string' ? body.type : 'metronome';

        if (!outcome) {
            console.warn('✗ Invalid event outcome');
            res.status(400).json({ error: 'Event must include outcome (success or failure)' });
            return;
        }

        // Only require BPM for metronome events
        if (eventType === 'metronome' && (!Number.isFinite(bpm) || bpm < 1)) {
            console.warn('✗ Invalid BPM for metronome event');
            res.status(400).json({ error: 'Metronome events must include a valid bpm (number >= 1)' });
            return;
        }

        if (!Number.isFinite(elapsedSeconds)) {
            console.warn('✗ Invalid elapsed time');
            res.status(400).json({ error: 'Elapsed time must be a number' });
            return;
        }

        const songs = await readSongs();
        const songIndex = songs.findIndex((song) => song.id === songId);

        if (songIndex === -1) {
            console.warn(`✗ Song not found (ID: ${songId})`);
            res.status(404).json({ error: 'Song not found' });
            return;
        }

        const song = songs[songIndex];
        if (!Array.isArray(song.measures)) {
            console.warn(`✗ Song ${songId} has no measures`);
            res.status(404).json({ error: 'Song has no measures' });
            return;
        }

        const targetMeasures = [];
        for (const currentMeasureNumber of measureNumbers) {
            const measure = song.measures.find((m) => m.number === currentMeasureNumber);
            if (!measure) {
                console.warn(`✗ Measure ${currentMeasureNumber} not found in song ${songId}`);
                res.status(404).json({ error: `Measure ${currentMeasureNumber} not found` });
                return;
            }
            if (!Array.isArray(measure.events)) {
                measure.events = [];
            }
            targetMeasures.push(measure);
        }

        const timestamp = Math.floor(Date.now() / 1000);
        const event = {
            timestamp,
            type: eventType,
            value: eventType === 'metronome' ? bpm : undefined,
            outcome,
        };

        for (const measure of targetMeasures) {
            measure.events.push(event);
            const currentElapsed = Number.isFinite(Number(measure.elapsedTime))
                ? Number(measure.elapsedTime)
                : Number.isFinite(Number(measure.timeElapsed))
                    ? Number(measure.timeElapsed)
                    : 0;
            measure.elapsedTime = currentElapsed + elapsedSeconds;
            measure.timeElapsed = measure.elapsedTime;
        }

        const currentSongElapsed = Number.isFinite(Number(song.elapsedTime))
            ? Number(song.elapsedTime)
            : Number.isFinite(Number(song.timeElapsed))
                ? Number(song.timeElapsed)
                : 0;
        song.elapsedTime = currentSongElapsed + elapsedSeconds;
        song.timeElapsed = song.elapsedTime;

        const updatedSongs = songs.slice();
        updatedSongs[songIndex] = song;
        await writeSongs(updatedSongs);

        console.log(`✓ Added ${outcome} event to measures ${measureNumbers.join(', ')} in song ${songId}${eventType === 'metronome' ? ` at ${bpm} BPM` : ''} (+${elapsedSeconds}s)`);

        res.json({
            event,
            measureNumbers,
            song: serializeSong(req, song),
        });
    } catch (err) {
        console.error('✗ Failed to add event:', err.message);
        res.status(500).json({ error: 'Failed to add event' });
    }
});

// Error handler for payload too large
app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
        res.setHeader('Access-Control-Allow-Origin', 'https://practiceapp-f1d1b.web.app');
        res.status(413).json({ error: 'Uploaded song payload is too large' });
        return;
    }

    next(err);
});


await ensureDataFile();
startBackupScheduler();

app.listen(port, '0.0.0.0', () => {
    console.log('');
    console.log('═'.repeat(50));
    console.log('🎵 Backend API Server Started');
    console.log('═'.repeat(50));
    console.log(`📡 Server running on http://0.0.0.0:${port}`);
    console.log(`📂 Data directory: ${dataDir}`);
    console.log('═'.repeat(50));
    console.log('');
});
