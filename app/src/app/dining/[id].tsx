import { useLocalSearchParams } from 'expo-router';

import { TransactionScreen } from '@/screens/dining';

export default function TransactionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TransactionScreen key={id} id={id} />;
}
