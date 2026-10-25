import { useLocalSearchParams } from 'expo-router';
import { SyllabusUploadScreen } from '@/screens/academic/syllabi';

export default function Route() {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  return <SyllabusUploadScreen key={courseId} courseId={courseId} />;
}
