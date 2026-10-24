import { View } from 'react-native';

import { colors } from '@/theme';
import { AppText } from './app-text';
import { Button } from './button';
import { Icon } from './icon';

/** Lock row that hides sensitive values (grades, pay) until revealed. */
export function PrivacyToggle({
  visible,
  onToggle,
  label,
  caption,
  actionLabel,
}: {
  visible: boolean;
  onToggle: () => void;
  label: string;
  caption: string;
  actionLabel?: string;
}) {
  return (
    <View style={{ minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
      <View style={{ width: 36, height: 36, borderRadius: 11, borderCurve: 'continuous', backgroundColor: colors.inkStrong, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="lock" size={18} color={colors.onDark} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="headline">{label}</AppText>
        <AppText variant="caption">{caption}</AppText>
      </View>
      <Button size="sm" variant="ghost" title={actionLabel ?? (visible ? 'Hide' : 'Show')} onPress={onToggle} />
    </View>
  );
}
