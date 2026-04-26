/**
 * yt-dlp wrapper — spawns yt-dlp as a child process to download YouTube videos.
 *
 * SECURITY: All video IDs are validated against a strict pattern before use.
 * Arguments are passed as an array to spawn() — never via shell interpolation.
 * The output directory is read from env and never from user input.
 *
 * Requires:
 *   - yt-dlp installed and on PATH (pip install yt-dlp  or  winget install yt-dlp)
 *   - ffmpeg installed and on PATH (for merging video+audio streams)
 *   - YT_DOWNLOAD_DIR env var pointing at your Google Drive folder
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { createLogger } from './logger.js';

const logger = createLogger('ytdlp');

// Strict YouTube video ID format: exactly 11 chars, alphanumeric + - _
const VALID_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

// yt-dlp format selector:
// Enforce browser-friendly H.264/AVC (+ AAC/M4A when possible).
// Intentionally does NOT fall back to AV1/VP9 to avoid downstream wasm decode failures.
// This still covers 1920x824 cinema crops which fit within 1080p height.
const FORMAT_SELECTOR =
  'bestvideo[vcodec^=avc1][height<=1080][ext=mp4]+bestaudio[acodec^=mp4a][ext=m4a]/bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/best[height<=1080][ext=mp4][vcodec^=avc1][acodec^=mp4a]/best[height<=1080][vcodec^=avc1][ext=mp4]/best[height<=1080][vcodec^=avc1]';

const MERGE_FORMAT = 'mp4';

// Output template: %(title)s [%(id)s].%(ext)s
// Bracket-wrapped ID lets you find the file by ID later.
const OUTPUT_TEMPLATE = '%(title)s [%(id)s].%(ext)s';

function getYtDlpBin() {
  return String(process.env.YT_DLP_BIN || 'yt-dlp').trim();
}

function getFfmpegBin() {
  return String(process.env.FFMPEG_BIN || 'ffmpeg').trim();
}

function getFfmpegLocation() {
  const configured = String(process.env.FFMPEG_BIN || '').trim();
  if (configured) {
    return configured;
  }

  const fallback = getFfmpegBin();
  if (fallback.toLowerCase().endsWith('.exe')) {
    return dirname(fallback);
  }

  return fallback;
}

/** Returns the configured download directory, or throws if missing. */
function getDownloadDir() {
  const dir = process.env.YT_DOWNLOAD_DIR || '';
  if (!dir) {
    throw new Error(
      'YT_DOWNLOAD_DIR environment variable is not set. ' +
      'Set it to the absolute path of your Google Drive video folder.'
    );
  }
  return dir;
}

/**
 * Check that yt-dlp is available on PATH.
 * Returns { available: true } or { available: false, reason: string }
 */
export async function checkYtDlpAvailable() {
  return new Promise((resolve) => {
    const proc = spawn(getYtDlpBin(), ['--version'], { shell: false });
    let version = '';
    proc.stdout?.on('data', (d) => {
      version += d.toString();
    });
    proc.on('error', () => resolve({ available: false, reason: 'yt-dlp not found (set YT_DLP_BIN or add to PATH)' }));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ available: true, version: version.trim() });
      } else {
        resolve({ available: false, reason: `yt-dlp exited with code ${code}` });
      }
    });
  });
}

/**
 * Check that ffmpeg is available on PATH.
 */
export async function checkFfmpegAvailable() {
  return new Promise((resolve) => {
    const proc = spawn(getFfmpegBin(), ['-version'], { shell: false });
    proc.on('error', () => resolve({ available: false, reason: 'ffmpeg not found (set FFMPEG_BIN or add to PATH)' }));
    proc.on('close', (code) => {
      resolve({ available: code === 0, reason: code === 0 ? undefined : `ffmpeg exited with code ${code}` });
    });
  });
}

/**
 * Download a single YouTube video by ID.
 *
 * @param {object} opts
 * @param {string} opts.videoId  - 11-char YouTube video ID (validated)
 * @param {string} [opts.subDir] - Optional subdirectory under YT_DOWNLOAD_DIR
 * @param {(line: string) => void} [opts.onProgress] - Called with each stdout/stderr line
 * @returns {Promise<void>} Resolves when yt-dlp exits 0, rejects on failure.
 */
