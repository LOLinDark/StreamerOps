import { Paper, Text, Group, Badge, ScrollArea, Stack } from '@mantine/core';
import { useAppStore } from '../stores';

export default function DevFooter({ docked = false, width = 280, height = 260 }) {
  const activities = useAppStore((s) => s.activities);
  const devMode = useAppStore((s) => s.devMode);

  if (!devMode) return null;

  if (docked) {
    return (
      <Paper
        withBorder
        p="xs"
        style={{
          width,
          maxWidth: '100%',
          border: '1px solid rgba(34, 139, 230, 0.55)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
        }}
      >
        <Group gap="xs" mb={4}>
          <Badge size="xs" color="blue">DEV MODE</Badge>
          <Text size="xs" fw={700}>Activity Monitor</Text>
          <Badge size="xs" variant="light">{activities.length}</Badge>
        </Group>
        <ScrollArea h={height}>
          <Stack gap={2}>
            {activities.map(activity => (
              <Text key={activity.id} size="xs" style={{ fontFamily: 'monospace' }}>
                {activity.timestamp} {activity.type} {activity.details}
              </Text>
            ))}
          </Stack>
        </ScrollArea>
      </Paper>
    );
  }

  return (
    <Paper
      p="xs"
      style={{
        position: 'absolute',
        bottom: 10,
        right: 10,
        width: '350px',
        maxHeight: '400px',
        zIndex: 1000,
        border: '2px solid #228be6',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        cursor: 'move'
      }}
      onMouseDown={(e) => {
        const paper = e.currentTarget;
        const rect = paper.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;
        const onMouseMove = (e) => {
          paper.style.left = (e.clientX - startX) + 'px';
          paper.style.top = (e.clientY - startY + window.scrollY) + 'px';
          paper.style.bottom = 'auto';
          paper.style.right = 'auto';
        };
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      }}
    >
      <Group gap="xs" mb={4}>
        <Badge size="xs" color="blue">DEV MODE</Badge>
        <Text size="xs" fw={700}>Activity Monitor</Text>
        <Badge size="xs" variant="light">{activities.length}</Badge>
      </Group>
      <ScrollArea h={350}>
        <Stack gap={2}>
          {activities.map(activity => (
            <Text key={activity.id} size="xs" style={{ fontFamily: 'monospace' }}>
              {activity.timestamp} {activity.type} {activity.details}
            </Text>
          ))}
        </Stack>
      </ScrollArea>
    </Paper>
  );
}
