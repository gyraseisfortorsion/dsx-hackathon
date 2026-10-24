import { router } from 'expo-router';
import { View } from 'react-native';

import { useMealPlan } from '@/api/queries';
import { formatCents, mealSummary } from '@/api/selectors';
import type { MealPlanResponse } from '@/api/types';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { DetailItem, MetricHero } from '@/components/content';
import { DemoBanner, FootNote } from '@/components/feedback';
import { ListRow } from '@/components/list-row';
import { NotFound } from '@/components/not-found';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { transactions } from '@/data/services';
import { colors, spacing } from '@/theme';
import { formatLongDate, formatShortDate, formatTime } from '@/utils/campus-time';
import { openLink } from '@/utils/open-link';

type Balance = { id: string; label: string; value: string; suffix?: string; note: string };

function balancesOf(data: MealPlanResponse): Balance[] {
  const { balance, plan } = data;
  const resetNote = data.next_reset_on ? `Resets ${formatShortDate(data.next_reset_on)}` : 'For this period';
  return [
    ...(plan && !data.unlimited_meals
      ? [
          {
            id: 'meals',
            label: data.meal_period === 'weekly' ? 'MEALS THIS WEEK' : 'MEALS REMAINING',
            value: String(balance.meals_remaining ?? 0),
            suffix: plan.meal_allowance ? `of ${plan.meal_allowance}` : undefined,
            note: resetNote,
          },
        ]
      : []),
    ...(data.unlimited_meals ? [{ id: 'meals', label: 'MEAL SWIPES', value: 'Unlimited', note: plan?.name ?? 'Open access' }] : []),
    {
      id: 'dining',
      label: 'DINING POINTS',
      value: formatCents(balance.dining_points_balance_cents),
      suffix: plan ? `of ${formatCents(plan.dining_points_included_cents)}` : undefined,
      note: 'Carries fall to spring',
    },
    { id: 'convenience', label: 'CONVENIENCE POINTS', value: formatCents(balance.convenience_points_balance_cents), note: 'Carries year to year' },
    ...(plan && plan.guest_meal_allowance > 0
      ? [{ id: 'guest', label: 'GUEST MEALS', value: String(balance.guest_meals_remaining), suffix: `of ${plan.guest_meal_allowance}`, note: 'This semester' }]
      : []),
  ];
}

export function DiningScreen() {
  const mealPlan = useMealPlan();
  return (
    <Screen onRefresh={mealPlan.refetch}>
      <QueryView query={mealPlan} loadingLabel="Loading your meal plan…">
        {(data) => <DiningContent data={data} />}
      </QueryView>
    </Screen>
  );
}

function DiningContent({ data }: { data: MealPlanResponse }) {
  const summary = mealSummary(data);
  const links = [...(data.plan ? [data.plan.source] : []), ...data.sources].filter((link, index, all) => all.findIndex((item) => item.url === link.url) === index);

  return (
    <>
      {data.is_mock !== false && <DemoBanner title="Demo snapshot">Balances are a fixed demo snapshot; no purchases or resets are simulated.</DemoBanner>}

      <View style={{ paddingBottom: spacing.screen, borderBottomWidth: 1, borderBottomColor: colors.separator, gap: 5 }}>
        <AppText variant="eyebrow" style={{ color: colors.brandDeep }}>
          {data.plan ? `${data.plan.name.toUpperCase()} · ${data.plan.academic_year}` : 'NO MEAL PLAN'}
        </AppText>
        <AppText variant="largeTitle" style={{ fontSize: 26 }}>
          {summary.headline}
        </AppText>
        <AppText>
          {data.period_starts_on && data.period_ends_on
            ? `Current period ${formatShortDate(data.period_starts_on)} – ${formatShortDate(data.period_ends_on)}.`
            : data.plan
              ? 'Your plan is active for this semester.'
              : 'You can still use Convenience Points at campus markets.'}
        </AppText>
      </View>

      {balancesOf(data).map((balance) => (
        <View
          key={balance.id}
          accessible
          accessibilityLabel={`${balance.label}: ${balance.value}${balance.suffix ? ` ${balance.suffix}` : ''}. ${balance.note}`}
          style={{ minHeight: 86, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.separator }}>
          <View>
            <AppText variant="eyebrow" style={{ fontSize: 10 }}>
              {balance.label}
            </AppText>
            <AppText selectable style={{ fontSize: 24, fontWeight: '700', letterSpacing: -0.5, color: colors.ink, marginVertical: 2, fontVariant: ['tabular-nums'] }}>
              {balance.value}
              {balance.suffix ? <AppText style={{ fontSize: 14, color: colors.subtle }}> {balance.suffix}</AppText> : null}
            </AppText>
            <AppText variant="caption" style={{ color: colors.success }}>
              {balance.note}
            </AppText>
          </View>
          <AppText variant="caption">Demo API</AppText>
        </View>
      ))}

      <Section title="How balances work">
        {data.rules.map((rule) => (
          <View key={rule} style={{ flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.separator }}>
            <AppText variant="callout" style={{ color: colors.subtle }}>
              •
            </AppText>
            <AppText variant="callout" style={{ flex: 1, color: colors.inkSoft }}>
              {rule}
            </AppText>
          </View>
        ))}
      </Section>

      <Section title="Recent transactions" caption="Sample data">
        {transactions.map((item) => (
          <ListRow
            key={item.id}
            title={item.merchant}
            subtitle={item.meta}
            value={item.amount}
            valueStyle={{ fontSize: 13 }}
            onPress={() => router.push({ pathname: '/dining/[id]', params: { id: item.id } })}
          />
        ))}
      </Section>

      <Section title="Manage at BU">
        {links.map((link) => (
          <ListRow
            key={link.url}
            title={link.title}
            accessory="external"
            accessoryColor={colors.brand}
            minHeight={49}
            accessibilityHint="Opens the official BU site"
            onPress={() => openLink(link.url)}
          />
        ))}
      </Section>

      <FootNote>{`Snapshot as of ${formatLongDate(data.as_of.slice(0, 10))} at ${formatTime(data.as_of)}`}</FootNote>
    </>
  );
}

export function TransactionScreen({ id }: { id: string }) {
  const transaction = transactions.find((item) => item.id === id);
  if (!transaction) return <NotFound what="transaction" />;

  return (
    <Screen>
      <MetricHero eyebrow="SAMPLE TERRIER CARD ACTIVITY" value={transaction.amount} description={transaction.merchant} />
      <DetailItem icon="calendar" title="Completed" subtitle="Sample transaction · Not an official receipt" />
      <DetailItem icon="check" title={transaction.source} subtitle="Terrier Card balance source" />
      <Button title="Close" variant="secondary" onPress={() => router.back()} style={{ marginTop: spacing.xl }} />
    </Screen>
  );
}
