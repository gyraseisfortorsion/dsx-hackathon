import type { ReactNode } from 'react';
import { Pressable, Switch, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { AppText } from './app-text';
import { Icon } from './icon';
import { PillGroup } from './pill';

function FieldLabel({ children }: { children: string }) {
  return (
    <AppText variant="caption" style={{ color: colors.label, fontWeight: '600' }}>
      {children}
    </AppText>
  );
}

type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  invalid?: boolean;
  showCount?: boolean;
};

export function TextField({ label, invalid, showCount, multiline, maxLength, value, ...props }: TextFieldProps) {
  return (
    <View style={{ gap: 6, marginBottom: 14 }}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        accessibilityLabel={label}
        aria-invalid={invalid}
        placeholderTextColor={colors.tertiary}
        multiline={multiline}
        maxLength={maxLength}
        value={value}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={{
          minHeight: multiline ? 94 : 46,
          borderWidth: 1,
          borderColor: invalid ? colors.brand : colors.inputBorder,
          borderRadius: radius.md,
          borderCurve: 'continuous',
          backgroundColor: colors.surface,
          paddingHorizontal: 11,
          paddingVertical: 11,
          fontSize: 15,
          color: colors.ink,
        }}
        {...props}
      />
      {showCount && maxLength ? (
        <AppText variant="caption" style={{ alignSelf: 'flex-end', fontVariant: ['tabular-nums'] }}>
          {value?.length ?? 0} / {maxLength}
        </AppText>
      ) : null}
    </View>
  );
}

export function ChoiceField<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (value: T) => void }) {
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.lg }} accessibilityLabel={label}>
      <FieldLabel>{label}</FieldLabel>
      <PillGroup options={options} value={value} onChange={onChange} wrap />
    </View>
  );
}

export function ToggleRow({ label, subtitle, value, onValueChange }: { label: string; subtitle?: string; value: boolean; onValueChange: (value: boolean) => void }) {
  return (
    <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.separator, paddingVertical: spacing.xs }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="headline" style={{ fontWeight: '500' }}>
          {label}
        </AppText>
        {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.brand, false: colors.chip }}
        ios_backgroundColor={colors.chip}
      />
    </View>
  );
}

export function CheckboxRow({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, marginBottom: spacing.sm }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          borderCurve: 'continuous',
          borderWidth: 1.5,
          borderColor: checked ? colors.brand : colors.inputBorder,
          backgroundColor: checked ? colors.brand : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {checked && <Icon name="check" size={16} color={colors.onDark} />}
      </View>
      <AppText variant="callout" style={{ flex: 1, color: colors.label }}>
        {children}
      </AppText>
    </Pressable>
  );
}
