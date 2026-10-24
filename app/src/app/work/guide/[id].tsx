import { useLocalSearchParams } from 'expo-router';

import { WorkGuideScreen } from '@/screens/work';

export default function WorkGuideRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <WorkGuideScreen key={id} id={id} />;
}
