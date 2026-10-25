import { useLocalSearchParams } from 'expo-router';

import { TimesheetReviewScreen } from '@/screens/work';

export default function ReviewRoute() {
  const { sheet } = useLocalSearchParams<{ sheet?: string }>();
  return <TimesheetReviewScreen sheetId={sheet} />;
}
