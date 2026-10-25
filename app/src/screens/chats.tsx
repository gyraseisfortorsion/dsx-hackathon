import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';
import { FlatList, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { combineQueries } from '@/api/combine';
import { otherParticipant, useConversations, type CommunityConversation } from '@/api/community';
import { useCourses } from '@/api/queries';
import {
  useCalendarExtras,
  useChats,
  useClubs,
  useServiceWrite,
  useThread,
  type ChatThread,
  type PlannerEvent,
  type ThreadKind,
  type ThreadMessage,
} from '@/api/services';
import { AppText } from '@/components/app-text';
import { Composer, MessageBubble } from '@/components/chat';
import { Avatar } from '@/components/content';
import { EmptyState, InlineError } from '@/components/feedback';
import { Icon } from '@/components/icon';
import { KeyboardContainer } from '@/components/keyboard-container';
import { ListRow } from '@/components/list-row';
import { Pill } from '@/components/pill';
import { QueryView } from '@/components/query-view';
import { useCurrentUser } from '@/stores/session-store';
import { showToast } from '@/stores/toast-store';
import { colors, radius, spacing } from '@/theme';
import { addDays, campusMidnight, campusToday, dateOf, formatRelativeDay, formatShortTime, formatTime, toCampusIso } from '@/utils/campus-time';

const CHAT_FILTERS = ['All', 'Classes', 'Clubs', 'Peers', 'DMs'] as const;
type ChatFilter = (typeof CHAT_FILTERS)[number];
type RowKind = ThreadKind | 'peer';

const filterKinds: Record<ChatFilter, RowKind[]> = {
  All: ['class', 'club', 'dm', 'study_group', 'peer'],
  Classes: ['class', 'study_group'],
  Clubs: ['club'],
  Peers: ['peer'],
  DMs: ['dm'],
};

type ChatRow = {
  id: string;
  kind: RowKind;
  title: string;
  subtitle: string;
  avatar: string;
  last_activity?: string | null;
  href: Href;
};

const initialsOf = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '·';

function peerRows(conversations: CommunityConversation[], user: string): ChatRow[] {
  return conversations
    .filter((item) => item.invitation_id && !item.listing_id)
    .map((item) => {
      const other = otherParticipant(item, user);
      const last = item.messages[item.messages.length - 1];
      return {
        id: item.id,
        kind: 'peer' as const,
        title: other.name,
        subtitle: last?.body ?? 'Study peer',
        avatar: initialsOf(other.name),
        last_activity: last?.created_at ?? item.created_at,
        href: { pathname: '/inbox/[id]', params: { id: item.id } },
      };
    });
}

function campusRows(threads: ChatThread[], courses: Set<string>, clubs: Set<string>): ChatRow[] {
  return threads.filter((thread) => isJoinedThread(thread, courses, clubs)).map((thread) => ({
    id: thread.id,
    kind: thread.kind,
    title: thread.title,
    subtitle: thread.preview,
    avatar: thread.avatar,
    last_activity: thread.last_activity,
    href: { pathname: '/chat/[id]', params: { id: thread.id } },
  }));
}

function activityLabel(iso: string | null | undefined, today: string) {
  if (!iso) return '';
  const campus = toCampusIso(iso);
  const day = dateOf(campus);
  if (day === today) return formatShortTime(campus);
  return formatRelativeDay(day, today);
}

function toBubble(message: ThreadMessage) {
  return {
    id: message.id,
    author: message.author,
    body: message.body,
    fromMe: message.from_me,
    time: formatTime(toCampusIso(message.created_at)),
  };
}

const emptyCopy: Record<ChatFilter, { title: string; subtitle: string }> = {
  All: { title: 'No chats yet', subtitle: 'Class, club, and study-peer conversations appear after you enroll, join, or accept an invite.' },
  Classes: { title: 'No class chats', subtitle: 'Chats for your enrolled courses will appear here.' },
  Clubs: { title: 'No club chats', subtitle: 'Join a club to start a conversation.' },
  Peers: { title: 'No study peers yet', subtitle: 'Accept a study invite and the conversation will show up here.' },
  DMs: { title: 'No direct messages', subtitle: 'New direct messages will appear here.' },
};

function isJoinedThread(thread: ChatThread, courses: Set<string>, clubs: Set<string>) {
  if (thread.kind === 'class') return !!thread.course_id && courses.has(thread.course_id);
  if (thread.kind === 'club') return !!thread.club_id && clubs.has(thread.club_id);
  if (thread.kind === 'study_group') return !thread.course_id || courses.has(thread.course_id);
  return true;
}

export function ChatsScreen() {
  const [filter, setFilter] = useState<ChatFilter>('All');
  const user = useCurrentUser() ?? '';
  const query = combineQueries([useChats(), useClubs(), useCourses(), useConversations()] as const, (chats, clubs, courses, conversations) => {
    const enrolled = new Set(courses.courses.map((course) => course.id));
    const joined = new Set(clubs.data.filter((club) => club.joined).map((club) => club.id));
    return [...campusRows(chats.data, enrolled, joined), ...peerRows(conversations, user)].sort((left, right) =>
      (right.last_activity ?? '').localeCompare(left.last_activity ?? ''),
    );
  });

  return (
    <QueryView query={query} loadingLabel="Loading chats…">
      {(rows) => {
        const visible = rows.filter((row) => filterKinds[filter].includes(row.kind));
        const empty = emptyCopy[filter];
        return (
          <FlatList
            contentInsetAdjustmentBehavior="automatic"
            style={{ backgroundColor: colors.background }}
            contentContainerStyle={{ padding: spacing.screen, paddingBottom: 96 }}
            data={visible}
            keyExtractor={(row) => `${row.kind}:${row.id}`}
            ListHeaderComponent={
              <View style={{ gap: spacing.md, marginBottom: spacing.xs }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {CHAT_FILTERS.map((option) => (
                    <Pill key={option} label={option} active={filter === option} onPress={() => setFilter(option)} />
                  ))}
                </View>
              </View>
            }
            ListEmptyComponent={<EmptyState title={empty.title} subtitle={empty.subtitle} />}
            renderItem={({ item }) => (
              <ListRow
                leading={<Avatar initials={item.avatar} />}
                title={item.title}
                subtitle={item.subtitle}
                value={activityLabel(item.last_activity, campusToday())}
                valueStyle={{ fontSize: 10, fontWeight: '400', color: colors.tertiary }}
                minHeight={73}
                onPress={() => router.push(item.href)}
              />
            )}
          />
        );
      }}
    </QueryView>
  );
}

export function ChatThreadScreen({ id }: { id: string }) {
  const query = combineQueries([useThread(id), useCalendarExtras()] as const, (thread, extras) => ({
    thread: thread.data,
    extras: extras.data,
  }));
  const send = useServiceWrite<ThreadMessage>();

  return (
    <QueryView query={query} loadingLabel="Loading conversation…">
      {({ thread, extras }) => (
        <>
          <Stack.Screen options={{ title: thread.title }} />
          <KeyboardContainer>
            <FlatList
              contentInsetAdjustmentBehavior="automatic"
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              data={thread.messages}
              keyExtractor={(message) => message.id}
              contentContainerStyle={{ padding: spacing.screen, gap: 10 }}
              ListHeaderComponent={<ThreadHeader thread={thread} extras={extras} />}
              renderItem={({ item }) => <MessageBubble message={toBubble(item)} />}
            />
            <Composer
              sending={send.isPending}
              onSend={(body) =>
                send.mutate(
                  { path: `/chats/${encodeURIComponent(thread.id)}/messages`, method: 'POST', body: { body } },
                  { onError: (error) => showToast(errorMessage(error)) },
                )
              }
            />
          </KeyboardContainer>
        </>
      )}
    </QueryView>
  );
}

function ThreadHeader({ thread, extras }: { thread: ChatThread; extras: PlannerEvent[] }) {
  const write = useServiceWrite();
  const [summary, setSummary] = useState(false);
  const deadline = extras.find((item) => item.kind === 'extracted_deadline' && item.course_id === thread.course_id);
  const studyGroup = extras.find((item) => item.kind === 'study_group' && item.thread_id === thread.id);
  const busy = write.isPending;

  const toggleDeadline = () => {
    if (!thread.course_id) return;
    write.mutate(
      { path: `/calendar/deadlines/${encodeURIComponent(thread.course_id)}`, body: { enabled: !deadline } },
      {
        onSuccess: () => showToast(deadline ? 'Deadline removed from Calendar' : 'Deadline added to Calendar'),
        onError: (error) => showToast(errorMessage(error)),
      },
    );
  };

  const createStudyGroup = () => {
    const start = campusMidnight(addDays(campusToday(), 1)).replace('T00:00:00', 'T13:00:00');
    const end = start.replace('T13:00:00', 'T14:00:00');
    write.mutate(
      {
        path: `/chats/${encodeURIComponent(thread.id)}/study-groups`,
        method: 'POST',
        body: { title: `${thread.title} study group`, starts_at: start, ends_at: end, location: 'Mugar Memorial Library' },
      },
      {
        onSuccess: () => showToast('Study group added to Calendar'),
        onError: (error) => showToast(errorMessage(error)),
      },
    );
  };

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
            {thread.course_id ? (
              <Pill label={deadline ? 'Remove deadline' : 'Extract deadline'} active={!!deadline} onPress={busy ? undefined : toggleDeadline} />
            ) : null}
            <Pill label={studyGroup ? 'Study group scheduled' : 'Create study group'} active={!!studyGroup} onPress={studyGroup || busy ? undefined : createStudyGroup} />
          </View>
          {summary && (
            <ActionResult
              title="Conversation summary"
              body={thread.messages.map((message) => `${message.from_me ? 'You' : message.author}: ${message.body}`).join(' ')}
            />
          )}
          {studyGroup ? (
            <ActionResult
              title="Study group"
              body={`${formatTime(toCampusIso(studyGroup.starts_at))} · ${studyGroup.location ?? 'Campus'}`}
            />
          ) : null}
          {write.error ? <InlineError message={errorMessage(write.error)} /> : null}
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
