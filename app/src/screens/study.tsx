import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { combineQueries } from '@/api/combine';
import {
  FORMAT_OPTIONS,
  GOAL_OPTIONS,
  INTEREST_OPTIONS,
  MODE_OPTIONS,
  WEEKDAY_OPTIONS,
  courseLabel,
  labelOf,
  useCommunityConfig,
  useInvitationAction,
  useInvitationFeedback,
  useSaveStudyProfile,
  useSendStudyInvite,
  useStudyInvitations,
  useStudyMatches,
  useStudyProfile,
  type AvailabilityWindow,
  type CommunityConfig,
  type StudyInvitation,
  type StudyMatch,
  type StudyMatches,
  type StudyProfile,
  type StudyRanking,
} from '@/api/community';
import { errorMessage } from '@/api/client';
import { useCourses } from '@/api/queries';
import { useCurrentUser } from '@/stores/session-store';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { Avatar } from '@/components/content';
import { DemoBanner, EmptyState, InlineError } from '@/components/feedback';
import { CheckboxRow, ChoiceField, TextField, ToggleRow } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { colors, spacing } from '@/theme';
import { formatTime, toCampusIso } from '@/utils/campus-time';
import { successFeedback } from '@/utils/haptics';
import { showToast } from '@/stores/toast-store';

const initialsOf = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

export function StudyScreen() {
  const [ranking, setRanking] = useState<StudyRanking>('rules');
  const query = combineQueries([useStudyProfile(), useStudyMatches(ranking), useStudyInvitations(), useCommunityConfig(), useCourses()] as const, (profile, matches, invitations, config, courses) => ({
    profile,
    matches,
    invitations,
    config,
    courses: courses.courses,
  }));

  return (
    <Screen onRefresh={() => query.refetch()}>
      <QueryView query={query} loadingLabel="Loading study peers…">
        {(data) => <StudyHome ranking={ranking} onRanking={setRanking} {...data} />}
      </QueryView>
    </Screen>
  );
}

function StudyHome({
  profile,
  matches,
  invitations,
  config,
  courses,
  ranking,
  onRanking,
}: {
  profile: StudyProfile;
  matches: StudyMatches;
  invitations: StudyInvitation[];
  config: CommunityConfig;
  courses: { id: string; code: string; title: string }[];
  ranking: StudyRanking;
  onRanking: (value: StudyRanking) => void;
}) {
  const user = useCurrentUser();
  const incoming = invitations.filter((item) => item.recipient === user);
  const outgoing = invitations.filter((item) => item.sender === user);
  const catalog = config.courses.length ? config.courses : courses;

  return (
    <>
      {config.is_mock ? (
        <DemoBanner title="Prototype matching">{`Study peers are classmates on this demo API, not a BU directory. ${config.expectations}`}</DemoBanner>
      ) : null}

      <StudyProfileCard profile={profile} courses={catalog} term={config.term} />

      <Section title="Invitations">
        {incoming.length || outgoing.length ? (
          <>
            {incoming.map((item) => (
              <InvitationRow key={item.id} item={item} mine={false} courses={catalog} />
            ))}
            {outgoing.map((item) => (
              <InvitationRow key={item.id} item={item} mine courses={catalog} />
            ))}
          </>
        ) : (
          <EmptyState title="No invitations yet" subtitle="Invite a classmate from a match, or wait for one to reach out." />
        )}
      </Section>

      <Section title="Matches" action={{ label: ranking === 'rules' ? 'Try model rank' : 'Use rules', onPress: () => onRanking(ranking === 'rules' ? 'model' : 'rules') }}>
        {matches.synthetic_only ? (
          <AppText variant="caption" style={{ marginBottom: spacing.sm }}>
            Experimental ranking. {matches.items[0]?.model?.meaning ?? 'Not a probability of a successful session.'}
          </AppText>
        ) : null}
        {matches.items.length ? (
          matches.items.map((item) => (
            <ListRow
              key={item.student_id}
              leading={<Avatar initials={initialsOf(item.display_name)} />}
              title={item.display_name}
              subtitle={`${item.overlap_minutes} min overlap · ${item.course_ids.map((id) => courseLabel(catalog, id)).join(', ')}`}
              value={item.campus_area ?? undefined}
              minHeight={73}
              onPress={() => router.push({ pathname: '/study/[id]', params: { id: item.student_id } })}
            />
          ))
        ) : (
          <EmptyState title="No matches yet" subtitle={matches.explanation ?? 'Turn on discovery and add courses or study windows.'} />
        )}
      </Section>
    </>
  );
}

