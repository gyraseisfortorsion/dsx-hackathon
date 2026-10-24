import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Composer, MessageBubble } from '@/components/chat';
import { KeyboardContainer } from '@/components/keyboard-container';
import { Avatar } from '@/components/content';
import { EmptyState } from '@/components/feedback';
import { Icon } from '@/components/icon';
import { ListRow } from '@/components/list-row';
import { NotFound } from '@/components/not-found';
import { Pill, PillGroup } from '@/components/pill';
import { CHAT_FILTERS, chatThreads, type ChatFilter } from '@/data/campus';
import { usePlannerStore } from '@/stores/planner-store';
import type { ChatKind, ChatMessage, ChatThread } from '@/types';
import { colors, radius, spacing } from '@/theme';

const filterKinds: Record<ChatFilter, ChatKind[]> = {
  All: ['class', 'club', 'dm'],
  Classes: ['class'],
  Clubs: ['club'],
  DMs: ['dm'],
};

export function ChatsScreen() {
  const [filter, setFilter] = useState<ChatFilter>('All');
  const threads = chatThreads.filter((thread) => filterKinds[filter].includes(thread.kind));

  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.screen, paddingBottom: 96 }}
      data={threads}
      keyExtractor={(thread) => thread.id}
      ListHeaderComponent={
        <View style={{ gap: spacing.md, marginBottom: spacing.xs }}>
          <PillGroup options={CHAT_FILTERS} value={filter} onChange={setFilter} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#5b8a66' }} />
            <AppText variant="caption" style={{ fontSize: 11 }}>
              Synced 2 min ago · available offline
            </AppText>
          </View>
        </View>
      }
      ListFooterComponent={
        filter === 'DMs' ? <EmptyState title="That’s everything." subtitle="New direct messages will appear here." /> : undefined
      }
      renderItem={({ item }) => (
        <ListRow
          leading={<Avatar initials={item.avatar} />}
          title={item.title}
          subtitle={item.preview}
          value={item.lastActivity}
          valueStyle={{ fontSize: 10, fontWeight: '400', color: colors.tertiary }}
          minHeight={73}
          onPress={() =>
            item.opensClubId
              ? router.push({ pathname: '/club/[id]', params: { id: item.opensClubId } })
              : router.push({ pathname: '/chat/[id]', params: { id: item.id } })
          }
        />
      )}
    />
  );
}

const resolveThread = (id: string): ChatThread | undefined => chatThreads.find((thread) => thread.id === id);

const now = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function ChatThreadScreen({ id }: { id: string }) {
  const thread = resolveThread(id);
  const [sent, setSent] = useState<ChatMessage[]>([]);

  if (!thread) return <NotFound what="conversation" />;

  const messages = [...thread.messages, ...sent];

  return (
    <>
      <Stack.Screen options={{ title: thread.title }} />
      <KeyboardContainer>
        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          data={messages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={{ padding: spacing.screen, gap: 10 }}
          ListHeaderComponent={<ThreadHeader thread={thread} />}
          renderItem={({ item }) => <MessageBubble message={item} />}
        />
        <Composer
          onSend={(body) => setSent((items) => [...items, { id: `local-${items.length}`, body, fromMe: true, time: `Sent locally · demo · ${now()}` }])}
        />
      </KeyboardContainer>
    </>
  );
}

function ThreadHeader({ thread }: { thread: ChatThread }) {
  const [summary, setSummary] = useState(false);
  const [studyGroup, setStudyGroup] = useState(false);
  const deadlineExtracted = usePlannerStore((state) => state.deadlineExtracted);
  const toggleDeadline = usePlannerStore((state) => state.toggleDeadline);

  return (
    <View style={{ gap: spacing.md, marginBottom: thread.kind === 'class' ? spacing.xs : 30 }}>
      {thread.notice ? (
        <AppText variant="caption" style={{ fontSize: 11, textAlign: 'center' }}>
          {thread.notice}
        </AppText>
      ) : null}

      {thread.pinned && (
        <View style={{ flexDirection: 'row', gap: 10, padding: 14, backgroundColor: colors.surfaceMuted, borderRadius: 15, borderCurve: 'continuous' }}>
          <Icon name="pin" size={18} color={colors.brand} />
          <View style={{ flex: 1, gap: 2 }}>
            <AppText variant="caption" style={{ color: colors.brandDeep, fontWeight: '700' }}>
              {thread.pinned.label}
            </AppText>
            <AppText variant="headline">{thread.pinned.title}</AppText>
            <AppText variant="callout">{thread.pinned.body}</AppText>
          </View>
        </View>
      )}

      {thread.kind === 'class' && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Pill label={summary ? 'Hide summary' : 'Summarize'} active={summary} onPress={() => setSummary((value) => !value)} />
            <Pill label={deadlineExtracted ? 'Remove deadline' : 'Extract deadline'} active={deadlineExtracted} onPress={toggleDeadline} />
            <Pill label={studyGroup ? 'Close study group' : 'Create study group'} active={studyGroup} onPress={() => setStudyGroup((value) => !value)} />
          </View>
          {summary && (
            <ActionResult
              title="Conversation summary"
              body="Review problem 4 at Mugar’s fourth floor around 1:00 PM. Nora’s review sheet is pinned."
            />
          )}
          {studyGroup && <ActionResult title="Study group created" body="Demo group · Today at 1:00 PM · Mugar fourth floor" />}
        </>
      )}
    </View>
  );
}

function ActionResult({ title, body }: { title: string; body: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, borderCurve: 'continuous', padding: spacing.md, gap: 3 }}>
      <AppText variant="headline">{title}</AppText>
      <AppText variant="caption">{body}</AppText>
    </View>
  );
}
