import type { TextStyle } from 'react-native';

/**
 * BU One brand palette. The product uses a fixed warm-paper light theme
 * (see `userInterfaceStyle: "light"` in app.json), so tokens are static hex values.
 */
export const colors = {
  background: '#fcfbf8',
  surface: '#ffffff',
  surfaceMuted: '#f0eeea',
  surfaceSheet: '#f7f6f3',
  chip: '#eceae6',
  ink: '#18181a',
  inkStrong: '#1d1d20',
  inkSoft: '#3f3f44',
  label: '#4f4f55',
  muted: '#68686f',
  subtle: '#77777e',
  tertiary: '#8a8a90',
  separator: '#e2dfda',
  border: '#dedbd6',
  inputBorder: '#d5d2cd',
  brand: '#cc0000',
  brandDeep: '#a00000',
  brandTint: '#f2e8e6',
  brandOnDark: '#ff817a',
  success: '#4d7257',
  successTint: '#eaf1eb',
  errorText: '#7b2923',
  onDark: '#ffffff',
  onDarkMuted: '#c7c7cc',
  scrim: 'rgba(10, 10, 12, 0.38)',
  agenda: {
    class: { border: '#7f8ea3', text: '#364c68' },
    deadline: { border: '#ad875d', text: '#6e4b24' },
    event: { border: '#cc0000', text: '#a00000' },
    dining: { border: '#6f9679', text: '#3f6849' },
    travel: { border: '#c8c8cc', text: '#4e4e54' },
    academic: { border: '#c8c8cc', text: '#4e4e54' },
  },
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  screen: 18,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
  full: 9999,
} as const;

export const shadows = {
  card: '0 3px 14px rgba(20, 20, 20, 0.04)',
  raised: '0 8px 22px rgba(20, 20, 22, 0.13)',
  overlay: '0 8px 24px rgba(20, 20, 20, 0.22)',
} as const;

export const type = {
  display: { fontSize: 42, lineHeight: 46, fontWeight: '700', letterSpacing: -1.5, color: colors.ink },
  largeTitle: { fontSize: 28, lineHeight: 31, fontWeight: '700', letterSpacing: -0.8, color: colors.ink },
  title: { fontSize: 24, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, color: colors.ink },
  heading: { fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.25, color: colors.ink },
  headline: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400', color: colors.muted },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: colors.ink },
  callout: { fontSize: 13, lineHeight: 18, fontWeight: '400', color: colors.muted },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '400', color: colors.subtle },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.9, color: colors.subtle },
  micro: { fontSize: 10, lineHeight: 13, fontWeight: '600', color: colors.subtle },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof type;
