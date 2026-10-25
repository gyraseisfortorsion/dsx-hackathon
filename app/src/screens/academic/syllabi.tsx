import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { syllabiQuery, syllabusQuery, useAcademicCourses, useAcademicWrite, dashboardQuery, type Syllabus, type SyllabusUpload, type SyllabusCandidate } from '@/api/academic';
import { errorMessage } from '@/api/client';
import { useUserQuery } from '@/api/queries';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { EmptyState, InlineError, SuccessBanner } from '@/components/feedback';
import { ChoiceField, TextField } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Card, Section } from '@/components/section';
import { spacing } from '@/theme';
import { courseLabel, humanLabel } from '@/utils/academic';
import { campusToday } from '@/utils/campus-time';
import { showToast } from '@/stores/toast-store';
import { PassageLink, ValueSummary } from './shared';

export function SyllabiScreen({ courseId }: { courseId?: string }) {
  const query = useUserQuery(syllabiQuery(courseId));
  return <Screen onRefresh={query.refetch}>
    <Button title="Upload a syllabus" onPress={() => router.push({ pathname: '/academic/upload', params: courseId ? { courseId } : {} })} />
    <Section title={courseId ? courseLabel(courseId) : 'Your syllabi'}><QueryView query={query}>{({ data }) => data.length ? data.map(item => <ListRow key={item.id} title={item.filename} subtitle={`${courseLabel(item.course_id)} · ${humanLabel(item.status ?? 'Needs review')}`} onPress={() => router.push({ pathname: '/academic/syllabus/[id]', params: { id: item.id } })} />) : <EmptyState title="Bring your syllabus" subtitle="Choose a PDF or paste syllabus text. You’ll review extracted details before they affect your plan." />}</QueryView></Section>
  </Screen>;
}

export function SyllabusUploadScreen({ courseId }: { courseId?: string }) {
  const courses = useAcademicCourses();
  const dashboard = useUserQuery(dashboardQuery(campusToday()));
  const upload = useAcademicWrite<Syllabus>();
  const [selected, setSelected] = useState(courseId ?? '');
  const [mode, setMode] = useState('PDF');
  const [document, setDocument] = useState<SyllabusUpload | null>(null);
  const [filename, setFilename] = useState('syllabus.txt');
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState('');
  const [reading, setReading] = useState(false);
  const busy = upload.isPending || reading;
  const pick = async () => {
    setFileError(''); setReading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      // Bound memory before encoding the PDF for the JSON upload contract.
      const size = asset.size ?? (process.env.EXPO_OS === 'web' ? asset.file?.size : new File(asset.uri).size);
      if (!size || size > 10 * 1024 * 1024) throw new Error('Choose a PDF smaller than 10 MB.');
      let base64: string;
      if (process.env.EXPO_OS === 'web' && asset.file) {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Could not read this PDF. Choose it again.'));
          reader.readAsDataURL(asset.file!);
        });
      } else {
        base64 = await new File(asset.uri).base64();
      }
      if (!base64.startsWith('JVBERi0')) throw new Error('This file is not a valid PDF. Choose another file.');
      setDocument({ filename: asset.name.slice(0, 160), media_type: 'application/pdf', content_base64: base64 });
    } catch (error) { setFileError(errorMessage(error)); }
    finally { setReading(false); }
  };
  const course = courses.data?.data.find(item => item.id === selected);
  return <Screen>
    <AppText style={{ marginBottom: spacing.lg }}>Add your syllabus, then check the extracted dates, policies, and grading details before applying them.</AppText>
    <QueryView query={courses}>{({ data }) => <>
      <ChoiceField label="Course" options={data.map(item => item.code)} value={course?.code ?? ''} onChange={code => setSelected(data.find(item => item.code === code)?.id ?? '')} />
      {!data.length && <EmptyState title="No courses available" subtitle="A course is required to upload a syllabus." />}
    </>}</QueryView>
    <ChoiceField label="Add syllabus as" options={['PDF', 'Text']} value={mode} onChange={setMode} />
    {mode === 'PDF' ? <Card style={{ padding: spacing.lg, gap: spacing.md }}>
      <AppText variant="headline">{document?.filename ?? 'Choose your syllabus PDF'}</AppText>
      <AppText variant="caption">PDF up to 10 MB. Password-protected or image-only PDFs may not be supported. You can paste text instead.</AppText>
      <Button title={reading ? 'Reading PDF…' : document ? 'Choose a different PDF' : 'Choose PDF'} variant="secondary" disabled={busy} onPress={pick} />
    </Card> : <>
      <TextField label="Filename" value={filename} onChangeText={setFilename} maxLength={160} />
      <TextField label="Syllabus text" multiline value={text} onChangeText={setText} maxLength={500000} placeholder="Paste your syllabus here…" />
    </>}
    <InlineError message={fileError || (upload.error ? errorMessage(upload.error) : '')} />
    <QueryView query={dashboard} compact>{snapshot => <Button title={upload.isPending ? 'Uploading and extracting…' : 'Upload and review'} disabled={busy || !selected || (mode === 'PDF' ? !document : !text.trim() || !filename.trim())} onPress={() => {
      upload.mutate({ path: `/academic/courses/${encodeURIComponent(selected)}/syllabi`, method: 'POST', body: { version: snapshot.version, ...(mode === 'PDF' ? document! : { filename: filename.trim(), media_type: 'text/plain', text }) } }, { onSuccess: result => {
        router.replace({ pathname: '/academic/syllabus/[id]', params: { id: result.data.id } });
      } });
    }} />}</QueryView>
  </Screen>;
}

