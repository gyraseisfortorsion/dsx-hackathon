import { useLocalSearchParams } from 'expo-router';

import { ConversationScreen } from '@/screens/community';

export default function ConversationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConversationScreen key={id} id={id} />;
}
