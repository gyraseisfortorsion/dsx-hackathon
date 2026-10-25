import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import { SETTINGS_TOGGLES, useEditProfile, useExternalLink, useResourcePage, useSaveSettings, useSettings, type ServiceSettings } from '@/api/services';
import { useProfileDisplay } from '@/api/use-profile';
import { Button } from '@/components/button';
import { IntroBlock } from '@/components/content';
import { DemoBanner, InlineError, Orb } from '@/components/feedback';
import { TextField, ToggleRow } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { colors, spacing } from '@/theme';
import { confirmSignOut } from '@/utils/confirm-sign-out';
import { successFeedback } from '@/utils/haptics';
import { openLink } from '@/utils/open-link';

export function SettingsDetailScreen({ id }: { id: string }) {
  const page = useResourcePage(id);
  const settings = useSettings();
  const save = useSaveSettings();
  const editProfile = useEditProfile();
  const { profile, name } = useProfileDisplay();
  const [editedSettings, setEditedSettings] = useState<ServiceSettings | null>(null);
  const [editedName, setEditedName] = useState<string | null>(null);
  const draft = editedSettings ?? settings.data?.data;
  const fullName = editedName ?? profile?.full_name ?? '';

  const toggles = SETTINGS_TOGGLES[id] ?? [];

  return (
    <Screen onRefresh={() => Promise.all([page.refetch(), settings.refetch()])}>
      <QueryView query={page} loadingLabel="Loading page…">
        {(snapshot) => {
          const item = snapshot.data;
          return (
            <>
              <Stack.Screen options={{ title: item.title }} />
              <IntroBlock title={item.title} copy={item.intro} />
              {item.rows.map((row) => (
                <ListRow key={row} title={row} titleStyle={{ fontWeight: '400' }} minHeight={58} />
              ))}
              {item.links.map((link) => (
                <ListRow key={link.id} title={link.title} subtitle={link.description} accessory="external" accessoryColor={colors.brand} onPress={() => openLink(link.url)} minHeight={58} />
              ))}
              {id === 'edit-profile' ? (
                <TextField label="Full name" value={fullName} onChangeText={setEditedName} />
              ) : null}
              {draft &&
                toggles.map((toggle) => (
                  <ToggleRow key={toggle.key} label={toggle.label} value={draft[toggle.key]} onValueChange={(value) => setEditedSettings({ ...draft, [toggle.key]: value })} />
                ))}

              <View style={{ marginTop: 22, gap: 10 }}>
                {id === 'privacy' && <Button title="Community data & tools" variant="secondary" onPress={() => router.push('/community/tools')} />}
                {id === 'sign-out' && <Button title="Sign out" onPress={() => confirmSignOut(name)} />}
                {id === 'edit-profile' && (
                  <Button
                    title={editProfile.isPending ? 'Saving…' : 'Save name'}
                    disabled={editProfile.isPending || !fullName.trim()}
                    onPress={() =>
                      editProfile.mutate(fullName.trim(), {
                        onSuccess: () => {
                          successFeedback();
                          router.back();
                        },
                      })
                    }
                  />
                )}
                {toggles.length > 0 && draft && (
                  <Button
                    title={save.isPending ? 'Saving…' : 'Save'}
                    disabled={save.isPending}
                    onPress={() =>
                      save.mutate(draft, {
                        onSuccess: () => {
                          successFeedback();
                          router.back();
                        },
                      })
                    }
                  />
                )}
                {save.error ? <InlineError message={errorMessage(save.error)} /> : null}
                {editProfile.error ? <InlineError message={errorMessage(editProfile.error)} /> : null}
                <Button title="Close" variant="secondary" onPress={() => router.back()} />
              </View>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

export function ExternalConfirmScreen({ id }: { id: string }) {
  const query = useExternalLink(id);
  return (
    <Screen contentStyle={{ paddingTop: spacing.xl }} onRefresh={query.refetch}>
      <QueryView query={query} loadingLabel="Loading link…">
        {(snapshot) => {
          const link = snapshot.data;
          return (
            <>
              <Orb icon="external" />
              <IntroBlock title={link.title} copy={link.description} centered bordered={false} />
              <DemoBanner title="External secure handoff">You are leaving this prototype. Official actions happen in BU systems.</DemoBanner>
              <Button
                title="Continue to official BU site"
                icon="external"
                onPress={async () => {
                  router.back();
                  await openLink(link.url);
                }}
              />
              <Button title="Cancel" variant="secondary" onPress={() => router.back()} style={{ marginTop: 10 }} />
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
