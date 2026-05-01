import express from 'express';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDir = join(__dirname, 'data');
const imagesDir = join(dataDir, 'images');
const audioDir = join(dataDir, 'audio');
const dataFile = join(dataDir, 'songs.json');
const port = process.env.PORT || 3001;

async function ensureDataDirs() {
    await mkdir(dataDir, { recursive: true });
    await mkdir(imagesDir, { recursive: true });
    await mkdir(audioDir, { recursive: true });
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

    return Array.isArray(parsed.songs) ? parsed.songs : [];
}

async function writeSongs(songs) {
    await writeFile(dataFile, JSON.stringify({ songs }, null, 2), 'utf8');
}

const app = express();

// CORS middleware - set first so headers apply to all responses
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }

    next();
});

app.use(express.json({ limit: '50mb' }));
app.use('/images', express.static(imagesDir));
app.use('/audio', express.static(audioDir));

// Error handler for payload too large
app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
        res.status(413).json({ error: 'Uploaded song payload is too large' });
        return;
    }

    next(err);
});

app.get('/songs', async (req, res) => {
    const songs = await readSongs();
    res.json({ songs: songs.map((song) => serializeSong(req, song)) });
});

app.post('/songs', async (req, res) => {
    await ensureDataFile();

    const body = req.body;

    if (!body || !Array.isArray(body.songs)) {
        res.status(400).json({ error: 'Request body must be { songs: [] }' });
        return;
    }

    try {
        await writeFile(dataFile, JSON.stringify({ songs: body.songs }, null, 2), 'utf8');
        res.json({ songs: body.songs });
    } catch (err) {
        console.error('Failed to write songs file', err);
        res.status(500).json({ error: 'Failed to write songs' });
    }
});

app.post('/songs/create', async (req, res) => {
    try {
        const body = req.body ?? {};
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        const composer = typeof body.composer === 'string' ? body.composer.trim() : '';
        const measureCount = Number(body.measureCount);
        const initialTempo = Number(body.initialTempo);
        const targetTempo = Number(body.targetTempo);
        const imageFile = parseJsonFilePayload(body.imageFile);
        const audioFile = parseJsonFilePayload(body.audioFile);

        if (!title || !composer) {
            res.status(400).json({ error: 'Title and composer are required' });
            return;
        }

        if (!Number.isInteger(measureCount) || measureCount < 1) {
            res.status(400).json({ error: 'Number of measures must be a positive integer' });
            return;
        }

        if (!Number.isFinite(initialTempo) || !Number.isFinite(targetTempo)) {
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
        }

        if (audioFile) {
            await writeFile(join(audioDir, audioFilename), Buffer.from(audioFile.data, 'base64'));
        }

        const song = {
            id,
            archived: false,
            title,
            composer,
            image: imageFilename,
            audio: audioFilename,
            measureCount,
            measures: Array.from({ length: measureCount }, (_, index) => ({
                number: index + 1,
                initial: initialTempo,
                target: targetTempo,
                ignoreTempo: false,
                events: []
            })),
        };

        const updatedSongs = [...songs, song];
        await writeSongs(updatedSongs);

        res.status(201).json({
            song: serializeSong(req, song),
            songs: updatedSongs.map((entry) => serializeSong(req, entry)),
        });
    } catch (err) {
        console.error('Failed to create song', err);
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
            res.status(404).json({ error: 'Song not found' });
            return;
        }

        const existingSong = songs[songIndex];
        const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : existingSong.title;
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
        }

        if (audioFile) {
            const audioId = randomUUID();
            nextAudio = `${audioId}${getFileExtension(audioFile.name, '.mp3')}`;
            await writeFile(join(audioDir, nextAudio), Buffer.from(audioFile.data, 'base64'));
            await safelyRemoveFile(audioDir, existingSong.audio);
        }

        const updatedSong = {
            ...existingSong,
            title,
            composer,
            archived,
            image: nextImage,
            audio: nextAudio,
        };

        const updatedSongs = songs.slice();
        updatedSongs[songIndex] = updatedSong;
        await writeSongs(updatedSongs);

        res.json({
            song: serializeSong(req, updatedSong),
            songs: updatedSongs.map((entry) => serializeSong(req, entry)),
        });
    } catch (err) {
        console.error('Failed to update song', err);
        res.status(500).json({ error: 'Failed to update song' });
    }
});

await ensureDataFile();

app.listen(port, '0.0.0.0', () => {
    console.log(`Backend API running on http://0.0.0.0:${port}`);
});
