import { Badge } from '@mantine/core';
import { IconTool } from '@tabler/icons-react';

export default function IncompleteFeatureBadge({ label = 'In Development' }) {
  return (
    <Badge
      color="red"
      variant="light"
      size="sm"
      leftSection={<IconTool size={12} />}
    >
      {label}
    </Badge>
  );
}
