import { useLocalSearchParams } from 'expo-router';
import { SyllabusReviewScreen } from '@/screens/academic/syllabi';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SyllabusReviewScreen key={id} id={id} />;
}
