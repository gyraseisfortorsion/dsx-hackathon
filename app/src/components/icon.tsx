import { Platform, type ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

const glyphs = {
  home: <Path d="M5 10.5 12 5l7 5.5V19a1 1 0 0 1-1 1h-4v-6h-4v6H6a1 1 0 0 1-1-1Z" />,
  star: <Path d="M12 3l2.2 4.6 5 .7-3.6 3.6.9 5.1-4.5-2.4L7.5 17l.9-5.1-3.6-3.6 5-.7Z" />,
  chat: <Path d="M20 14a4 4 0 0 1-4 4H9l-5 3v-7a7 7 0 0 1 7-7h5a4 4 0 0 1 4 4Z" />,
  person: (
    <>
      <Circle cx="12" cy="8" r="4" />
      <Path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  spark: (
    <Path d="m12 3 1.3 4.2L17 9l-3.7 1.8L12 15l-1.3-4.2L7 9l3.7-1.8ZM6 15l.7 2.3L9 18l-2.3.7L6 21l-.7-2.3L3 18l2.3-.7Z" />
  ),
  back: <Path d="m15 18-6-6 6-6" />,
  chevron: <Path d="m9 18 6-6-6-6" />,
  check: <Path d="m5 12 4 4L19 6" />,
  search: (
    <>
      <Circle cx="11" cy="11" r="7" />
      <Path d="m20 20-4-4" />
    </>
  ),
  send: <Path d="m3 11 18-8-8 18-2-8Z" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  calendar: (
    <>
      <Rect x="4" y="5" width="16" height="15" rx="2" />
      <Path d="M8 3v4m8-4v4m-8 5h8" />
    </>
  ),
  pin: <Path d="m9 4 6 6m-8 2 5 5m-7 2 4-4 6-2 3-3-8-8-3 3-2 6-4 4" />,
  lock: (
    <>
      <Rect x="5" y="10" width="14" height="11" rx="2" />
      <Path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  external: <Path d="M14 5h5v5M19 5l-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />,
  menu: <Path d="M5 7h14M5 12h14M5 17h14" />,
  bookmark: <Path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" />,
  hide: <Path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.5 4.5 9 6-.3.9-1.4 2.6-3.1 4M14 14.1a3 3 0 0 1-4.1-4.1M6.4 7.6C4.6 8.9 3.4 10.8 3 12c.5 1.5 4 6 9 6 1.3 0 2.5-.3 3.6-.8" />,
  filter: <Path d="M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M6 14v6" />,
};

export type IconName = keyof typeof glyphs;

// react-native-svg forwards props to the DOM on web, where these are unknown attributes.
const hiddenFromAccessibility =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const);

export function Icon({ name, size = 20, color = colors.ink, filled }: { name: IconName; size?: number; color?: ColorValue; filled?: boolean }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...hiddenFromAccessibility}>
      {glyphs[name]}
    </Svg>
  );
}
