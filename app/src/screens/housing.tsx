import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useHousing, useHousingContacts, useHousingRequest, useHousingRequests, useServiceWrite, type HousingRequest, type HousingStatus } from '@/api/services';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { IntroBlock, KeyValueList } from '@/components/content';
import { EmergencyCallPanel } from '@/components/emergency-call-panel';
import { Callout, DemoBanner, EmptyState, InlineError } from '@/components/feedback';
import { TextField } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { PillGroup } from '@/components/pill';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { HOUSING_TIMELINE } from '@/data/services';
import { colors, spacing } from '@/theme';
import { campusToday, formatRelativeDay, formatTime, toCampusIso } from '@/utils/campus-time';
import { openLink } from '@/utils/open-link';

const openRequest = (id: string) => router.push({ pathname: '/housing/[id]', params: { id } });

export function HousingScreen() {
  const housing = useHousing();
  const requests = useHousingRequests();
  const query = {
    data: housing.data && requests.data ? { residence: housing.data.data, requests: requests.data.data } : undefined,
    error: housing.error ?? requests.error,
    refetch: () => Promise.all([housing.refetch(), requests.refetch()]),
  };

  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query} loadingLabel="Loading housing…">
        {({ residence, requests: items }) => (
          <>
            <DemoBanner title="Prototype residence data">Assignments and request routing are mock campus-service data.</DemoBanner>
            <IntroBlock eyebrow="RESIDENCE" title={residence.building} copy={`Room ${residence.room} · ${residence.office}`} />
            <Button title="Report an issue" onPress={() => router.push('/housing/report')} style={{ marginTop: spacing.screen, marginBottom: spacing.xs }} />

            <Section title="My requests" action={{ label: 'View all', onPress: () => router.push('/housing/requests') }}>
              {items.length ? (
                items.slice(0, 3).map((request) => (
                  <ListRow key={request.id} title={`${request.id} · ${request.title}`} subtitle={request.status} onPress={() => openRequest(request.id)} minHeight={64} />
                ))
              ) : (
                <EmptyState title="No requests yet" subtitle="Report an issue to start one." />
              )}
            </Section>

            <Section title="Housing services">
              <ListRow title="My requests" subtitle="Track open and resolved requests" onPress={() => router.push('/housing/requests')} minHeight={61} />
              <ListRow title="Contact Residence Life" subtitle="RA and community support" onPress={() => router.push('/housing/contacts')} minHeight={61} />
              <ListRow title="Emergency help" subtitle="Call-first contacts" onPress={() => router.push('/housing/emergency')} minHeight={61} />
            </Section>
          </>
        )}
      </QueryView>
    </Screen>
  );
}

const REQUEST_FILTERS = ['Open', 'Resolved', 'All'] as const;
type RequestFilter = (typeof REQUEST_FILTERS)[number];