function StudyProfileCard({ profile, courses, term }: { profile: StudyProfile; courses: { id: string; code: string; title: string }[]; term: string }) {
  const save = useSaveStudyProfile();
  const [draft, setDraft] = useState(profile);
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState('16:00');
  const [end, setEnd] = useState('18:00');
  const [weekday, setWeekday] = useState(1);

  const persist = (next: StudyProfile) => {
    setDraft(next);
    save.mutate(
      { ...next, term: next.term || term },
      {
        onSuccess: () => {
          successFeedback();
          showToast('Study profile saved');
        },
        onError: (error) => showToast(errorMessage(error)),
      },
    );
  };

  const toggle = <T,>(list: T[], value: T, max: number) => (list.includes(value) ? list.filter((item) => item !== value) : list.length < max ? [...list, value] : list);

  return (
    <View>
      <ToggleRow
        label="Show me to classmates"
        subtitle={draft.discovery ? 'You’re discoverable this term' : 'Turn on to appear in matches'}
        value={draft.discovery}
        onValueChange={(discovery) => persist({ ...draft, discovery })}
      />
      <ToggleRow label="Invite notifications" value={draft.notifications} onValueChange={(notifications) => persist({ ...draft, notifications })} />

      <AppText variant="caption" style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
        Courses
      </AppText>
      {courses.map((course) => (
        <CheckboxRow key={course.id} checked={draft.course_ids.includes(course.id)} onChange={() => persist({ ...draft, course_ids: toggle(draft.course_ids, course.id, 12) })}>
          {course.code} · {course.title}
        </CheckboxRow>
      ))}

      <AppText variant="caption" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
        Goals
      </AppText>
      {GOAL_OPTIONS.map((option) => (
        <CheckboxRow key={option.id} checked={draft.goals.includes(option.id)} onChange={() => persist({ ...draft, goals: toggle(draft.goals, option.id, 3) })}>
          {option.label}
        </CheckboxRow>
      ))}

      <ChoiceField
        label="Study format"
        options={FORMAT_OPTIONS.map((option) => option.label)}
        value={labelOf(FORMAT_OPTIONS, draft.study_format)}
        onChange={(label) => persist({ ...draft, study_format: FORMAT_OPTIONS.find((option) => option.label === label)?.id ?? null })}
      />
      <ChoiceField
        label="Meeting"
        options={MODE_OPTIONS.map((option) => option.label)}
        value={labelOf(MODE_OPTIONS, draft.meeting_mode)}
        onChange={(label) => persist({ ...draft, meeting_mode: MODE_OPTIONS.find((option) => option.label === label)?.id ?? null })}
      />

      <AppText variant="caption" style={{ marginBottom: spacing.sm }}>
        Interests
      </AppText>
      {INTEREST_OPTIONS.map((option) => (
        <CheckboxRow key={option.id} checked={draft.interests.includes(option.id)} onChange={() => persist({ ...draft, interests: toggle(draft.interests, option.id, 5) })}>
          {option.label}
        </CheckboxRow>
      ))}

      <TextField label="Campus area" value={draft.campus_area ?? ''} onChangeText={(campus_area) => setDraft({ ...draft, campus_area })} onEndEditing={() => persist({ ...draft, campus_area: draft.campus_area?.trim() || null })} placeholder="West Campus" />

      <AppText variant="caption" style={{ marginBottom: spacing.sm }}>
        Weekly windows
      </AppText>
      {draft.availability.map((window, index) => (
        <ListRow
          key={`${window.weekday}-${window.start}-${index}`}
          title={`${WEEKDAY_OPTIONS[window.weekday] ?? 'Day'} · ${window.start}–${window.end}`}
          accessory="none"
          value="Remove"
          onPress={() => persist({ ...draft, availability: draft.availability.filter((_, item) => item !== index) })}
        />
      ))}
      {adding ? (
        <View>
          <ChoiceField label="Day" options={[...WEEKDAY_OPTIONS]} value={WEEKDAY_OPTIONS[weekday]} onChange={(label) => setWeekday(WEEKDAY_OPTIONS.indexOf(label as (typeof WEEKDAY_OPTIONS)[number]))} />
          <TextField label="Start (24h)" value={start} onChangeText={setStart} placeholder="16:00" />
          <TextField label="End (24h)" value={end} onChangeText={setEnd} placeholder="18:00" />
          <Button
            title="Add window"
            disabled={save.isPending}
            onPress={() => {
              if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) {
                showToast('Use 24-hour times like 16:00');
                return;
              }
              const next: AvailabilityWindow = { weekday, start, end };
              persist({ ...draft, availability: [...draft.availability, next] });
              setAdding(false);
            }}
          />
        </View>
      ) : (
        <Button title="Add study window" variant="secondary" onPress={() => setAdding(true)} />
      )}
      {save.error ? <InlineError message={errorMessage(save.error)} /> : null}
    </View>
  );
}

