import * as SecureStore from 'expo-secure-store';

const isWeb = process.env.EXPO_OS === 'web';

/** Small string storage: SecureStore on device, localStorage on web. Keys may use letters, digits, ".", "-" and "_". */
export const kvStorage = {
  get: async (key: string) => (isWeb ? (globalThis.localStorage?.getItem(key) ?? null) : SecureStore.getItemAsync(key)),
  set: async (key: string, value: string) => (isWeb ? globalThis.localStorage?.setItem(key, value) : SecureStore.setItemAsync(key, value)),
  remove: async (key: string) => (isWeb ? globalThis.localStorage?.removeItem(key) : SecureStore.deleteItemAsync(key)),
};
