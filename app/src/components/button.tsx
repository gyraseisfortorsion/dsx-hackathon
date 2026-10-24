import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

const variants = {
  primary: { backgroundColor: colors.brand, borderColor: colors.brand, color: colors.onDark },
  secondary: { backgroundColor: colors.surface, borderColor: colors.inputBorder, color: colors.ink },
  planned: { backgroundColor: colors.brandTint, borderColor: colors.brandTint, color: colors.brandDeep },
  dark: { backgroundColor: colors.inkStrong, borderColor: colors.inkStrong, color: colors.onDark },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent', color: colors.brand },
} as const;

const sizes = {
  sm: { minHeight: 44, paddingHorizontal: spacing.md },
  md: { minHeight: 48, paddingHorizontal: spacing.screen },
} as const;

export type ButtonVariant = keyof typeof variants;

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  icon?: IconName;
  disabled?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, onPress, variant = 'primary', size = 'md', icon, disabled, accessibilityHint, style }: ButtonProps) {
  const palette = variants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          ...sizes[size],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: variant === 'ghost' ? 'flex-start' : 'center',
          gap: 7,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          borderWidth: 1,
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          paddingHorizontal: variant === 'ghost' ? 0 : sizes[size].paddingHorizontal,
          opacity: disabled ? 0.6 : pressed ? 0.75 : 1,
        },
        style,
      ]}>
      {icon && <Icon name={icon} size={17} color={palette.color} />}
      <AppText variant="headline" style={{ color: palette.color, textAlign: 'center' }}>
        {title}
      </AppText>
    </Pressable>
  );
}
