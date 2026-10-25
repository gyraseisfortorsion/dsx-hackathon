import { useLocalSearchParams } from 'expo-router';
import { AcademicTaskScreen } from '@/screens/academic/assessment';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AcademicTaskScreen key={id} id={id} />;
}
