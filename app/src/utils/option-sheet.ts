import { ActionSheetIOS, Alert } from 'react-native';

/** Native option picker: action sheet on iOS, dialog on Android (max three options). */
export function showOptionSheet(title: string, options: string[], onSelect: (option: string) => void) {
  if (process.env.EXPO_OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...options, 'Cancel'], cancelButtonIndex: options.length },
      (index) => {
        if (index < options.length) onSelect(options[index]);
      },
    );
    return;
  }
  Alert.alert(
    title,
    undefined,
    options.slice(0, 3).map((option) => ({ text: option, onPress: () => onSelect(option) })),
    { cancelable: true },
  );
}
