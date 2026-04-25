import { useEffect, useMemo, useState } from 'react';

export function useRotatingTips(tips, intervalMs = 9000) {
  const safeTips = useMemo(() => (Array.isArray(tips) ? tips.filter(Boolean) : []), [tips]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [safeTips.length]);

  useEffect(() => {
    if (safeTips.length <= 1) {
      return undefined;
    }

    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % safeTips.length);
    }, Math.max(3000, intervalMs));

    return () => clearInterval(timer);
  }, [safeTips.length, intervalMs]);

  return {
    currentTip: safeTips[index] || '',
    index,
    total: safeTips.length,
  };
}
