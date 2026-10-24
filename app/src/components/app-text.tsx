import { StyleSheet, Text, type TextProps } from 'react-native';

import { type, type TextVariant } from '@/theme';

export type AppTextProps = TextProps & { variant?: TextVariant };

const LINE_HEIGHT_RATIO = 1.2;

export function AppText({ variant = 'body', style, ...props }: AppTextProps) {
  const override = StyleSheet.flatten(style);
  // A fontSize override would otherwise keep the variant's lineHeight, and iOS clips glyphs
  // when lineHeight < fontSize.
  const minLineHeight =
    override?.fontSize != null && override.lineHeight == null
      ? Math.round(override.fontSize * LINE_HEIGHT_RATIO)
      : 0;
  const lineHeight = minLineHeight > type[variant].lineHeight ? minLineHeight : undefined;
  return <Text style={[type[variant], lineHeight != null && { lineHeight }, style]} {...props} />;
}
