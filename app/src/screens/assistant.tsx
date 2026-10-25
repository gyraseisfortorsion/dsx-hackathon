import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useAssistantMessages, useSendAssistantMessage } from '@/api/queries';
import type { AssistantMessage, RequestRouting } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Composer } from '@/components/chat';
import { EventCard } from '@/components/event-card';
import { IntroBlock } from '@/components/content';
import { ErrorState, LoadingState, Orb } from '@/components/feedback';
import { Icon } from '@/components/icon';
import { KeyboardContainer } from '@/components/keyboard-container';
import { ListRow } from '@/components/list-row';
import { UndoToast } from '@/components/undo-toast';
import { ASSISTANT_SUGGESTIONS } from '@/data/assistant';
import { colors, radius, spacing } from '@/theme';
import { openLink } from '@/utils/open-link';

type PendingMessage = { text: string; failed: boolean };

export function AssistantScreen({ initialPrompt }: { initialPrompt?: string }) {
  const history = useAssistantMessages();
  const send = useSendAssistantMessage();
  const [pending, setPending] = useState<PendingMessage | null>(null);
  const sentInitialPrompt = useRef(false);

  const submit = (text: string) => {
    if (send.isPending) return;
    setPending({ text, failed: false });
    send.mutate(text, {
      onSuccess: () => setPending(null),
      onError: () => setPending({ text, failed: true }),
    });
  };

  useEffect(() => {
    if (!initialPrompt || sentInitialPrompt.current) return;
    sentInitialPrompt.current = true;
    submit(initialPrompt);
    // Only the prompt the screen was opened with is auto-sent, exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const messages = history.data ?? [];
  const chatting = messages.length > 0 || pending != null;
  const showIntro = history.data !== undefined && !chatting;
  // Newest first so an inverted list opens on the latest reply instead of the first message.
  const rows = chatting ? [...messages].reverse() : messages;

  return (
    <KeyboardContainer>
      {history.data === undefined && !pending ? (
        <View style={{ flex: 1 }}>
          {history.error ? (
            <ErrorState message={errorMessage(history.error)} onRetry={() => history.refetch()} />
          ) : (
            <LoadingState label="Loading conversation…" />
          )}
        </View>
      ) : (
        <FlatList
          inverted={chatting}
          data={rows}
          keyExtractor={(message) => message.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ padding: spacing.screen, gap: spacing.md, flexGrow: 1 }}
          maintainVisibleContentPosition={chatting ? { minIndexForVisible: 0, autoscrollToTopThreshold: 80 } : undefined}
          ListHeaderComponent={
            chatting ? (
              pending ? <PendingBlock pending={pending} error={send.error} onRetry={() => submit(pending.text)} onDiscard={() => setPending(null)} /> : undefined
            ) : showIntro ? (
              <AssistantIntro onSelect={submit} />
            ) : undefined
          }
          renderItem={({ item }) => <AssistantBubble message={item} />}
        />
      )}
      <Composer placeholder="Ask about BU…" onSend={submit} sending={send.isPending} attachments={false} />
      <UndoToast bottomOffset={64} />
    </KeyboardContainer>
  );
}

function PendingBlock({
  pending,
  error,
  onRetry,
  onDiscard,
}: {
  pending: PendingMessage;
  error: unknown;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <View style={{ gap: spacing.md }}>
      <AssistantBubble message={{ id: 'pending', role: 'user', content: pending.text, created_at: '' }} />
      {pending.failed ? <SendFailure message={errorMessage(error)} onRetry={onRetry} onDiscard={onDiscard} /> : <TypingIndicator />}
    </View>
  );
}

function AssistantIntro({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <View>
      <Orb icon="spark" />
      <IntroBlock title="What can I help with?" copy="I can answer from your schedule, meal plan, courses, and grades, find campus events, and point you to BU sources." centered bordered={false} />
      <AppText variant="eyebrow" style={{ fontSize: 10, marginTop: spacing.xl, marginBottom: 7 }}>
        TRY ASKING
      </AppText>
      {ASSISTANT_SUGGESTIONS.map((suggestion) => (
        <ListRow key={suggestion} title={suggestion} titleStyle={{ fontWeight: '400', fontSize: 14 }} minHeight={48} onPress={() => onSelect(suggestion)} />
      ))}
    </View>
  );
}

/** Renders `**bold**` spans, the only markdown the assistant commonly uses inline. */
function RichText({ text, color }: { text: string; color: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <AppText selectable style={{ fontSize: 15, lineHeight: 21, color }}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <AppText key={index} style={{ fontSize: 15, lineHeight: 21, color, fontWeight: '700' }}>
            {part}
          </AppText>
        ) : (
          part.replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*]\s+/gm, '• ')
        ),
      )}
    </AppText>
  );
}

