import { useLocalSearchParams } from 'expo-router';

import { ClubScreen } from '@/screens/club';

export default function ClubRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ClubScreen key={id} id={id} />;
}
