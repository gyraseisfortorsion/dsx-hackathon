import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';

import { combineQueries } from '@/api/combine';
import { ApiError, errorMessage } from '@/api/client';
import { isEmptyPreferences, preferencesQuery, useEventOptions, usePreferences, useSavePreferences } from '@/api/events';
import type { EventOptions, Preferences } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { IntroBlock } from '@/components/content';
import { InlineError } from '@/components/feedback';
import { TextField, ToggleRow } from '@/components/form';
import { Pill } from '@/components/pill';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { goToTab } from '@/navigation/routes';
import { useEventBrowseStore } from '@/stores/event-browse-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { usePreferencesStore } from '@/stores/preferences-store';
import { useCurrentUser } from '@/stores/session-store';
import { showToast } from '@/stores/toast-store';
import { colors, spacing } from '@/theme';
import { successFeedback } from '@/utils/haptics';

const MAX_INTERESTS = 10;
const MAX_GOALS = 5;
const MAX_INTERESTS_TEXT = 500;

type Draft = Omit<Preferences, 'version'>;

const toDraft = ({ version: _version, ...draft }: Preferences): Draft => draft;

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

function usePreferencesForm() {
  return combineQueries([useEventOptions(), usePreferences()] as const, (options, preferences) => ({ options, preferences }));
}

/** Event personalization form. Choices come from GET /events/options, never from the app. */
function PreferencesEditor({
  options,
  initial,
  submitLabel,
  requireChanges,
  onSaved,
  children,
}: {
  options: EventOptions;
  initial: Preferences;
  submitLabel: string;
  requireChanges?: boolean;
  onSaved?: (saved: Preferences) => void;
  children?: ReactNode;
}) {
  const user = useCurrentUser();
  const client = useQueryClient();
  const save = useSavePreferences();
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [limitMessage, setLimitMessage] = useState('');

  const toggle = (key: 'interest_ids' | 'goal_ids', id: string, max: number, noun: string) => {
    const selected = draft[key].includes(id);
    if (!selected && draft[key].length >= max) {
      setLimitMessage(`You can choose up to ${max} ${noun}.`);
      return;
    }
    setLimitMessage('');
    setDraft({ ...draft, [key]: selected ? draft[key].filter((item) => item !== id) : [...draft[key], id] });
  };

  const submit = () => {
    save.mutate(
      { draft: { ...draft, interests_text: draft.interests_text.trim() }, base },
      {
        onSuccess: (saved) => {
          setBase(saved);
          setDraft(toDraft(saved));
          successFeedback();
          showToast('Preferences saved');
          onSaved?.(saved);
        },
        onError: (error) => {
          if (!(error instanceof ApiError) || error.status !== 409 || !user) return;
          const latest = client.getQueryData(preferencesQuery(user).queryKey);
          if (latest) setBase(latest);
        },
      },
    );
  };

  const unchanged = sameDraft(draft, toDraft(base));

  return (
    <View>
      <Section title="Interests" caption={`${draft.interest_ids.length} / ${MAX_INTERESTS}`} style={{ marginTop: 0 }}>
        <View style={{ marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {options.interests.map((interest) => (
            <Pill
              key={interest.id}
              label={interest.label}
              active={draft.interest_ids.includes(interest.id)}
              onPress={() => toggle('interest_ids', interest.id, MAX_INTERESTS, 'interests')}
            />
          ))}
        </View>
      </Section>

      <View style={{ marginTop: spacing.lg }}>
        <TextField
          label="Anything more specific? (optional)"
          placeholder="Beginner robotics and live jazz"
          value={draft.interests_text}
          onChangeText={(interests_text) => setDraft((state) => ({ ...state, interests_text }))}
          maxLength={MAX_INTERESTS_TEXT}
          showCount
          multiline
        />
      </View>

      <Section title="Goals" caption={`${draft.goal_ids.length} / ${MAX_GOALS}`} style={{ marginTop: spacing.sm }}>
        <View style={{ marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {options.goals.map((goal) => (
            <Pill key={goal.id} label={goal.label} active={draft.goal_ids.includes(goal.id)} onPress={() => toggle('goal_ids', goal.id, MAX_GOALS, 'goals')} />
          ))}
        </View>
      </Section>

      <Section title="Schedule">
        <ToggleRow
          label="Avoid class conflicts"
          subtitle="Leave out events that overlap your class meetings. BU One checks this on the server."
          value={draft.avoid_schedule_conflicts}
          onValueChange={(avoid_schedule_conflicts) => setDraft((state) => ({ ...state, avoid_schedule_conflicts }))}
        />
      </Section>

      {limitMessage ? (
        <AppText variant="caption" accessibilityRole="alert" style={{ color: colors.errorText, marginTop: spacing.md }}>
          {limitMessage}
        </AppText>
      ) : null}
      {save.error ? <InlineError message={errorMessage(save.error)} /> : null}

      <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
        <Button title={save.isPending ? 'Saving…' : submitLabel} onPress={submit} disabled={save.isPending || (requireChanges && unchanged)} />
        {children}
      </View>
    </View>
  );
}

export function PreferencesScreen() {
  const form = usePreferencesForm();
  const { vegetarian, stepFree, setVegetarian, setStepFree } = usePreferencesStore(
    useShallow((state) => ({ vegetarian: state.vegetarian, stepFree: state.stepFree, setVegetarian: state.setVegetarian, setStepFree: state.setStepFree })),
  );

  return (
    <Screen onRefresh={form.refetch}>
      <AppText variant="caption" style={{ marginBottom: spacing.lg }}>
        Saved to your BU One profile and used to rank For You and search. Event options come from the student API.
      </AppText>
      <QueryView query={form} loadingLabel="Loading preferences…">
        {({ options, preferences }) => <PreferencesEditor options={options} initial={preferences} submitLabel="Save preferences" requireChanges />}
      </QueryView>

      <Section title="On this device" caption="Plan my day">
        <ToggleRow label="Vegetarian suggestions" value={vegetarian} onValueChange={setVegetarian} />
        <ToggleRow label="Step-free routes" value={stepFree} onValueChange={setStepFree} />
      </Section>
    </Screen>
  );
}

export function OnboardingScreen() {
  const user = useCurrentUser();
  const form = usePreferencesForm();
  const markDone = useOnboardingStore((state) => state.markDone);
  const setSegment = useEventBrowseStore((state) => state.setSegment);

  const finish = (segment: 'For You' | 'Upcoming') => {
    if (user) markDone(user);
    setSegment(segment);
    goToTab('events');
  };

  return (
    <Screen>
      <IntroBlock
        title="What are you into?"
        copy="Choose interests and goals so BU One can rank campus events for you. It’s optional, and you can change it anytime in Me → Interests & Preferences."
        bordered={false}
      />
      <QueryView query={form} loadingLabel="Loading options…">
        {({ options, preferences }) => (
          <PreferencesEditor
            options={options}
            initial={preferences}
            submitLabel="Save and show my picks"
            onSaved={(saved) => finish(isEmptyPreferences(saved) ? 'Upcoming' : 'For You')}>
            <Button title="Skip for now" variant="secondary" onPress={() => finish('Upcoming')} />
          </PreferencesEditor>
        )}
      </QueryView>
      {form.data === undefined && form.error ? (
        <Button title="Skip and browse all events" variant="secondary" onPress={() => finish('Upcoming')} style={{ marginTop: spacing.md }} />
      ) : null}
    </Screen>
  );
}
