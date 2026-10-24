import { Stack } from 'expo-router';

import { tabRootOptions } from '@/navigation/screen-options';

export default function TodayLayout() {
  return (
    <Stack screenOptions={tabRootOptions}>
      <Stack.Screen name="index" options={{ title: 'BU One' }} />
    </Stack>
  );
}
