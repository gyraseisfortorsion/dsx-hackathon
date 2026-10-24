import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { AiActionRow, DetailItem, IntroBlock, MetricHero } from '@/components/content';
import { Callout, DemoBanner, FootNote, InlineError, Orb } from '@/components/feedback';
import { CheckboxRow } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { NotFound } from '@/components/not-found';
import { PrivacyToggle } from '@/components/privacy-toggle';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { employmentChecklist, job, pay, priorTimesheets, workGuides, workPrompts } from '@/data/services';
import { openAsk, openExternal } from '@/navigation/routes';
import { useWorkStore } from '@/stores/work-store';
import { colors, spacing } from '@/theme';
import { successFeedback } from '@/utils/haptics';
import { totalHours } from '@/utils/shift';

export const CURRENT_TIMESHEET_ID = 'current';

const openTimesheet = (id: string) => router.push({ pathname: '/work/timesheet/[id]', params: { id } });
const openGuide = (id: string) => router.push({ pathname: '/work/guide/[id]', params: { id } });

function useCurrentWeek() {
  const shifts = useWorkStore((state) => state.shifts);
  const released = useWorkStore((state) => state.released);
  return { shifts, released, hours: totalHours(shifts), status: released ? 'Awaiting supervisor' : 'Draft' };
}

