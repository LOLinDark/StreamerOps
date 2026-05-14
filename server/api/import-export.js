import express from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const router = express.Router();

const ROAMING_ROOT = 'C:/Users/squee/AppData/Roaming';

// Only scan directories that actually store scene collection JSON files.
const SCAN_ROOTS = [
  join(ROAMING_ROOT, 'obs-studio', 'basic', 'scenes'),
  join(ROAMING_ROOT, 'slobs-client', 'SceneCollections'),
  join(ROAMING_ROOT, 'slobs-client'),
].filter((dir) => existsSync(dir));

const uploadDir = join(ROAMING_ROOT, 'StreamerOps', 'tmp', 'import-export');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({ dest: uploadDir });

function normalizePath(filePath) {
  return resolve(String(filePath || ''));
}

function isPathInsideRoot(filePath, rootPath = ROAMING_ROOT) {
  const normalizedFile = normalizePath(filePath);
  const normalizedRoot = normalizePath(rootPath);
  const prefix = normalizedRoot.endsWith(sep) ? normalizedRoot : `${normalizedRoot}${sep}`;
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(prefix);
}

function transformToOBSFormat(streamlabsData) {
  const scenes = Array.isArray(streamlabsData?.scenes) ? streamlabsData.scenes : [];
  const sources = Array.isArray(streamlabsData?.sources) ? streamlabsData.sources : [];

  return {
    name: streamlabsData?.name || 'Imported from Streamlabs',
    current_scene: scenes[0]?.name || 'Scene',
    sources,
    scene_order: scenes.map((scene) => scene?.name).filter(Boolean),
    scenes,
  };
}

/**
 * Check if a JSON file looks like a scene collection by peeking at its content.
 * Looks for top-level "scenes" or "sources" arrays, which both OBS and Streamlabs use.
 */
function looksLikeSceneCollection(filePath) {
  try {
    const head = readFileSync(filePath, { encoding: 'utf-8', flag: 'r' }).slice(0, 2048);
    return /"scenes"\s*:/i.test(head) || /"sources"\s*:/i.test(head);
  } catch {
    return false;
  }
}

function collectJsonFiles(rootDir, maxDepth = 2, depth = 0) {
  if (!existsSync(rootDir) || depth > maxDepth) {
    return [];
  }

  let entries = [];
  try {
    entries = readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    const absolutePath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      return collectJsonFiles(absolutePath, maxDepth, depth + 1);
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) {
      return [];
    }

    try {
      const stats = statSync(absolutePath);
      if (!stats.isFile() || stats.size < 50 || stats.size > 200 * 1024 * 1024) {
        return [];
      }

      if (!looksLikeSceneCollection(absolutePath)) {
        return [];
      }

      return [{
        name: entry.name,
        path: absolutePath,
        root: rootDir,
        size: stats.size,
      }];
    } catch {
      return [];
    }
  });
}

function readSourcePayload(req) {
  const relativePath = String(req.body?.relativePath || '').trim();

  if (relativePath) {
    const absolutePath = normalizePath(relativePath);
    if (!isPathInsideRoot(absolutePath)) {
      const error = new Error('Path must be inside the hardcoded Roaming root');
      error.statusCode = 400;
      throw error;
    }

    return { content: readFileSync(absolutePath, 'utf-8'), sourcePath: absolutePath, sourceType: 'filesystem' };
  }

  if (req.file?.path) {
    return { content: readFileSync(req.file.path, 'utf-8'), sourcePath: req.file.path, sourceType: 'upload' };
  }

  const error = new Error('No import source provided');
  error.statusCode = 400;
  throw error;
}

router.get('/paths', (req, res) => {
  return res.json({
    roamingRoot: ROAMING_ROOT,
    scanRoots: SCAN_ROOTS,
    uploadDir,
  });
});

router.get('/discover', (req, res) => {
  const files = SCAN_ROOTS.flatMap((root) => collectJsonFiles(root));
  return res.json({
    roamingRoot: ROAMING_ROOT,
    files: files
      .filter((file, index, array) => array.findIndex((candidate) => candidate.path === file.path) === index)
      .sort((a, b) => a.path.localeCompare(b.path)),
  });
});

router.post('/streamlabs-to-obs', upload.single('file'), (req, res) => {
  try {
    const { content, sourcePath, sourceType } = readSourcePayload(req);
    const streamlabsData = JSON.parse(content);
    const obsData = transformToOBSFormat(streamlabsData);

    if (req.file?.path) {
      rmSync(req.file.path, { force: true });
    }

    return res.json({
      success: true,
      sourceType,
      sourcePath,
      downloadName: 'obs_scene_collection.json',
      obsData,
    });
  } catch (err) {
    if (req.file?.path) {
      rmSync(req.file.path, { force: true });
    }

    const statusCode = err?.statusCode || 500;
    return res.status(statusCode).json({
      error: 'Failed to process file',
      details: err?.message || 'Unknown error',
    });
  }
});

export default router;
