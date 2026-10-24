import { Stack } from 'expo-router';

import { tabRootOptions } from '@/navigation/screen-options';

export default function EventsLayout() {
  return (
    <Stack screenOptions={tabRootOptions}>
      <Stack.Screen name="events" options={{ title: 'Events' }} />
    </Stack>
  );
}