export function downloadVideo({ videoId, subDir = '', onProgress }) {
  return new Promise((resolve, reject) => {
    // SECURITY: Validate video ID before passing to child process
    if (!VALID_VIDEO_ID.test(videoId)) {
      return reject(new Error(`Invalid YouTube video ID: ${videoId}`));
    }

    const baseDir = getDownloadDir();
    const outputDir = subDir
      ? join(baseDir, subDir.replace(/[^a-zA-Z0-9 _-]/g, '')) // strip dangerous path chars
      : baseDir;

    const outputPath = join(outputDir, OUTPUT_TEMPLATE);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    const args = [
      '--format', FORMAT_SELECTOR,
      '--merge-output-format', MERGE_FORMAT,
      '--ffmpeg-location', getFfmpegLocation(),
      '--output', outputPath,
      '--no-playlist',          // never accidentally grab a whole playlist
      '--no-overwrites',        // skip if file already exists
      '--restrict-filenames',   // safe filename characters only
      '--no-part',              // no .part temp files left behind
      '--retries', '3',
      '--fragment-retries', '3',
      videoUrl,
    ];

    logger.info(`Starting download: ${videoId}`);
    const proc = spawn(getYtDlpBin(), args, { shell: false });
    let collectedOutput = '';

    function handleLine(data) {
      const line = data.toString().trim();
      if (line) {
        collectedOutput += `${line}\n`;
      }
      if (line && onProgress) {
        onProgress(line);
      }
      if (line) {
        logger.debug(`[yt-dlp ${videoId}] ${line}`);
      }
    }

    proc.stdout?.on('data', handleLine);
    proc.stderr?.on('data', handleLine);

    proc.on('error', (err) => {
      logger.error(`yt-dlp spawn failed for ${videoId}:`, err.message);
      reject(new Error(`yt-dlp spawn failed: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        logger.info(`Download complete: ${videoId}`);
        resolve();
      } else {
        logger.warn(`yt-dlp exited ${code} for ${videoId}`);
        const missingCompatibleFormat = /Requested format is not available/i.test(collectedOutput);
        if (missingCompatibleFormat) {
          reject(new Error(
            'No browser-safe H.264/AVC format was available for this video. ' +
            'Try another source or pre-transcode this clip before adding it to the sequence.'
          ));
          return;
        }

        reject(new Error(`yt-dlp exited with code ${code}`));
      }
    });
  });
}

/**
 * Fetch duration metadata for multiple YouTube videos without downloading files.
 * Returns a map: { [videoId]: durationSeconds }
 *
 * @param {string[]} videoIds
 * @returns {Promise<Record<string, number>>}
 */
export function fetchVideoDurations(videoIds = []) {
  return new Promise((resolve, reject) => {
    const uniqueIds = Array.from(new Set(
      (Array.isArray(videoIds) ? videoIds : [])
        .map((id) => String(id || '').trim())
        .filter((id) => VALID_VIDEO_ID.test(id))
    ));

    if (uniqueIds.length === 0) {
      resolve({});
      return;
    }

    const urls = uniqueIds.map((id) => `https://www.youtube.com/watch?v=${id}`);
    const args = [
      '--skip-download',
      '--ignore-errors',
      '--no-warnings',
      '--no-playlist',
      '--print', '%(id)s\t%(duration)s',
      ...urls,
    ];

    const proc = spawn(getYtDlpBin(), args, { shell: false });
    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`yt-dlp metadata spawn failed: ${err.message}`));
    });

    proc.on('close', (code) => {
      const durations = {};
      const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

      for (const line of lines) {
        const [id, rawDuration] = line.split('\t');
        const videoId = String(id || '').trim();
        const parsed = Number(rawDuration);
        if (!VALID_VIDEO_ID.test(videoId)) continue;
        if (!Number.isFinite(parsed) || parsed <= 0) continue;
        durations[videoId] = Math.round(parsed);
      }

      if (code !== 0 && Object.keys(durations).length === 0) {
        reject(new Error(`yt-dlp metadata failed with code ${code}: ${String(stderr || '').slice(0, 300)}`));
        return;
      }

      resolve(durations);
    });
  });
}
