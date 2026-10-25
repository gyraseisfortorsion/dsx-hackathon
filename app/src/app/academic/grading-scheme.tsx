import { useLocalSearchParams } from 'expo-router';
import { GradingSchemeScreen } from '@/screens/academic/grades';

export default function Route() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  return <GradingSchemeScreen key={courseId} courseId={courseId} />;
}
