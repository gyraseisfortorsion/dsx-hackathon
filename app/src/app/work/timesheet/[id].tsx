import { useLocalSearchParams } from 'expo-router';

import { TimesheetScreen } from '@/screens/work';

export default function TimesheetRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TimesheetScreen key={id} id={id} />;
}
