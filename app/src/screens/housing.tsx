import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { IntroBlock, KeyValueList } from '@/components/content';
import { EmergencyCallPanel } from '@/components/emergency-call-panel';
import { Callout, DemoBanner, EmptyState } from '@/components/feedback';
import { TextField } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { NotFound } from '@/components/not-found';
import { PillGroup } from '@/components/pill';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { BU_LINKS, HOUSING_TIMELINE, housingContacts, residence } from '@/data/services';
import { useHousingStore } from '@/stores/housing-store';
import { colors, spacing } from '@/theme';
import { openLink } from '@/utils/open-link';

const openRequest = (id: string) => router.push({ pathname: '/housing/[id]', params: { id } });

export function HousingScreen() {
  const requests = useHousingStore((state) => state.requests);

  return (
    <Screen>
      <DemoBanner title="Demo residence data">Housing assignments, request IDs, statuses, and integrations are mock data.</DemoBanner>
      <IntroBlock eyebrow="DEMO RESIDENCE" title={residence.building} copy={`Room ${residence.room} · ${residence.office}`} />
      <Button title="Report an issue" onPress={() => router.push('/housing/report')} style={{ marginTop: spacing.screen, marginBottom: spacing.xs }} />

      <Section title="My requests" action={{ label: 'View all', onPress: () => router.push('/housing/requests') }}>
        {requests.map((request) => (
          <ListRow key={request.id} title={`${request.id} · ${request.title}`} subtitle={`${request.status} · Demo`} onPress={() => openRequest(request.id)} minHeight={64} />
        ))}
      </Section>

      <Section title="Housing services">
        <ListRow title="My requests" subtitle="Track demo requests" onPress={() => router.push('/housing/requests')} minHeight={61} />
        <ListRow title="Contact Residence Life" subtitle="RA and community support" onPress={() => router.push('/housing/contacts')} minHeight={61} />
        <ListRow
          title="My Housing portal"
          subtitle="Official public portal"
          accessory="external"
          accessoryColor={colors.brand}
          onPress={() => openLink(BU_LINKS.myHousing)}
          minHeight={61}
        />
        <ListRow title="Emergency help" subtitle="Call-first contacts" onPress={() => router.push('/housing/emergency')} minHeight={61} />
      </Section>
    </Screen>
  );
}

const REQUEST_FILTERS = ['Open', 'Resolved', 'All'] as const;
type RequestFilter = (typeof REQUEST_FILTERS)[number];

export function HousingRequestsScreen() {
  const [filter, setFilter] = useState<RequestFilter>('Open');
  const requests = useHousingStore((state) => state.requests);
  const visible = requests.filter(
    (request) => filter === 'All' || (filter === 'Resolved' ? request.status === 'Resolved' : request.status !== 'Resolved'),
  );

  return (
    <Screen>
      <DemoBanner title="Mock request tracking">IDs, statuses, updates, and integrations are demo data.</DemoBanner>
      <PillGroup options={REQUEST_FILTERS} value={filter} onChange={setFilter} />
      <View style={{ marginTop: spacing.screen }}>
        {visible.length ? (
          visible.map((request) => (
            <ListRow key={request.id} title={`${request.id} · ${request.title}`} subtitle={`${request.status} · Demo`} onPress={() => openRequest(request.id)} minHeight={68} />
          ))
        ) : (
          <EmptyState title={`No ${filter.toLowerCase()} demo requests.`} subtitle="New requests will appear here." />
        )}
      </View>
    </Screen>
  );
}

