import { Stack } from 'expo-router';

import { tabRootOptions } from '@/navigation/screen-options';

export default function MeLayout() {
  return (
    <Stack screenOptions={tabRootOptions}>
      <Stack.Screen name="me" options={{ title: 'Me' }} />
    </Stack>
  );
}
