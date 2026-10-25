import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { apiRequest, errorMessage } from '@/api/client';
import { useCommunityModels, useDeletionRequest } from '@/api/community';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { InlineError, SuccessBanner, EmptyState } from '@/components/feedback';
import { ChoiceField, TextField } from '@/components/form';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Card, Section } from '@/components/section';
import { useCurrentUser } from '@/stores/session-store';
import { spacing } from '@/theme';
import { ValueSummary } from './academic/shared';

export function CommunityToolsScreen() {
  const models = useCommunityModels();
  const deletion = useDeletionRequest();
  const [confirm, setConfirm] = useState(false);
  const [phrase, setPhrase] = useState('');
  return <Screen onRefresh={models.refetch}>
    <Section title="Community models"><QueryView query={models}>{data => <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
      <AppText>{data.synthetic_only ? 'Models use synthetic training data.' : 'Community model status'}</AppText>
      <AppText variant="caption" selectable>Study ranking: {data.study_ranker}</AppText>
      <AppText variant="caption" selectable>Moderation: {data.moderation}</AppText>
      <AppText>Automatic review flags: {data.automatic_review_flags_enabled ? 'Enabled' : 'Disabled'}</AppText>
      <AppText>Automatic removals or bans: {data.automatic_removal_or_bans ? 'Enabled' : 'Disabled'}</AppText>
    </Card>}</QueryView></Section>
    <Section title="Your community data">
      <AppText style={{ marginBottom: spacing.md }}>Submit a request to delete your community data. The server determines processing and retention.</AppText>
      {deletion.isSuccess ? <><SuccessBanner message="Deletion request submitted" />{deletion.data.message && <AppText selectable>{deletion.data.message}</AppText>}</> : confirm ? <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
        <AppText variant="headline">Request deletion for the selected student?</AppText>
        <TextField label="Type DELETE to confirm" value={phrase} onChangeText={setPhrase} autoCapitalize="characters" autoCorrect={false} />
        <Button title={deletion.isPending ? 'Submitting…' : 'Submit deletion request'} disabled={deletion.isPending || phrase !== 'DELETE'} onPress={() => deletion.mutate(undefined)} />
        <Button title="Cancel" variant="secondary" disabled={deletion.isPending} onPress={() => { setConfirm(false); setPhrase(''); }} />
      </Card> : <Button title="Request data deletion" variant="secondary" onPress={() => setConfirm(true)} />}
      <InlineError message={deletion.error ? errorMessage(deletion.error) : ''} />
    </Section>
    <Section title="Moderation"><AppText style={{ marginBottom: spacing.md }}>For authorized moderators. A separate moderator credential is required.</AppText><Button title="Open moderator tools" variant="secondary" onPress={() => router.push('/community/moderation')} /></Section>
  </Screen>;
}

type Report = { id: string; target_type?: string; target_id?: string; reason?: string; status?: string; [key: string]: unknown };
type ModerationQueue = Report[] | { reports: Report[] };
export function ModerationScreen() {
  const user = useCurrentUser();
  const [credential, setCredential] = useState('');
  const [activeToken, setActiveToken] = useState('');
  const [reportId, setReportId] = useState('');
  const [action, setAction] = useState<'dismiss' | 'remove_listing' | 'suspend_account' | 'restore_account'>('dismiss');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const queue = useMutation({ mutationFn: (token: string) => apiRequest<ModerationQueue>(user!, '/community/moderation', { moderatorToken: token }) });
  const metrics = useMutation({ mutationFn: (token: string) => apiRequest<Record<string, unknown>>(user!, '/community/metrics', { moderatorToken: token }) });
  const moderate = useMutation({ mutationFn: () => apiRequest(user!, `/community/moderation/${encodeURIComponent(reportId)}`, { method: 'POST', moderatorToken: activeToken, body: { action, reason: reason.trim() } }), onSuccess: () => { setConfirmed(false); setReportId(''); setReason(''); queue.mutate(activeToken); metrics.mutate(activeToken); } });
  const reports = Array.isArray(queue.data) ? queue.data : queue.data?.reports ?? [];
  const busy = queue.isPending || metrics.isPending || moderate.isPending;
  return <Screen>
    <AppText style={{ marginBottom: spacing.lg }}>Enter your separate moderator credential. It stays in memory for this screen and is never stored on the device.</AppText>
    <TextField label="Moderator credential" secureTextEntry autoCapitalize="none" autoCorrect={false} value={credential} onChangeText={v => { setCredential(v); setActiveToken(''); queue.reset(); metrics.reset(); moderate.reset(); }} editable={!busy} />
    <Button title={queue.isPending ? 'Checking access…' : 'Load reports'} disabled={!credential.trim() || busy} onPress={() => queue.mutate(credential.trim(), { onSuccess: () => { setActiveToken(credential.trim()); metrics.mutate(credential.trim()); } })} />
    <InlineError message={queue.error ? errorMessage(queue.error) : ''} />
    {queue.isSuccess && activeToken && <>
      <Section title="Reports">{reports.length ? reports.map(report => <Card key={report.id} style={{ padding: spacing.lg, marginBottom: spacing.md }}><ValueSummary value={report} /><Button title={reportId === report.id ? 'Selected' : 'Review report'} variant="secondary" onPress={() => { setReportId(report.id); setConfirmed(false); }} /></Card>) : <EmptyState title="No reports in the queue" />}</Section>
      {reportId && <Section title="Review action">
        <AppText selectable>Report {reportId}</AppText>
        <ChoiceField label="Action" options={['Dismiss report', 'Remove listing', 'Suspend account', 'Restore account']} value={{ dismiss: 'Dismiss report', remove_listing: 'Remove listing', suspend_account: 'Suspend account', restore_account: 'Restore account' }[action]} onChange={v => { setAction(({ 'Dismiss report': 'dismiss', 'Remove listing': 'remove_listing', 'Suspend account': 'suspend_account', 'Restore account': 'restore_account' } as const)[v as 'Dismiss report']); setConfirmed(false); }} />
        <TextField label="Reason for this action" multiline value={reason} onChangeText={v => { setReason(v); setConfirmed(false); }} maxLength={2000} />
        {confirmed && <AppText style={{ marginBottom: spacing.md }}>This applies the selected action to the reported item or account. Confirm the report and reason before continuing.</AppText>}
        <Button title={moderate.isPending ? 'Applying…' : confirmed ? 'Confirm moderation action' : 'Review this action'} disabled={!reason.trim() || busy} onPress={() => confirmed ? moderate.mutate() : setConfirmed(true)} />
        <InlineError message={moderate.error ? errorMessage(moderate.error) : ''} />
      </Section>}
      <Section title="Community metrics">{metrics.isPending ? <AppText>Loading metrics…</AppText> : metrics.error ? <><InlineError message={errorMessage(metrics.error)} /><Button title="Retry metrics" variant="secondary" onPress={() => metrics.mutate(activeToken)} /></> : <ValueSummary value={metrics.data} />}</Section>
    </>}
  </Screen>;
}
