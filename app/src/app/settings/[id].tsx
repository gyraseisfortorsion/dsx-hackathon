import { useLocalSearchParams } from 'expo-router';

import { SettingsDetailScreen } from '@/screens/settings';

export default function SettingsDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SettingsDetailScreen key={id} id={id} />;
}
