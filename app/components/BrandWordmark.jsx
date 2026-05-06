import { Text } from '@mantine/core';
import PropTypes from 'prop-types';

export default function BrandWordmark({ onClick, size = '1.5rem', color = '#00d9ff' }) {
  return (
    <Text
      fw={700}
      onClick={onClick}
      style={{
        letterSpacing: '0.1em',
        color,
        margin: 0,
        fontSize: size,
        lineHeight: 1,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      STREAMEROPS
    </Text>
  );
}

BrandWordmark.propTypes = {
  onClick: PropTypes.func,
  size: PropTypes.string,
  color: PropTypes.string,
};

BrandWordmark.defaultProps = {
  size: '1.5rem',
  color: '#00d9ff',
};
