import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useDepartments, useRouteRequest, type Department, type RoutingResult } from '@/api/community';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { DemoBanner, EmptyState, InlineError } from '@/components/feedback';
import { TextField } from '@/components/form';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { colors, spacing } from '@/theme';
import { openLink } from '@/utils/open-link';

export function RequestsScreen() {
  const departments = useDepartments();
  const route = useRouteRequest();
  const [text, setText] = useState('');

  return (
    <Screen onRefresh={() => departments.refetch()}>
      <DemoBanner title="Does not file a ticket">This only suggests a BU office. Nothing is submitted to Registrar, Housing, or Financial Assistance.</DemoBanner>
      <TextField label="What do you need?" value={text} onChangeText={setText} multiline maxLength={8000} placeholder="I need a transcript sent to an employer…" />
      <Button
        title="Find the right office"
        disabled={route.isPending || text.trim().length < 4}
        onPress={() => route.mutate(text.trim())}
      />
      {route.error ? <InlineError message={errorMessage(route.error)} /> : null}
      {route.data ? <RoutingCard result={route.data} /> : null}

      <Section title="Offices">
        <QueryView query={departments} loadingLabel="Loading offices…">
          {(items) => (items.length ? items.map((item) => <DepartmentBlock key={item.id} department={item} />) : <EmptyState title="No offices listed" />)}
        </QueryView>
      </Section>
    </Screen>
  );
}

function RoutingCard({ result }: { result: RoutingResult }) {
  const lead = result.department ?? result.candidates[0]?.department;
  return (
    <View style={{ marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.surfaceMuted, borderRadius: 14, gap: spacing.sm }}>
      <AppText variant="eyebrow">{result.handling.replace('_', ' ')}</AppText>
      <AppText variant="headline">{lead?.name ?? 'Need a bit more detail'}</AppText>
      <AppText variant="callout">{result.message}</AppText>
      {result.synthetic_only ? <AppText variant="caption">Experimental classifier · {result.model_version}</AppText> : null}
      {lead ? <DepartmentBlock department={lead} /> : null}
    </View>
  );
}

function DepartmentBlock({ department }: { department: Department }) {
  return (
    <View style={{ paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.separator, gap: 4 }}>
      <AppText variant="headline">{department.name}</AppText>
      <AppText variant="callout">{department.handles}</AppText>
      <AppText variant="caption">{department.boundaries}</AppText>
      {department.official_source_urls.map((url) => (
        <AppText key={url} variant="caption" onPress={() => openLink(url)} style={{ color: colors.brand, fontWeight: '600' }}>
          Official page
        </AppText>
      ))}
    </View>
  );
}
