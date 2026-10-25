import { Pressable, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText } from './app-text';

export type TimelineEntry = {
  key: string;
  time: string;
  title: string;
  subtitle: string;
  highlight?: boolean;
  note?: string;
  onPress?: () => void;
};

/** Vertical rail with time stamps, used for "Up next" and day plans. */
export function Timeline({ entries, spacious }: { entries: TimelineEntry[]; spacious?: boolean }) {
  return (
    <View style={{ marginLeft: 50, borderLeftWidth: spacious ? 2 : 1, borderLeftColor: '#d9d7d2' }}>
      {entries.map((entry) => {
        const title = (
          <AppText variant="headline" style={{ fontSize: 14, color: entry.onPress || entry.highlight ? colors.brand : colors.ink }}>
            {entry.title}
          </AppText>
        );
        return (
          <View key={entry.key} style={{ minHeight: spacious ? 71 : 60, paddingLeft: spacing.md, paddingBottom: spacing.sm, position: 'relative' }}>
            <AppText
              variant="caption"
              style={{ position: 'absolute', left: -58, width: 46, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
              {entry.time}
            </AppText>
            <View
              style={{
                position: 'absolute',
                left: spacious ? -7 : -6,
                top: 3,
                width: 11,
                height: 11,
                borderRadius: 6,
                borderWidth: spacious ? 3 : 2,
                borderColor: spacious ? colors.background : '#98989f',
                backgroundColor: entry.highlight ? colors.brand : spacious ? colors.tertiary : colors.background,
              }}
            />
            {entry.onPress ? (
              <Pressable
                accessibilityRole="link"
                accessibilityHint="Opens the course page"
                onPress={entry.onPress}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, gap: 2 })}>
                {title}
                {entry.subtitle ? <AppText variant="caption">{entry.subtitle}</AppText> : null}
              </Pressable>
            ) : (
              <>
                {title}
                {entry.subtitle ? <AppText variant="caption">{entry.subtitle}</AppText> : null}
              </>
            )}
            {entry.note ? (
              <AppText variant="caption" style={{ marginTop: 2, color: colors.muted }}>
                {entry.note}
              </AppText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
