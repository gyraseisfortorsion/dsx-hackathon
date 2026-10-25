import { useLocalSearchParams } from 'expo-router';

import { StudyMatchScreen } from '@/screens/study';

export default function StudyMatchRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <StudyMatchScreen key={id} id={id} />;
}
