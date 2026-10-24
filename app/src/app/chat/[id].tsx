import { useLocalSearchParams } from 'expo-router';

import { ChatThreadScreen } from '@/screens/chats';

export default function ChatThreadRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatThreadScreen key={id} id={id} />;
}
