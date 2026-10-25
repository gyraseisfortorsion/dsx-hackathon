import { useLocalSearchParams } from 'expo-router';
import { GradeScenarioScreen } from '@/screens/academic/grades';

export default function Route() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  return <GradeScenarioScreen key={courseId} courseId={courseId} />;
}
