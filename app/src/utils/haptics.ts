import * as Haptics from 'expo-haptics';

export function tapFeedback() {
  if (process.env.EXPO_OS === 'ios') Haptics.selectionAsync();
}

export function successFeedback() {
  if (process.env.EXPO_OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
