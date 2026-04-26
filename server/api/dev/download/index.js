/**
 * Developer Download API — REST endpoints for the YouTube download queue.
 *
 * All endpoints are under /api/dev/download/ and are intentionally only
 * registered in development mode. They control yt-dlp on the host machine.
 *
 * Endpoints:
 *   GET  /api/dev/download/status      — queue stats + full item list
 *   GET  /api/dev/download/env         — check yt-dlp/ffmpeg availability
 *   POST /api/dev/download/enqueue     — add videos to queue
 *   POST /api/dev/download/start       — start the queue worker
 *   POST /api/dev/download/stop        — stop the queue worker (after current item)
 *   POST /api/dev/download/retry/:id   — reset a failed item to queued
 *   DELETE /api/dev/download/item/:id  — remove an item from the queue
 */

import { createLogger } from '../../../lib/logger.js';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import {
  getQueue,
  getQueueStats,
  enqueueVideos,
  peekNext,
  markDownloading,
  markDone,
  markFailed,
  retryFailed,
  removeFromQueue,
  resetStuckDownloading,
} from '../../../lib/downloadQueue.js';
import {
  downloadVideo,
  checkYtDlpAvailable,
  checkFfmpegAvailable,
  fetchVideoDurations,
} from '../../../lib/ytdlp.js';

const logger = createLogger('api.dev.download');
const DEFAULT_STAR_CITIZEN_VIDEO_DIR = 'G:\\My Drive\\Gaming\\Star Citizen\\StarCitizenTV';

// SECURITY: Strict YouTube video ID validation
const VALID_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

// ── Worker state (in-memory, single Node process) ────────────────────────
let workerRunning = false;
let workerStopping = false;
let currentVideoId = null;

function extractVideoIdFromName(input) {
  const raw = String(input || '');
  const match = raw.match(/\[([A-Za-z0-9_-]{11})\]/);
  return match ? match[1] : '';
}

function isLikelyVideoFileName(name) {
  const lower = String(name || '').toLowerCase();
  return ['.mp4', '.mkv', '.webm', '.mov', '.m4v'].some((ext) => lower.endsWith(ext));
}

