import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText } from './app-text';

type SectionProps = {
  title?: string;
  /** Small trailing label next to the title, e.g. "Estimates". */
  caption?: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Section({ title, caption, action, children, style }: SectionProps) {
  return (
    <View style={[{ marginTop: spacing.xl }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.xs }}>
          <AppText variant="heading" accessibilityRole="header">
            {title}
          </AppText>
          {caption ? <AppText variant="micro">{caption}</AppText> : null}
          {action ? (
            <Pressable accessibilityRole="button" hitSlop={10} onPress={action.onPress}>
              <AppText variant="label" style={{ color: colors.brand, fontSize: 13 }}>
                {action.label}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** White grouped container, used for grouped settings lists. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.separator,
          borderRadius: 17,
          borderCurve: 'continuous',
          paddingHorizontal: 14,
          paddingVertical: spacing.xs,
          boxShadow: '0 3px 14px rgba(20, 20, 20, 0.035)',
        },
        style,
      ]}>
      {children}
    </View>
  );
}
