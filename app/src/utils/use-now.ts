import { useEffect, useState } from 'react';

const MINUTE = 60_000;

/** Current time in ms, refreshed every minute so countdowns and "next" items stay current. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE);
    return () => clearInterval(timer);
  }, []);
  return now;
}
