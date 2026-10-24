import { router, type NativeStackNavigationOptions } from 'expo-router';

import { AskButton, HeaderTextButton, MenuAvatarButton } from '@/components/header-buttons';
import { colors } from '@/theme';

export const baseHeaderOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.brand,
  headerTitleStyle: { color: colors.ink, fontWeight: '700' },
  headerBackButtonDisplayMode: 'minimal',
  contentStyle: { backgroundColor: colors.background },
};

/** Root tab screens: menu avatar on the left, Ask BU One on the right. */
export const tabRootOptions: NativeStackNavigationOptions = {
  ...baseHeaderOptions,
  headerTitleAlign: 'left',
  headerTitleStyle: { color: colors.ink, fontWeight: '700', fontSize: 20 },
  headerLeft: () => <MenuAvatarButton />,
  headerRight: () => <AskButton />,
};

/** Pushed detail screens that offer the assistant shortcut. */
export const detailWithAskOptions: NativeStackNavigationOptions = {
  ...baseHeaderOptions,
  headerRight: () => <AskButton />,
};

/** Detail screens without the assistant shortcut (sensitive or task-focused flows). */
export const detailOptions: NativeStackNavigationOptions = {
  ...baseHeaderOptions,
  headerRight: () => null,
};

/** Task modals. `headerRight` must be reset explicitly or the root stack's Ask button leaks in. */
export const modalOptions: NativeStackNavigationOptions = {
  ...baseHeaderOptions,
  presentation: 'modal',
  headerRight: () => null,
};

export const modalCancelOptions: NativeStackNavigationOptions = {
  ...modalOptions,
  headerLeft: () => <HeaderTextButton label="Cancel" onPress={() => router.back()} />,
};

export const modalDoneOptions: NativeStackNavigationOptions = {
  ...modalOptions,
  headerRight: () => <HeaderTextButton label="Done" onPress={() => router.back()} />,
};
