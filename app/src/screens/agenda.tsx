import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { combineQueries } from '@/api/combine';
import { useAttendance, useGrades } from '@/api/queries';
import { allAssessments, assessmentResult, sectionOf, type AgendaEntry } from '@/api/selectors';
import { useSchedule, type Schedule } from '@/api/use-schedule';
import { Button } from '@/components/button';
import { AiActionRow, DetailItem, MetricHero } from '@/components/content';
import { DemoBanner } from '@/components/feedback';
import { NotFound } from '@/components/not-found';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { openAsk } from '@/navigation/routes';
import { spacing } from '@/theme';
import { openLink } from '@/utils/open-link';
import { dateOf, formatClockTime, formatLongDate, formatTime, formatWeekdays } from '@/utils/campus-time';

const ATTENDANCE_LABELS: Record<string, string> = { present: 'Marked present', late: 'Marked late', absent: 'Marked absent', excused: 'Excused absence' };

/** Detail for a calendar entry; layout depends on whether it's a class meeting or an assessment. */
export function AgendaDetailScreen({ id }: { id: string }) {
  const schedule = useSchedule();
  return (
    <QueryView query={schedule}>
      {(data) => {
        const entry = data.entries.find((item) => item.id === id);
        if (!entry) return <NotFound what="calendar item" />;
        return entry.isClass ? <ClassDetail entry={entry} schedule={data} /> : <AssessmentDetail entry={entry} />;
      }}
    </QueryView>
  );
}

function ClassDetail({ entry, schedule }: { entry: AgendaEntry; schedule: Schedule }) {
  const attendance = useAttendance();
  const course = schedule.courses.get(entry.source.course_id);
  const section = sectionOf(course, entry.source.section_id);
  const record = attendance.data?.courses
    .find((item) => item.course_id === entry.source.course_id)
    ?.records.find((item) => item.event_id === entry.id);
  const meetings = section?.meetings ?? [];

  return (
    <Screen>
      <Stack.Screen options={{ title: entry.code }} />
      <MetricHero
        eyebrow={`${entry.label.toUpperCase()} · SECTION ${section?.id ?? '—'}`}
        value={formatTime(entry.startsAt)}
        description={[course?.title, formatLongDate(dateOf(entry.startsAt))].filter(Boolean).join(' · ')}
      />
      {entry.location ? <DetailItem icon="pin" title={entry.location} subtitle="Room" /> : null}
      {meetings.map((meeting) => (
        <DetailItem
          key={`${meeting.weekdays.join()}-${meeting.start_time}`}
          icon="calendar"
          title={formatWeekdays(meeting.weekdays)}
          subtitle={`${formatClockTime(meeting.start_time)}–${formatClockTime(meeting.end_time)}`}
        />
      ))}
      {section?.instructors.length ? <DetailItem icon="person" title={section.instructors.join(', ')} subtitle={section.instructors.length > 1 ? 'Instructors' : 'Instructor'} /> : null}
      {record ? <DetailItem icon="check" title={ATTENDANCE_LABELS[record.status] ?? record.status} subtitle="Attendance for this session" /> : null}
      {section?.notes ? <DetailItem icon="menu" title="Section note" subtitle={section.notes} /> : null}

      <View style={{ marginTop: spacing.xl, gap: 10 }}>
        <Button title="Course attendance" onPress={() => router.push({ pathname: '/attendance/[id]', params: { id: entry.source.course_id } })} />
        {course?.source.url ? <Button title="Course description" icon="external" variant="secondary" onPress={() => openLink(course.source.url)} /> : null}
      </View>
    </Screen>
  );
}

function AssessmentDetail({ entry }: { entry: AgendaEntry }) {
  const grades = useGrades();
  const assessmentQuery = combineQueries([grades] as const, (data) => allAssessments(data.courses).find((item) => item.id === entry.source.assessment_id) ?? null);

  return (
    <Screen>
      <Stack.Screen options={{ title: entry.label }} />
      <DemoBanner title="Demo LMS data">Confirm submission details in the official course LMS.</DemoBanner>
      <MetricHero
        eyebrow={`${entry.label.toUpperCase()} · ${entry.code}`}
        value={formatTime(entry.startsAt)}
        description={`${entry.title} · ${formatLongDate(dateOf(entry.startsAt))}`}
      />
      {entry.location ? <DetailItem icon="pin" title={entry.location} subtitle="Location" /> : null}
      {entry.endsAt ? (
        <DetailItem icon="calendar" title={`${formatTime(entry.startsAt)}–${formatTime(entry.endsAt)}`} subtitle="Scheduled time" />
      ) : (
        <DetailItem icon="calendar" title={`Due ${formatTime(entry.startsAt)}`} subtitle={formatLongDate(dateOf(entry.startsAt))} />
      )}
      <QueryView query={assessmentQuery} compact>
        {(assessment) =>
          assessment ? (
            <DetailItem
              icon="check"
              title={assessmentResult(assessment)}
              subtitle={assessment.status === 'graded' ? `Score out of ${assessment.max_score}` : `Worth ${assessment.max_score} points`}
            />
          ) : null
        }
      </QueryView>
      <View style={{ marginTop: spacing.xl, gap: 10 }}>
        <Button title="Course grades" onPress={() => router.push({ pathname: '/grades/[id]', params: { id: entry.source.course_id } })} />
      </View>
      <View style={{ marginTop: spacing.lg }}>
        <AiActionRow boxed title={`Help me prepare for ${entry.label.toLowerCase()}`} subtitle="Study plan and review topics, not graded answers" onPress={() => openAsk(`Help me prepare for ${entry.title}`)} />
      </View>
    </Screen>
  );
}
