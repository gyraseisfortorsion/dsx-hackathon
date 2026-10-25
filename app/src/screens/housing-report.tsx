import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmergencyCallPanel } from '@/components/emergency-call-panel';
import { IntroBlock, KeyValueList } from '@/components/content';
import { InlineError, Orb } from '@/components/feedback';
import { CheckboxRow, ChoiceField, TextField, ToggleRow } from '@/components/form';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { errorMessage } from '@/api/client';
import { useHousing, useServiceWrite, type HousingRequest, type Residence } from '@/api/services';
import {
  HOUSING_CATEGORIES,
  HOUSING_DEMO_FILES,
  HOUSING_EXAMPLES,
  HOUSING_TIMES,
  HOUSING_URGENCIES,
} from '@/data/services';
import type { HousingUrgency } from '@/types';
import { colors, radius, spacing } from '@/theme';
import { classifyHousing, DEFAULT_ROUTING, EMERGENCY_TERMS } from '@/utils/classify-housing';
import { successFeedback } from '@/utils/haptics';
import { showOptionSheet } from '@/utils/option-sheet';

const MAX_DESCRIPTION = 250;
const TOTAL_STEPS = 3;

type Category = (typeof HOUSING_CATEGORIES)[number];
type PreferredTime = (typeof HOUSING_TIMES)[number];

export function HousingReportScreen() {
  const housing = useHousing();
  return (
    <QueryView query={housing} loadingLabel="Loading residence…">
      {(snapshot) => <HousingReportForm residence={snapshot.data} />}
    </QueryView>
  );
}