export function WorkScreen() {
  const { hours, released, status } = useCurrentWeek();

  return (
    <Screen>
      <DemoBanner title="Demo employment data">Official employment actions happen in BU systems.</DemoBanner>
      <IntroBlock eyebrow={job.status} eyebrowColor={colors.success} title={job.title} copy={job.meta} />

      <View style={{ paddingVertical: spacing.screen, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
        <AppText variant="eyebrow" style={{ fontSize: 10 }}>
          {job.currentWeek.toUpperCase()} · DEMO
        </AppText>
        <AppText selectable style={{ fontSize: 25, fontWeight: '700', color: colors.ink, marginVertical: 3, fontVariant: ['tabular-nums'] }}>
          {hours.toFixed(1)} hours
        </AppText>
        <AppText variant="caption" style={{ marginBottom: 14 }}>
          {status} · {job.dueLabel}
        </AppText>
        <Button title={released ? 'View timesheet' : 'Complete timesheet'} onPress={() => openTimesheet(CURRENT_TIMESHEET_ID)} />
      </View>

      <Section title="Work services">
        <ListRow title="Timesheets" subtitle="Current and prior demo weeks" onPress={() => router.push('/work/timesheets')} minHeight={61} />
        <ListRow title="Pay & earnings" subtitle="Face ID protected · Demo" onPress={() => router.push('/work/pay')} minHeight={61} />
        <ListRow title="Direct deposit" subtitle="Authorized · Demo" onPress={() => router.push('/work/direct-deposit')} minHeight={61} />
        <ListRow title="Employment checklist" subtitle="Mock onboarding statuses" onPress={() => router.push('/work/checklist')} minHeight={61} />
        <ListRow title="Find student jobs" subtitle="JobX Student Job Board" accessory="external" onPress={() => openExternal('jobs')} minHeight={61} />
        <ListRow title="Student Employment help" subtitle="Official public resource" accessory="external" onPress={() => openExternal('employmentHelp')} minHeight={61} />
      </Section>

      <Section title="Ask BU One">
        {workPrompts.map((prompt) => (
          <ListRow key={prompt} title={prompt} titleStyle={{ fontWeight: '400', fontSize: 14 }} minHeight={50} onPress={() => openAsk(prompt)} />
        ))}
      </Section>

      <FootNote boxed>
        Demo data. No SSNs, tax identifiers, bank routing numbers, full account numbers, I-9 documents, or real salary statements are stored in BU One.
      </FootNote>
    </Screen>
  );
}

export function TimesheetsScreen() {
  const { hours, status } = useCurrentWeek();
  const weeks = [{ id: CURRENT_TIMESHEET_ID, week: job.currentWeek, status, hours }, ...priorTimesheets];

  return (
    <Screen>
      <DemoBanner title="Mock timesheets">
        Hourly employees enter actual time in Employee Self-Service and release weekly for supervisor approval.
      </DemoBanner>
      {weeks.map((week) => (
        <ListRow key={week.id} title={week.week} subtitle={`${week.status} · ${week.hours.toFixed(1)}h · Demo`} onPress={() => openTimesheet(week.id)} minHeight={68} />
      ))}
      <Callout title="Weekly-salaried demo job" body="Weekly-salaried student employees do not enter weekly timesheets." />
      <Button title="Official timesheet guidance" icon="external" variant="secondary" onPress={() => openExternal('timesheetGuidance')} />
    </Screen>
  );
}

export function TimesheetScreen({ id }: { id: string }) {
  const { shifts, released, hours, status } = useCurrentWeek();
  const deleteShift = useWorkStore((state) => state.deleteShift);
  const prior = priorTimesheets.find((item) => item.id === id);
  const current = id === CURRENT_TIMESHEET_ID;

  if (!current && !prior) return <NotFound what="timesheet" />;

  const editable = current && !released;

  return (
    <Screen>
      <Stack.Screen options={{ title: current ? job.currentWeek : prior!.week }} />
      <DemoBanner title={`${current ? status : prior!.status} · Demo`}>
        {current ? 'Release by Sunday 11:59 PM. Late approved hours pay in a later cycle.' : 'Prior mock timesheet is locked.'}
      </DemoBanner>

      {current ? (
        shifts.map((shift) => (
          <View key={shift.id} style={{ minHeight: 72, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.separator, gap: 4, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="headline">{shift.date}</AppText>
                <AppText variant="caption">
                  {shift.start}–{shift.end}
                  {shift.breakMin ? ` · ${shift.breakMin}m break` : ''}
                  {shift.note ? ` · ${shift.note}` : ''}
                </AppText>
              </View>
              <AppText variant="headline" style={{ fontVariant: ['tabular-nums'] }}>
                {shift.hours.toFixed(1)}h
              </AppText>
            </View>
            {editable && (
              <View style={{ flexDirection: 'row', gap: spacing.screen }}>
                <TextAction label="Edit" onPress={() => router.push({ pathname: '/work/shift', params: { id: shift.id } })} />
                <TextAction label="Delete" onPress={() => deleteShift(shift.id)} />
              </View>
            )}
          </View>
        ))
      ) : (
        <ListRow title="Locked prior week" subtitle="Demo hours are read-only" value={`${prior!.hours.toFixed(1)}h`} minHeight={72} />
      )}

      <View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <AppText style={{ color: colors.ink }}>Weekly total</AppText>
        <AppText variant="headline" style={{ fontVariant: ['tabular-nums'] }}>
          {(current ? hours : prior!.hours).toFixed(1)} hours
        </AppText>
      </View>

      {editable && (
        <>
          <Button title="Add shift" variant="secondary" onPress={() => router.push('/work/shift')} />
          <Button title="Review & release" onPress={() => router.push('/work/review')} style={{ marginTop: 10 }} />
        </>
      )}
      {current && released && <Button title="Contact supervisor" variant="secondary" onPress={() => openGuide('supervisor')} />}

      <View style={{ marginTop: spacing.lg }}>
        <AiActionRow title="Run AI check" subtitle="Flags visible conflicts or unusual entries only" onPress={() => openGuide('ai-check')} />
      </View>
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

export function TimesheetReviewScreen() {
  const { shifts, released } = useCurrentWeek();
  const release = useWorkStore((state) => state.release);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState('');

  if (released) {
    return (
      <Screen contentStyle={{ paddingTop: spacing.xl }}>
        <Orb icon="check" />
        <AppText variant="eyebrow" style={{ color: colors.brandDeep, textAlign: 'center', marginBottom: 6 }}>
          DEMO ONLY · NO OFFICIAL RELEASE
        </AppText>
        <IntroBlock title="Released for supervisor approval" copy={`${job.supervisor} · Demo supervisor`} centered bordered={false} />
        <Button title="View timesheet" onPress={() => router.back()} />
        <Button title="Done" variant="secondary" onPress={() => router.dismissTo('/work')} style={{ marginTop: 10 }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <DemoBanner title="Review actual hours · Demo">BU One cannot release or approve an official timesheet.</DemoBanner>
      {shifts.map((shift) => (
        <ListRow key={shift.id} title={shift.date} subtitle={`${shift.hours.toFixed(1)} hours`} minHeight={58} />
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
        title="Release demo timesheet"
        onPress={() => {
          if (!acknowledged) return setError('Confirm the acknowledgement before releasing.');
          release();
          successFeedback();
        }}
      />
      <InlineError message={error} />
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} style={{ marginTop: 10 }} />
    </Screen>
  );
}

export function PayScreen() {
  const visible = useWorkStore((state) => state.payVisible);
  const setVisible = useWorkStore((state) => state.setPayVisible);

  return (
    <Screen>
      <DemoBanner title="Mock pay data">No real salary statements or official payroll records are stored.</DemoBanner>
      <PrivacyToggle visible={visible} onToggle={() => setVisible(!visible)} label={visible ? 'Pay visible' : 'Pay hidden'} caption="Local Face ID demo state" />
      <MetricHero eyebrow="NEXT PAYDAY · DEMO" value={pay.nextPayday} description="Student employees are normally paid weekly" />
      <View style={{ marginTop: 14, marginBottom: 22 }}>
        <ListRow title={`Last payment · ${pay.lastPaymentDate}`} value={visible ? pay.lastPayment : '••••••'} minHeight={61} />
        <ListRow title="Year to date · Demo" value={visible ? pay.ytd : '••••••'} minHeight={61} />
      </View>
      <Button title="View salary statements" onPress={() => openExternal('salaryStatements')} />
    </Screen>
  );
}

export function DirectDepositScreen() {
  return (
    <Screen>
      <DemoBanner title="Demo banking status">BU One never stores routing numbers or full account numbers.</DemoBanner>
      <MetricHero eyebrow="DIRECT DEPOSIT · DEMO" value="Authorized" description="Checking •••• 4821 · Demo" />
      <DetailItem icon="check" title="Last verified" subtitle="Student Assistant position · Demo" />
      <Callout
        title="Before you continue"
        body="An employment record must exist before access. Authorization should be verified or resubmitted for every new position. Suspected fraud should go to BU Payroll."
      />
      <Button title="Manage securely in MyBU" onPress={() => openExternal('directDeposit')} />
    </Screen>
  );
}

export function ChecklistScreen() {
  return (
    <Screen>
      <DemoBanner title="Mock onboarding statuses">No I-9 documents, tax identifiers, or uploads are stored.</DemoBanner>
      {employmentChecklist.map((item) => (
        <ListRow key={item.id} title={item.title} subtitle={item.status} onPress={() => openGuide(item.id)} minHeight={65} />
      ))}
    </Screen>
  );
}

export function WorkGuideScreen({ id }: { id: string }) {
  const guide = workGuides.find((item) => item.id === id);
  if (!guide) return <NotFound what="guide" />;

  return (
    <Screen>
      <Stack.Screen options={{ title: guide.title }} />
      <IntroBlock title={guide.title} copy={guide.copy} />
      <Callout
        title="Official action required"
        body="This is plain-language demo guidance. BU One cannot change employment records, provide tax advice, approve time, or upload documents."
      />
      <Button title="Open official resource" icon="external" variant="secondary" onPress={() => openExternal('employmentResource')} />
      <Button title="Close" variant="secondary" onPress={() => router.back()} style={{ marginTop: 10 }} />
    </Screen>
  );
}
