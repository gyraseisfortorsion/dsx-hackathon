import type { ReactNode } from 'react';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

/**
 * Lifts a bottom-pinned composer above the keyboard. Must be rendered flush with the bottom of
 * the screen (pushed screens and iOS sheets both are); RN's KeyboardAvoidingView miscalculates
 * the overlap inside sheets. The composer keeps its own safe-area padding, so it's subtracted here.
 */
export function KeyboardContainer({ children }: { children: ReactNode }) {
  const { height } = useReanimatedKeyboardAnimation();
  const { bottom } = useSafeAreaInsets();
  const style = useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, -height.get() - bottom),
  }));
  return <Animated.View style={[{ flex: 1, backgroundColor: colors.background }, style]}>{children}</Animated.View>;
}
