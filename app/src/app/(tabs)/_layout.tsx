import { router } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { useEffect } from 'react';
import { View } from 'react-native';

import { isEmptyPreferences, usePreferences } from '@/api/events';
import { MenuHint } from '@/components/menu-hint';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useCurrentUser } from '@/stores/session-store';
import { colors } from '@/theme';

/** Offers event onboarding once per student on this device, only while their preferences are empty. */
function useOnboardingPrompt() {
  const user = useCurrentUser();
  const preferences = usePreferences();
  const status = useOnboardingStore((state) => (user ? state.status[user] : undefined));
  const load = useOnboardingStore((state) => state.load);
  const markDone = useOnboardingStore((state) => state.markDone);
  const shouldPrompt = status === 'pending' && preferences.data !== undefined && isEmptyPreferences(preferences.data);

  useEffect(() => {
    if (user && status === undefined) void load(user);
  }, [user, status, load]);

  useEffect(() => {
    if (!user || !shouldPrompt) return;
    markDone(user);
    router.push('/onboarding');
  }, [user, shouldPrompt, markDone]);
}

export default function TabsLayout() {
  useOnboardingPrompt();
  return (
    <View style={{ flex: 1 }}>
      <NativeTabs
        tintColor={colors.brand}
        backgroundColor={colors.background}
        iconColor={{ default: '#7d7d84', selected: colors.brand }}
        labelStyle={{ default: { color: '#7d7d84' }, selected: { color: colors.brand } }}
        indicatorColor={colors.brandTint}>
        <NativeTabs.Trigger name="(today)">
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
          <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(calendar)">
          <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
          <NativeTabs.Trigger.Label>Calendar</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(events)">
          <NativeTabs.Trigger.Icon sf={{ default: 'star', selected: 'star.fill' }} md="star" />
          <NativeTabs.Trigger.Label>Events</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(chats)">
          <NativeTabs.Trigger.Icon sf={{ default: 'bubble.left', selected: 'bubble.left.fill' }} md="chat_bubble" />
          <NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(me)">
          <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} md="account_circle" />
          <NativeTabs.Trigger.Label>Me</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      <MenuHint />
    </View>
  );
}
