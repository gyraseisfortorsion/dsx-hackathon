import { useLocalSearchParams } from 'expo-router';

import { ShiftFormScreen } from '@/screens/shift-form';

export default function ShiftRoute() {
  const { id, sheet } = useLocalSearchParams<{ id?: string; sheet?: string }>();
  return <ShiftFormScreen shiftId={id} sheetId={sheet} />;
}
