import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePreferencesStore } from '@/stores/preferences-store';
import { colors, radius, shadows } from '@/theme';
import { AppText } from './app-text';

/** One-time coach mark pointing at the header avatar that opens the menu. */
export function MenuHint() {
  const visible = usePreferencesStore((state) => state.menuHintVisible);
  const dismiss = usePreferencesStore((state) => state.dismissMenuHint);
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.delay(400).duration(200)}
      exiting={FadeOut.duration(150)}
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        top: insets.top + 54,
        left: 14,
        width: 220,
        minHeight: 56,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        backgroundColor: colors.inkStrong,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 12,
        paddingRight: 4,
        paddingVertical: 6,
        boxShadow: shadows.overlay,
      }}>
      <View
        style={{ position: 'absolute', left: 15, top: -6, width: 14, height: 14, backgroundColor: colors.inkStrong, transform: [{ rotate: '45deg' }] }}
      />
      <AppText style={{ flex: 1, fontSize: 12, lineHeight: 16, color: colors.onDark }}>BU tools and settings live here.</AppText>
      <Pressable accessibilityRole="button" onPress={dismiss} style={{ minWidth: 52, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <AppText style={{ fontSize: 12, fontWeight: '700', color: colors.brandOnDark }}>Got it</AppText>
      </Pressable>
    </Animated.View>
  );
}
