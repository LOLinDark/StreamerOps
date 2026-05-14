import { useEffect, useMemo, useState } from 'react';
import { Alert, Anchor, Badge, Button, Code, Group, Loader, Paper, Select, Stack, Text, Title } from '@mantine/core';

const HARD_CODED_ROAMING_ROOT = 'C:/Users/squee/AppData/Roaming';

export default function ImportExportOBS() {
  const [files, setFiles] = useState([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingConvert, setLoadingConvert] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  const options = useMemo(() => files.map((file) => ({
    value: file.path,
    label: `${file.name} (${file.path})`,
  })), [files]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadFiles() {
      setLoadingFiles(true);
      setError('');

      try {
        const response = await fetch('/api/import-export/discover', { signal: controller.signal });
        if (!response.ok) {
          let details = '';
          try {
            const errorPayload = await response.json();
            details = errorPayload?.details || errorPayload?.error || '';
          } catch {
            details = response.statusText || '';
          }
          throw new Error(details || `Failed to discover JSON files (HTTP ${response.status}).`);
        }

        const payload = await response.json();
        const nextFiles = Array.isArray(payload.files) ? payload.files : [];
        setFiles(nextFiles);
        setSelectedPath((current) => current || nextFiles[0]?.path || '');
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load files');
        }
      } finally {
        setLoadingFiles(false);
      }
    }

    loadFiles();
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    if (downloadUrl) {
      window.URL.revokeObjectURL(downloadUrl);
    }
  }, [downloadUrl]);

  const handleConvert = async () => {
    if (!selectedPath) {
      setError('Choose a Streamlabs or OBS JSON file first.');
      return;
    }

    setLoadingConvert(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch('/api/import-export/streamlabs-to-obs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relativePath: selectedPath }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.details || payload.error || 'Failed to convert scene collection.');
      }

      const blob = new Blob([JSON.stringify(payload.obsData, null, 2)], { type: 'application/json' });
      const nextUrl = window.URL.createObjectURL(blob);

      if (downloadUrl) {
        window.URL.revokeObjectURL(downloadUrl);
      }

      setDownloadUrl(nextUrl);
      setSuccessMessage(`Converted ${payload.sourcePath} using the hardcoded Roaming path.`);
    } catch (err) {
      setError(err.message || 'Conversion failed.');
    } finally {
      setLoadingConvert(false);
    }
  };

  return (
    <Paper p="lg" radius="md" style={{ background: 'rgba(5, 12, 24, 0.86)', border: '1px solid rgba(0, 217, 255, 0.18)' }}>
      <Stack gap="md">
        <div>
          <Group gap="sm" mb="xs">
            <Badge variant="light" color="cyan">Streamlabs to OBS</Badge>
            <Badge variant="light" color="blue">Hardcoded Roaming Root</Badge>
          </Group>
          <Title order={3}>Import scenes and sources into OBS</Title>
          <Text c="dimmed" mt="xs">
            Scans OBS and Streamlabs scene collection directories, filters for valid scene files, and converts them into an OBS-compatible format.
          </Text>
        </div>

        <Alert color="blue" title="Root path">
          <Code>{HARD_CODED_ROAMING_ROOT}</Code>
        </Alert>

        {error && <Alert color="red" title="Import error">{error}</Alert>}
        {successMessage && <Alert color="green" title="Ready">{successMessage}</Alert>}

        <Stack gap="sm">
          <Text fw={600}>Discovered JSON files</Text>
          <Select
            data={options}
            value={selectedPath}
            onChange={setSelectedPath}
            placeholder={loadingFiles ? 'Scanning Roaming...' : 'Select a JSON file'}
            searchable
            nothingFoundMessage="No scene collection files found in OBS/Streamlabs directories"
            disabled={loadingFiles}
          />
          <Text size="sm" c="dimmed">
            Only files containing scene or source data are shown. Upload manually if your export is stored elsewhere.
          </Text>
        </Stack>

        <Group justify="space-between" align="center">
          <Button color="cyan" onClick={handleConvert} loading={loadingConvert} disabled={!selectedPath || loadingFiles}>
            Convert to OBS JSON
          </Button>
          {loadingFiles ? <Loader size="sm" /> : <Text size="sm" c="dimmed">{files.length} file(s) found</Text>}
        </Group>

        {downloadUrl && (
          <Alert color="teal" title="Download ready">
            <Anchor href={downloadUrl} download="obs_scene_collection.json">
              Download OBS scene collection JSON
            </Anchor>
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
