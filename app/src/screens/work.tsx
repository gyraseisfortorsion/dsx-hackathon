import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { formatCents } from '@/api/selectors';
import {
  clockTime,
  currentTimesheet,
  usePatchSettings,
  useSettings,
  useTimesheet,
  useWork,
  useServiceWrite,
  type Employment,
  type Timesheet,
} from '@/api/services';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { AiActionRow, DetailItem, IntroBlock, MetricHero } from '@/components/content';
import { Callout, DemoBanner, FootNote, InlineError, Orb } from '@/components/feedback';
import { CheckboxRow } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { NotFound } from '@/components/not-found';
import { PrivacyToggle } from '@/components/privacy-toggle';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { openAsk, openExternal } from '@/navigation/routes';
import { colors, spacing } from '@/theme';
import { formatLongDate, formatShortDate, formatTime } from '@/utils/campus-time';
import { successFeedback } from '@/utils/haptics';

const workPrompts = ['Why is my timesheet awaiting approval?', 'Explain gross vs net pay', 'What do I need before my first shift?'];

const openTimesheet = (id: string) => router.push({ pathname: '/work/timesheet/[id]', params: { id } });
const openGuide = (id: string) => router.push({ pathname: '/work/guide/[id]', params: { id } });

function timesheetTitle(sheet: Timesheet) {
  return `${formatShortDate(sheet.starts_on)} – ${formatShortDate(sheet.ends_on)}`;
}

export function WorkScreen() {
  const query = useWork();
  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query} loadingLabel="Loading work…">
        {(snapshot) => <WorkHome work={snapshot.data} />}
      </QueryView>
    </Screen>
  );
}

