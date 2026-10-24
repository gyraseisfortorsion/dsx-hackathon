import { useLocalSearchParams } from 'expo-router';

import { HousingRequestScreen } from '@/screens/housing';

export default function HousingRequestRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HousingRequestScreen key={id} id={id} />;
}
