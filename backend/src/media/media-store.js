import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { config } from '../config.js';

export async function ensureMediaDirs() {
    await mkdir(config.imagesDir, { recursive: true });
    await mkdir(config.audioDir, { recursive: true });
}

export function parseFile(file) {
    return file && typeof file.name === 'string' && typeof file.data === 'string'
        && typeof file.type === 'string' && file.name && file.data ? file : null;
}

function validateMedia(file, kind) {
    const encoded = file.data.replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
        throw new Error(`Invalid ${kind} file encoding`);
    }
    const data = Buffer.from(encoded, 'base64');
    const maxBytes = kind === 'image' ? config.maxImageBytes : config.maxAudioBytes;
    if (data.length === 0 || data.length > maxBytes) {
        throw new Error(`${kind} file exceeds the ${Math.floor(maxBytes / 1024 / 1024)}MB limit`);
    }
    const isJpeg = data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const isPng = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isGif = data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('ascii'));
    const isWebp = data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP';
    const isId3Audio = data.length >= 3 && data.subarray(0, 3).toString('ascii') === 'ID3';
    const isOgg = data.length >= 4 && data.subarray(0, 4).toString('ascii') === 'OggS';
    const isFlac = data.length >= 4 && data.subarray(0, 4).toString('ascii') === 'fLaC';
    const isWav = data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WAVE';
    const isMp4 = data.length >= 12 && data.subarray(4, 8).toString('ascii') === 'ftyp';

    if (kind === 'image') {
        if (isJpeg) return { data, extension: '.jpg' };
        if (isPng) return { data, extension: '.png' };
        if (isGif) return { data, extension: '.gif' };
        if (isWebp) return { data, extension: '.webp' };
    } else {
        if (isId3Audio) return { data, extension: '.mp3' };
        if (isOgg) return { data, extension: '.ogg' };
        if (isFlac) return { data, extension: '.flac' };
        if (isWav) return { data, extension: '.wav' };
        if (isMp4) return { data, extension: '.m4a' };
    }
    throw new Error(`Unsupported ${kind} file type`);
}

export async function saveMedia(file, directory, kind) {
    if (!file) return '';
    const validated = validateMedia(file, kind);
    const filename = `${randomUUID()}${validated.extension}`;
    await writeFile(join(directory, filename), validated.data, { flag: 'wx' });
    return filename;
}

export async function removeMedia(directory, filename) {
    if (!filename) return;
    try {
        await unlink(join(directory, filename));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}
