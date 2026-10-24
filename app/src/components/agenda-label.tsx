import { View } from 'react-native';

import type { AgendaKind } from '@/types';
import { colors } from '@/theme';
import { AppText } from './app-text';

const tones: Record<AgendaKind, { border: string; text: string }> = {
  class: colors.agenda.class,
  travel: colors.agenda.travel,
  dining: colors.agenda.dining,
  deadline: colors.agenda.deadline,
  event: colors.agenda.event,
  academic: colors.agenda.academic,
  check: colors.agenda.travel,
};

export function AgendaLabel({ kind, label }: { kind: AgendaKind; label: string }) {
  const tone = tones[kind];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderStyle: kind === 'travel' ? 'dashed' : 'solid',
        borderColor: tone.border,
        borderRadius: 5,
        paddingHorizontal: 5,
        paddingVertical: 2,
        marginBottom: 5,
      }}>
      <AppText style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.3, color: tone.text, textTransform: 'uppercase' }}>{label}</AppText>
    </View>
  );
}
