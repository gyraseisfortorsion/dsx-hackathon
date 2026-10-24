import { useQueries } from '@tanstack/react-query';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { studentQuery } from '@/api/queries';
import { initialsOf, profileSubtitle } from '@/api/selectors';
import { DEMO_USERS, type DemoUser } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Avatar } from '@/components/content';
import { Icon } from '@/components/icon';
import { useSessionStore } from '@/stores/session-store';
import { colors, radius, shadows, spacing } from '@/theme';
import { successFeedback } from '@/utils/haptics';

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const signIn = useSessionStore((state) => state.signIn);
  // Profiles only decorate the list; signing in works even if they fail to load.
  const profiles = useQueries({ queries: DEMO_USERS.map((user) => ({ ...studentQuery(user), retry: 1 })) });

  const choose = (user: DemoUser) => {
    successFeedback();
    signIn(user);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + spacing.xl, paddingHorizontal: spacing.screen }}>
      <View style={{ width: 58, height: 58, borderRadius: 18, borderCurve: 'continuous', backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
        <AppText style={{ color: colors.onDark, fontSize: 20, fontWeight: '800', letterSpacing: -0.5 }}>BU</AppText>
      </View>
      <AppText variant="display" accessibilityRole="header" style={{ marginTop: spacing.xl }}>
        BU One
      </AppText>
      <AppText style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>Your day, classes, dining, and campus life in one place.</AppText>

      <AppText variant="eyebrow" style={{ marginBottom: spacing.sm }}>
        SIGN IN AS A DEMO STUDENT
      </AppText>
      <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, borderCurve: 'continuous', borderWidth: 1, borderColor: colors.border, boxShadow: shadows.card, overflow: 'hidden' }}>
        {DEMO_USERS.map((user, index) => {
          const profile = profiles[index].data;
          const name = profile?.full_name ?? capitalize(user);
          return (
            <Pressable
              key={user}
              accessibilityRole="button"
              accessibilityLabel={`Sign in as ${name}`}
              accessibilityHint={profile ? profile.program : undefined}
              onPress={() => choose(user)}
              style={({ pressed }) => ({
                minHeight: 72,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.separator,
                backgroundColor: pressed ? colors.surfaceMuted : 'transparent',
              })}>
              <Avatar initials={initialsOf(name)} size={42} tone="dark" />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="headline">{name}</AppText>
                <AppText variant="caption" numberOfLines={1}>
                  {profile ? profileSubtitle(profile) : `@${user}`}
                </AppText>
              </View>
              <Icon name="chevron" color={colors.tertiary} />
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.xs }}>
        <Icon name="lock" size={14} color={colors.subtle} />
        <AppText variant="caption" style={{ flex: 1 }}>
          Demo accounts, no password needed. Student data comes from the BU Student Prototype API and is not an official record.
        </AppText>
      </View>
    </ScrollView>
  );
}
