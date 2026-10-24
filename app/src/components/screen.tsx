import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';

type ScreenProps = {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Enables pull-to-refresh. Resolve once the refetch settles. */
  onRefresh?: () => Promise<unknown>;
};

/**
 * Standard scrolling screen body. Must be the first child of a route so native
 * headers and tab bars can adjust insets automatically.
 */
export function Screen({ children, contentStyle, onRefresh }: ScreenProps) {
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.subtle} /> : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[{ padding: spacing.screen, paddingBottom: spacing.xxl + 64 }, contentStyle]}>
      {children}
    </ScrollView>
  );
}