function buildTitleFromFileName(name) {
  const raw = String(name || '').replace(/\.[^.]+$/, '');
  return raw
    .replace(/\[[A-Za-z0-9_-]{11}\]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Star Citizen Video';
}

function buildStarCitizenPlaylistFromDirectories(downloadDirs) {
  const seenById = new Set();
  const seenByName = new Set();
  const files = [];

  for (const dir of downloadDirs) {
    const baseDir = resolve(dir);
    let entries = [];
    try {
      entries = readdirSync(baseDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!isLikelyVideoFileName(entry.name)) continue;

      const fileName = entry.name;
      const videoId = extractVideoIdFromName(fileName);
      const idKey = videoId ? `id:${videoId}` : '';
      const nameKey = `name:${fileName.toLowerCase()}`;

      if (idKey && seenById.has(idKey)) continue;
      if (seenByName.has(nameKey)) continue;

      const absolutePath = resolve(baseDir, fileName);
      let mtimeMs = 0;
      try {
        mtimeMs = Number(statSync(absolutePath).mtimeMs || 0);
      } catch {
        // Keep default timestamp if metadata cannot be read.
      }

      if (idKey) seenById.add(idKey);
      seenByName.add(nameKey);

      files.push({
        fileName,
        videoId,
        mtimeMs,
      });
    }
  }

  files.sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files.map((item, index) => ({
    id: item.videoId ? `sc-video-${item.videoId}` : `sc-video-${index + 1}`,
    type: 'video',
    title: buildTitleFromFileName(item.fileName),
    source: `/api/dev/download/file/${encodeURIComponent(item.fileName)}`,
    fileName: item.fileName,
    videoId: item.videoId || null,
  }));
}

function getStarCitizenVideoDirectories() {
  const primary = String(process.env.SC_STAR_CITIZEN_TV_DIR || '').trim();
  const fallback = DEFAULT_STAR_CITIZEN_VIDEO_DIR;
  const queueDir = String(process.env.YT_DOWNLOAD_DIR || '').trim();

  return Array.from(new Set([
    queueDir,
    primary,
    fallback,
  ].filter(Boolean)));
}

function resolveExistingFilePath(baseDir, fileName) {
  const requestedPath = resolve(baseDir, fileName);
  const safeBase = `${baseDir}${sep}`;
  const inBase = requestedPath === baseDir || requestedPath.startsWith(safeBase);

  if (!inBase) {
    return '';
  }

  if (existsSync(requestedPath)) {
    try {
      const stat = statSync(requestedPath);
      if (stat.isFile()) {
        return requestedPath;
      }
    } catch {
      // Ignore and fall back to ID-based lookup.
    }
  }

  const videoId = extractVideoIdFromName(fileName);
  if (!videoId) {
    return '';
  }

  try {
    const entries = readdirSync(baseDir, { withFileTypes: true });
    const idTag = `[${videoId}]`;
    const fallback = entries.find((entry) => entry.isFile() && entry.name.includes(idTag));
    return fallback ? resolve(baseDir, fallback.name) : '';
  } catch {
    return '';
  }
}

/** Random integer between min and max (inclusive). */
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pause for a random duration (ms). */
function randomDelay(minMs, maxMs) {
  const ms = randomBetween(minMs, maxMs);
  logger.info(`Waiting ${Math.round(ms / 1000)}s before next download…`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The queue worker loop.
 * Picks one video at a time, downloads it, waits a random delay, repeats.
 * Stops when workerStopping is set or the queue is empty.
 */
async function runWorker() {
  workerRunning = true;
  workerStopping = false;
  logger.info('Download worker started');

  try {
    while (!workerStopping) {
      const next = peekNext();
      if (!next) {
        logger.info('Queue empty — worker stopping');
        break;
      }

      currentVideoId = next.videoId;
      markDownloading(next.videoId);

      try {
        await downloadVideo({
          videoId: next.videoId,
          onProgress: (line) => logger.debug(line),
        });
        markDone(next.videoId);
        logger.info(`Done: ${next.title || next.videoId}`);
      } catch (err) {
        markFailed(next.videoId, err.message);
        logger.warn(`Failed: ${next.videoId} — ${err.message}`);
      }

      currentVideoId = null;

      if (!workerStopping) {
        // Random delay: 60–300 seconds to avoid hammering YouTube
        await randomDelay(60_000, 300_000);
      }
    }
  } finally {
    workerRunning = false;
    workerStopping = false;
    currentVideoId = null;
    logger.info('Download worker stopped');
  }
}

// ── Route registration ───────────────────────────────────────────────────

export function registerDownloadRoutes(app) {
  // Reset any items that were mid-download when server last restarted
  resetStuckDownloading();

  // GET /api/dev/download/file/:fileName
  // Streams a downloaded file. If exact filename is not found, we also
  // resolve by embedded YouTube ID token: "...[VIDEO_ID].mp4".
  app.get('/api/dev/download/file/:fileName', (req, res) => {
    const fileName = String(req.params.fileName || '').trim();
    const downloadDirs = getStarCitizenVideoDirectories();

    if (downloadDirs.length === 0) {
      return res.status(400).json({ error: 'No media directory is configured in .env' });
    }

    if (!fileName) {
      return res.status(400).json({ error: 'fileName is required' });
    }

    if (/[/\\]/.test(fileName) || fileName.includes('..')) {
      return res.status(400).json({ error: 'Invalid fileName path' });
    }

    for (const dir of downloadDirs) {
      const baseDir = resolve(dir);
      const filePath = resolveExistingFilePath(baseDir, fileName);
      if (!filePath) continue;

      return res.sendFile(filePath);
    }

    return res.status(404).json({ error: 'File not found', fileName });
  });

  // GET /api/dev/download/library
  // Returns a live playlist built from existing Star Citizen video files.
  app.get('/api/dev/download/library', (_req, res) => {
    const downloadDirs = getStarCitizenVideoDirectories();

    if (downloadDirs.length === 0) {
      return res.json({ items: [] });
    }

    try {
      const items = buildStarCitizenPlaylistFromDirectories(downloadDirs);
      return res.json({ items });
    } catch (error) {
      logger.warn(`library read error: ${error?.message || 'unknown error'}`);
      return res.status(500).json({ error: 'Failed to read media library' });
    }
  });

  // GET /api/dev/download/status
  app.get('/api/dev/download/status', (_req, res) => {
    try {
      const stats = getQueueStats();
      const items = getQueue();
      res.json({
        workerRunning,
        workerStopping,
        currentVideoId,
        downloadDir: process.env.YT_DOWNLOAD_DIR || null,
        stats,
        items,
      });
    } catch (err) {
      logger.error('status error', err.message);
      res.status(500).json({ error: 'Failed to read queue' });
    }
  });

  // GET /api/dev/download/env
  app.get('/api/dev/download/env', async (_req, res) => {
    try {
      const [ytdlp, ffmpeg] = await Promise.all([
        checkYtDlpAvailable(),
        checkFfmpegAvailable(),
      ]);
      res.json({
        ytdlp,
        ffmpeg,
        downloadDir: process.env.YT_DOWNLOAD_DIR || null,
        downloadDirSet: !!process.env.YT_DOWNLOAD_DIR,
      });
    } catch (err) {
      logger.error('env check error', err.message);
      res.status(500).json({ error: 'Failed to check environment' });
    }
  });

  // GET /api/dev/download/durations?ids=abc123def45,xyz987uvw65
  // Returns duration seconds map for requested YouTube IDs.
  app.get('/api/dev/download/durations', async (req, res) => {
    try {
      const idsParam = String(req.query.ids || '').trim();
      const ids = idsParam
        .split(',')
        .map((id) => String(id || '').trim())
        .filter((id) => VALID_VIDEO_ID.test(id));

      const uniqueIds = Array.from(new Set(ids)).slice(0, 300);
      if (uniqueIds.length === 0) {
        return res.json({ durations: {} });
      }

      const durations = await fetchVideoDurations(uniqueIds);
      return res.json({ durations });
    } catch (err) {
      logger.error('duration metadata error', err.message);
      return res.status(500).json({ error: 'Failed to resolve video durations' });
    }
  });

  // POST /api/dev/download/enqueue
  // Body: { videos: [{ videoId, title, url, playlistId, playlistLabel }] }
  app.post('/api/dev/download/enqueue', (req, res) => {
    if (!process.env.YT_DOWNLOAD_DIR) {
      return res.status(400).json({ error: 'YT_DOWNLOAD_DIR is not set in .env — configure it before queueing downloads' });
    }
    try {
      const videos = req.body?.videos;
      if (!Array.isArray(videos) || videos.length === 0) {
        return res.status(400).json({ error: 'videos array is required' });
      }
      if (videos.length > 500) {
        return res.status(400).json({ error: 'Cannot enqueue more than 500 videos at once' });
      }

      // SECURITY: validate every video ID before touching the queue
      const sanitised = [];
      for (const v of videos) {
        const id = String(v.videoId || '').trim();
        if (!VALID_VIDEO_ID.test(id)) {
          return res.status(400).json({ error: `Invalid video ID: ${id}` });
        }
        sanitised.push({
          videoId: id,
          title: String(v.title || '').slice(0, 300),
          url: `https://www.youtube.com/watch?v=${id}`, // always build URL ourselves
          playlistId: String(v.playlistId || '').slice(0, 100),
          playlistLabel: String(v.playlistLabel || '').slice(0, 100),
        });
      }

      const result = enqueueVideos(sanitised);
      res.json({ success: true, ...result });
    } catch (err) {
      logger.error('enqueue error', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/dev/download/start
  app.post('/api/dev/download/start', (_req, res) => {
    if (workerRunning) {
      return res.json({ success: true, message: 'Worker already running' });
    }
    if (!process.env.YT_DOWNLOAD_DIR) {
      return res.status(400).json({ error: 'YT_DOWNLOAD_DIR is not set in .env' });
    }
    // Fire and forget — the worker manages itself
    runWorker().catch((err) => logger.error('Worker crashed:', err.message));
    res.json({ success: true, message: 'Download worker started' });
  });

  // POST /api/dev/download/stop
  app.post('/api/dev/download/stop', (_req, res) => {
    if (!workerRunning) {
      return res.json({ success: true, message: 'Worker not running' });
    }
    workerStopping = true;
    res.json({ success: true, message: 'Stop signal sent — will finish current video then stop' });
  });

  // POST /api/dev/download/retry/:videoId
  app.post('/api/dev/download/retry/:videoId', (req, res) => {
    const { videoId } = req.params;
    if (!VALID_VIDEO_ID.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }
    const ok = retryFailed(videoId);
    if (!ok) {
      return res.status(404).json({ error: 'Item not found or not in failed state' });
    }
    res.json({ success: true });
  });

  // POST /api/dev/download/remove/:videoId
  app.post('/api/dev/download/remove/:videoId', (req, res) => {
    const { videoId } = req.params;
    if (!VALID_VIDEO_ID.test(videoId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }
    if (videoId === currentVideoId) {
      return res.status(409).json({ error: 'Cannot remove item currently being downloaded' });
    }
    const ok = removeFromQueue(videoId);
    res.json({ success: ok });
  });
}
