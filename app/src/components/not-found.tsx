import { router } from 'expo-router';

import { Button } from './button';
import { EmptyState } from './feedback';
import { Screen } from './screen';

/** Fallback for deep links to records that don't exist in the mock data. */
export function NotFound({ what }: { what: string }) {
  return (
    <Screen>
      <EmptyState title={`This ${what} isn’t available.`} subtitle="It may have been removed from the demo." />
      <Button title="Go back" variant="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </Screen>
  );
}
