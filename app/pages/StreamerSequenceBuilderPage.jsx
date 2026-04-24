import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Image,
  NumberInput,
  SimpleGrid,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconDownload, IconEye, IconEyeOff, IconFolder, IconPlayerPlay, IconPlus, IconTrash } from '@tabler/icons-react';

const SEQUENCE_LIBRARY_KEY = 'streamerops.sequenceLibrary.v1';
const SEQUENCE_DRAFT_KEY = 'streamerops.sequenceDraft.v1';
const BROWSER_FFMPEG_LOAD_TIMEOUT_MS = 45000;

function sanitizeConcatPath(input) {
  return String(input || '')
    .replace(/\\/g, '/')
    .replace(/'/g, "'\\''")
    .trim();
}

function toFileOrUrlLocation(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (/^[a-zA-Z]:\\/.test(raw)) {
    const normalized = raw.replace(/\\/g, '/');
    return `file:///${encodeURI(normalized)}`;
  }

  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  return `file:///${encodeURI(normalized)}`;
}

function buildVlcXspf(sequence) {
  const videoItems = sequence.filter((item) => item.type === 'video');

  const tracks = videoItems
    .map((item, index) => {
      const location = toFileOrUrlLocation(item.source);
      if (!location) return '';

      return [
        '    <track>',
        `      <location>${location}</location>`,
        `      <title>${item.title || `Video ${index + 1}`}</title>`,
        '    </track>',
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<playlist version="1" xmlns="http://xspf.org/ns/0/">',
    '  <title>StreamerOps Video Playlist</title>',
    '  <trackList>',
    tracks,
    '  </trackList>',
    '</playlist>',
  ].join('\n');
}

function buildFfconcat(sequence) {
  const lines = ['ffconcat version 1.0'];

  sequence.forEach((item) => {
    const source = sanitizeConcatPath(item.source);
    if (!source) return;

    lines.push(`file '${source}'`);

    if (item.type === 'image' && Number(item.durationSec) > 0) {
      lines.push(`duration ${Number(item.durationSec)}`);
    }
  });

  return lines.join('\n');
}

function inferVirtualExtension(source, type) {
  const clean = String(source || '').split('?')[0].toLowerCase();

  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'jpg';
  if (clean.endsWith('.webp')) return 'webp';
  if (clean.endsWith('.mov')) return 'mov';
  if (clean.endsWith('.mkv')) return 'mkv';
  if (clean.endsWith('.webm')) return 'webm';
  if (clean.endsWith('.avi')) return 'avi';
  if (clean.endsWith('.mp4')) return 'mp4';

  return type === 'image' ? 'png' : 'mp4';
}

function sanitizeOutputName(input) {
  return String(input || 'streamerops-sequence')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'streamerops-sequence';
}

function downloadTextFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getStemFromFileName(name) {
  const clean = String(name || '').trim();
  if (!clean) return '';
  return clean.replace(/\.[^.]+$/, '').trim();
}

function normalizeMatchKey(name) {
  const stem = getStemFromFileName(name)
    .toLowerCase()
    .replace(/star\s*citizen/g, '')
    .replace(/[_\-\s]+/g, '')
    .replace(/[^a-z0-9]/g, '');

  return stem.trim();
}

function titleFromStem(name) {
  const stem = getStemFromFileName(name);
  if (!stem) return 'Untitled';
  return stem
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Determine if a source string is previewable in the browser
function isPreviewable(source) {
  if (!source) return false;
  return /^blob:|^https?:\/\//i.test(source);
}

// Small inline preview component for sequence rows
function ItemPreview({ item }) {
  const [expanded, setExpanded] = useState(false);

  if (!isPreviewable(item.previewUrl || item.source)) {
    return (
      <Tooltip label="Local file paths cannot be previewed in the browser. Use the file picker to enable preview." withArrow>
        <Badge color="gray" variant="light" size="sm" style={{ cursor: 'default' }}>📁 local</Badge>
      </Tooltip>
    );
  }

  const src = item.previewUrl || item.source;

  if (!expanded) {
    return (
      <ActionIcon size="sm" variant="light" color="cyan" onClick={() => setExpanded(true)}>
        <IconEye size={14} />
      </ActionIcon>
    );
  }

  return (
    <Stack gap="xs" align="flex-start">
      <ActionIcon size="sm" variant="light" color="gray" onClick={() => setExpanded(false)}>
        <IconEyeOff size={14} />
      </ActionIcon>
      {item.type === 'image' ? (
        <Image src={src} h={90} w="auto" fit="contain" radius="sm" />
      ) : (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          src={src}
          controls
          style={{ height: 90, maxWidth: 160, borderRadius: 4, display: 'block' }}
        />
      )}
    </Stack>
  );
}

export default function StreamerSequenceBuilderPage() {
  const blobUrls = useRef([]);
  const ffmpegWasmRef = useRef(null);
  const browserOutputUrlRef = useRef('');

  // Revoke all blob URLs on unmount
  useEffect(() => {
    const urls = blobUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      if (browserOutputUrlRef.current) {
        URL.revokeObjectURL(browserOutputUrlRef.current);
      }
    };
  }, []);

  const imageFileRef = useRef(null);
  const videoFileRef = useRef(null);
  const pairImageFileRef = useRef(null);
  const pairVideoFileRef = useRef(null);
  const bulkImageDirRef = useRef(null);
  const bulkVideoDirRef = useRef(null);

  const [sequence, setSequence] = useState([]);
  const [sequenceName, setSequenceName] = useState('Untitled Sequence');
  const [savedSequences, setSavedSequences] = useState([]);
  const [selectedSequenceId, setSelectedSequenceId] = useState(null);
  const [ffmpegStatus, setFfmpegStatus] = useState({ loading: true, installed: false, source: 'unknown', path: null });
  const [browserWasmLoading, setBrowserWasmLoading] = useState(false);
  const [browserWasmReady, setBrowserWasmReady] = useState(false);
  const [browserRenderRunning, setBrowserRenderRunning] = useState(false);
  const [browserRenderProgress, setBrowserRenderProgress] = useState(0);
  const [browserRenderMessage, setBrowserRenderMessage] = useState('Idle');
  const [browserRenderError, setBrowserRenderError] = useState('');
  const [browserOutputUrl, setBrowserOutputUrl] = useState('');
  const [browserOutputName, setBrowserOutputName] = useState('');

  // Image-only add fields
  const [imageTitle, setImageTitle] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [imageDurationSec, setImageDurationSec] = useState(2);

  // Video-only add fields
  const [videoTitle, setVideoTitle] = useState('');
  const [videoSource, setVideoSource] = useState('');
  const [videoPreviewUrl, setVideoPreviewUrl] = useState('');

  // Pair fields
  const [pairImageTitle, setPairImageTitle] = useState('');
  const [pairImagePath, setPairImagePath] = useState('');
  const [pairImagePreviewUrl, setPairImagePreviewUrl] = useState('');
  const [pairVideoDuration, setPairVideoDuration] = useState(2);
  const [pairVideoTitle, setPairVideoTitle] = useState('');
  const [pairVideoSource, setPairVideoSource] = useState('');
  const [pairVideoPreviewUrl, setPairVideoPreviewUrl] = useState('');

  // Bulk folder match fields
  const [bulkImageFiles, setBulkImageFiles] = useState([]);
  const [bulkVideoFiles, setBulkVideoFiles] = useState([]);
  const [bulkImageDurationSec, setBulkImageDurationSec] = useState(2);
  const [excludeUnmatchedVideos, setExcludeUnmatchedVideos] = useState(true);
  const [methodVisibility, setMethodVisibility] = useState({
    addImage: true,
    addVideo: true,
    quickPair: true,
    bulkMatch: true,
  });

  function createId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function toPersistableSequence(items) {
    return items.map(({ previewUrl: _p, ...rest }) => rest);
  }

  function buildSequenceRecord({ id, name, items, createdAt }) {
    const now = new Date().toISOString();
    return {
      id,
      name,
      version: 1,
      createdAt: createdAt || now,
      updatedAt: now,
      sequence: toPersistableSequence(items),
    };
  }

  function saveLibrary(nextLibrary) {
    try {
      localStorage.setItem(SEQUENCE_LIBRARY_KEY, JSON.stringify(nextLibrary));
    } catch {
      // Ignore write errors (private mode / quota issues)
    }
  }

  function makeBlobUrl(file) {
    const url = URL.createObjectURL(file);
    blobUrls.current.push(url);
    return url;
  }

  const handleImageFilePick = useCallback((event, setPath, setPreview) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPath(file.name);
    setPreview(makeBlobUrl(file));
    event.target.value = '';
  }, []);

  const handleVideoFilePick = useCallback((event, setPath, setPreview) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPath(file.name);
    setPreview(makeBlobUrl(file));
    event.target.value = '';
  }, []);

  const handleBulkDirectoryPick = useCallback((event, kind) => {
    const files = Array.from(event.target.files || []);
    const filtered = files.filter((file) =>
      kind === 'image' ? file.type.startsWith('image/') : file.type.startsWith('video/')
    );

    if (kind === 'image') {
      setBulkImageFiles(filtered);
    } else {
      setBulkVideoFiles(filtered);
    }

    event.target.value = '';
  }, []);

  function addImage() {
    const source = imagePath.trim() || imagePreviewUrl;
    if (!source) return;
    setSequence((prev) => [
      ...prev,
      {
        id: createId(),
        type: 'image',
        title: imageTitle.trim() || 'Ship Transition',
        source: imagePath.trim() || imagePreviewUrl,
        previewUrl: imagePreviewUrl || undefined,
        durationSec: Number(imageDurationSec) || 2,
      },
    ]);
    setImageTitle('');
    setImagePath('');
    setImagePreviewUrl('');
  }

  function addVideo() {
    const source = videoSource.trim() || videoPreviewUrl;
    if (!source) return;
    setSequence((prev) => [
      ...prev,
      {
        id: createId(),
        type: 'video',
        title: videoTitle.trim() || 'Video',
        source: videoSource.trim() || videoPreviewUrl,
        previewUrl: videoPreviewUrl || undefined,
        durationSec: 0,
      },
    ]);
    setVideoTitle('');
    setVideoSource('');
    setVideoPreviewUrl('');
  }

  function addPair() {
    const imgSource = pairImagePath.trim() || pairImagePreviewUrl;
    const vidSource = pairVideoSource.trim() || pairVideoPreviewUrl;
    if (!imgSource || !vidSource) return;
    setSequence((prev) => [
      ...prev,
      {
        id: createId(),
        type: 'image',
        title: pairImageTitle.trim() || 'Ship Transition',
        source: imgSource,
        previewUrl: pairImagePreviewUrl || undefined,
        durationSec: Number(pairVideoDuration) || 2,
      },
      {
        id: createId(),
        type: 'video',
        title: pairVideoTitle.trim() || 'Segment',
        source: vidSource,
        previewUrl: pairVideoPreviewUrl || undefined,
        durationSec: 0,
      },
    ]);
    setPairImageTitle('');
    setPairImagePath('');
    setPairImagePreviewUrl('');
    setPairVideoTitle('');
    setPairVideoSource('');
    setPairVideoPreviewUrl('');
  }

  function addMatchesFromDirectories() {
    if (bulkVideoFiles.length === 0 || bulkImageFiles.length === 0) return;

    const imageBuckets = new Map();
    bulkImageFiles.forEach((imageFile) => {
      const key = normalizeMatchKey(imageFile.name);
      if (!key) return;
      if (!imageBuckets.has(key)) {
        imageBuckets.set(key, []);
      }
      imageBuckets.get(key).push(imageFile);
    });

    const sortedVideos = [...bulkVideoFiles].sort((a, b) =>
      String(a.webkitRelativePath || a.name).localeCompare(String(b.webkitRelativePath || b.name))
    );

    const additions = [];
    sortedVideos.forEach((videoFile) => {
      const key = normalizeMatchKey(videoFile.name);
      const bucket = key ? imageBuckets.get(key) || [] : [];
      const matchingImage = bucket.length > 0 ? bucket.shift() : null;

      if (matchingImage) {
        const pairId = createId();
        additions.push({
          id: createId(),
          type: 'image',
          pairId,
          title: `${titleFromStem(matchingImage.name)} Transition`,
          source: matchingImage.webkitRelativePath || matchingImage.name,
          previewUrl: makeBlobUrl(matchingImage),
          durationSec: Number(bulkImageDurationSec) || 2,
        });
        additions.push({
          id: createId(),
          type: 'video',
          pairId,
          title: titleFromStem(videoFile.name),
          source: videoFile.webkitRelativePath || videoFile.name,
          previewUrl: makeBlobUrl(videoFile),
          durationSec: 0,
        });
        return;
      }

      if (!excludeUnmatchedVideos) {
        additions.push({
          id: createId(),
          type: 'video',
          title: titleFromStem(videoFile.name),
          source: videoFile.webkitRelativePath || videoFile.name,
          previewUrl: makeBlobUrl(videoFile),
          durationSec: 0,
        });
      }
    });

    if (additions.length > 0) {
      setSequence((prev) => [...prev, ...additions]);
    }
  }

  function moveItem(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sequence.length) return;
    setSequence((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[newIndex];
      next[newIndex] = temp;
      return next;
    });
  }

  function removeItem(id) {
    setSequence((prev) => prev.filter((item) => item.id !== id));
  }

  function saveNamedSequence() {
    const trimmedName = sequenceName.trim() || 'Untitled Sequence';

    setSavedSequences((prev) => {
      const existing = selectedSequenceId ? prev.find((item) => item.id === selectedSequenceId) : null;
      const record = buildSequenceRecord({
        id: existing?.id || createId(),
        name: trimmedName,
        items: sequence,
        createdAt: existing?.createdAt,
      });

      const next = existing
        ? prev.map((item) => (item.id === existing.id ? record : item))
        : [record, ...prev];

      saveLibrary(next);
      setSelectedSequenceId(record.id);
      return next;
    });
  }

  function loadNamedSequence(id) {
    const entry = savedSequences.find((item) => item.id === id);
    if (!entry) return;

    setSelectedSequenceId(entry.id);
    setSequenceName(entry.name || 'Untitled Sequence');
    setSequence(Array.isArray(entry.sequence) ? entry.sequence : []);
  }

  function deleteNamedSequence() {
    if (!selectedSequenceId) return;

    setSavedSequences((prev) => {
      const next = prev.filter((item) => item.id !== selectedSequenceId);
      saveLibrary(next);
      return next;
    });

    setSelectedSequenceId(null);
  }

  function duplicateNamedSequence() {
    if (!selectedSequenceId) return;

    const current = savedSequences.find((item) => item.id === selectedSequenceId);
    if (!current) return;

    const copy = buildSequenceRecord({
      id: createId(),
      name: `${current.name || 'Untitled Sequence'} Copy`,
      items: Array.isArray(current.sequence) ? current.sequence : [],
    });

    setSavedSequences((prev) => {
      const next = [copy, ...prev];
      saveLibrary(next);
      return next;
    });

    setSelectedSequenceId(copy.id);
    setSequenceName(copy.name);
    setSequence(copy.sequence || []);
  }

  function updateDuration(id, value) {
    setSequence((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, durationSec: Number(value) > 0 ? Number(value) : 0 } : item
      )
    );
  }

  function updateVideoRowLinkedDuration(index, value) {
    const nextDuration = Number(value) > 0 ? Number(value) : 0;
    if (nextDuration <= 0) return;

    setSequence((prev) => {
      const row = prev[index];
      if (!row || row.type !== 'video') return prev;

      // Prefer explicit pairId, otherwise use immediate previous image row.
      if (row.pairId) {
        return prev.map((item) =>
          item.type === 'image' && item.pairId === row.pairId ? { ...item, durationSec: nextDuration } : item
        );
      }

      if (index > 0 && prev[index - 1]?.type === 'image') {
        const updated = [...prev];
        updated[index - 1] = { ...updated[index - 1], durationSec: nextDuration };
        return updated;
      }

      return prev;
    });
  }

  useEffect(() => {
    try {
      const rawLibrary = localStorage.getItem(SEQUENCE_LIBRARY_KEY);
      if (rawLibrary) {
        const parsed = JSON.parse(rawLibrary);
        if (Array.isArray(parsed)) {
          setSavedSequences(parsed);
        }
      }

      const rawDraft = localStorage.getItem(SEQUENCE_DRAFT_KEY);
      if (rawDraft) {
        const parsedDraft = JSON.parse(rawDraft);
        if (parsedDraft && Array.isArray(parsedDraft.sequence)) {
          setSequence(parsedDraft.sequence);
          setSequenceName(parsedDraft.name || 'Untitled Sequence');
        }
      }
    } catch {
      // Ignore malformed local data
    }
  }, []);

  useEffect(() => {
    const draft = {
      version: 1,
      name: sequenceName.trim() || 'Untitled Sequence',
      updatedAt: new Date().toISOString(),
      sequence: toPersistableSequence(sequence),
    };

    try {
      localStorage.setItem(SEQUENCE_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore write errors (private mode / quota issues)
    }
  }, [sequence, sequenceName]);

  useEffect(() => {
    if (!selectedSequenceId) return;

    const nextName = sequenceName.trim() || 'Untitled Sequence';
    const nextItems = toPersistableSequence(sequence);

    setSavedSequences((prev) => {
      const existing = prev.find((item) => item.id === selectedSequenceId);
      if (!existing) return prev;

      const hasNameChange = String(existing.name || '') !== nextName;
      const hasSequenceChange = JSON.stringify(existing.sequence || []) !== JSON.stringify(nextItems);
      if (!hasNameChange && !hasSequenceChange) {
        return prev;
      }

      const updated = buildSequenceRecord({
        id: existing.id,
        name: nextName,
        items: nextItems,
        createdAt: existing.createdAt,
      });

      const next = prev.map((item) => (item.id === selectedSequenceId ? updated : item));
      saveLibrary(next);
      return next;
    });
  }, [selectedSequenceId, sequence, sequenceName]);

  useEffect(() => {
    let active = true;

    async function fetchFfmpegStatus() {
      try {
        const response = await fetch('/api/system/ffmpeg-status');
        if (!response.ok) throw new Error('status_failed');
        const payload = await response.json();
        if (!active) return;
        setFfmpegStatus({
          loading: false,
          installed: Boolean(payload?.installed),
          source: String(payload?.source || 'unknown'),
          path: payload?.path || null,
        });
      } catch {
        if (!active) return;
        setFfmpegStatus({ loading: false, installed: false, source: 'error', path: null });
      }
    }

    fetchFfmpegStatus();
    return () => {
      active = false;
    };
  }, []);

  function getVideoRowDuration(index) {
    const row = sequence[index];
    if (!row || row.type !== 'video') return null;

    if (row.pairId) {
      const linkedImage = sequence.find((item) => item.type === 'image' && item.pairId === row.pairId);
      return linkedImage ? Number(linkedImage.durationSec) || 2 : null;
    }

    if (index > 0 && sequence[index - 1]?.type === 'image') {
      return Number(sequence[index - 1].durationSec) || 2;
    }

    return null;
  }

  async function ensureBrowserFfmpegLoaded() {
    if (ffmpegWasmRef.current) {
      return ffmpegWasmRef.current;
    }

    if (!window.crossOriginIsolated) {
      throw new Error('Browser render requires COOP/COEP headers. Restart dev server and refresh this page.');
    }

    setBrowserWasmLoading(true);
    setBrowserRenderMessage('Loading FFmpeg WebAssembly core...');

    try {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ]);

      const ffmpeg = new FFmpeg();
      ffmpeg.on('progress', ({ progress }) => {
        const next = Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress * 100))) : 0;
        setBrowserRenderProgress(next);
      });

      await Promise.race([
        ffmpeg.load({
          coreURL: await toBlobURL('/vendor/ffmpeg/ffmpeg-core.js', 'text/javascript'),
          wasmURL: await toBlobURL('/vendor/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
        }),
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error('Timed out loading FFmpeg WebAssembly core. Refresh the page and try again.'));
          }, BROWSER_FFMPEG_LOAD_TIMEOUT_MS);
        }),
      ]);

      ffmpegWasmRef.current = ffmpeg;
      setBrowserWasmReady(true);
      setBrowserRenderMessage('FFmpeg WebAssembly ready.');
      return ffmpeg;
    } finally {
      setBrowserWasmLoading(false);
    }
  }

  async function renderInBrowserWithWasm() {
    const browserSequence = sequence.map((item) => ({
      ...item,
      runtimeSource: item.previewUrl || item.source,
    }));

    if (browserSequence.length === 0) {
      setBrowserRenderError('Add sequence items before starting browser render.');
      return;
    }

    const unsupported = browserSequence.filter((item) => !isPreviewable(item.runtimeSource));
    if (unsupported.length > 0) {
      setBrowserRenderError('Browser render only supports picked files/blob URLs or reachable http(s) URLs.');
      return;
    }

    setBrowserRenderRunning(true);
    setBrowserRenderError('');
    setBrowserRenderProgress(0);
    setBrowserRenderMessage('Preparing browser render...');

    try {
      const ffmpeg = await ensureBrowserFfmpegLoaded();
      const { fetchFile } = await import('@ffmpeg/util');

      const lines = ['ffconcat version 1.0'];
      const inputPrefix = `${Date.now()}`;

      for (let index = 0; index < browserSequence.length; index += 1) {
        const item = browserSequence[index];
        const source = item.runtimeSource;
        const ext = inferVirtualExtension(source, item.type);
        const virtualName = `seq-${inputPrefix}-${String(index + 1).padStart(4, '0')}.${ext}`;

        setBrowserRenderMessage(`Caching source ${index + 1}/${browserSequence.length}...`);
        await ffmpeg.writeFile(virtualName, await fetchFile(source));

        lines.push(`file '${virtualName}'`);
        if (item.type === 'image' && Number(item.durationSec) > 0) {
          lines.push(`duration ${Number(item.durationSec)}`);
        }
      }

      const concatName = `sequence-${inputPrefix}.ffconcat`;
      const outputName = `${sanitizeOutputName(sequenceName)}-${inputPrefix}.mp4`;

      setBrowserRenderMessage('Rendering MP4 in browser (this can take a while)...');
      await ffmpeg.writeFile(concatName, new TextEncoder().encode(lines.join('\n')));

      await ffmpeg.exec([
        '-y',
        '-safe',
        '0',
        '-f',
        'concat',
        '-i',
        concatName,
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outputName,
      ]);

      const outputData = await ffmpeg.readFile(outputName);
      const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' });
      const nextUrl = URL.createObjectURL(outputBlob);

      if (browserOutputUrlRef.current) {
        URL.revokeObjectURL(browserOutputUrlRef.current);
      }

      browserOutputUrlRef.current = nextUrl;
      setBrowserOutputUrl(nextUrl);
      setBrowserOutputName(outputName);
      setBrowserRenderProgress(100);
      setBrowserRenderMessage('Browser render completed.');
    } catch (error) {
      setBrowserRenderError(error?.message || 'Browser render failed.');
      setBrowserRenderMessage('Browser render failed.');
    } finally {
      setBrowserRenderRunning(false);
    }
  }

  function downloadBrowserRender() {
    if (!browserOutputUrl) return;

    const anchor = document.createElement('a');
    anchor.href = browserOutputUrl;
    anchor.download = browserOutputName || `${sanitizeOutputName(sequenceName)}.mp4`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function rerunBulkMatchImport() {
    addMatchesFromDirectories();
  }

  // Build exports stripping browser-only blob URLs from the plan output
  const exportSequence = useMemo(
    () =>
      sequence.map(({ previewUrl: _p, ...rest }) => rest),
    [sequence]
  );

  const planJson = useMemo(
    () =>
      JSON.stringify(
        {
          version: 1,
          name: sequenceName.trim() || 'Untitled Sequence',
          generatedAt: new Date().toISOString(),
          notes: 'Sequence plan for StreamerOps. Images include explicit duration seconds.',
          sequence: exportSequence,
        },
        null,
        2
      ),
    [exportSequence, sequenceName]
  );

  const ffconcatScript = useMemo(() => buildFfconcat(exportSequence), [exportSequence]);
  const vlcXspf = useMemo(() => buildVlcXspf(exportSequence), [exportSequence]);

  const bulkMatchCount = useMemo(() => {
    if (bulkImageFiles.length === 0 || bulkVideoFiles.length === 0) return 0;

    const imageBuckets = new Map();
    bulkImageFiles.forEach((imageFile) => {
      const key = normalizeMatchKey(imageFile.name);
      if (!key) return;
      if (!imageBuckets.has(key)) {
        imageBuckets.set(key, 0);
      }
      imageBuckets.set(key, imageBuckets.get(key) + 1);
    });

    return bulkVideoFiles.reduce((total, videoFile) => {
      const key = normalizeMatchKey(videoFile.name);
      if (!key) return total;
      const remaining = imageBuckets.get(key) || 0;
      if (remaining <= 0) return total;
      imageBuckets.set(key, remaining - 1);
      return total + 1;
    }, 0);
  }, [bulkImageFiles, bulkVideoFiles]);

  const bulkUnmatchedVideoCount = useMemo(() => {
    if (bulkImageFiles.length === 0 || bulkVideoFiles.length === 0) return 0;
    return bulkVideoFiles.length - bulkMatchCount;
  }, [bulkImageFiles, bulkVideoFiles, bulkMatchCount]);

  const unsupportedBrowserItemsCount = useMemo(
    () => sequence.filter((item) => !isPreviewable(item.previewUrl || item.source)).length,
    [sequence]
  );

  const isBrowserIsolated = typeof window !== 'undefined' && Boolean(window.crossOriginIsolated);

  return (
    <Container size="xl" py="md">
      {/* Hidden native file inputs */}
      <input
        ref={imageFileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleImageFilePick(e, setImagePath, setImagePreviewUrl)}
      />
      <input
        ref={videoFileRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => handleVideoFilePick(e, setVideoSource, setVideoPreviewUrl)}
      />
      <input
        ref={pairImageFileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => handleImageFilePick(e, setPairImagePath, setPairImagePreviewUrl)}
      />
      <input
        ref={pairVideoFileRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => handleVideoFilePick(e, setPairVideoSource, setPairVideoPreviewUrl)}
      />
      <input
        ref={bulkImageDirRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        multiple
        webkitdirectory=""
        directory=""
        style={{ display: 'none' }}
        onChange={(e) => handleBulkDirectoryPick(e, 'image')}
      />
      <input
        ref={bulkVideoDirRef}
        type="file"
        accept="video/*"
        multiple
        webkitdirectory=""
        directory=""
        style={{ display: 'none' }}
        onChange={(e) => handleBulkDirectoryPick(e, 'video')}
      />

      <Stack gap="lg">
        <div>
          <Title order={2}>Sequence Builder</Title>
          <Text c="dimmed" mt="xs">
            Assemble ship PNG transitions and videos into a sequence. Use the file picker for browser preview, or type a path for export scripts.
          </Text>
        </div>

        {/* Sequence persistence */}
        <Card withBorder p="md" style={{ borderColor: 'rgba(76, 201, 240, 0.35)' }}>
          <Stack gap="sm">
            <Text fw={700}>Sequence Session</Text>
            <Group align="flex-end" wrap="wrap">
              <TextInput
                label="Sequence Name"
                placeholder="SC Salvage Loop A"
                value={sequenceName}
                onChange={(e) => setSequenceName(e.currentTarget.value)}
                style={{ minWidth: 260, flex: 1 }}
              />
              <Select
                label="Saved Sequences"
                placeholder="Select saved sequence"
                data={savedSequences.map((item) => ({
                  value: item.id,
                  label: `${item.name || 'Untitled Sequence'} (${new Date(item.updatedAt || Date.now()).toLocaleString()})`,
                }))}
                value={selectedSequenceId}
                onChange={(value) => {
                  setSelectedSequenceId(value);
                  if (value) loadNamedSequence(value);
                }}
                searchable
                clearable
                style={{ minWidth: 320, flex: 2 }}
              />
            </Group>
            <Group gap="sm" wrap="wrap">
              <Button onClick={saveNamedSequence} leftSection={<IconPlus size={16} />}>
                Save Named Sequence
              </Button>
              <Button variant="light" onClick={duplicateNamedSequence} disabled={!selectedSequenceId}>
                Duplicate
              </Button>
              <Button color="red" variant="light" onClick={deleteNamedSequence} disabled={!selectedSequenceId}>
                Delete Saved
              </Button>
              <Badge variant="light" color="cyan">Autosave: On</Badge>
              <Text size="xs" c="dimmed">Draft restores automatically, and loaded saved sequences update as you edit.</Text>
            </Group>
            <Group gap="md" wrap="wrap" mt="xs">
              <Checkbox
                label="Show Add Image"
                checked={methodVisibility.addImage}
                onChange={(e) => setMethodVisibility((prev) => ({ ...prev, addImage: e.currentTarget.checked }))}
              />
              <Checkbox
                label="Show Add Video"
                checked={methodVisibility.addVideo}
                onChange={(e) => setMethodVisibility((prev) => ({ ...prev, addVideo: e.currentTarget.checked }))}
              />
              <Checkbox
                label="Show Quick Pair"
                checked={methodVisibility.quickPair}
                onChange={(e) => setMethodVisibility((prev) => ({ ...prev, quickPair: e.currentTarget.checked }))}
              />
              <Checkbox
                label="Show Bulk Match Import"
                checked={methodVisibility.bulkMatch}
                onChange={(e) => setMethodVisibility((prev) => ({ ...prev, bulkMatch: e.currentTarget.checked }))}
              />
            </Group>
          </Stack>
        </Card>

        {/* Add Image */}
        {methodVisibility.addImage && (
        <Card withBorder p="md">
          <Text fw={700} mb="sm">Add Ship Image (transition frame)</Text>
          <Stack gap="sm">
            <Group align="flex-end" grow>
              <TextInput
                label="Image Title"
                placeholder="Drake Vulture Transition"
                value={imageTitle}
                onChange={(e) => setImageTitle(e.currentTarget.value)}
              />
              <NumberInput
                label="Display Duration (sec)"
                min={1}
                max={20}
                value={imageDurationSec}
                onChange={setImageDurationSec}
              />
            </Group>
            <Group align="flex-end">
              <TextInput
                label="Image Path or URL"
                placeholder="D:\Images\vulture.png or https://..."
                value={imagePath}
                onChange={(e) => setImagePath(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Tooltip label="Pick a file — enables in-page preview">
                <Button
                  variant="light"
                  leftSection={<IconFolder size={16} />}
                  onClick={() => imageFileRef.current?.click()}
                >
                  Browse
                </Button>
              </Tooltip>
              <Button leftSection={<IconPlus size={16} />} onClick={addImage} disabled={!imagePath.trim() && !imagePreviewUrl}>
                Add Image
              </Button>
            </Group>
            {imagePreviewUrl && (
              <Image src={imagePreviewUrl} h={120} w="auto" fit="contain" radius="sm" />
            )}
          </Stack>
        </Card>
        )}

        {/* Add Video */}
        {methodVisibility.addVideo && (
        <Card withBorder p="md">
          <Text fw={700} mb="sm">Add Video</Text>
          <Stack gap="sm">
            <Group align="flex-end">
              <TextInput
                label="Video Title"
                placeholder="Vulture Showcase Clip"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
            </Group>
            <Group align="flex-end">
              <TextInput
                label="Video Path or URL"
                placeholder="D:\Videos\vulture.mp4 or https://..."
                value={videoSource}
                onChange={(e) => setVideoSource(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Tooltip label="Pick a file — enables in-page preview">
                <Button
                  variant="light"
                  leftSection={<IconFolder size={16} />}
                  onClick={() => videoFileRef.current?.click()}
                >
                  Browse
                </Button>
              </Tooltip>
              <Button leftSection={<IconPlus size={16} />} onClick={addVideo} disabled={!videoSource.trim() && !videoPreviewUrl}>
                Add Video
              </Button>
            </Group>
            {videoPreviewUrl && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={videoPreviewUrl} controls style={{ height: 120, borderRadius: 4 }} />
            )}
          </Stack>
        </Card>
        )}

        {/* Quick Pair */}
        {methodVisibility.quickPair && (
        <Card withBorder p="md" style={{ borderColor: 'rgba(176, 0, 255, 0.35)' }}>
          <Text fw={700} mb="sm">Quick Add: Ship Image + Video Pair</Text>
          <Stack gap="sm">
            <Group align="flex-end">
              <TextInput
                label="Image Title"
                placeholder="Vulture Transition"
                value={pairImageTitle}
                onChange={(e) => setPairImageTitle(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <TextInput
                label="Image Path or URL"
                placeholder="D:\Images\vulture.png"
                value={pairImagePath}
                onChange={(e) => setPairImagePath(e.currentTarget.value)}
                style={{ flex: 2 }}
              />
              <NumberInput
                label="Img Duration (sec)"
                min={1}
                max={20}
                value={pairVideoDuration}
                onChange={setPairVideoDuration}
                style={{ width: 120 }}
              />
              <Tooltip label="Pick image file">
                <Button variant="light" leftSection={<IconFolder size={16} />} onClick={() => pairImageFileRef.current?.click()}>
                  Browse
                </Button>
              </Tooltip>
            </Group>
            {pairImagePreviewUrl && (
              <Image src={pairImagePreviewUrl} h={80} w="auto" fit="contain" radius="sm" />
            )}
            <Group align="flex-end">
              <TextInput
                label="Video Title"
                placeholder="Vulture Segment"
                value={pairVideoTitle}
                onChange={(e) => setPairVideoTitle(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <TextInput
                label="Video Path or URL"
                placeholder="D:\Videos\vulture.mp4"
                value={pairVideoSource}
                onChange={(e) => setPairVideoSource(e.currentTarget.value)}
                style={{ flex: 2 }}
              />
              <Tooltip label="Pick video file">
                <Button variant="light" leftSection={<IconFolder size={16} />} onClick={() => pairVideoFileRef.current?.click()}>
                  Browse
                </Button>
              </Tooltip>
              <Button
                color="violet"
                leftSection={<IconPlus size={16} />}
                onClick={addPair}
                disabled={(!pairImagePath.trim() && !pairImagePreviewUrl) || (!pairVideoSource.trim() && !pairVideoPreviewUrl)}
              >
                Add Pair
              </Button>
            </Group>
            {pairVideoPreviewUrl && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={pairVideoPreviewUrl} controls style={{ height: 80, borderRadius: 4 }} />
            )}
          </Stack>
        </Card>
        )}

        {/* Bulk folder matcher */}
        {methodVisibility.bulkMatch && (
        <Card withBorder p="md" style={{ borderColor: 'rgba(0, 189, 214, 0.35)' }}>
          <Text fw={700} mb="sm">Bulk Match Import (PNG folder + Video folder)</Text>
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Pick a PNG directory and a video directory. Files are matched by filename (without extension), then added as image + video sequence pairs.
            </Text>
            <Group align="flex-end" wrap="wrap">
              <Button variant="light" leftSection={<IconFolder size={16} />} onClick={() => bulkImageDirRef.current?.click()}>
                Choose PNG Directory
              </Button>
              <Button variant="light" leftSection={<IconFolder size={16} />} onClick={() => bulkVideoDirRef.current?.click()}>
                Choose Videos Directory
              </Button>
              <NumberInput
                label="Image Duration (sec)"
                min={1}
                max={20}
                value={bulkImageDurationSec}
                onChange={setBulkImageDurationSec}
                style={{ width: 180 }}
              />
            </Group>
            <Group align="center" justify="space-between" wrap="wrap">
              <Switch
                checked={excludeUnmatchedVideos}
                onChange={(e) => setExcludeUnmatchedVideos(e.currentTarget.checked)}
                label="Exclude videos without matching image"
              />
              <Group gap="xs">
                <Badge variant="light" color="cyan">PNGs: {bulkImageFiles.length}</Badge>
                <Badge variant="light" color="green">Videos: {bulkVideoFiles.length}</Badge>
                <Badge variant="light" color="teal">Matches: {bulkMatchCount}</Badge>
                <Badge variant="light" color={bulkUnmatchedVideoCount > 0 ? 'orange' : 'gray'}>
                  Unmatched videos: {bulkUnmatchedVideoCount}
                </Badge>
              </Group>
            </Group>
            <Group>
              <Button
                color="cyan"
                leftSection={<IconPlus size={16} />}
                onClick={addMatchesFromDirectories}
                disabled={bulkImageFiles.length === 0 || bulkVideoFiles.length === 0}
              >
                Add Matched Items To Sequence
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Note: Browser folder selection only provides relative filenames (not full Windows paths). Preview works immediately; adjust paths later if you need absolute export paths.
            </Text>
          </Stack>
        </Card>
        )}

        {/* Sequence table */}
        <Card withBorder p="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Sequence</Title>
            <Group gap="xs">
              <Badge variant="light">{sequence.length} items</Badge>
              <Button color="red" variant="light" size="xs" onClick={() => setSequence([])}>Clear</Button>
            </Group>
          </Group>

          <Table striped withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ width: 36 }}>#</Table.Th>
                <Table.Th style={{ width: 70 }}>Type</Table.Th>
                <Table.Th>Title</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th style={{ width: 80 }}>Dur.</Table.Th>
                <Table.Th style={{ width: 90 }}>Preview</Table.Th>
                <Table.Th style={{ width: 110 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sequence.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" size="sm" ta="center" py="md">No items yet. Add images and videos above.</Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {sequence.map((item, index) => (
                <Table.Tr key={item.id}>
                  <Table.Td>{index + 1}</Table.Td>
                  <Table.Td>
                    <Badge color={item.type === 'image' ? 'cyan' : 'green'} variant="light" size="sm">
                      {item.type}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{item.title}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed" lineClamp={1}>{item.source}</Text>
                  </Table.Td>
                  <Table.Td>
                    {item.type === 'video' && getVideoRowDuration(index) !== null ? (
                      <NumberInput
                        min={1}
                        max={20}
                        value={getVideoRowDuration(index)}
                        onChange={(value) => updateVideoRowLinkedDuration(index, value)}
                        size="xs"
                      />
                    ) : (
                      <Text size="xs" c="dimmed">n/a</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <ItemPreview item={item} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <ActionIcon size="sm" variant="light" onClick={() => moveItem(index, -1)} disabled={index === 0}>
                        <IconArrowUp size={14} />
                      </ActionIcon>
                      <ActionIcon size="sm" variant="light" onClick={() => moveItem(index, 1)} disabled={index === sequence.length - 1}>
                        <IconArrowDown size={14} />
                      </ActionIcon>
                      <ActionIcon size="sm" color="red" variant="light" onClick={() => removeItem(item.id)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Group justify="space-between" mt="md" wrap="wrap">
            <Group gap="xs" wrap="wrap">
              <Button
                color="blue"
                leftSection={<IconPlayerPlay size={16} />}
                onClick={renderInBrowserWithWasm}
                loading={browserRenderRunning || browserWasmLoading}
                disabled={sequence.length === 0 || unsupportedBrowserItemsCount > 0 || !isBrowserIsolated}
              >
                Render In Browser (Experimental)
              </Button>
              <Button
                variant="light"
                leftSection={<IconDownload size={16} />}
                onClick={downloadBrowserRender}
                disabled={!browserOutputUrl}
              >
                Download Browser MP4
              </Button>
            </Group>

            <Button
              variant="outline"
              color="gray"
              onClick={rerunBulkMatchImport}
              disabled={bulkImageFiles.length === 0 || bulkVideoFiles.length === 0}
            >
              Re-run Bulk Match Import
            </Button>
          </Group>

          <Text size="xs" c="dimmed" mt="xs">Status: {browserRenderMessage}</Text>
          {(browserRenderRunning || browserRenderProgress > 0) && (
            <Text size="xs" c="dimmed">Progress: {browserRenderProgress}%</Text>
          )}
          {browserRenderError && (
            <Text size="xs" c="red">{browserRenderError}</Text>
          )}
        </Card>

        {/* Exports */}
        <Card withBorder p="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={4}>Alternative Exports</Title>
              <Text size="sm" c="dimmed">Preview blob URLs are stripped from export outputs — only file paths and http URLs are included.</Text>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Stack gap="md">
                <Group gap="sm" wrap="wrap">
                  <Button onClick={() => downloadTextFile(planJson, 'streamerops-sequence-plan.json', 'application/json')}>
                    Download Plan JSON
                  </Button>
                  <Button variant="light" onClick={() => downloadTextFile(vlcXspf, 'streamerops-videos-only.xspf', 'application/xspf+xml')}>
                    Download VLC Playlist (Videos)
                  </Button>
                  <Button variant="light" color="violet" onClick={() => downloadTextFile(ffconcatScript, 'streamerops-image-video.ffconcat', 'text/plain')}>
                    Download FFconcat (Images + Videos)
                  </Button>
                </Group>
                <Textarea label="Plan JSON" value={planJson} minRows={6} autosize readOnly />
                <Textarea label="VLC XSPF (videos only)" value={vlcXspf} minRows={5} autosize readOnly />
                <Textarea label="FFconcat (images + videos)" value={ffconcatScript} minRows={5} autosize readOnly />
              </Stack>

              <Card withBorder p="sm" style={{ borderColor: 'rgba(176, 0, 255, 0.35)' }}>
                <Stack gap="sm">
                  <Title order={5}>FFmpeg Helper</Title>
                  <Text size="sm" c="dimmed">
                    Use native FFmpeg for best stability. Browser Render (WASM) is available as an install-free fallback for smaller jobs.
                  </Text>

                  {ffmpegStatus.loading ? (
                    <Badge variant="light" color="gray">Checking FFmpeg status...</Badge>
                  ) : ffmpegStatus.installed ? (
                    <Badge variant="light" color="teal">FFmpeg detected ({ffmpegStatus.source})</Badge>
                  ) : (
                    <Badge variant="light" color="orange">FFmpeg not detected</Badge>
                  )}

                  {ffmpegStatus.path && (
                    <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
                      Path: {ffmpegStatus.path}
                    </Text>
                  )}

                  <Badge variant="light" color={isBrowserIsolated ? 'teal' : 'orange'}>
                    Browser isolation: {isBrowserIsolated ? 'Ready' : 'Missing COOP/COEP'}
                  </Badge>

                  <Group gap="xs" wrap="wrap">
                    <Button
                      color="blue"
                      leftSection={<IconPlayerPlay size={16} />}
                      onClick={renderInBrowserWithWasm}
                      loading={browserRenderRunning || browserWasmLoading}
                      disabled={sequence.length === 0 || unsupportedBrowserItemsCount > 0 || !isBrowserIsolated}
                    >
                      Render In Browser (Experimental)
                    </Button>
                    <Button
                      variant="light"
                      leftSection={<IconDownload size={16} />}
                      onClick={downloadBrowserRender}
                      disabled={!browserOutputUrl}
                    >
                      Download Browser MP4
                    </Button>
                  </Group>

                  {browserWasmReady && <Badge variant="light" color="cyan">FFmpeg WASM loaded</Badge>}

                  <Text size="xs" c="dimmed">Status: {browserRenderMessage}</Text>
                  {(browserRenderRunning || browserRenderProgress > 0) && (
                    <Text size="xs" c="dimmed">Progress: {browserRenderProgress}%</Text>
                  )}

                  {unsupportedBrowserItemsCount > 0 && (
                    <Text size="xs" c="orange">
                      {unsupportedBrowserItemsCount} sequence item(s) use local path text only. This often happens after reload because browser file blobs are session-only. Re-run Bulk Match Import (or re-pick files) before Browser Render.
                    </Text>
                  )}

                  {browserRenderError && (
                    <Text size="xs" c="red">{browserRenderError}</Text>
                  )}

                  {browserOutputUrl && (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={browserOutputUrl} controls style={{ width: '100%', borderRadius: 4 }} />
                  )}

                  <Text size="sm" fw={600}>Quick guidance</Text>
                  <Text size="xs" c="dimmed">1. Native: export FFconcat and render with system FFmpeg.</Text>
                  <Text size="xs" c="dimmed">2. Browser: use picked files/URLs and click Render In Browser.</Text>
                  <Text size="xs" c="dimmed">3. For long edits, split into smaller compilations to reduce memory pressure.</Text>

                  <Button
                    component="a"
                    href="https://ffmpeg.org/download.html"
                    target="_blank"
                    rel="noreferrer"
                    variant="light"
                    color="violet"
                  >
                    Download FFmpeg
                  </Button>

                  <Text size="xs" c="dimmed">
                    OBS supports scripted scene/source automation, but reliable timeline-style media rendering is still better handled by FFmpeg-style processing.
                  </Text>
                </Stack>
              </Card>
            </SimpleGrid>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
