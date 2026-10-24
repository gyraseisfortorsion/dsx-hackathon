import { useLocalSearchParams } from 'expo-router';

import { EventDetailScreen } from '@/screens/events';

export default function EventDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EventDetailScreen key={id} id={id} />;
}
