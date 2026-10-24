import { useLocalSearchParams } from 'expo-router';

import { AssistantScreen } from '@/screens/assistant';

export default function AskRoute() {
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  return <AssistantScreen initialPrompt={prompt} />;
}
