import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ChatMessage } from '@/types';
import { colors, spacing } from '@/theme';
import { showOptionSheet } from '@/utils/option-sheet';
import { AppText } from './app-text';
import { Icon } from './icon';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = !!message.fromMe;
  return (
    <View
      accessible
      accessibilityLabel={`${mine ? 'You' : message.author ?? 'Message'}: ${message.body}`}
      style={{
        maxWidth: '78%',
        alignSelf: mine ? 'flex-end' : 'flex-start',
        backgroundColor: mine ? colors.brand : colors.chip,
        borderRadius: 16,
        borderCurve: 'continuous',
        borderBottomLeftRadius: mine ? 16 : 5,
        borderBottomRightRadius: mine ? 5 : 16,
        paddingHorizontal: 13,
        paddingVertical: 11,
        gap: 3,
      }}>
      {message.author && !mine ? (
        <AppText variant="caption">
          {message.author} · {message.time}
        </AppText>
      ) : null}
      <AppText selectable style={{ fontSize: 14, lineHeight: 19, color: mine ? colors.onDark : colors.ink }}>
        {message.body}
      </AppText>
      {mine && message.time ? (
        <AppText variant="caption" style={{ color: colors.onDark, opacity: 0.8 }}>
          {message.time}
        </AppText>
      ) : null}
    </View>
  );
}

const ATTACHMENT_OPTIONS = ['Photo Library', 'Camera', 'Document'];

type ComposerProps = {
  placeholder?: string;
  onSend: (text: string) => void;
  /** Blocks sending (e.g. while a reply is pending) without discarding the draft. */
  sending?: boolean;
  attachments?: boolean;
};

export function Composer({ placeholder = 'Message', onSend, sending = false, attachments = true }: ComposerProps) {
  const [draft, setDraft] = useState('');
  const insets = useSafeAreaInsets();
  const canSend = draft.trim().length > 0 && !sending;

  const send = () => {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft('');
  };

  return (
    <View style={{ paddingHorizontal: 14, paddingTop: spacing.sm, paddingBottom: Math.max(insets.bottom, spacing.md), backgroundColor: colors.background }}>
      <View
        style={{
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          borderWidth: 1,
          borderColor: '#dad7d2',
          backgroundColor: colors.surface,
          borderRadius: 24,
          paddingLeft: spacing.xs,
          paddingRight: spacing.xs,
          boxShadow: '0 5px 18px rgba(20, 20, 20, 0.08)',
        }}>
        {attachments ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add attachment"
            onPress={() => showOptionSheet('Add attachment', ATTACHMENT_OPTIONS, (option) => setDraft(`[${option} demo]`))}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={22} color={colors.ink} />
          </Pressable>
        ) : (
          <View style={{ width: spacing.sm }} />
        )}
        <TextInput
          accessibilityLabel={placeholder}
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={colors.tertiary}
          returnKeyType="send"
          submitBehavior="submit"
          onSubmitEditing={send}
          style={{ flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 10 }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={send}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.brand,
            opacity: canSend ? 1 : 0.4,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Icon name="send" size={18} color={colors.onDark} />
        </Pressable>
      </View>
    </View>
  );
}