function InvitationRow({ item, mine, courses }: { item: StudyInvitation; mine: boolean; courses: { id: string; code: string; title: string }[] }) {
  const action = useInvitationAction();
  const feedback = useInvitationFeedback();
  const busy = action.isPending || feedback.isPending;
  const other = mine ? item.recipient : item.sender;

  return (
    <View style={{ paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.separator, gap: spacing.sm }}>
      <AppText variant="headline">{mine ? `To ${other}` : `From ${other}`}</AppText>
      <AppText variant="caption">
        {courseLabel(courses, item.course_id)} · {item.status}
        {item.proposed_time ? ` · ${item.proposed_time}` : ''}
      </AppText>
      {item.message ? <AppText variant="callout">{item.message}</AppText> : null}
      {item.status === 'pending' ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {mine ? (
            <Button title="Cancel" size="sm" variant="secondary" disabled={busy} onPress={() => action.mutate({ id: item.id, action: 'cancel' }, { onError: (error) => showToast(errorMessage(error)) })} />
          ) : (
            <>
              <Button
                title="Accept"
                size="sm"
                disabled={busy}
                onPress={() =>
                  action.mutate(
                    { id: item.id, action: 'accept' },
                    {
                      onSuccess: (result) => {
                        successFeedback();
                        if (result.conversation_id) router.push({ pathname: '/inbox/[id]', params: { id: result.conversation_id } });
                      },
                      onError: (error) => showToast(errorMessage(error)),
                    },
                  )
                }
              />
              <Button title="Decline" size="sm" variant="secondary" disabled={busy} onPress={() => action.mutate({ id: item.id, action: 'decline' }, { onError: (error) => showToast(errorMessage(error)) })} />
            </>
          )}
        </View>
      ) : null}
      {item.status === 'accepted' && item.conversation_id ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Button title="Open chat" size="sm" onPress={() => router.push({ pathname: '/inbox/[id]', params: { id: item.conversation_id! } })} />
          <Button title="Useful match" size="sm" variant="secondary" disabled={busy} onPress={() => feedback.mutate({ id: item.id, useful: true }, { onSuccess: () => showToast('Thanks for the feedback') })} />
        </View>
      ) : null}
    </View>
  );
}

