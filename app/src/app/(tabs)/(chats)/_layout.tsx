import { Stack } from 'expo-router';

import { tabRootOptions } from '@/navigation/screen-options';

export default function ChatsLayout() {
  return (
    <Stack screenOptions={tabRootOptions}>
      <Stack.Screen name="chats" options={{ title: 'Chats' }} />
    </Stack>
  );
}
