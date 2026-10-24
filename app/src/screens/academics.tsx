import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { combineQueries } from '@/api/combine';
import { useAttendance, useCourses, useGrades } from '@/api/queries';
import {
  assessmentResult,
  attendanceStats,
  averageGrade,
  courseLookup,
  formatPercent,
  formatTerm,
  letterGrade,
  overallAttendance,
  pluralize,
  type CourseLookup,
} from '@/api/selectors';
import type { Assessment, CourseAttendance, CourseGrades } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { AiActionRow, MetricHero, Paragraph } from '@/components/content';
import { DemoBanner, EmptyState, FootNote, SuccessBanner } from '@/components/feedback';
import { ListRow } from '@/components/list-row';
import { NotFound } from '@/components/not-found';
import { PrivacyToggle } from '@/components/privacy-toggle';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { openAsk } from '@/navigation/routes';
import { useAcademicsStore } from '@/stores/academics-store';
import { colors, radius, spacing } from '@/theme';
import { campusToday, dateOf, formatLongDate, formatRelativeDay, formatShortDate, formatTime } from '@/utils/campus-time';

const STATUS_LABELS: Record<string, string> = { present: 'Present', late: 'Late', absent: 'Absent', excused: 'Excused' };
const RECENT_SESSIONS = 12;
const RECENT_ASSESSMENTS = 5;

const courseName = (courses: CourseLookup, id: string) => courses.get(id)?.code ?? id.toUpperCase();

function useAttendanceWithCourses() {
  const attendance = useAttendance();
  const courses = useCourses();
  return combineQueries([attendance, courses] as const, (attendanceData, coursesData) => ({
    attendance: attendanceData,
    courses: courseLookup(coursesData.courses),
    term: coursesData.term,
  }));
}

function useGradesWithCourses() {
  const grades = useGrades();
  const courses = useCourses();
  return combineQueries([grades, courses] as const, (gradesData, coursesData) => ({
    grades: gradesData,
    courses: courseLookup(coursesData.courses),
    term: coursesData.term,
  }));
}

function absenceSummary(course: CourseAttendance) {
  const lastAbsence = course.records.filter((record) => record.status === 'absent').at(-1);
  if (!lastAbsence) return 'No unexcused absences this term';
  return `Last absence ${formatShortDate(dateOf(lastAbsence.starts_at))}`;
}

