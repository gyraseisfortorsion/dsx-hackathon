import { useState, type ReactNode } from 'react';
import { LayoutAnimation, Pressable, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { AppText } from './app-text';
import { Icon, type IconName } from './icon';

/** Large metric heading used on detail screens ("96%", "11:59 PM"). */
export function MetricHero({ eyebrow, value, description }: { eyebrow: string; value: string; description?: string }) {
  return (
    <View style={{ paddingTop: spacing.screen, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
      <AppText variant="eyebrow">{eyebrow}</AppText>
      <AppText variant="display" selectable style={{ marginTop: 9, marginBottom: 3, fontVariant: ['tabular-nums'] }}>
        {value}
      </AppText>
      {description ? <AppText>{description}</AppText> : null}
    </View>
  );
}

/** Eyebrow + title + copy block that opens a screen. */
export function IntroBlock({
  eyebrow,
  eyebrowColor = colors.subtle,
  title,
  copy,
  centered,
  bordered = true,
}: {
  eyebrow?: string;
  eyebrowColor?: string;
  title: string;
  copy?: string;
  centered?: boolean;
  bordered?: boolean;
}) {
  return (
    <View
      style={[
        { paddingTop: spacing.md, paddingBottom: spacing.screen, gap: spacing.xs },
        bordered && { borderBottomWidth: 1, borderBottomColor: colors.separator },
        centered && { alignItems: 'center' },
      ]}>
      {eyebrow ? (
        <AppText variant="eyebrow" style={{ color: eyebrowColor, marginBottom: 4 }}>
          {eyebrow}
        </AppText>
      ) : null}
      <AppText variant="largeTitle" accessibilityRole="header" style={centered && { textAlign: 'center' }}>
        {title}
      </AppText>
      {copy ? <AppText style={centered && { textAlign: 'center' }}>{copy}</AppText> : null}
    </View>
  );
}

export function DetailItem({ icon, title, subtitle }: { icon: IconName; title: string; subtitle?: string }) {
  return (
    <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
      <Icon name={icon} color={colors.brand} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="headline">{title}</AppText>
        {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
      </View>
    </View>
  );
}

/** Stacked label/value rows used for summaries and request details. */
export function KeyValueList({ items }: { items: { label: string; value: string }[] }) {
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.separator }}>
      {items.map((item) => (
        <View key={item.label} style={{ minHeight: 56, justifyContent: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.separator, gap: 2 }}>
          <AppText variant="headline">{item.label}</AppText>
          <AppText variant="caption" selectable>
            {item.value}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.separator }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen((value) => !value);
        }}
        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="headline">{title}</AppText>
        <AppText style={{ fontSize: 21, color: colors.subtle }}>{open ? '−' : '+'}</AppText>
      </Pressable>
      {open && (
        <AppText variant="callout" style={{ color: colors.inkSoft, paddingRight: spacing.xl, paddingBottom: 15 }}>
          {children}
        </AppText>
      )}
    </View>
  );
}

export function Avatar({ initials, size = 44, tone = 'muted' }: { initials: string; size?: number; tone?: 'muted' | 'dark' }) {
  const dark = tone === 'dark';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        borderCurve: 'continuous',
        backgroundColor: dark ? colors.inkStrong : colors.chip,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText style={{ fontWeight: '800', fontSize: Math.round(size * 0.33), color: dark ? colors.onDark : '#49494e' }}>{initials}</AppText>
    </View>
  );
}

export function Paragraph({ children }: { children: string }) {
  return <AppText style={{ color: colors.inkSoft, marginVertical: spacing.xl - 4 }}>{children}</AppText>;
}

/** Row with leading spark icon used for AI actions ("Explain weighting", "Run AI check"). */
export function AiActionRow({ title, subtitle, onPress, boxed }: { title: string; subtitle: string; onPress: () => void; boxed?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: pressed ? 0.7 : 1 },
        boxed
          ? { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: spacing.lg, borderCurve: 'continuous', padding: 15, boxShadow: '0 3px 12px rgba(20, 20, 20, 0.04)' }
          : { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.separator },
      ]}>
      <Icon name="spark" color={colors.brand} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="headline">{title}</AppText>
        <AppText variant="caption">{subtitle}</AppText>
      </View>
      <Icon name="chevron" size={17} color={colors.tertiary} />
    </Pressable>
  );
}
