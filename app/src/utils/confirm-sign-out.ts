import { Alert, Platform } from 'react-native';

import { useSessionStore } from '@/stores/session-store';

export function confirmSignOut(name: string) {
  const title = 'Sign out?';
  const message = `You’ll return to the student picker. ${name}’s local demo changes will be cleared.`;
  const signOut = () => useSessionStore.getState().signOut();

  // Alert.alert is a no-op on react-native-web.
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) signOut();
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign Out', style: 'destructive', onPress: signOut },
  ]);
}
