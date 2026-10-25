import { router } from 'expo-router';
import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import { clubChatId, useChats, useClub, useClubs, useServiceWrite } from '@/api/services';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Avatar, Paragraph } from '@/components/content';
import { EmptyState, InlineError, SuccessBanner } from '@/components/feedback';
import { ListRow } from '@/components/list-row';
import { PillGroup } from '@/components/pill';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/theme';
import { formatTime, toCampusIso } from '@/utils/campus-time';

export function ClubsScreen() {
  const query = useClubs();
  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query} loadingLabel="Loading clubs…">
        {(snapshot) =>
          snapshot.data.length ? (
            snapshot.data.map((club) => (
              <ListRow
                key={club.id}
                leading={<Avatar initials={club.initials} />}
                title={club.name}
                subtitle={club.tagline}
                value={club.joined ? 'Joined' : undefined}
                minHeight={73}
                onPress={() => router.push({ pathname: '/club/[id]', params: { id: club.id } })}
              />
            ))
          ) : (
            <EmptyState title="No clubs yet" subtitle="Campus organizations will appear here." />
          )
        }
      </QueryView>
    </Screen>
  );
}

export function ClubScreen({ id }: { id: string }) {
  const club = useClub(id);
  const chats = useChats();
  const write = useServiceWrite();

  return (
    <Screen onRefresh={() => Promise.all([club.refetch(), chats.refetch()])}>
      <QueryView query={club} loadingLabel="Loading club…">
        {(snapshot) => {
          const item = snapshot.data;
          const threadId = clubChatId(chats.data?.data, item.id);
          const busy = write.isPending;
          return (
            <>
              <View style={{ marginTop: spacing.sm, marginBottom: spacing.screen }}>
                <Avatar initials={item.initials} size={74} tone="dark" />
              </View>
              <AppText variant="eyebrow" style={{ color: '#a60000', letterSpacing: 0.2 }}>
                Verified BU organization
              </AppText>
              <AppText variant="largeTitle" accessibilityRole="header" style={{ marginTop: 7, marginBottom: 7 }}>
                {item.name}
              </AppText>
              <AppText>{item.tagline}</AppText>

              <View style={{ marginTop: 14, marginBottom: 14 }}>
                <PillGroup options={item.tags} wrap />
              </View>

              <View style={{ flexDirection: 'row', paddingVertical: spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.separator }}>
                {[
                  { value: String(item.member_count), label: 'members' },
                  { value: item.meeting_schedule, label: 'weekly meetings' },
                  { value: item.welcome, label: 'welcome' },
                ].map((stat) => (
                  <View key={stat.label} style={{ flex: 1, alignItems: 'center' }}>
                    <AppText variant="headline">{stat.value}</AppText>
                    <AppText variant="caption" style={{ textAlign: 'center' }}>
                      {stat.label}
                    </AppText>
                  </View>
                ))}
              </View>

              <Paragraph>{item.about}</Paragraph>

              {item.joined ? (
                <>
                  <SuccessBanner message={`You joined ${item.name}`} />
                  <Button title="Open Chat" onPress={() => router.push({ pathname: '/chat/[id]', params: { id: threadId } })} />
                </>
              ) : (
                <Button
                  title={busy ? 'Joining…' : 'Join club'}
                  disabled={busy}
                  onPress={() => write.mutate({ path: `/clubs/${encodeURIComponent(item.id)}/membership`, body: { enabled: true } })}
                />
              )}
              {item.open_house ? (
                <Button
                  title={item.open_house_planned ? 'Remove open house from Calendar' : 'Add open house to Calendar'}
                  variant={item.open_house_planned ? 'planned' : 'secondary'}
                  disabled={busy}
                  onPress={() =>
                    write.mutate({
                      path: `/clubs/${encodeURIComponent(item.id)}/open-house`,
                      body: { enabled: !item.open_house_planned },
                    })
                  }
                  style={{ marginTop: 10 }}
                />
              ) : null}
              {item.open_house ? (
                <AppText variant="caption" style={{ marginTop: spacing.md }}>
                  {item.open_house.title} · {formatTime(toCampusIso(item.open_house.starts_at))} · {item.open_house.location}
                </AppText>
              ) : null}
              {write.error ? <InlineError message={errorMessage(write.error)} /> : null}
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
