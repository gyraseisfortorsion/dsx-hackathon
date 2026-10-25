import { useLocalSearchParams } from 'expo-router';
import { PrerequisitesScreen } from '@/screens/academic/prerequisites';

export default function Route() {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  return <PrerequisitesScreen key={courseId} courseId={courseId} />;
}