export function AttendanceScreen() {
  const query = useAttendanceWithCourses();
  const reporting = useAcademicsStore((state) => state.reportingAbsence);
  const reportedFor = useAcademicsStore((state) => state.absenceReportedFor);
  const setReporting = useAcademicsStore((state) => state.setReportingAbsence);
  const reportAbsence = useAcademicsStore((state) => state.reportAbsence);

  return (
    <Screen onRefresh={query.refetch}>
      <DemoBanner title="Demo LMS data" style={{ marginBottom: spacing.xs }}>
        This is not an official or universal BU attendance record. Confirm details with your instructor and syllabus.
      </DemoBanner>
      <QueryView query={query} loadingLabel="Loading attendance…">
        {({ attendance, courses, term }) => {
          const overall = overallAttendance(attendance.courses);
          return (
            <>
              <MetricHero
                eyebrow={`${formatTerm(term.id).toUpperCase()} · ALL COURSES`}
                value={`${overall.percent}%`}
                description={`${overall.attended} of ${overall.total} sessions attended · ${pluralize(overall.absent, 'absence', 'absences')}`}
              />

              <Section title="Courses">
                {attendance.courses.map((course) => (
                  <AttendanceCourseCard key={course.course_id} course={course} name={courseName(courses, course.course_id)} title={courses.get(course.course_id)?.title} />
                ))}
              </Section>

              <View style={{ marginTop: spacing.screen }}>
                {reportedFor ? (
                  <SuccessBanner message={`Demo absence report saved locally · ${reportedFor}`} />
                ) : reporting ? (
                  <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: 15, borderCurve: 'continuous', padding: 15 }}>
                    <AppText variant="headline">Report an absence</AppText>
                    <AppText variant="caption" style={{ marginTop: 4, marginBottom: spacing.md }}>
                      Choose the affected course. This demo will not notify BU or your instructor.
                    </AppText>
                    {attendance.courses.map((course) => {
                      const name = courseName(courses, course.course_id);
                      return (
                        <ListRow
                          key={course.course_id}
                          title={name}
                          accessory="none"
                          minHeight={44}
                          onPress={() => reportAbsence(name)}
                          style={{ borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: '#d9d6d1' }}
                        />
                      );
                    })}
                    <Button title="Cancel" variant="ghost" onPress={() => setReporting(false)} style={{ justifyContent: 'center' }} />
                  </View>
                ) : (
                  <Button title="Report an absence" onPress={() => setReporting(true)} />
                )}
              </View>
              <FootNote>{`Demo LMS sync · ${formatLongDate(attendance.as_of.slice(0, 10))} at ${formatTime(attendance.as_of)}`}</FootNote>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

function AttendanceCourseCard({ course, name, title }: { course: CourseAttendance; name: string; title?: string }) {
  const [policyOpen, setPolicyOpen] = useState(false);
  const stats = attendanceStats(course);
  return (
    <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
      <ListRow
        title={name}
        subtitle={[title, `${stats.attended}/${stats.total} sessions`].filter(Boolean).join(' · ')}
        value={`${stats.percent}%`}
        valueStyle={{ fontSize: 17 }}
        separator={false}
        minHeight={48}
        onPress={() => router.push({ pathname: '/attendance/[id]', params: { id: course.course_id } })}
        style={{ paddingVertical: 0 }}
      />
      <AppText variant="caption" style={{ color: colors.muted, marginTop: spacing.sm, marginBottom: 3 }}>
        {[stats.late ? pluralize(stats.late, 'late arrival') : null, stats.excused ? `${stats.excused} excused` : null, absenceSummary(course)].filter(Boolean).join(' · ')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <LinkButton label={policyOpen ? 'Hide policy' : 'View policy'} expanded={policyOpen} onPress={() => setPolicyOpen((value) => !value)} />
        <LinkButton label="Ask about this course" onPress={() => openAsk(`What is the attendance policy for ${name}?`)} />
      </View>
      {policyOpen && (
        <View style={{ backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.md, gap: 3 }}>
          <AppText variant="caption" style={{ color: colors.ink, fontWeight: '700' }}>
            Syllabus policy
          </AppText>
          <AppText variant="caption" style={{ color: '#55555b' }}>
            Attendance expectations are set per course. Late arrivals count as attended; excused absences need instructor approval.
          </AppText>
        </View>
      )}
    </View>
  );
}

function LinkButton({ label, onPress, expanded }: { label: string; onPress: () => void; expanded?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? undefined : { expanded }}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <AppText variant="label" style={{ color: colors.brandDeep, fontSize: 13, fontWeight: '700' }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function AttendanceCourseScreen({ id }: { id: string }) {
  const query = useAttendanceWithCourses();
  const setReporting = useAcademicsStore((state) => state.setReportingAbsence);

  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query}>
        {({ attendance, courses }) => {
          const course = attendance.courses.find((item) => item.course_id === id);
          if (!course) return <NotFound what="course" />;
          const name = courseName(courses, id);
          const stats = attendanceStats(course);
          const today = campusToday();
          const recent = course.records.filter((record) => dateOf(record.starts_at) <= today).slice(-RECENT_SESSIONS).reverse();
          return (
            <>
              <Stack.Screen options={{ title: name }} />
              <DemoBanner title="Demo LMS data">Not an official universal BU attendance record.</DemoBanner>
              <MetricHero
                eyebrow="COURSE ATTENDANCE"
                value={`${stats.percent}%`}
                description={`${courses.get(id)?.title ?? name} · ${stats.attended} of ${stats.total} sessions attended`}
              />
              <Section title="Recent sessions">
                {recent.length ? (
                  recent.map((record) => (
                    <ListRow
                      key={record.event_id}
                      title={formatRelativeDay(dateOf(record.starts_at), today)}
                      subtitle={formatTime(record.starts_at)}
                      value={STATUS_LABELS[record.status] ?? record.status}
                      valueStyle={{ fontSize: 14, color: record.status === 'absent' ? colors.brand : colors.ink }}
                      minHeight={52}
                    />
                  ))
                ) : (
                  <EmptyState title="No sessions yet" />
                )}
              </Section>
              <Section title="Syllabus policy">
                <Paragraph>Course-specific attendance expectations apply. Confirm this demo summary against the current syllabus or with your instructor.</Paragraph>
              </Section>
              <Button
                title="Report an absence"
                variant="secondary"
                onPress={() => {
                  setReporting(true);
                  router.back();
                }}
              />
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}

const explainWeighting = () => openAsk('Explain how my grades are weighted');

function gradeLabel(grade: CourseGrades) {
  return grade.current_percentage == null ? '—' : `${letterGrade(grade.current_percentage)} · ${formatPercent(grade.current_percentage)}`;
}

export function GradesScreen() {
  const query = useGradesWithCourses();
  const visible = useAcademicsStore((state) => state.gradesVisible);
  const setVisible = useAcademicsStore((state) => state.setGradesVisible);

  return (
    <Screen onRefresh={query.refetch}>
      <DemoBanner title="Demo grade data">From the BU One demo API. Not connected to Student Link or your LMS.</DemoBanner>
      <PrivacyToggle
        visible={visible}
        onToggle={() => setVisible(!visible)}
        label={visible ? 'Grades visible' : 'Grades hidden'}
        caption={visible ? 'Privacy mode is off for this session.' : 'Protected by Face ID privacy mode.'}
        actionLabel={visible ? 'Hide Grades' : 'Show Grades'}
      />

      {!visible ? (
        <View style={{ minHeight: 290, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
          <AppText style={{ fontSize: 34, letterSpacing: 4, color: colors.ink, fontWeight: '700' }}>••••</AppText>
          <AppText variant="callout" style={{ maxWidth: 240, textAlign: 'center' }}>
            Use Show Grades to reveal course details, assignments, and your current average.
          </AppText>
        </View>
      ) : (
        <QueryView query={query} loadingLabel="Loading grades…">
          {({ grades, courses, term }) => <GradesContent grades={grades.courses} courses={courses} termId={term.id} />}
        </QueryView>
      )}
    </Screen>
  );
}

function GradesContent({ grades, courses, termId }: { grades: CourseGrades[]; courses: CourseLookup; termId: string }) {
  const average = averageGrade(grades, courses);
  const assessments = grades.flatMap((course) => course.assessments);
  const recent = assessments
    .filter((item) => item.status !== 'upcoming')
    .sort((a, b) => Date.parse(b.due_at) - Date.parse(a.due_at))
    .slice(0, RECENT_ASSESSMENTS);
  const upcoming = assessments.filter((item) => item.status === 'upcoming').sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));

  return (
    <>
      <MetricHero
        eyebrow={`${formatTerm(termId).toUpperCase()} · CURRENT AVERAGE`}
        value={average == null ? '—' : formatPercent(Math.round(average * 10) / 10)}
        description={average == null ? 'No graded work yet' : `${letterGrade(average)} estimate, weighted by credits`}
      />
      <Section title="Current courses" caption="Estimates">
        {grades.map((grade) => (
          <ListRow
            key={grade.course_id}
            title={courseName(courses, grade.course_id)}
            subtitle={`${grade.earned_points}/${grade.graded_possible_points} pts graded`}
            value={gradeLabel(grade)}
            valueStyle={{ fontSize: 16 }}
            minHeight={70}
            onPress={() => router.push({ pathname: '/grades/[id]', params: { id: grade.course_id } })}
          />
        ))}
      </Section>
      <Section title="Recent assessments">
        {recent.map((assessment) => (
          <AssessmentRow key={assessment.id} assessment={assessment} />
        ))}
      </Section>
      {upcoming.length > 0 && (
        <Section title="Coming up">
          {upcoming.map((assessment) => (
            <AssessmentRow key={assessment.id} assessment={assessment} />
          ))}
        </Section>
      )}
      <View style={{ marginVertical: spacing.screen }}>
        <AiActionRow boxed title="Explain grade weighting" subtitle="BU One can explain weighting, not complete graded work" onPress={explainWeighting} />
      </View>
      <AppText variant="caption" style={{ fontSize: 11, textAlign: 'center', paddingHorizontal: 14 }}>
        AI can clarify a syllabus or calculate grade scenarios. It will not answer or complete graded assignments.
      </AppText>
    </>
  );
}

function AssessmentRow({ assessment }: { assessment: Assessment }) {
  const result = assessmentResult(assessment);
  return (
    <ListRow
      title={assessment.title}
      subtitle={`${assessment.kind.charAt(0).toUpperCase()}${assessment.kind.slice(1)} · ${assessment.status === 'upcoming' ? 'Due' : 'Was due'} ${formatShortDate(dateOf(assessment.due_at))}`}
      value={result}
      valueStyle={{ fontSize: 14, color: assessment.status === 'missing' ? colors.brand : colors.ink }}
      minHeight={62}
    />
  );
}

export function GradeDetailScreen({ id }: { id: string }) {
  const query = useGradesWithCourses();
  return (
    <Screen onRefresh={query.refetch}>
      <QueryView query={query}>
        {({ grades, courses }) => {
          const grade = grades.courses.find((item) => item.course_id === id);
          if (!grade) return <NotFound what="course" />;
          const course = courses.get(id);
          const sorted = [...grade.assessments].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
          return (
            <>
              <Stack.Screen options={{ title: course?.code ?? id }} />
              <DemoBanner title="Demo grade data">Current course estimate · not an official final grade</DemoBanner>
              <MetricHero
                eyebrow="CURRENT COURSE ESTIMATE"
                value={gradeLabel(grade)}
                description={[course?.title, course ? pluralize(course.credits, 'credit') : null].filter(Boolean).join(' · ')}
              />
              <Section title="Assessments" caption={`${grade.earned_points}/${grade.graded_possible_points} pts`}>
                {sorted.map((assessment) => (
                  <AssessmentRow key={assessment.id} assessment={assessment} />
                ))}
              </Section>
              <View style={{ marginVertical: spacing.screen }}>
                <AiActionRow
                  boxed
                  title="Explain weighting"
                  subtitle="AI explains weighting but cannot complete graded work"
                  onPress={() => openAsk(`Explain how grades are weighted in ${course?.code ?? 'this course'}`)}
                />
              </View>
            </>
          );
        }}
      </QueryView>
    </Screen>
  );
}
