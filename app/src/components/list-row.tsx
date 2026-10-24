import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

type ListRowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  valueStyle?: StyleProp<TextStyle>;
  titleStyle?: StyleProp<TextStyle>;
  leading?: ReactNode;
  /** Trailing accessory. Defaults to a chevron when the row is pressable. */
  accessory?: IconName | 'none';
  accessoryColor?: string;
  onPress?: () => void;
  separator?: boolean;
  minHeight?: number;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function ListRow({
  title,
  subtitle,
  value,
  valueStyle,
  titleStyle,
  leading,
  accessory,
  accessoryColor = colors.tertiary,
  onPress,
  separator = true,
  minHeight = 60,
  accessibilityHint,
  style,
}: ListRowProps) {
  const trailingIcon = accessory ?? (onPress ? 'chevron' : 'none');

  const body = (pressed: boolean) => (
    <View
      style={[
        {
          minHeight,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          paddingVertical: spacing.sm,
          borderBottomWidth: separator ? 1 : 0,
          borderBottomColor: colors.separator,
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="headline" style={[{ fontWeight: '600' }, titleStyle]}>
          {title}
        </AppText>
        {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
      </View>
      {value ? (
        <AppText variant="headline" selectable style={[{ fontVariant: ['tabular-nums'] }, valueStyle]}>
          {value}
        </AppText>
      ) : null}
      {trailingIcon !== 'none' && <Icon name={trailingIcon} size={17} color={accessoryColor} />}
    </View>
  );

  if (!onPress) return body(false);
  return (
    <Pressable accessibilityRole="button" accessibilityHint={accessibilityHint} onPress={onPress}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}