export function HousingRequestsScreen() {
  const [filter, setFilter] = useState<RequestFilter>('Open');
  const query = useHousingRequests();

  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query} loadingLabel="Loading requests…">
        {(snapshot) => {
          const visible = snapshot.data.filter((request) =>
            filter === 'All' ? true : filter === 'Resolved' ? request.status === 'Resolved' : request.status !== 'Resolved',
          );
          return (
            <>
              <DemoBanner title="Request tracking">Statuses and updates come from the campus-service API.</DemoBanner>
              <PillGroup options={REQUEST_FILTERS} value={filter} onChange={setFilter} />
              <View style={{ marginTop: spacing.screen }}>
                {visible.length ? (
                  visible.map((request) => (
                    <ListRow key={request.id} title={`${request.id} · ${request.title}`} subtitle={request.status} onPress={() => openRequest(request.id)} minHeight={68} />
                  ))
                ) : (
                  <EmptyState title={`No ${filter.toLowerCase()} requests.`} subtitle="New requests will appear here." />
                )}
              </View>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

export function HousingRequestScreen({ id }: { id: string }) {
  const query = useHousingRequest(id);
  const write = useServiceWrite<HousingRequest>();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmReopen, setConfirmReopen] = useState(false);

  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query} loadingLabel="Loading request…">
        {(snapshot) => {
          const request = snapshot.data;
          const resolved = request.status === 'Resolved';
          const currentStep = HOUSING_TIMELINE.indexOf(request.status);
          const busy = write.isPending;
          return (
            <>
              <Stack.Screen options={{ title: request.id }} />
              <DemoBanner title={request.status}>No real BU work order is created.</DemoBanner>
              <AppText variant="largeTitle" accessibilityRole="header">
                {request.title}
              </AppText>
              <AppText style={{ marginTop: 6, marginBottom: spacing.lg }}>{request.description}</AppText>
              <KeyValueList
                items={[
                  { label: 'Category', value: request.category },
                  { label: 'Urgency', value: request.urgency },
                  { label: 'Route', value: request.destination },
                  { label: 'Location', value: `${request.building} · Room ${request.room}` },
                  { label: 'Preferred time', value: request.preferred_time },
                ]}
              />

              <Section title="Timeline">
                {HOUSING_TIMELINE.map((step, index) => {
                  const update = request.updates.find((item) => item.status === step);
                  const complete = resolved || index <= Math.max(currentStep, 0);
                  return (
                    <View key={step} style={{ minHeight: 52, flexDirection: 'row', gap: 11 }} accessibilityLabel={`${step}: ${complete ? 'complete' : 'pending'}`}>
                      <View style={{ width: 11, height: 11, marginTop: 4, borderRadius: 6, backgroundColor: complete ? colors.success : '#d0ceca' }} />
                      <View style={{ flex: 1 }}>
                        <AppText variant="headline">{step}</AppText>
                        <AppText variant="caption">
                          {update
                            ? `${formatRelativeDay(toCampusIso(update.created_at).slice(0, 10), campusToday())} · ${formatTime(toCampusIso(update.created_at))}`
                            : complete
                              ? 'Complete'
                              : 'Pending'}
                        </AppText>
                      </View>
                    </View>
                  );
                })}
              </Section>

              {request.updates.map((update) => (
                <View key={`${update.status}-${update.created_at}`} style={{ backgroundColor: colors.surfaceMuted, borderRadius: 13, padding: spacing.md, marginBottom: 10, gap: 3 }}>
                  <AppText variant="headline">{update.status}</AppText>
                  <AppText variant="caption" selectable>
                    {update.text}
                  </AppText>
                </View>
              ))}

              {composing ? (
                <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: 15, padding: 14, marginVertical: spacing.md, gap: spacing.sm }}>
                  <TextField label="Add an update" value={draft} onChangeText={setDraft} multiline autoFocus placeholder="Add access details or a status note." />
                  <Button
                    title={busy ? 'Saving…' : 'Save update'}
                    disabled={!draft.trim() || busy}
                    onPress={() =>
                      write.mutate(
                        { path: `/housing/requests/${encodeURIComponent(request.id)}`, body: { text: draft.trim() } },
                        {
                          onSuccess: () => {
                            setDraft('');
                            setComposing(false);
                          },
                        },
                      )
                    }
                  />
                  <Button title="Cancel" variant="secondary" onPress={() => setComposing(false)} />
                </View>
              ) : (
                <Button title="Add update" variant="secondary" onPress={() => setComposing(true)} style={{ marginTop: spacing.md }} />
              )}

              {resolved ? (
                confirmReopen ? (
                  <Callout
                    title="Reopen this request?"
                    body="The status will return to Assigned."
                    actions={[
                      {
                        label: 'Confirm reopen',
                        onPress: () => {
                          write.mutate({ path: `/housing/requests/${encodeURIComponent(request.id)}`, body: { status: 'Assigned' satisfies HousingStatus } });
                          setConfirmReopen(false);
                        },
                      },
                      { label: 'Cancel', onPress: () => setConfirmReopen(false) },
                    ]}
                  />
                ) : (
                  <Button title="Reopen request" variant="secondary" disabled={busy} onPress={() => setConfirmReopen(true)} style={{ marginTop: 10 }} />
                )
              ) : (
                <Button
                  title={busy ? 'Updating…' : 'Mark resolved'}
                  variant="secondary"
                  disabled={busy}
                  onPress={() => write.mutate({ path: `/housing/requests/${encodeURIComponent(request.id)}`, body: { status: 'Resolved' satisfies HousingStatus } })}
                  style={{ marginTop: 10 }}
                />
              )}
              {write.error ? <InlineError message={errorMessage(write.error)} /> : null}
              <Button title="Need help" variant="secondary" onPress={() => router.push('/housing/contacts')} style={{ marginTop: 10 }} />
            </>
          );
        }}
      </QueryView>
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
  const query = useHousingContacts();
  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query} loadingLabel="Loading contacts…">
        {(snapshot) => {
          const contacts = snapshot.data;
          return (
            <>
              <DemoBanner title="Public BU contact information">Use the service that matches your residence or concern.</DemoBanner>
              <Section title="Student residences" style={{ marginTop: 0 }}>
                <AppText style={{ marginBottom: spacing.md }}>
                  Routine maintenance goes through Residence Life / Facilities. Furniture, appliance, and key requests use My Housing. Roommate or community concerns go to an RA or Residence Life.
                </AppText>
                {contacts.residences.map((contact) => (
                  <ContactRow key={contact.label} {...contact} />
                ))}
              </Section>
              <Section title="BU Real Estate tenant?">
                {contacts.real_estate.map((contact) => (
                  <ContactRow key={contact.label} {...contact} />
                ))}
              </Section>
              <Button title="Emergency help" variant="secondary" onPress={() => router.push('/housing/emergency')} style={{ marginTop: spacing.xl }} />
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

export function HousingEmergencyScreen() {
  const query = useHousingContacts();
  return (
    <Screen onRefresh={query.refetch}>
      <IntroBlock
        eyebrow="CALL-FIRST RESOURCES"
        eyebrowColor={colors.muted}
        title="This may need immediate help"
        copy="For crime or immediate safety, call 911 or BUPD. Online safety forms are not monitored 24/7."
        bordered={false}
      />
      <QueryView query={query} loadingLabel="Loading contacts…">
        {(snapshot) => (
          <>
            <EmergencyCallPanel calls={snapshot.data.emergency.map((item) => ({ label: `Call ${item.label} · ${item.value}`, href: item.href }))} />
            <Section title="Other facilities contacts">
              {snapshot.data.residences.slice(1).map((contact) => (
                <ContactRow key={contact.label} {...contact} />
              ))}
              {snapshot.data.real_estate.map((contact) => (
                <ContactRow key={contact.label} {...contact} />
              ))}
            </Section>
          </>
        )}
      </QueryView>
      <Button title="Close" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
    </Screen>
  );
}
