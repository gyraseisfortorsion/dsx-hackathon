import { useLocalSearchParams } from 'expo-router';

import { ExternalConfirmScreen } from '@/screens/settings';

export default function ExternalConfirmRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ExternalConfirmScreen key={id} id={id} />;
}