export function HousingRequestScreen({ id }: { id: string }) {
  const request = useHousingStore((state) => state.requests.find((item) => item.id === id));
  const setStatus = useHousingStore((state) => state.setStatus);
  const addUpdate = useHousingStore((state) => state.addUpdate);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmReopen, setConfirmReopen] = useState(false);

  if (!request) return <NotFound what="request" />;

  const resolved = request.status === 'Resolved';
  const currentStep = HOUSING_TIMELINE.indexOf(request.status);

  return (
    <Screen>
      <Stack.Screen options={{ title: request.id }} />
      <DemoBanner title={`Demo request · ${request.status}`}>No real BU work order or integration exists.</DemoBanner>
      <AppText variant="largeTitle" accessibilityRole="header">
        {request.title}
      </AppText>
      <AppText style={{ marginTop: 6, marginBottom: spacing.lg }}>{request.description}</AppText>
      <KeyValueList
        items={[
          { label: 'Category', value: request.category },
          { label: 'Route', value: request.destination },
          { label: 'Location', value: request.location },
          { label: 'Attachment', value: request.attachment || 'Demo attachment placeholder' },
        ]}
      />

      <Section title="Timeline">
        {HOUSING_TIMELINE.map((step, index) => {
          const complete = resolved || index <= Math.max(currentStep, 0);
          return (
            <View key={step} style={{ minHeight: 52, flexDirection: 'row', gap: 11 }} accessibilityLabel={`${step}: ${complete ? 'complete' : 'pending'}`}>
              <View style={{ width: 11, height: 11, marginTop: 4, borderRadius: 6, backgroundColor: complete ? colors.success : '#d0ceca' }} />
              <View style={{ flex: 1 }}>
                <AppText variant="headline">{step}</AppText>
                <AppText variant="caption">{index === 0 ? 'Oct 15 · 9:48 AM · Demo' : complete ? 'Mock status update' : 'Pending'}</AppText>
              </View>
            </View>
          );
        })}
      </Section>

      {request.updates.map((update, index) => (
        <View key={index} style={{ backgroundColor: colors.surfaceMuted, borderRadius: 13, padding: spacing.md, marginBottom: 10, gap: 3 }}>
          <AppText variant="headline">Your update</AppText>
          <AppText variant="caption" selectable>
            {update}
          </AppText>
        </View>
      ))}

      {composing ? (
        <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: 15, padding: 14, marginVertical: spacing.md, gap: spacing.sm }}>
          <TextField label="Add a demo update" value={draft} onChangeText={setDraft} multiline autoFocus placeholder="Add access details or a status note." />
          <Button
            title="Save update"
            disabled={!draft.trim()}
            onPress={() => {
              addUpdate(request.id, draft.trim());
              setDraft('');
              setComposing(false);
            }}
          />
          <Button title="Cancel" variant="secondary" onPress={() => setComposing(false)} />
        </View>
      ) : (
        <Button title="Add update" variant="secondary" onPress={() => setComposing(true)} style={{ marginTop: spacing.md }} />
      )}

      {resolved ? (
        confirmReopen ? (
          <Callout
            title="Reopen this demo request?"
            body="The status will return to Assigned."
            actions={[
              {
                label: 'Confirm reopen',
                onPress: () => {
                  setStatus(request.id, 'Assigned');
                  setConfirmReopen(false);
                },
              },
              { label: 'Cancel', onPress: () => setConfirmReopen(false) },
            ]}
          />
        ) : (
          <Button title="Reopen request" variant="secondary" onPress={() => setConfirmReopen(true)} style={{ marginTop: 10 }} />
        )
      ) : (
        <Button title="Mark resolved" variant="secondary" onPress={() => setStatus(request.id, 'Resolved')} style={{ marginTop: 10 }} />
      )}
      <Button title="Need help" variant="secondary" onPress={() => router.push('/housing/contacts')} style={{ marginTop: 10 }} />
    </Screen>
  );
}

function ContactRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityHint={href.startsWith('tel:') ? 'Calls this number' : 'Opens the official BU site'}
      onPress={() => openLink(href)}
      style={({ pressed }) => ({ minHeight: 58, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.separator, opacity: pressed ? 0.6 : 1 })}>
      <AppText variant="headline">{label}</AppText>
      <AppText variant="caption" selectable>
        {value}
      </AppText>
    </Pressable>
  );
}

export function HousingContactsScreen() {
  return (
    <Screen>
      <DemoBanner title="Public BU contact information">Use the service that matches your residence or concern.</DemoBanner>
      <Section title="Student residences" style={{ marginTop: 0 }}>
        <AppText style={{ marginBottom: spacing.md }}>
          Routine maintenance goes through Residence Life / Facilities. Furniture, appliance, and key requests use My Housing. Roommate or community concerns go to an RA or Residence Life.
        </AppText>
        {housingContacts.residences.map((contact) => (
          <ContactRow key={contact.label} {...contact} />
        ))}
      </Section>
      <Section title="BU Real Estate tenant?">
        {housingContacts.realEstate.map((contact) => (
          <ContactRow key={contact.label} {...contact} />
        ))}
      </Section>
      <Button title="Emergency help" variant="secondary" onPress={() => router.push('/housing/emergency')} style={{ marginTop: spacing.xl }} />
    </Screen>
  );
}

export function HousingEmergencyScreen() {
  return (
    <Screen>
      <IntroBlock
        eyebrow="CALL-FIRST RESOURCES"
        eyebrowColor={colors.muted}
        title="This may need immediate help"
        copy="For crime or immediate safety, call 911 or BUPD. Online safety forms are not monitored 24/7."
        bordered={false}
      />
      <EmergencyCallPanel />
      <Section title="Other facilities contacts">
        <ContactRow label="Medical Campus" value="617-358-4144" href={housingContacts.residences[1].href} />
        <ContactRow label="BU Real Estate" value="617-353-4102" href={housingContacts.realEstate[0].href} />
      </Section>
      <Button title="Close" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
    </Screen>
  );
}