function WorkHome({ work }: { work: Employment }) {
  const current = currentTimesheet(work.timesheets);
  return (
    <>
      <DemoBanner title="Prototype employment data">Official employment actions happen in BU systems.</DemoBanner>
      <IntroBlock
        eyebrow={`${work.job.status.toUpperCase()} · HOURLY`}
        eyebrowColor={colors.success}
        title={work.job.title}
        copy={`${work.job.department} · Supervisor ${work.job.supervisor}`}
      />

      {current ? (
        <View style={{ paddingVertical: spacing.screen, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
          <AppText variant="eyebrow" style={{ fontSize: 10 }}>
            {timesheetTitle(current).toUpperCase()}
          </AppText>
          <AppText selectable style={{ fontSize: 25, fontWeight: '700', color: colors.ink, marginVertical: 3, fontVariant: ['tabular-nums'] }}>
            {current.hours.toFixed(1)} hours
          </AppText>
          <AppText variant="caption" style={{ marginBottom: 14 }}>
            {current.status} · Due {formatTime(current.due_at)} {formatShortDate(current.due_at.slice(0, 10))}
          </AppText>
          <Button title={current.status === 'Draft' ? 'Complete timesheet' : 'View timesheet'} onPress={() => openTimesheet(current.id)} />
        </View>
      ) : null}

      <Section title="Work services">
        <ListRow title="Timesheets" subtitle="Current and prior weeks" onPress={() => router.push('/work/timesheets')} minHeight={61} />
        <ListRow title="Pay & earnings" subtitle="Face ID protected" onPress={() => router.push('/work/pay')} minHeight={61} />
        <ListRow title="Direct deposit" subtitle={work.direct_deposit.status} onPress={() => router.push('/work/direct-deposit')} minHeight={61} />
        <ListRow title="Employment checklist" subtitle="Onboarding statuses" onPress={() => router.push('/work/checklist')} minHeight={61} />
        <ListRow title="Find student jobs" subtitle="JobX Student Job Board" accessory="external" onPress={() => openExternal('jobs')} minHeight={61} />
        <ListRow title="Student Employment help" subtitle="Official public resource" accessory="external" onPress={() => openExternal('employmentHelp')} minHeight={61} />
      </Section>

      <Section title="Ask BU One">
        {workPrompts.map((prompt) => (
          <ListRow key={prompt} title={prompt} titleStyle={{ fontWeight: '400', fontSize: 14 }} minHeight={50} onPress={() => openAsk(prompt)} />
        ))}
      </Section>

      <FootNote boxed>
        Prototype data. No SSNs, tax identifiers, bank routing numbers, full account numbers, I-9 documents, or real salary statements are stored in BU One.
      </FootNote>
    </>
  );
}

export function TimesheetsScreen() {
  const query = useWork();
  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query} loadingLabel="Loading timesheets…">
        {(snapshot) => (
          <>
            <DemoBanner title="Timesheets">Hourly employees enter actual time and release weekly for supervisor approval.</DemoBanner>
            {snapshot.data.timesheets.map((sheet) => (
              <ListRow
                key={sheet.id}
                title={timesheetTitle(sheet)}
                subtitle={`${sheet.status} · ${sheet.hours.toFixed(1)}h`}
                onPress={() => openTimesheet(sheet.id)}
                minHeight={68}
              />
            ))}
            <Callout title="Weekly-salaried jobs" body="Weekly-salaried student employees do not enter weekly timesheets." />
            <Button title="Official timesheet guidance" icon="external" variant="secondary" onPress={() => openExternal('timesheetGuidance')} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}

export function TimesheetScreen({ id }: { id: string }) {
  const query = useTimesheet(id);
  const remove = useServiceWrite();

  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query} loadingLabel="Loading timesheet…">
        {(snapshot) => {
          const sheet = snapshot.data;
          const editable = sheet.status === 'Draft';
          return (
            <>
              <Stack.Screen options={{ title: timesheetTitle(sheet) }} />
              <DemoBanner title={sheet.status}>
                {editable ? `Release by ${formatTime(sheet.due_at)} on ${formatShortDate(sheet.due_at.slice(0, 10))}.` : 'This timesheet is locked.'}
              </DemoBanner>

              {sheet.shifts.length ? (
                sheet.shifts.map((shift) => (
                  <View key={shift.id} style={{ minHeight: 72, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.separator, gap: 4, justifyContent: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <AppText variant="headline">{formatShortDate(shift.date)}</AppText>
                        <AppText variant="caption">
                          {clockTime(shift.start)}–{clockTime(shift.end)}
                          {shift.break_minutes ? ` · ${shift.break_minutes}m break` : ''}
                          {shift.note ? ` · ${shift.note}` : ''}
                        </AppText>
                      </View>
                      <AppText variant="headline" style={{ fontVariant: ['tabular-nums'] }}>
                        {shift.hours.toFixed(1)}h
                      </AppText>
                    </View>
                    {editable && (
                      <View style={{ flexDirection: 'row', gap: spacing.screen }}>
                        <TextAction label="Edit" onPress={() => router.push({ pathname: '/work/shift', params: { id: shift.id, sheet: sheet.id } })} />
                        <TextAction
                          label="Delete"
                          onPress={() =>
                            remove.mutate({
                              path: `/work/timesheets/${encodeURIComponent(sheet.id)}/shifts/${encodeURIComponent(shift.id)}`,
                              method: 'DELETE',
                            })
                          }
                        />
                      </View>
                    )}
                  </View>
                ))
              ) : (
                <ListRow title={editable ? 'No shifts yet' : 'No shift details'} subtitle={editable ? 'Add the hours you actually worked' : 'Hours are summarized for this week'} value={`${sheet.hours.toFixed(1)}h`} minHeight={72} />
              )}

              <View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <AppText style={{ color: colors.ink }}>Weekly total</AppText>
                <AppText variant="headline" style={{ fontVariant: ['tabular-nums'] }}>
                  {sheet.hours.toFixed(1)} hours
                </AppText>
              </View>

              {editable && (
                <>
                  <Button title="Add shift" variant="secondary" onPress={() => router.push({ pathname: '/work/shift', params: { sheet: sheet.id } })} />
                  <Button title="Review & release" onPress={() => router.push({ pathname: '/work/review', params: { sheet: sheet.id } })} style={{ marginTop: 10 }} />
                </>
              )}
              {sheet.status === 'Awaiting supervisor' && <Button title="Contact supervisor" variant="secondary" onPress={() => openGuide('supervisor')} />}
              {remove.error ? <InlineError message={errorMessage(remove.error)} /> : null}

              <View style={{ marginTop: spacing.lg }}>
                <AiActionRow title="Run AI check" subtitle="Flags visible conflicts or unusual entries only" onPress={() => openGuide('ai-check')} />
              </View>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress} style={{ minHeight: 38, justifyContent: 'center' }}>
      <AppText variant="caption" style={{ color: colors.brandDeep, fontWeight: '700' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function TimesheetReviewScreen({ sheetId }: { sheetId?: string }) {
  const work = useWork();
  const release = useServiceWrite<Timesheet>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');

  return (
    <Screen onRefresh={work.refetch}>
      <QueryView query={work} loadingLabel="Loading timesheet…">
        {(snapshot) => {
          const sheet = snapshot.data.timesheets.find((item) => item.id === sheetId) ?? currentTimesheet(snapshot.data.timesheets);
          if (!sheet) return <NotFound what="timesheet" />;
          if (sheet.status !== 'Draft') {
            return (
              <View style={{ paddingTop: spacing.xl }}>
                <Orb icon="check" />
                <AppText variant="eyebrow" style={{ color: colors.brandDeep, textAlign: 'center', marginBottom: 6 }}>
                  RELEASED FOR REVIEW
                </AppText>
                <IntroBlock title="Awaiting supervisor approval" copy={snapshot.data.job.supervisor} centered bordered={false} />
                <Button title="View timesheet" onPress={() => router.back()} />
                <Button title="Done" variant="secondary" onPress={() => router.dismissTo('/work')} style={{ marginTop: 10 }} />
              </View>
            );
          }
          return (
            <>
              <DemoBanner title="Review actual hours">BU One cannot release or approve an official timesheet.</DemoBanner>
              {sheet.shifts.map((shift) => (
                <ListRow key={shift.id} title={formatShortDate(shift.date)} subtitle={`${shift.hours.toFixed(1)} hours`} minHeight={58} />
              ))}
              <View style={{ marginTop: spacing.lg }}>
                <CheckboxRow
                  checked={acknowledged}
                  onChange={(value) => {
                    setAcknowledged(value);
                    setError('');
                  }}>
                  I confirm these are the hours I actually worked.
                </CheckboxRow>
              </View>
              <Button
                title={release.isPending ? 'Releasing…' : 'Release timesheet'}
                disabled={release.isPending}
                onPress={() => {
                  if (!acknowledged) return setError('Confirm the acknowledgement before releasing.');
                  release.mutate(
                    { path: `/work/timesheets/${encodeURIComponent(sheet.id)}/release`, method: 'POST', body: {} },
                    {
                      onSuccess: () => successFeedback(),
                      onError: (err) => setError(errorMessage(err)),
                    },
                  );
                }}
              />
              <InlineError message={error} />
              <Button title="Cancel" variant="secondary" onPress={() => router.back()} style={{ marginTop: 10 }} />
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

export function PayScreen() {
  const work = useWork();
  const settings = useSettings();
  const patch = usePatchSettings();
  const hidden = settings.data?.data.pay_hidden ?? true;

  return (
    <Screen onRefresh={() => Promise.all([work.refetch(), settings.refetch()])}>
      <QueryView query={work} loadingLabel="Loading pay…">
        {(snapshot) => {
          const { pay } = snapshot.data;
          return (
            <>
              <DemoBanner title="Pay snapshot">No real salary statements or official payroll records are stored.</DemoBanner>
              <PrivacyToggle
                visible={!hidden}
                onToggle={() => patch.mutate({ pay_hidden: !hidden })}
                label={hidden ? 'Pay hidden' : 'Pay visible'}
                caption="Saved in your campus-service preferences"
              />
              <MetricHero eyebrow="NEXT PAYDAY" value={formatLongDate(pay.next_payday)} description="Student employees are normally paid weekly" />
              <View style={{ marginTop: 14, marginBottom: 22 }}>
                <ListRow title={`Last payment · ${formatShortDate(pay.last_payment_on)}`} value={hidden ? '••••••' : formatCents(pay.last_payment_cents)} minHeight={61} />
                <ListRow title="Year to date" value={hidden ? '••••••' : formatCents(pay.ytd_net_cents)} minHeight={61} />
              </View>
              <Button title="View salary statements" onPress={() => openExternal('salaryStatements')} />
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

export function DirectDepositScreen() {
  const query = useWork();
  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query} loadingLabel="Loading direct deposit…">
        {(snapshot) => {
          const deposit = snapshot.data.direct_deposit;
          return (
            <>
              <DemoBanner title="Banking status">BU One never stores routing numbers or full account numbers.</DemoBanner>
              <MetricHero
                eyebrow="DIRECT DEPOSIT"
                value={deposit.status}
                description={deposit.account_last_four ? `Checking •••• ${deposit.account_last_four}` : 'No account on file'}
              />
              <DetailItem icon="check" title="Last verified" subtitle={`${snapshot.data.job.title} · ${snapshot.data.job.department}`} />
              <Callout
                title="Before you continue"
                body="An employment record must exist before access. Authorization should be verified or resubmitted for every new position. Suspected fraud should go to BU Payroll."
              />
              <Button title="Manage securely in MyBU" onPress={() => openExternal('directDeposit')} />
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

export function ChecklistScreen() {
  const query = useWork();
  const write = useServiceWrite();
  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query} loadingLabel="Loading checklist…">
        {(snapshot) => (
          <>
            <DemoBanner title="Onboarding statuses">No I-9 documents, tax identifiers, or uploads are stored.</DemoBanner>
            {snapshot.data.checklist.map((item) => (
              <View key={item.id}><ListRow
                key={item.id}
                title={item.title}
                subtitle={item.complete ? 'Complete' : 'Review suggested'}
                onPress={() => openGuide(item.id)}
                minHeight={65}
              /><Button title={item.complete ? 'Mark incomplete' : 'Mark complete'} variant="ghost" disabled={write.isPending} onPress={() => write.mutate({ path: `/work/checklist/${encodeURIComponent(item.id)}`, body: { enabled: !item.complete } })} /></View>
            ))}
            {write.error && <InlineError message={errorMessage(write.error)} />}
          </>
        )}
      </QueryView>
    </Screen>
  );
}

const LOCAL_GUIDES: Record<string, { title: string; copy: string }> = {
  supervisor: {
    title: 'Contact supervisor',
    copy: 'Your supervisor is listed on the job record. BU One cannot approve or alter an official timesheet.',
  },
  'ai-check': {
    title: 'AI check',
    copy: 'AI only flags visible conflicts or unusual entries. It does not add, infer, release, or approve hours.',
  },
};

export function WorkGuideScreen({ id }: { id: string }) {
  const work = useWork();
  const local = LOCAL_GUIDES[id];
  const item = work.data?.data.checklist.find((entry) => entry.id === id);
  const title = item?.title ?? local?.title;
  const copy = item?.description ?? local?.copy;

  if (work.data && !title) return <NotFound what="guide" />;

  return (
    <Screen onRefresh={work.refetch}>
      <QueryView query={work} loadingLabel="Loading guide…">
        {() => (
          <>
            <Stack.Screen options={{ title: title ?? 'Guide' }} />
            <IntroBlock title={title ?? 'Guide'} copy={copy ?? ''} />
            <Callout
              title="Official action required"
              body="This is plain-language prototype guidance. BU One cannot change employment records, provide tax advice, approve time, or upload documents."
            />
            <Button title="Open official resource" icon="external" variant="secondary" onPress={() => openExternal('employmentResource')} />
            <Button title="Close" variant="secondary" onPress={() => router.back()} style={{ marginTop: 10 }} />
          </>
        )}
      </QueryView>
    </Screen>
  );
}
