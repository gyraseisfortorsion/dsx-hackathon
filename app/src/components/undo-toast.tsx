import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToastStore } from '@/stores/toast-store';
import { colors, radius, shadows, spacing } from '@/theme';
import { AppText } from './app-text';

const AUTO_DISMISS_MS = 5000;

/** Global undo snackbar. `bottomOffset` lifts it above the tab bar. */
export function UndoToast({ bottomOffset = 0 }: { bottomOffset?: number }) {
  const toast = useToastStore((state) => state.toast);
  const dismiss = useToastStore((state) => state.dismiss);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  return (
    <Animated.View
      key={toast.id}
      entering={FadeInDown.duration(200)}
      exiting={FadeOutDown.duration(150)}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: spacing.lg,
        right: spacing.lg,
        bottom: insets.bottom + spacing.md + bottomOffset,
        minHeight: 50,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        backgroundColor: colors.inkStrong,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 15,
        paddingRight: 6,
        boxShadow: shadows.overlay,
      }}>
      <AppText variant="callout" style={{ flex: 1, color: colors.onDark }}>
        {toast.message}
      </AppText>
      {toast.undo && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Undo: ${toast.message}`}
          onPress={() => {
            toast.undo?.();
            dismiss();
          }}
          style={{ minWidth: 60, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="headline" style={{ color: colors.brandOnDark }}>
            Undo
          </AppText>
        </Pressable>
      )}
    </Animated.View>
  );
}
