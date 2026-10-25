import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { academicGradesQuery, useAcademicWrite, type AcademicGrades, type GradeScenario, type GradingScheme } from '@/api/academic';
import { errorMessage } from '@/api/client';
import { useUserQuery } from '@/api/queries';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { InlineError } from '@/components/feedback';
import { ChoiceField, TextField } from '@/components/form';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Card, Section } from '@/components/section';
import { showToast } from '@/stores/toast-store';
import { isNumberIn } from '@/utils/academic';
import { spacing } from '@/theme';

export function GradeScenarioScreen({ courseId }: { courseId: string }) {
  const query = useUserQuery(academicGradesQuery(courseId));
  const calculate = useAcademicWrite<GradeScenario>();
  const [target, setTarget] = useState('90');
  const [scores, setScores] = useState<Record<string, string>>({});
  const [calculatedInput, setCalculatedInput] = useState('');
  const signature = JSON.stringify({ target, scores });
  return <Screen>
    <AppText style={{ marginBottom: spacing.lg }}>Explore what future scores would mean for your grade. Assumptions do not change your recorded scores.</AppText>
    <QueryView query={query}>{({ data }) => <>
      <TextField label="Target percentage" value={target} onChangeText={setTarget} keyboardType="decimal-pad" invalid={!isNumberIn(target, 0.01, 100)} />
      <Section title="Assumed scores" caption="Optional">{data.assessments.filter(item => item.score == null).map(item => <TextField key={item.id} label={`${item.title} (out of ${item.points_possible ?? 'unknown'})`} value={scores[item.id] ?? ''} onChangeText={v => setScores(prev => ({ ...prev, [item.id]: v }))} keyboardType="decimal-pad" placeholder="Leave blank if unknown" />)}</Section>
      <InlineError message={calculate.error ? errorMessage(calculate.error) : ''} />
      <Button title={calculate.isPending ? 'Calculating…' : 'Calculate scenario'} disabled={calculate.isPending || !isNumberIn(target, 0.01, 100) || Object.values(scores).some(score => score.trim() && !isNumberIn(score, 0, 1000000))} onPress={() => calculate.mutate({ path: `/academic/courses/${encodeURIComponent(courseId)}/grade-scenarios`, method: 'POST', body: { target_percentage: Number(target), assumed_scores: Object.fromEntries(Object.entries(scores).filter(([,v]) => v.trim()).map(([id,v]) => [id, Number(v)])) } }, { onSuccess: () => setCalculatedInput(signature) })} />
      {calculate.data && signature === calculatedInput && <Section title="Projected result"><Card style={{ padding: spacing.lg, gap: spacing.sm }}>
        <AppText variant="display" selectable>{calculate.data.data.projection.current_percentage ?? '—'}%</AppText>
        <AppText>{calculate.data.data.target_met ? 'Your target is met under these assumptions.' : 'Your target is not yet met under these assumptions.'}</AppText>
        {calculate.data.data.unknown_assessment_ids.length > 0 && <AppText variant="caption">{calculate.data.data.unknown_assessment_ids.length} assessment scores remain unknown. This is a partial projection.</AppText>}
      </Card></Section>}
    </>}</QueryView>
  </Screen>;
}

