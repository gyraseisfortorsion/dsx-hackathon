import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useProfileDisplay } from '@/api/use-profile';
import { openAsk } from '@/navigation/routes';
import { usePatchSettings } from '@/api/services';
import { colors } from '@/theme';
import { AppText } from './app-text';
import { Icon } from './icon';

const isIOS = process.env.EXPO_OS === 'ios';

export function AskButton() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ask BU One"
      onPress={() => openAsk()}
      hitSlop={6}
      style={({ pressed }) => ({
        height: 36,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: isIOS ? 8 : 12,
        borderRadius: 18,
        // iOS 26 wraps header items in a glass capsule; Android needs its own.
        borderWidth: isIOS ? 0 : 1,
        borderColor: colors.border,
        backgroundColor: isIOS ? 'transparent' : colors.surface,
        opacity: pressed ? 0.6 : 1,
      })}>
      <Icon name="spark" size={16} color={colors.brand} />
      <AppText variant="label" style={{ color: colors.brand, fontSize: 13, fontWeight: '700' }}>
        Ask BU One
      </AppText>
    </Pressable>
  );
}

export function HeaderTextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ paddingHorizontal: 6, opacity: pressed ? 0.6 : 1 })}>
      <AppText variant="label" style={{ color: colors.brand, fontWeight: '600' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function MenuAvatarButton() {
  const dismissMenuHint = usePatchSettings();
  const { initials } = useProfileDisplay();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open BU One menu"
      hitSlop={6}
      onPress={() => {
        dismissMenuHint.mutate({ menu_hint_visible: false });
        router.push('/menu');
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.inkStrong, alignItems: 'center', justifyContent: 'center' }}>
        <AppText style={{ color: colors.onDark, fontSize: 11, fontWeight: '800' }}>{initials}</AppText>
        <View
          style={{
            position: 'absolute',
            right: -2,
            bottom: -1,
            width: 15,
            height: 15,
            borderRadius: 8,
            borderWidth: 2,
            borderColor: colors.background,
            backgroundColor: '#68686f',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="menu" size={9} color={colors.onDark} />
        </View>
      </View>
    </Pressable>
  );
}
