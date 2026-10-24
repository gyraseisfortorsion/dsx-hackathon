import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/button';
import { IntroBlock } from '@/components/content';
import { DemoBanner, Orb } from '@/components/feedback';
import { ToggleRow } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { NotFound } from '@/components/not-found';
import { Screen } from '@/components/screen';
import { useProfileDisplay } from '@/api/use-profile';
import { externalLinks, settingsPages, type ExternalLinkId } from '@/data/services';
import { usePreferencesStore } from '@/stores/preferences-store';
import { colors, spacing } from '@/theme';
import { confirmSignOut } from '@/utils/confirm-sign-out';
import { openLink } from '@/utils/open-link';

export function SettingsDetailScreen({ id }: { id: string }) {
  const page = settingsPages.find((item) => item.id === id);
  const toggles = usePreferencesStore((state) => state.toggles);
  const saveToggles = usePreferencesStore((state) => state.saveToggles);
  const { name } = useProfileDisplay();
  const [draft, setDraft] = useState(toggles);

  if (!page) return <NotFound what="page" />;

  return (
    <Screen>
      <Stack.Screen options={{ title: page.title }} />
      <IntroBlock title={page.title} copy={page.intro} />
      {page.rows.map((row) => (
        <ListRow key={row} title={row} titleStyle={{ fontWeight: '400' }} minHeight={58} />
      ))}
      {page.toggles?.map((key) => (
        <ToggleRow key={key} label={key} value={!!draft[key]} onValueChange={(value) => setDraft((current) => ({ ...current, [key]: value }))} />
      ))}

      {page.link && (
        <ListRow title={page.link.label} accessory="external" accessoryColor={colors.brand} onPress={() => openLink(page.link!.url)} minHeight={48} />
      )}

      <View style={{ marginTop: 22, gap: 10 }}>
        {page.id === 'sign-out' && (
          <Button title="Sign out" onPress={() => confirmSignOut(name)} />
        )}
        {page.toggles && (
          <Button
            title="Save"
            onPress={() => {
              saveToggles(draft);
              router.back();
            }}
          />
        )}
        <Button title="Close" variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

export function ExternalConfirmScreen({ id }: { id: string }) {
  const link = externalLinks[id as ExternalLinkId];
  if (!link) return <NotFound what="link" />;

  return (
    <Screen contentStyle={{ paddingTop: spacing.xl }}>
      <Orb icon="external" />
      <IntroBlock title={link.title} copy={link.copy} centered bordered={false} />
      <DemoBanner title="External secure handoff">You are leaving this demo. Official actions happen in BU systems.</DemoBanner>
      <Button
        title="Continue to official BU site"
        icon="external"
        onPress={async () => {
          router.back();
          await openLink(link.url);
        }}
      />
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} style={{ marginTop: 10 }} />
    </Screen>
  );
}