type CategoryDraft = { name: string; weight: string; drop: string };
type ThresholdDraft = { letter: string; minimum: string };
export function GradingSchemeScreen({ courseId }: { courseId: string }) {
  const query = useUserQuery(academicGradesQuery(courseId));
  return <Screen><QueryView query={query}>{snapshot => <SchemeForm key={courseId} courseId={courseId} data={snapshot.data} version={snapshot.version} />}</QueryView></Screen>;
}
function SchemeForm({ courseId, data, version }: { courseId: string; data: AcademicGrades; version: number }) {
  const save = useAcademicWrite<GradingScheme>();
  const [mode, setMode] = useState<GradingScheme['mode']>(data.scheme?.mode ?? 'points');
  const [categories, setCategories] = useState<CategoryDraft[]>((data.scheme?.categories ?? []).map(c => ({ name: c.name, weight: String(c.weight), drop: String(c.drop_lowest) })));
  const [thresholds, setThresholds] = useState<ThresholdDraft[]>((data.scheme?.thresholds ?? []).map(t => ({ letter: t.letter, minimum: String(t.minimum) })));
  const sum = categories.reduce((n, c) => n + Number(c.weight), 0);
  const validCategories = mode === 'points' || (categories.length > 0 && Math.abs(sum - 100) < 0.001 && categories.every(c => c.name.trim() && isNumberIn(c.weight, .01, 100) && isNumberIn(c.drop, 0, 10000, true)) && new Set(categories.map(c => c.name.trim().toLowerCase())).size === categories.length);
  const validThresholds = thresholds.every(t => t.letter.trim() && isNumberIn(t.minimum, 0, 100)) && new Set(thresholds.map(t => t.letter.trim().toUpperCase())).size === thresholds.length;
  return <>
    <AppText style={{ marginBottom: spacing.lg }}>Copy the grading rules from your reviewed syllabus. Weights must total 100%.</AppText>
    <ChoiceField label="Calculation method" options={['Points', 'Weighted']} value={mode === 'points' ? 'Points' : 'Weighted'} onChange={v => setMode(v === 'Points' ? 'points' : 'weighted')} />
    {mode === 'weighted' && <Section title="Categories" caption={`${Number.isFinite(sum) ? sum : 0}% of 100%`}>
      {categories.map((category, index) => <Card key={index} style={{ padding: spacing.md, marginBottom: spacing.md }}>
        <TextField label="Category name" value={category.name} onChangeText={v => setCategories(prev => prev.map((c,i) => i === index ? { ...c, name: v } : c))} placeholder="Homework" />
        <TextField label="Weight (%)" value={category.weight} onChangeText={v => setCategories(prev => prev.map((c,i) => i === index ? { ...c, weight: v } : c))} keyboardType="decimal-pad" />
        <TextField label="Drop lowest scores" value={category.drop} onChangeText={v => setCategories(prev => prev.map((c,i) => i === index ? { ...c, drop: v } : c))} keyboardType="number-pad" />
        <Button title="Remove category" variant="ghost" onPress={() => setCategories(prev => prev.filter((_,i) => i !== index))} />
      </Card>)}
      <Button title="Add category" variant="secondary" onPress={() => setCategories(prev => [...prev, { name: '', weight: '', drop: '0' }])} />
    </Section>}
    <Section title="Letter grade thresholds" caption="Optional">
      {thresholds.map((threshold, index) => <View key={index}>
        <TextField label="Letter grade" value={threshold.letter} onChangeText={v => setThresholds(prev => prev.map((t,i) => i === index ? { ...t, letter: v } : t))} placeholder="A" />
        <TextField label="Minimum percentage" value={threshold.minimum} onChangeText={v => setThresholds(prev => prev.map((t,i) => i === index ? { ...t, minimum: v } : t))} keyboardType="decimal-pad" />
        <Button title="Remove threshold" variant="ghost" onPress={() => setThresholds(prev => prev.filter((_,i) => i !== index))} />
      </View>)}
      <Button title="Add threshold" variant="secondary" onPress={() => setThresholds(prev => [...prev, { letter: '', minimum: '' }])} />
    </Section>
    <InlineError message={save.error ? errorMessage(save.error) : ''} />
    <Button title={save.isPending ? 'Saving…' : 'Save grading scheme'} disabled={save.isPending || !validCategories || !validThresholds} style={{ marginTop: spacing.lg }} onPress={() => save.mutate({ path: `/academic/courses/${encodeURIComponent(courseId)}/grading-scheme`, body: { version, scheme: { ...data.scheme, mode, categories: mode === 'weighted' ? categories.map(c => ({ name: c.name.trim(), weight: Number(c.weight), drop_lowest: Number(c.drop) })) : [], thresholds: thresholds.map(t => ({ letter: t.letter.trim().toUpperCase(), minimum: Number(t.minimum) })) } } }, { onSuccess: () => { showToast('Grading scheme saved'); router.back(); } })} />
  </>;
}
