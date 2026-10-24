import { useLocalSearchParams } from 'expo-router';

import { AgendaDetailScreen } from '@/screens/agenda';

export default function AgendaDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AgendaDetailScreen key={id} id={id} />;
}
