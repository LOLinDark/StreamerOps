import { Stack, Text, Title } from '@mantine/core';
import ImportExportOBS from '../components/ImportExportOBS';

export default function ToolsPage() {
  return (
    <Stack gap="lg">
      <div>
        <Title order={2}>Tools</Title>
        <Text c="dimmed" mt="xs">
          Operational utilities for moving content between external apps and StreamerOps.
        </Text>
      </div>

      <ImportExportOBS />
    </Stack>
  );
}