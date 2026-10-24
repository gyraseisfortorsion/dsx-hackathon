import { useLocalSearchParams } from 'expo-router';

import { AttendanceCourseScreen } from '@/screens/academics';

export default function AttendanceCourseRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AttendanceCourseScreen key={id} id={id} />;
}
