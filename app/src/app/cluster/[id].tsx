import { useLocalSearchParams } from 'expo-router';

import { ClusterEventsScreen } from '@/screens/events';

export default function ClusterRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClusterEventsScreen key={id} id={id} />;
}
