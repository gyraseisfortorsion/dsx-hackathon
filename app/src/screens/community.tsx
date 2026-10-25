import { router } from 'expo-router';
import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import {
  messageAuthor,
  otherParticipant,
  useBlockAccount,
  useConversation,
  useConversations,
  useReportCommunity,
  useSendCommunityMessage,
  type CommunityMessage,
} from '@/api/community';
import { useCurrentUser } from '@/stores/session-store';
import { showToast } from '@/stores/toast-store';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Composer } from '@/components/chat';
import { EmptyState, InlineError } from '@/components/feedback';
import { KeyboardContainer } from '@/components/keyboard-container';
import { ListRow } from '@/components/list-row';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/theme';
import { formatTime, toCampusIso } from '@/utils/campus-time';

export function InboxScreen() {
  const query = useConversations();
  const user = useCurrentUser() ?? '';

  return (
    <Screen onRefresh={() => query.refetch()}>
      <QueryView query={query} loadingLabel="Loading messages…">
        {(conversations) =>
          conversations.length ? (
            conversations.map((item) => {
              const other = otherParticipant(item, user);
              const last = item.messages[item.messages.length - 1];
              return (
                <ListRow
                  key={item.id}
                  title={item.title}
                  subtitle={last?.body ?? `${other.name}${item.listing_id ? ' · marketplace' : ' · study'}`}
                  value={item.blocked ? 'Blocked' : undefined}
                  minHeight={73}
                  onPress={() => router.push({ pathname: '/inbox/[id]', params: { id: item.id } })}
                />
              );
            })
          ) : (
            <EmptyState title="No peer messages" subtitle="Marketplace inquiries and accepted study invites appear here." />
          )
        }
      </QueryView>
    </Screen>
  );
}

export function ConversationScreen({ id }: { id: string }) {
  const query = useConversation(id);
  const user = useCurrentUser() ?? '';
  const send = useSendCommunityMessage();
  const block = useBlockAccount();
  const report = useReportCommunity();

  return (
    <KeyboardContainer>
      <QueryView query={query} loadingLabel="Loading conversation…">
        {(conversation) => {
          const other = otherParticipant(conversation, user);
          const messages = conversation.messages ?? [];
          return (
            <View style={{ flex: 1 }}>
              <Screen onRefresh={() => query.refetch()} contentStyle={{ paddingBottom: spacing.md }}>
                {conversation.expectations ? (
                  <AppText variant="caption" style={{ marginBottom: spacing.md }}>
                    {conversation.expectations}
                  </AppText>
                ) : null}
                {conversation.listing_id ? (
                  <Button title="View listing" variant="secondary" onPress={() => router.push({ pathname: '/marketplace/[id]', params: { id: conversation.listing_id! } })} style={{ marginBottom: spacing.md }} />
                ) : null}
                {messages.length ? (
                  messages.map((message) => <Bubble key={message.id} message={message} mine={message.from_me || messageAuthor(message) === user} />)
                ) : (
                  <EmptyState title="No messages yet" subtitle={`Say hello to ${other.name}.`} />
                )}
                {conversation.blocked ? <InlineError message="This conversation is blocked." /> : null}
                <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg }}>
                  <Button
                    title={conversation.blocked ? 'Unblock' : 'Block'}
                    variant="ghost"
                    disabled={block.isPending}
                    onPress={() => block.mutate({ target: other.id, enabled: !conversation.blocked }, { onError: (error) => showToast(errorMessage(error)) })}
                  />
                  <Button
                    title="Report"
                    variant="ghost"
                    disabled={report.isPending}
                    onPress={() =>
                      report.mutate({ target_type: 'account', target_id: other.id, reason: 'Reported from a BU One conversation' }, { onSuccess: () => showToast('Report sent') })
                    }
                  />
                </View>
                {send.error || block.error || report.error ? <InlineError message={errorMessage(send.error ?? block.error ?? report.error)} /> : null}
              </Screen>
              <Composer
                placeholder={`Message ${other.name}…`}
                attachments={false}
                sending={send.isPending || conversation.blocked}
                onSend={(body) => send.mutate({ id: conversation.id, body }, { onError: (error) => showToast(errorMessage(error)) })}
              />
            </View>
          );
        }}
      </QueryView>
    </KeyboardContainer>
  );
}

function Bubble({ message, mine }: { message: CommunityMessage; mine: boolean }) {
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        backgroundColor: mine ? colors.brand : colors.chip,
        borderRadius: 16,
        borderBottomRightRadius: mine ? 5 : 16,
        borderBottomLeftRadius: mine ? 16 : 5,
        paddingHorizontal: 13,
        paddingVertical: 11,
        marginBottom: spacing.sm,
      }}>
      <AppText selectable style={{ fontSize: 15, lineHeight: 20, color: mine ? colors.onDark : colors.ink }}>
        {message.body}
      </AppText>
      <AppText variant="caption" style={{ color: mine ? colors.onDark : colors.subtle, opacity: 0.8, marginTop: 4 }}>
        {formatTime(toCampusIso(message.created_at))}
      </AppText>
    </View>
  );
}
