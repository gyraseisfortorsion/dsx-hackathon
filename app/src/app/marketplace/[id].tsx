import { useLocalSearchParams } from 'expo-router';

import { ListingScreen } from '@/screens/marketplace';

export default function ListingRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ListingScreen key={id} id={id} />;
}
