import { useLocalSearchParams } from 'expo-router';

import { ShiftFormScreen } from '@/screens/shift-form';

export default function ShiftRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <ShiftFormScreen shiftId={id} />;
}
