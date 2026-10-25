import { useLocalSearchParams } from 'expo-router';
import { AcademicAssessmentScreen } from '@/screens/academic/assessment';

export default function Route() {
  const { id, courseId } = useLocalSearchParams<{ id: string; courseId: string }>();
  return <AcademicAssessmentScreen key={id} id={id} courseId={courseId} />;
}
