import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Pressable, View } from 'react-native';

import { colors, radius } from '@/theme';
import { fromMinutes, toMinutes } from '@/utils/shift';
import { AppText } from './app-text';

const toDate = (value: string) => {
  const minutes = toMinutes(value);
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
};

const toValue = (date: Date) => fromMinutes(date.getHours() * 60 + date.getMinutes());

const display = (value: string) => toDate(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Native time picker: inline compact control on iOS, system dialog on Android. */
export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <AppText variant="caption" style={{ color: colors.label, fontWeight: '600' }}>
        {label}
      </AppText>
      {process.env.EXPO_OS === 'ios' ? (
        <View style={{ minHeight: 46, alignItems: 'flex-start', justifyContent: 'center' }}>
          <DateTimePicker
            accessibilityLabel={label}
            value={toDate(value)}
            mode="time"
            display="compact"
            minuteInterval={5}
            accentColor={colors.brand}
            onValueChange={(_, date) => onChange(toValue(date))}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${display(value)}`}
          onPress={() =>
            DateTimePickerAndroid.open({
              value: toDate(value),
              mode: 'time',
              onValueChange: (_, date) => onChange(toValue(date)),
            })
          }
          style={{
            minHeight: 46,
            justifyContent: 'center',
            paddingHorizontal: 11,
            borderWidth: 1,
            borderColor: colors.inputBorder,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
          }}>
          <AppText variant="headline" style={{ fontWeight: '500' }}>
            {display(value)}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
