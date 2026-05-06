import { Badge } from '@mantine/core';
import { IconTool } from '@tabler/icons-react';
import PropTypes from 'prop-types';

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

IncompleteFeatureBadge.propTypes = {
  label: PropTypes.string,
};

IncompleteFeatureBadge.defaultProps = {
  label: 'In Development',
};