function HousingReportForm({ residence }: { residence: Residence }) {
  const submit = useServiceWrite<HousingRequest>();
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState('');
  const [building, setBuilding] = useState(residence.building);
  const [room, setRoom] = useState(residence.room);
  const [permission, setPermission] = useState(true);
  const [time, setTime] = useState<PreferredTime>('Weekday afternoon');
  const [category, setCategory] = useState<Category>(DEFAULT_ROUTING.category as Category);
  const [urgency, setUrgency] = useState<HousingUrgency>(DEFAULT_ROUTING.urgency);
  const [destination, setDestination] = useState(DEFAULT_ROUTING.destination);
  const [reason, setReason] = useState(DEFAULT_ROUTING.reason);
  const [acknowledged, setAcknowledged] = useState(false);

  const dirty = description.trim().length > 0 && !submittedId;
  const isEmergency = urgency === 'Emergency' || EMERGENCY_TERMS.test(description);

  const updateDescription = (value: string) => {
    const next = value.slice(0, MAX_DESCRIPTION);
    setDescription(next);
    if (next.trim().length >= 6) {
      const routing = classifyHousing(next);
      setCategory(routing.category as Category);
      setUrgency(routing.urgency);
      setDestination(routing.destination);
      setReason(routing.reason);
    }
    setError('');
  };

  const pickAttachment = () =>
    showOptionSheet(
      'Demo file picker',
      HOUSING_DEMO_FILES.map((file) => `${file.name} · ${file.size}`),
      (option) => {
        const file = HOUSING_DEMO_FILES.find((item) => option.startsWith(item.name))!;
        if (file.tooLarge) setError('That demo file is over 25 MB. Your description was preserved.');
        else setAttachment(file.name);
      },
    );

  const advance = () => {
    if (step === 1 && description.trim().length < 6) return setError('Add at least a short description so the issue can be routed.');
    if (step === 2 && !room.trim()) return setError('Room is required.');
    setError('');
    setStep((value) => Math.min(TOTAL_STEPS, value + 1));
  };

  const send = () => {
    if (!acknowledged) return setError('Acknowledge the demo-only notice before sending.');
    submit.mutate(
      {
        path: '/housing/requests',
        method: 'POST',
        body: {
          description: description.trim(),
          category,
          urgency,
          building,
          room,
          preferred_time: time,
          photos: [],
        },
      },
      {
        onSuccess: (snapshot) => {
          successFeedback();
          setSubmittedId(snapshot.data.id);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  if (submittedId) {
    return (
      <Screen contentStyle={{ paddingTop: spacing.xl }}>
        <Stack.Screen options={{ title: 'Request sent', headerLeft: () => null, gestureEnabled: true }} />
        <Orb icon="check" />
        <AppText variant="eyebrow" style={{ color: colors.brandDeep, textAlign: 'center', marginBottom: 6 }}>
          DEMO ONLY · NO BU REQUEST CREATED
        </AppText>
        <IntroBlock
          title={`Request ${submittedId}`}
          copy={`Routed to ${destination}. Expected next step: demo review by Residence Life / Facilities.`}
          centered
          bordered={false}
        />
        <Button title="View request" onPress={() => router.replace({ pathname: '/housing/[id]', params: { id: submittedId } })} />
        <Button title="Done" variant="secondary" onPress={() => router.back()} style={{ marginTop: 10 }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ gestureEnabled: !dirty }} />

      <View
        accessible
        accessibilityLabel={`Step ${step} of ${TOTAL_STEPS}`}
        style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: 14 }}>
        {step > 1 ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Previous step" hitSlop={8} onPress={() => setStep((value) => value - 1)}>
            <AppText variant="label" style={{ color: colors.brand, fontSize: 13 }}>
              Back
            </AppText>
          </Pressable>
        ) : null}
        <AppText variant="caption" style={{ color: colors.ink, fontWeight: '700' }}>
          Step {step} of {TOTAL_STEPS}
        </AppText>
        <View style={{ flex: 1, height: 5, borderRadius: 4, backgroundColor: colors.separator, overflow: 'hidden' }}>
          <View style={{ width: `${(step / TOTAL_STEPS) * 100}%`, height: '100%', backgroundColor: colors.brand }} />
        </View>
      </View>

      {step === 1 && (
        <>
          <IntroBlock title="What’s happening?" copy="Describe the issue first. You never need to choose a department." bordered={false} />
          <TextField
            label="Description"
            value={description}
            onChangeText={updateDescription}
            multiline
            maxLength={MAX_DESCRIPTION}
            showCount
            placeholder="Example: The radiator is making a loud knocking sound."
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: spacing.screen }}>
            {HOUSING_EXAMPLES.map((example) => (
              <Pressable
                key={example}
                accessibilityRole="button"
                accessibilityHint="Uses this example as the description"
                onPress={() => updateDescription(example)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  justifyContent: 'center',
                  paddingHorizontal: spacing.md,
                  borderWidth: 1,
                  borderColor: '#d7d4cf',
                  borderRadius: 22,
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.7 : 1,
                })}>
                <AppText variant="caption" style={{ color: colors.ink }}>
                  {example}
                </AppText>
              </Pressable>
            ))}
          </View>
          <View style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.separator }}>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="headline">Attachment</AppText>
              <AppText variant="caption">{attachment || 'Optional JPG, PNG, or PDF · under 25 MB'}</AppText>
            </View>
            <Button
              size="sm"
              variant="ghost"
              title={attachment ? 'Remove' : 'Add file'}
              onPress={attachment ? () => setAttachment('') : pickAttachment}
            />
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <IntroBlock title="Check details" copy="Confirm location and review the editable routing suggestion." bordered={false} />
          <TextField label="Residence" value={building} onChangeText={setBuilding} />
          <TextField
            label="Room · required"
            value={room}
            invalid={!room.trim()}
            onChangeText={(value) => {
              setRoom(value);
              setError('');
            }}
          />
          <ToggleRow label="Permission to enter" value={permission} onValueChange={setPermission} />
          <View style={{ height: spacing.lg }} />
          <ChoiceField label="Preferred time" options={HOUSING_TIMES} value={time} onChange={setTime} />

          <View style={{ borderTopWidth: 1, borderTopColor: colors.separator, paddingTop: spacing.lg, marginTop: 6 }}>
            <AppText variant="headline">AI suggestion — you confirm.</AppText>
            <AppText variant="caption" style={{ marginTop: 2, marginBottom: 15 }}>
              BU staff make the final decision.
            </AppText>
            <ChoiceField label="Category" options={HOUSING_CATEGORIES} value={category} onChange={setCategory} />
            <ChoiceField label="Urgency" options={HOUSING_URGENCIES} value={urgency} onChange={setUrgency} />
            <TextField label="Destination" value={destination} onChangeText={setDestination} />
            <TextField label="Short reason" value={reason} onChangeText={setReason} multiline />
          </View>
        </>
      )}

      {step === 3 && (
        <>
          <IntroBlock title="Review and send" bordered={false} />
          <KeyValueList
            items={[
              { label: 'Issue', value: description },
              { label: 'Location', value: `${building} · Room ${room}` },
              { label: 'Route', value: `${category} · ${urgency} · ${destination}` },
              { label: 'Entry', value: `${permission ? 'Permission granted' : 'Contact me first'} · ${time}` },
            ]}
          />
          {isEmergency ? (
            <EmergencyCallPanel
              title="This may need immediate help"
              copy="Examples include fire, flooding, gas or chemical smell, no water, lockout, or an unlivable room. Call first; online forms are not monitored 24/7.">
              <Pressable
                accessibilityRole="button"
                onPress={() => setUrgency('Urgent')}
                style={{ minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.separator }}>
                <AppText variant="headline" style={{ color: colors.brand }}>
                  Not an emergency—continue as urgent
                </AppText>
              </Pressable>
            </EmergencyCallPanel>
          ) : (
            <View style={{ marginTop: spacing.lg }}>
              <CheckboxRow
                checked={acknowledged}
                onChange={(value) => {
                  setAcknowledged(value);
                  setError('');
                }}>
                I understand this is a demo and no real BU request will be created.
              </CheckboxRow>
              <Button title={submit.isPending ? 'Sending…' : 'Send request'} disabled={submit.isPending} onPress={send} />
            </View>
          )}
        </>
      )}

      <InlineError message={error} />
      {step < TOTAL_STEPS && <Button title="Continue" onPress={advance} style={{ marginTop: spacing.lg, borderRadius: radius.lg }} />}
    </Screen>
  );
}
