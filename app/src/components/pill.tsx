import { Pressable, ScrollView, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { tapFeedback } from '@/utils/haptics';
import { AppText } from './app-text';

type PillProps = { label: string; active?: boolean; onPress?: () => void };

export function Pill({ label, active, onPress }: PillProps) {
  const content = (pressed = false) => (
    <View
      style={{
        minHeight: 38,
        paddingHorizontal: 14,
        justifyContent: 'center',
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: active ? colors.inkStrong : colors.border,
        backgroundColor: active ? colors.inkStrong : colors.surface,
        opacity: pressed ? 0.75 : 1,
      }}>
      <AppText variant="label" style={{ fontSize: 13, color: active ? colors.onDark : colors.ink }}>
        {label}
      </AppText>
    </View>
  );

  if (!onPress) return content();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      hitSlop={{ top: 3, bottom: 3 }}
      onPress={() => {
        tapFeedback();
        onPress();
      }}>
      {({ pressed }) => content(pressed)}
    </Pressable>
  );
}

type PillGroupProps<T extends string> = {
  options: readonly T[];
  value?: T;
  onChange?: (value: T) => void;
  /** Wrap onto multiple lines instead of scrolling horizontally. */
  wrap?: boolean;
};

export function PillGroup<T extends string>({ options, value, onChange, wrap }: PillGroupProps<T>) {
  const pills = options.map((option) => (
    <Pill key={option} label={option} active={value === option} onPress={onChange ? () => onChange(option) : undefined} />
  ));

  if (wrap) {
    return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{pills}</View>;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -spacing.screen, flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: spacing.screen, gap: spacing.sm }}>
      {pills}
    </ScrollView>
  );
}