export function StudyMatchScreen({ id }: { id: string }) {
  const [ranking] = useState<StudyRanking>('rules');
  const query = combineQueries([useStudyMatches(ranking), useStudyInvitations(), useCommunityConfig(), useStudyProfile()] as const, (matches, invitations, config, profile) => ({
    match: matches.items.find((item) => item.student_id === id) ?? null,
    invitations,
    config,
    profile,
  }));

  return (
    <Screen onRefresh={() => query.refetch()}>
      <QueryView query={query} loadingLabel="Loading classmate…">
        {({ match, invitations, config, profile }) =>
          match ? <MatchDetail match={match} invitations={invitations} courses={config.courses} profile={profile} /> : <EmptyState title="Match unavailable" subtitle="They may have turned discovery off." />
        }
      </QueryView>
    </Screen>
  );
}

function MatchDetail({
  match,
  invitations,
  courses,
  profile,
}: {
  match: StudyMatch;
  invitations: StudyInvitation[];
  courses: { id: string; code: string; title: string }[];
  profile: StudyProfile;
}) {
  const user = useCurrentUser();
  const invite = useSendStudyInvite();
  const shared = match.course_ids.filter((id) => profile.course_ids.includes(id));
  const [courseId, setCourseId] = useState(shared[0] ?? match.course_ids[0] ?? '');
  const [message, setMessage] = useState('');
  const [proposed, setProposed] = useState(match.windows[0] ? `${formatTime(toCampusIso(match.windows[0].starts_at))} at Mugar` : '');
  const existing = invitations.find((item) => (item.recipient === match.student_id || item.sender === match.student_id) && item.status === 'pending');

  const courseOptions = useMemo(() => (shared.length ? shared : match.course_ids).map((id) => courseLabel(courses, id)), [shared, match.course_ids, courses]);

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <Avatar initials={initialsOf(match.display_name)} size={64} tone="dark" />
        <View style={{ flex: 1 }}>
          <AppText variant="largeTitle">{match.display_name}</AppText>
          <AppText>{match.campus_area ?? 'BU campus'} · {match.overlap_minutes} min overlap</AppText>
        </View>
      </View>

      <AppText variant="callout">
        {labelOf(FORMAT_OPTIONS, match.study_format)} · {labelOf(MODE_OPTIONS, match.meeting_mode)} · {match.shared_goals.map((goal) => labelOf(GOAL_OPTIONS, goal)).join(', ')}
      </AppText>
      <AppText variant="caption" style={{ marginTop: spacing.sm }}>
        Shared courses: {match.course_ids.map((id) => courseLabel(courses, id)).join(', ')}
      </AppText>
      {match.windows.map((window) => (
        <ListRow
          key={window.starts_at}
          title={`${formatTime(toCampusIso(window.starts_at))}–${formatTime(toCampusIso(window.ends_at))}`}
          subtitle="Suggested overlap"
          accessory="none"
        />
      ))}

      {existing ? (
        <EmptyState title="Invitation pending" subtitle={`Waiting on ${existing.recipient === user ? 'you' : existing.recipient}.`} />
      ) : (
        <Section title="Invite to study">
          {courseOptions.length ? (
            <ChoiceField
              label="Course"
              options={courseOptions}
              value={courseLabel(courses, courseId)}
              onChange={(label) => {
                const id = [...shared, ...match.course_ids].find((item) => courseLabel(courses, item) === label);
                if (id) setCourseId(id);
              }}
            />
          ) : null}
          <TextField label="Proposed time" value={proposed} onChangeText={setProposed} placeholder="Tuesday 4:30 PM at Mugar" />
          <TextField label="Message" value={message} onChangeText={setMessage} multiline maxLength={2000} placeholder="Want to review before the midterm?" />
          {invite.error ? <InlineError message={errorMessage(invite.error)} /> : null}
          <Button
            title="Send invitation"
            disabled={invite.isPending || !courseId}
            onPress={() =>
              invite.mutate(
                { recipient: match.student_id, course_id: courseId, message: message.trim() || undefined, proposed_time: proposed.trim() || undefined },
                {
                  onSuccess: () => {
                    successFeedback();
                    showToast('Invitation sent');
                    router.back();
                  },
                },
              )
            }
          />
        </Section>
      )}
    </>
  );
}