type Decision = { candidate_id: string; status: 'accepted' | 'rejected'; value?: Record<string, unknown> };

export function SyllabusReviewScreen({ id }: { id: string }) {
  const query = useUserQuery(syllabusQuery(id));
  const save = useAcademicWrite<Syllabus>();
  const commit = useAcademicWrite<Syllabus>();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [reviewedVersion, setReviewedVersion] = useState<number | null>(null);
  const busy = save.isPending || commit.isPending;
  return <Screen onRefresh={query.refetch}>
    <QueryView query={query} loadingLabel="Loading syllabus review…">{snapshot => {
      const item = snapshot.data;
      const candidates = item.candidates ?? [];
      const changed = Object.keys(decisions).length > 0;
      const unresolved = candidates.some(candidate => !['accepted', 'rejected', 'committed'].includes(candidate.status));
      return <>
        <Stack.Screen options={{ title: 'Review syllabus' }} />
        <AppText variant="heading" selectable>{item.filename}</AppText>
        <AppText variant="caption">{courseLabel(item.course_id)} · {humanLabel(item.status ?? 'Needs review')}</AppText>
        <AppText style={{ marginTop: spacing.md }}>Verify each extracted item against its source. Save your review, then apply accepted items to your academic workspace.</AppText>
        {item.warnings?.map(warning => <InlineError key={warning} message={warning} />)}
        <Section title="Extracted items">{candidates.length ? candidates.map(candidate => <CandidateReview key={candidate.id} candidate={candidate} decision={decisions[candidate.id]} disabled={busy || item.status === 'committed'} onChange={decision => { setDecisions(current => ({ ...current, [candidate.id]: decision })); setReviewedVersion(null); }} />) : <EmptyState title="No extracted items" subtitle="Try a text-based PDF or paste the syllabus text. Source passages, when available, are shown below." />}</Section>
        {item.passages?.length ? <Section title="Source passages">{item.passages.map(passage => <View key={passage.id}><AppText selectable numberOfLines={5}>{passage.text}</AppText><PassageLink id={passage.id} label={passage.page ? `Read page ${passage.page}` : 'Read source'} /></View>)}</Section> : null}
        {save.error || commit.error ? <InlineError message={errorMessage(save.error ?? commit.error)} /> : null}
        {changed && <Button title={save.isPending ? 'Saving review…' : 'Save review decisions'} disabled={busy} onPress={() => save.mutate({ path: `/academic/syllabi/${encodeURIComponent(id)}/review`, body: { version: snapshot.version, decisions: Object.values(decisions) } }, { onSuccess: result => { setDecisions({}); setReviewedVersion(result.version); showToast('Review saved'); } })} />}
        {item.status === 'committed' ? <SuccessBanner message="Accepted items applied" /> : <Button title={commit.isPending ? 'Applying…' : 'Apply accepted items'} disabled={busy || changed || !candidates.length || (unresolved && reviewedVersion !== snapshot.version)} style={{ marginTop: spacing.md }} onPress={() => commit.mutate({ path: `/academic/syllabi/${encodeURIComponent(id)}/commit`, method: 'POST', body: { version: snapshot.version } }, { onSuccess: () => { showToast('Accepted syllabus items applied'); router.replace({ pathname: '/academic/course/[id]', params: { id: item.course_id } }); } })} />}
      </>;
    }}</QueryView>
  </Screen>;
}

function CandidateReview({ candidate, decision, disabled, onChange }: { candidate: SyllabusCandidate; decision?: Decision; disabled: boolean; onChange: (v: Decision) => void }) {
  const value = decision?.value ?? candidate.value;
  const status = decision?.status ?? candidate.status;
  return <Card style={{ padding: spacing.lg, marginBottom: spacing.md, gap: spacing.sm }}>
    <AppText variant="headline">{humanLabel(candidate.kind ?? 'Extracted item')}</AppText>
    <ValueSummary value={value} />
    {candidate.excerpt && <AppText selectable variant="caption">“{candidate.excerpt}”</AppText>}
    {candidate.passage_ids?.map(passageId => <PassageLink key={passageId} id={passageId} />)}
    {candidate.warnings?.map(warning => <InlineError key={warning} message={warning} />)}
    <AppText variant="caption">{humanLabel(status ?? 'Pending review')}</AppText>
    <Button title={status === 'accepted' ? 'Accepted' : 'Accept item'} variant={status === 'accepted' ? 'planned' : 'secondary'} disabled={disabled} onPress={() => onChange({ candidate_id: candidate.id, status: 'accepted', value })} />
    <Button title={status === 'rejected' ? 'Rejected' : 'Reject item'} variant="ghost" disabled={disabled} onPress={() => onChange({ candidate_id: candidate.id, status: 'rejected' })} />
  </Card>;
}
