import { useLocalSearchParams } from 'expo-router';
import { AcademicPassageScreen } from '@/screens/academic/home';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AcademicPassageScreen key={id} id={id} />;
}
