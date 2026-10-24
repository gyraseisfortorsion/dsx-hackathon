# BU One

Expo / React Native port of the BU One student superapp prototype. Profile, meal plan, courses, calendar, attendance, grades, campus events (Upcoming, For You, Explore, Saved), preferences, and the Ask BU One assistant come from the [BU student demo API](https://dsx-bu-student-api.vercel.app/docs) (`openapi.json`). Chats, clubs, housing, work, and dining transactions are still local mock data.

## Run

Requires Node.js 22.13+.

```bash
npm install
cp .env.example .env.local   # then fill in EXPO_PUBLIC_API_PASSWORD
npx expo start
```

Scan the QR code with Expo Go (iOS/Android). Sign in as one of the demo students (alex, maya, jordan, sam, taylor); no password is needed.

`EXPO_PUBLIC_*` values are inlined into the JS bundle, so the API password is only suitable for this demo API. The API does not send CORS headers for local origins, so the web preview (`w`) cannot reach it; use a native client.

## Structure

```
src/
  app/          Expo Router routes only (thin wrappers that read params)
    (tabs)/     Native tab bar: Today, Calendar, Events, Chats, Me — one Stack per tab
    ...         Detail screens and modals live in the root Stack so the tab bar hides on them
  screens/      Screen implementations
  components/   Shared UI primitives (text, buttons, rows, forms, chat, toast)
  api/          API client, TanStack Query options/hooks, response types and selectors
  stores/       Zustand stores split by domain (session, planner, preferences, housing, work, academics, toast)
  data/         Mock data for features the API does not cover
  utils/        Pure logic (shift validation, housing triage) and native helpers (haptics, links, sheets)
  navigation/   Route helpers and shared header options
  theme.ts      Design tokens: colors, spacing, radius, shadows, type scale
```

## Checks

```bash
npx tsc --noEmit
npx eslint src
npx expo-doctor
```