function AssistantBubble({ message }: { message: AssistantMessage }) {
  const mine = message.role === 'user';
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'stretch', maxWidth: mine ? '82%' : '100%', gap: spacing.sm }}>
      <View
        accessible
        accessibilityLabel={`${mine ? 'You' : 'BU One'}: ${message.content.replace(/\*\*/g, '')}`}
        style={
          mine
            ? { backgroundColor: colors.brand, borderRadius: 18, borderBottomRightRadius: 5, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 10 }
            : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.separator, borderRadius: radius.xl, borderCurve: 'continuous', padding: spacing.lg }
        }>
        <RichText text={message.content} color={mine ? colors.onDark : colors.ink} />
      </View>
      {!mine && message.routing ? <RoutingCard routing={message.routing} /> : null}
      {!mine && message.sources?.length ? (
        <View style={{ gap: 2, paddingHorizontal: spacing.xs }}>
          <AppText variant="eyebrow" style={{ fontSize: 9 }}>
            SOURCES
          </AppText>
          {message.sources.map((source) => (
            <Pressable
              key={source.url}
              accessibilityRole="link"
              accessibilityHint="Opens the source in a browser"
              onPress={() => openLink(source.url)}
              style={({ pressed }) => ({ minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
              <Icon name="external" size={13} color={colors.brand} />
              <AppText variant="caption" numberOfLines={1} style={{ flex: 1, color: colors.brand, fontWeight: '600' }}>
                {source.title}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {!mine && message.event_cards?.length ? (
        <View style={{ gap: spacing.sm }}>
          {message.event_cards.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TypingIndicator() {
  return (
    <View
      accessibilityLabel="BU One is thinking"
      accessibilityLiveRegion="polite"
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.chip, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 }}>
      <Icon name="spark" size={14} color={colors.brand} />
      <AppText variant="caption">Thinking…</AppText>
    </View>
  );
}

function SendFailure({ message, onRetry, onDiscard }: { message: string; onRetry: () => void; onDiscard: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ alignSelf: 'flex-end', alignItems: 'flex-end', gap: 2 }}>
      <AppText variant="caption" style={{ color: colors.errorText }}>
        Not sent. {message}
      </AppText>
      <AppText variant="caption">You can still browse, search, and save events in the Events tab.</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.lg }}>
        <Pressable accessibilityRole="button" onPress={onDiscard} hitSlop={8} style={{ minHeight: 36, justifyContent: 'center' }}>
          <AppText variant="label" style={{ color: colors.subtle, fontSize: 13 }}>
            Discard
          </AppText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8} style={{ minHeight: 36, justifyContent: 'center' }}>
          <AppText variant="label" style={{ color: colors.brand, fontSize: 13 }}>
            Retry
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function RoutingCard({ routing }: { routing: RequestRouting }) {
  const departments = routing.department
    ? [routing.department]
    : routing.handling === 'multiple_routes'
      ? routing.candidates.map((candidate) => candidate.department)
      : [];
  const title = routing.handling === 'urgent_bypass'
    ? 'Get urgent help'
    : routing.handling === 'route'
      ? 'Suggested office'
      : routing.handling === 'multiple_routes'
        ? 'More than one office can help'
        : 'More detail needed';
  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.separator, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm }}>
      <AppText variant="label">{title}</AppText>
      <AppText>{routing.message}</AppText>
      {departments.map((department) => (
        <View key={department.id} style={{ gap: spacing.xs }}>
          <AppText variant="label">{department.name}</AppText>
          <AppText variant="caption">{department.handles}</AppText>
          <AppText variant="caption">{department.boundaries}</AppText>
          {department.official_source_urls.slice(0, 1).map((url) => (
            <Pressable key={url} accessibilityRole="link" onPress={() => openLink(url)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText style={{ color: colors.brand }}>Official contact and intake</AppText>
            </Pressable>
          ))}
        </View>
      ))}
      {routing.handling === 'urgent_bypass' ? (
        <Pressable accessibilityRole="link" onPress={() => openLink('https://www.bu.edu/emergency/')} style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText style={{ color: colors.brand }}>BU emergency guidance</AppText>
        </Pressable>
      ) : null}
      <AppText variant="caption">Prototype suggestion · No request submitted</AppText>
    </View>
  );
}
