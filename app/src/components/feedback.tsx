import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { AppText } from './app-text';
import { Icon } from './icon';

/** Disclosure that the screen shows mock data, not a BU system of record. */
export function DemoBanner({ title, children, style }: { title: string; children: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      accessibilityRole="summary"
      style={[{ gap: spacing.xs, backgroundColor: colors.surfaceMuted, borderRadius: 13, borderCurve: 'continuous', padding: spacing.md, marginBottom: spacing.screen }, style]}>
      <AppText variant="caption" style={{ color: colors.brandDeep, fontWeight: '700' }}>
        {title}
      </AppText>
      <AppText variant="caption" style={{ fontSize: 11, lineHeight: 15, color: colors.muted }}>
        {children}
      </AppText>
    </View>
  );
}

type CalloutAction = { label: string; onPress: () => void };

export function Callout({ title, body, actions, children }: { title: string; body?: string; actions?: CalloutAction[]; children?: ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.xl, borderCurve: 'continuous', padding: 15, marginVertical: spacing.xl - 4, gap: spacing.xs }}>
      <AppText variant="headline">{title}</AppText>
      {body ? <AppText variant="callout">{body}</AppText> : null}
      {children}
      {actions?.map((action) => (
        <Pressable key={action.label} accessibilityRole="button" onPress={action.onPress} style={{ minHeight: 44, justifyContent: 'center' }}>
          {({ pressed }) => (
            <AppText variant="headline" style={{ color: colors.brand, opacity: pressed ? 0.6 : 1 }}>
              {action.label}
            </AppText>
          )}
        </Pressable>
      ))}
    </View>
  );
}

export function InlineError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ backgroundColor: colors.brandTint, borderRadius: radius.md, padding: spacing.md, marginVertical: spacing.md }}>
      <AppText variant="caption" selectable style={{ color: colors.errorText }}>
        {message}
      </AppText>
    </View>
  );
}

export function LoadingState({ label = 'Loading…', compact }: { label?: string; compact?: boolean }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: compact ? spacing.lg : 60 }}>
      <ActivityIndicator color={colors.subtle} />
      {!compact && <AppText variant="caption">{label}</AppText>}
    </View>
  );
}

/** Blocking error for content that has never loaded. */
export function ErrorState({ message, onRetry, compact }: { message: string; onRetry: () => void; compact?: boolean }) {
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', paddingVertical: compact ? spacing.lg : 50, paddingHorizontal: spacing.xl, gap: spacing.sm }}>
      {!compact && (
        <AppText variant="headline" style={{ textAlign: 'center' }}>
          Couldn’t load this
        </AppText>
      )}
      <AppText variant="caption" selectable style={{ textAlign: 'center' }}>
        {message}
      </AppText>
      <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
        <AppText variant="headline" style={{ color: colors.brand }}>
          Try again
        </AppText>
      </Pressable>
    </View>
  );
}

/** Nonblocking notice that a refresh failed while older data is still shown. */
export function StaleBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Retries loading the latest data"
      onPress={onRetry}
      style={({ pressed }) => ({ backgroundColor: colors.brandTint, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, opacity: pressed ? 0.7 : 1 })}>
      <AppText variant="caption" style={{ color: colors.errorText }}>
        Couldn’t refresh. Showing saved data · Tap to retry
      </AppText>
    </Pressable>
  );
}

export function EmptyState({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: 'calendar' }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 30, paddingHorizontal: 30, gap: spacing.xs }}>
      {icon && <Icon name={icon} size={25} color={colors.subtle} />}
      <AppText variant={icon ? 'headline' : 'callout'} style={{ textAlign: 'center', color: icon ? colors.ink : colors.subtle }}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="caption" style={{ textAlign: 'center' }}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: colors.successTint, borderRadius: radius.lg, marginBottom: 9, paddingHorizontal: spacing.md }}>
      <Icon name="check" size={18} color={colors.success} />
      <AppText variant="label" style={{ color: colors.success, fontSize: 13 }}>
        {message}
      </AppText>
    </View>
  );
}

export function FootNote({ children, boxed }: { children: string; boxed?: boolean }) {
  return (
    <AppText
      variant="caption"
      style={[
        { fontSize: 11, textAlign: 'center', paddingVertical: 15 },
        boxed && { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, marginTop: spacing.lg, paddingHorizontal: spacing.md, paddingVertical: 10, overflow: 'hidden' },
      ]}>
      {children}
    </AppText>
  );
}

/** Rounded dark square holding an icon, used at the top of confirmations and assistant views. */
export function Orb({ icon }: { icon: 'spark' | 'check' | 'calendar' | 'external' }) {
  return (
    <View style={{ width: 54, height: 54, borderRadius: 18, borderCurve: 'continuous', backgroundColor: colors.inkStrong, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 6, marginBottom: 17 }}>
      <Icon name={icon} size={25} color={colors.onDark} />
    </View>
  );
}
