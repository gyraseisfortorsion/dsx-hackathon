import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/app-text';
import { Avatar } from '@/components/content';
import { Icon, type IconName } from '@/components/icon';
import { useProfileDisplay } from '@/api/use-profile';
import { goToTab } from '@/navigation/routes';
import { colors, radius, spacing } from '@/theme';

const DRAWER_RATIO = 0.84;
const OPEN_MS = 280;
const CLOSE_MS = 200;
const SWIPE_CLOSE_DISTANCE = 55;

type MenuItem = { label: string; href: Href; icon?: IconName };

const settingsHref = (id: string): Href => ({ pathname: '/settings/[id]', params: { id } });

const groups: { title: string; items: MenuItem[] }[] = [
  {
    title: 'MY BU',
    items: [
      { label: 'Dining & Campus Wallet', href: '/dining' },
      { label: 'Housing', href: '/housing' },
      { label: 'Work & Pay', href: '/work' },
      { label: 'Academics', href: '/academic' },
      { label: 'Attendance', href: '/attendance' },
      { label: 'Grades', href: '/grades', icon: 'lock' },
      { label: 'Clubs & Organizations', href: '/clubs' },
      { label: 'Study peers', href: '/study' },
      { label: 'Marketplace', href: '/marketplace' },
    ],
  },
  {
    title: 'CAMPUS',
    items: [
      { label: 'Peer messages', href: '/inbox' },
      { label: 'Where to ask', href: '/requests' },
      { label: 'Map & Transit', href: settingsHref('map-transit') },
      { label: 'Campus Resources', href: settingsHref('campus-resources') },
      { label: 'Safety & Emergency', href: settingsHref('safety-emergency') },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { label: 'Data Connections', href: settingsHref('data-connections') },
      { label: 'Notifications', href: settingsHref('notifications') },
      { label: 'Accessibility', href: settingsHref('accessibility') },
      { label: 'Privacy', href: settingsHref('privacy') },
      { label: 'Community tools', href: '/community/tools' },
      { label: 'Help & Feedback', href: settingsHref('help-feedback') },
    ],
  },
];

/** Left-edge utility drawer, presented as a transparent modal route. */
export function MenuScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { name, initials, subtitle } = useProfileDisplay();
  const drawerWidth = Math.min(width * DRAWER_RATIO, 360);
  const offset = useSharedValue(-drawerWidth);

  useEffect(() => {
    offset.set(withTiming(0, { duration: OPEN_MS, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
  }, [offset]);

  /** Navigation to run once the drawer has animated out. */
  const pendingAction = useRef<(() => void) | null>(null);

  const finish = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    if (action) action();
    else router.back();
  };

  const close = (after?: () => void, dismissMenu = true) => {
    pendingAction.current = () => {
      if (dismissMenu) router.back();
      after?.();
    };
    offset.set(withTiming(-drawerWidth, { duration: CLOSE_MS }, (finished) => {
      if (finished) scheduleOnRN(finish);
    }));
  };

  const pan = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    onUpdate: (event) => {
      'worklet';
      offset.set(Math.min(0, event.translationX));
    },
    onDeactivate: (event) => {
      'worklet';
      if (event.translationX < -SWIPE_CLOSE_DISTANCE || event.velocityX < -500) {
        offset.set(withTiming(-drawerWidth, { duration: CLOSE_MS }, (finished) => {
          if (finished) scheduleOnRN(finish);
        }));
      } else {
        offset.set(withTiming(0, { duration: CLOSE_MS }));
      }
    },
  });

  const drawerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: 1 + offset.get() / drawerWidth }));

  const navigate = (href: Href) => close(() => router.push(href));

  return (
    <View style={{ flex: 1 }} accessibilityViewIsModal>
      <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: colors.scrim }, backdropStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close BU One menu" style={{ flex: 1 }} onPress={() => close()} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityLabel="BU One menu"
          style={[
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: drawerWidth,
              backgroundColor: colors.surfaceSheet,
              borderTopRightRadius: radius.xl + 8,
              borderBottomRightRadius: radius.xl + 8,
              boxShadow: '12px 0 38px rgba(20, 20, 22, 0.2)',
            },
            drawerStyle,
          ]}>
          <ScrollView
            contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.screen, paddingHorizontal: spacing.lg }}
            showsVerticalScrollIndicator={false}>
            <View style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText style={{ fontSize: 19, fontWeight: '700', letterSpacing: -0.3, color: colors.ink }} accessibilityRole="header">
                BU One
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="Close BU One menu" hitSlop={8} onPress={() => close()} style={{ minHeight: 44, justifyContent: 'center' }}>
                <AppText variant="headline" style={{ color: colors.brand }}>
                  Close
                </AppText>
              </Pressable>
            </View>

            <View style={{ minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: '#dedcd8', marginBottom: 10 }}>
              <Avatar initials={initials} size={46} tone="dark" />
              <View style={{ flex: 1 }}>
                <AppText variant="headline">{name}</AppText>
                <AppText variant="caption">{subtitle}</AppText>
                <Pressable accessibilityRole="button" onPress={() => close(() => goToTab('me'), false)} style={{ minHeight: 32, justifyContent: 'center' }}>
                  <AppText variant="caption" style={{ color: colors.brand, fontWeight: '700' }}>
                    View profile
                  </AppText>
                </Pressable>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => navigate('/ask')}
              style={({ pressed }) => ({
                minHeight: 50,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 9,
                paddingHorizontal: 13,
                marginTop: spacing.sm,
                marginBottom: spacing.screen,
                borderRadius: radius.lg,
                borderCurve: 'continuous',
                backgroundColor: colors.brand,
                opacity: pressed ? 0.85 : 1,
              })}>
              <Icon name="spark" size={18} color={colors.onDark} />
              <AppText variant="headline" style={{ flex: 1, color: colors.onDark }}>
                Ask BU One
              </AppText>
              <Icon name="chevron" size={17} color={colors.onDark} />
            </Pressable>

            {groups.map((group) => (
              <View key={group.title} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, marginBottom: 14 }}>
                <AppText variant="eyebrow" style={{ fontSize: 9, paddingTop: 9, paddingBottom: 3 }}>
                  {group.title}
                </AppText>
                {group.items.map((item, index) => (
                  <Pressable
                    key={item.label}
                    accessibilityRole="button"
                    onPress={() => navigate(item.href)}
                    style={({ pressed }) => ({
                      minHeight: 49,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: '#e3e1dd',
                      opacity: pressed ? 0.6 : 1,
                    })}>
                    <AppText style={{ fontSize: 14, color: colors.ink }}>{item.label}</AppText>
                    <Icon name={item.icon ?? 'chevron'} size={item.icon ? 16 : 17} color={colors.subtle} />
                  </Pressable>
                ))}
              </View>
            ))}

            <AppText variant="micro" style={{ textAlign: 'center', fontWeight: '400' }}>
              BU One demo · Student data from the BU Student Prototype API
            </AppText>
          </ScrollView>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
