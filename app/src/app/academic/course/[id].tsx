import { useLocalSearchParams } from 'expo-router';
import { AcademicCourseScreen } from '@/screens/academic/course';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AcademicCourseScreen key={id} id={id} />;
}
