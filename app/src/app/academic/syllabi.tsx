import { useLocalSearchParams } from 'expo-router';
import { SyllabiScreen } from '@/screens/academic/syllabi';

export default function Route() {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  return <SyllabiScreen key={courseId} courseId={courseId} />;
}
