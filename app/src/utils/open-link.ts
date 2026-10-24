import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking } from 'react-native';

/** Opens `tel:` links with the dialer and web links in an in-app browser. */
export async function openLink(href: string) {
  try {
    if (href.startsWith('tel:')) {
      await Linking.openURL(href);
      return;
    }
    await WebBrowser.openBrowserAsync(href);
  } catch {
    Alert.alert('Can’t open link', href.startsWith('tel:') ? 'Calling isn’t available on this device.' : href);
  }
}
