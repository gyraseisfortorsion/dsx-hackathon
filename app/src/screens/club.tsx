import { router } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Avatar, Paragraph } from '@/components/content';
import { SuccessBanner } from '@/components/feedback';
import { NotFound } from '@/components/not-found';
import { PillGroup } from '@/components/pill';
import { Screen } from '@/components/screen';
import { clubs } from '@/data/campus';
import { usePlannerStore } from '@/stores/planner-store';
import { colors, spacing } from '@/theme';

export function ClubScreen({ id }: { id: string }) {
  const club = clubs.find((item) => item.id === id);
  const joined = usePlannerStore((state) => state.joinedClubIds.includes(id));
  const planned = usePlannerStore((state) => state.plannedOpenHouseIds.includes(id));
  const joinClub = usePlannerStore((state) => state.joinClub);
  const toggleOpenHouse = usePlannerStore((state) => state.toggleOpenHouse);

  if (!club) return <NotFound what="club" />;

  return (
    <Screen>
      <View style={{ marginTop: spacing.sm, marginBottom: spacing.screen }}>
        <Avatar initials={club.initials} size={74} tone="dark" />
      </View>
      <AppText variant="eyebrow" style={{ color: '#a60000', letterSpacing: 0.2 }}>
        Verified BU organization
      </AppText>
      <AppText variant="largeTitle" accessibilityRole="header" style={{ marginTop: 7, marginBottom: 7 }}>
        {club.name}
      </AppText>
      <AppText>{club.tagline}</AppText>

      <View style={{ marginTop: 14, marginBottom: 14 }}>
        <PillGroup options={club.tags} wrap />
      </View>

      <View style={{ flexDirection: 'row', paddingVertical: spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.separator }}>
        {club.stats.map((stat) => (
          <View key={stat.label} style={{ flex: 1, alignItems: 'center' }}>
            <AppText variant="headline">{stat.value}</AppText>
            <AppText variant="caption" style={{ textAlign: 'center' }}>
              {stat.label}
            </AppText>
          </View>
        ))}
      </View>

      <Paragraph>{club.about}</Paragraph>

      {joined ? (
        <>
          <SuccessBanner message={`You joined ${club.name}`} />
          <Button title="Open Chat" onPress={() => router.push({ pathname: '/chat/[id]', params: { id: club.id } })} />
        </>
      ) : (
        <Button title="Join club" onPress={() => joinClub(club.id)} />
      )}
      <Button
        title={planned ? 'Remove open house from Calendar' : 'Add open house to Calendar'}
        variant={planned ? 'planned' : 'secondary'}
        onPress={() => toggleOpenHouse(club.id)}
        style={{ marginTop: 10 }}
      />
    </Screen>
  );
}
