import { useLocalSearchParams } from 'expo-router';

import { GradeDetailScreen } from '@/screens/academics';

export default function GradeDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GradeDetailScreen key={id} id={id} />;
}
