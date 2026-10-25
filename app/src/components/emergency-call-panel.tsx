import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { emergencyCalls } from '@/data/services';
import { colors, spacing } from '@/theme';
import { openLink } from '@/utils/open-link';
import { AppText } from './app-text';

/** Red-outlined call-first panel with BU emergency numbers. */
export function EmergencyCallPanel({
  title,
  copy,
  children,
  calls = emergencyCalls,
}: {
  title?: string;
  copy?: string;
  children?: ReactNode;
  calls?: { label: string; href: string }[];
}) {
  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.brand, borderRadius: spacing.lg, borderCurve: 'continuous', padding: 14, marginVertical: spacing.lg }}>
      {title ? <AppText variant="heading">{title}</AppText> : null}
      {copy ? (
        <AppText variant="callout" style={{ marginTop: 5, marginBottom: spacing.sm }}>
          {copy}
        </AppText>
      ) : null}
      {calls.map((call, index) => (
        <Pressable
          key={call.label}
          accessibilityRole="link"
          accessibilityHint="Calls this number"
          onPress={() => openLink(call.href)}
          style={({ pressed }) => ({
            minHeight: 48,
            justifyContent: 'center',
            borderTopWidth: index === 0 && !title ? 0 : 1,
            borderTopColor: colors.separator,
            opacity: pressed ? 0.6 : 1,
          })}>
          <AppText variant="headline" style={{ color: colors.brand }}>
            {call.label}
          </AppText>
        </Pressable>
      ))}
      {children}
    </View>
  );
}
