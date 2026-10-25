import { useLocalSearchParams } from 'expo-router';
import { EditListingScreen } from '@/screens/marketplace';
export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <EditListingScreen key={id} id={id} />;
}
