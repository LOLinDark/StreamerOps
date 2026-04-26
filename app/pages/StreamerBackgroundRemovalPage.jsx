import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Image,
  Loader,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertCircle, IconDownload, IconPhoto, IconSparkles, IconWand } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import DevTag from '../components/DevTag';
import { usePageTitle } from '../contexts/PageTitleContext';

const API_KEY_STORAGE = 'streamerops.clipdropApiKey';

export default function StreamerBackgroundRemovalPage() {
  const { setPageTitle } = usePageTitle();
  const [apiKey, setApiKey] = useState('');
  const [rememberKey, setRememberKey] = useState(false);
  const [transparencyHandling, setTransparencyHandling] = useState('return_input_if_non_opaque');
  const [inputFile, setInputFile] = useState(null);
  const [inputPreviewUrl, setInputPreviewUrl] = useState('');
  const [outputPreviewUrl, setOutputPreviewUrl] = useState('');
  const [outputMime, setOutputMime] = useState('image/png');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [remainingCredits, setRemainingCredits] = useState('');
  const [creditsConsumed, setCreditsConsumed] = useState('');

  const inputUrlRef = useRef('');
  const outputUrlRef = useRef('');

  useEffect(() => {
    const savedKey = localStorage.getItem(API_KEY_STORAGE) || '';
    if (savedKey) {
      setApiKey(savedKey);
      setRememberKey(true);
    }
  }, []);

  useEffect(() => {
    if (rememberKey && apiKey) {
      localStorage.setItem(API_KEY_STORAGE, apiKey);
      return;
    }

    localStorage.removeItem(API_KEY_STORAGE);
  }, [apiKey, rememberKey]);

  useEffect(() => {
    return () => {
      if (inputUrlRef.current) URL.revokeObjectURL(inputUrlRef.current);
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    };
  }, []);

  useEffect(() => {
    setPageTitle(<><DevTag tag="ST06" />Ship PNG Cutout</>);
    return () => setPageTitle(null);
  }, [setPageTitle]);

  function onPickFile(event) {
    const file = event.target.files?.[0] || null;
    setError('');
    setInputFile(file);

    if (inputUrlRef.current) {
      URL.revokeObjectURL(inputUrlRef.current);
      inputUrlRef.current = '';
    }

    if (!file) {
      setInputPreviewUrl('');
      return;
    }

    const next = URL.createObjectURL(file);
    inputUrlRef.current = next;
    setInputPreviewUrl(next);
    event.target.value = '';
  }

  async function removeBackground() {
    if (!inputFile) {
      setError('Pick an image first.');
      return;
    }

    setProcessing(true);
    setError('');
    setRemainingCredits('');
    setCreditsConsumed('');

    if (outputUrlRef.current) {
      URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = '';
      setOutputPreviewUrl('');
    }

    try {
      const formData = new FormData();
      formData.append('image_file', inputFile);
      formData.append('transparency_handling', transparencyHandling);

      const headers = {};
      if (apiKey.trim()) {
        headers['x-clipdrop-api-key'] = apiKey.trim();
      }

      const response = await fetch('/api/images/remove-background/clipdrop', {
        method: 'POST',
        headers,
        body: formData,
      });

      const nextRemaining = response.headers.get('x-clipdrop-remaining-credits') || '';
      const nextConsumed = response.headers.get('x-clipdrop-credits-consumed') || '';
      setRemainingCredits(nextRemaining);
      setCreditsConsumed(nextConsumed);

      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          // Ignore JSON parse failures and keep generic message.
        }
        throw new Error(message);
      }

      const resultBlob = await response.blob();
      const resultUrl = URL.createObjectURL(resultBlob);
      outputUrlRef.current = resultUrl;
      setOutputPreviewUrl(resultUrl);
      setOutputMime(response.headers.get('content-type') || 'image/png');
    } catch (requestError) {
      setError(requestError.message || 'Background removal failed');
    } finally {
      setProcessing(false);
    }
  }

  function downloadResult() {
    if (!outputPreviewUrl || !inputFile) return;

    const safeBase = inputFile.name.replace(/\.[^.]+$/, '') || 'ship-cutout';
    const extension = outputMime.includes('webp') ? 'webp' : outputMime.includes('jpeg') ? 'jpg' : 'png';

    const anchor = document.createElement('a');
    anchor.href = outputPreviewUrl;
    anchor.download = `${safeBase}-no-bg.${extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Text c="dimmed">
          Remove image backgrounds using Clipdrop. You get 100 free development credits, then you need paid credits.
        </Text>

        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Text fw={700}>Clipdrop Connection</Text>
                <Text size="sm" c="dimmed">Your key is only sent to the StreamerOps backend proxy.</Text>
              </Stack>
              <Badge color="violet" variant="light">BYO API Key</Badge>
            </Group>

            <PasswordInput
              label="Clipdrop API Key"
              placeholder="Paste your Clipdrop key"
              value={apiKey}
              onChange={(event) => setApiKey(event.currentTarget.value)}
            />

            <Switch
              checked={rememberKey}
              onChange={(event) => setRememberKey(event.currentTarget.checked)}
              label="Remember key in this browser"
            />

            <Select
              label="Transparency handling"
              value={transparencyHandling}
              onChange={(value) => setTransparencyHandling(value || 'return_input_if_non_opaque')}
              data={[
                {
                  value: 'return_input_if_non_opaque',
                  label: 'Return input if already transparent',
                },
                {
                  value: 'discard_alpha_layer',
                  label: 'Discard existing alpha before remove',
                },
              ]}
            />

            <Group>
              <Button component="label" leftSection={<IconPhoto size={16} />} variant="light" color="blue">
                Choose Image
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onPickFile} />
              </Button>

              <Button
                onClick={removeBackground}
                leftSection={processing ? <Loader size={16} color="white" /> : <IconWand size={16} />}
                disabled={processing || !inputFile}
                color="violet"
              >
                {processing ? 'Processing...' : 'Remove Background'}
              </Button>

              <Button
                onClick={downloadResult}
                leftSection={<IconDownload size={16} />}
                disabled={!outputPreviewUrl}
                variant="outline"
                color="teal"
              >
                Download PNG
              </Button>
            </Group>

            {inputFile && (
              <Text size="sm" c="dimmed">
                Selected file: {inputFile.name}
              </Text>
            )}

            {(remainingCredits || creditsConsumed) && (
              <Group gap="xs">
                {remainingCredits && <Badge color="cyan" variant="light">Remaining credits: {remainingCredits}</Badge>}
                {creditsConsumed && <Badge color="lime" variant="light">Consumed: {creditsConsumed}</Badge>}
              </Group>
            )}

            {error && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
              </Alert>
            )}
          </Stack>
        </Card>

        <Group align="flex-start" grow>
          <Card withBorder>
            <Stack gap="sm">
              <Group gap="xs"><IconPhoto size={16} /><Text fw={600}>Original</Text></Group>
              {inputPreviewUrl ? (
                <Image src={inputPreviewUrl} alt="Original preview" radius="sm" />
              ) : (
                <Text size="sm" c="dimmed">Pick an image to preview it here.</Text>
              )}
            </Stack>
          </Card>

          <Card withBorder>
            <Stack gap="sm">
              <Group gap="xs"><IconSparkles size={16} /><Text fw={600}>Background Removed</Text></Group>
              {outputPreviewUrl ? (
                <Image src={outputPreviewUrl} alt="Background removed preview" radius="sm" />
              ) : (
                <Text size="sm" c="dimmed">Processed preview appears here.</Text>
              )}
            </Stack>
          </Card>
        </Group>
      </Stack>
    </Container>
  );
}
