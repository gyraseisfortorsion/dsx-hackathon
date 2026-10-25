import { QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, Stack, ThemeProvider, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { queryClient, useAppFocusRefetch } from '@/api/query-client';
import { UndoToast } from '@/components/undo-toast';
import { detailOptions, detailWithAskOptions, modalCancelOptions, modalDoneOptions, modalOptions } from '@/navigation/screen-options';
import { useSessionStore } from '@/stores/session-store';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.brand,
    background: colors.background,
    card: colors.background,
    text: colors.ink,
    border: colors.separator,
  },
};

/** Approximate native tab bar height so the toast clears it on tab screens. */
const TAB_BAR_CLEARANCE = Platform.select({ ios: 52, default: 72 });

export default function RootLayout() {
  const segments = useSegments();
  const onTabs = segments[0] === '(tabs)';
  const user = useSessionStore((state) => state.user);
  const hydrated = useSessionStore((state) => state.hydrated);
  const hydrate = useSessionStore((state) => state.hydrate);
  useAppFocusRefetch();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated) SplashScreen.hide();
  }, [hydrated]);

  // Routing depends on the stored session; deciding before it loads would flash the login screen.
  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <KeyboardProvider>
          <ThemeProvider value={navigationTheme}>
            <StatusBar style="dark" />
            <Stack screenOptions={detailWithAskOptions}>
              <Stack.Protected guard={!user}>
                <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
              </Stack.Protected>

              <Stack.Protected guard={!!user}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />

                {/* Modals */}
                <Stack.Screen name="ask" options={{ ...modalDoneOptions, title: 'Ask BU One' }} />
                <Stack.Screen
                  name="menu"
                  options={{
                    presentation: 'transparentModal',
                    animation: 'none',
                    headerShown: false,
                    contentStyle: { backgroundColor: 'transparent' },
                  }}
                />
                <Stack.Screen name="onboarding" options={{ ...modalOptions, title: 'Personalize events', gestureEnabled: true }} />
                <Stack.Screen name="event-filters" options={{ ...modalCancelOptions, title: 'Filters' }} />
                <Stack.Screen name="housing/report" options={{ ...modalCancelOptions, title: 'Report an issue' }} />
                <Stack.Screen name="marketplace/new" options={{ ...modalCancelOptions, title: 'New listing' }} />
                <Stack.Screen name="work/shift" options={{ ...modalCancelOptions, title: 'Shift' }} />
                <Stack.Screen
                  name="external/[id]"
                  options={{
                    ...detailOptions,
                    presentation: 'formSheet',
                    headerShown: false,
                    sheetGrabberVisible: true,
                    sheetAllowedDetents: [0.7, 1],
                  }}
                />

                {/* Pushed detail screens */}
                <Stack.Screen name="event/[id]" options={{ title: 'Event details' }} />
                <Stack.Screen name="cluster/[id]" options={{ title: 'Topic group' }} />
                <Stack.Screen name="chat/[id]" options={{ title: 'Chat' }} />
                <Stack.Screen name="clubs" options={{ title: 'Clubs & Organizations' }} />
                <Stack.Screen name="club/[id]" options={{ title: 'Club discovery' }} />
                <Stack.Screen name="study/index" options={{ title: 'Study peers' }} />
                <Stack.Screen name="study/[id]" options={{ title: 'Classmate' }} />
                <Stack.Screen name="marketplace/index" options={{ title: 'Marketplace' }} />
                <Stack.Screen name="marketplace/[id]" options={{ title: 'Listing' }} />
                <Stack.Screen name="inbox/index" options={{ title: 'Peer messages' }} />
                <Stack.Screen name="inbox/[id]" options={{ title: 'Conversation' }} />
                <Stack.Screen name="requests" options={{ title: 'Where to ask' }} />
                <Stack.Screen name="agenda/[id]" options={{ title: '' }} />
                <Stack.Screen name="dining/index" options={{ title: 'Dining / Campus Wallet' }} />
                <Stack.Screen name="dining/[id]" options={{ ...detailOptions, title: 'Transaction' }} />
                <Stack.Screen name="housing/index" options={{ title: 'Housing' }} />
                <Stack.Screen name="housing/requests" options={{ ...detailOptions, title: 'My requests' }} />
                <Stack.Screen name="housing/[id]" options={{ ...detailOptions, title: 'Request' }} />
                <Stack.Screen name="housing/contacts" options={{ ...detailOptions, title: 'Housing contacts' }} />
                <Stack.Screen name="housing/emergency" options={{ ...detailOptions, title: 'Emergency help' }} />
                <Stack.Screen name="work/index" options={{ title: 'Work & Pay' }} />
                <Stack.Screen name="work/timesheets" options={{ title: 'Timesheets' }} />
                <Stack.Screen name="work/timesheet/[id]" options={{ title: 'Timesheet' }} />
                <Stack.Screen name="work/review" options={{ ...detailOptions, title: 'Review timesheet' }} />
                <Stack.Screen name="work/pay" options={{ title: 'Pay & earnings' }} />
                <Stack.Screen name="work/direct-deposit" options={{ title: 'Direct deposit' }} />
                <Stack.Screen name="work/checklist" options={{ title: 'Employment checklist' }} />
                <Stack.Screen name="work/guide/[id]" options={{ title: 'Guidance' }} />
                <Stack.Screen name="academic/index" options={{ title: 'Academics' }} />
                <Stack.Screen name="academic/search" options={{ title: 'Search syllabi' }} />
                <Stack.Screen name="academic/upload" options={{ title: 'Upload syllabus' }} />
                <Stack.Screen name="academic/syllabi" options={{ title: 'Syllabus library' }} />
                <Stack.Screen name="academic/syllabus/[id]" options={{ title: 'Review syllabus' }} />
                <Stack.Screen name="academic/course/[id]" options={{ title: 'Course' }} />
                <Stack.Screen name="academic/assessment/[id]" options={{ title: 'Assessment' }} />
                <Stack.Screen name="academic/passage/[id]" options={{ title: 'Source passage' }} />
                <Stack.Screen name="academic/task/[id]" options={{ title: 'Study task' }} />
                <Stack.Screen name="academic/planner" options={{ title: 'Study planner' }} />
                <Stack.Screen name="academic/availability" options={{ title: 'Study availability' }} />
                <Stack.Screen name="academic/completed" options={{ title: 'Completed courses' }} />
                <Stack.Screen name="academic/prerequisites" options={{ title: 'Prerequisites' }} />
                <Stack.Screen name="academic/grade-scenario" options={{ title: 'Grade scenario' }} />
                <Stack.Screen name="academic/grading-scheme" options={{ title: 'Grading scheme' }} />
                <Stack.Screen name="marketplace/edit/[id]" options={{ title: 'Edit listing' }} />
                <Stack.Screen name="community/tools" options={{ title: 'Community tools' }} />
                <Stack.Screen name="community/moderation" options={{ title: 'Moderator tools' }} />
                <Stack.Screen name="attendance/index" options={{ title: 'Attendance' }} />
                <Stack.Screen name="attendance/[id]" options={{ title: 'Course' }} />
                <Stack.Screen name="grades/index" options={{ title: 'Grades' }} />
                <Stack.Screen name="grades/[id]" options={{ title: 'Grade' }} />
                <Stack.Screen name="preferences" options={{ ...detailOptions, title: 'Interests & Preferences' }} />
                <Stack.Screen name="settings/[id]" options={{ ...detailOptions, title: '' }} />
              </Stack.Protected>
            </Stack>
            {user && <UndoToast bottomOffset={onTabs ? TAB_BAR_CLEARANCE : 0} />}
          </ThemeProvider>
        </KeyboardProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
