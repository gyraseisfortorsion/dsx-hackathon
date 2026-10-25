import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { conflictStatus, eventCategory, eventToday, eventWhen, type ConflictStatus } from '@/api/event-format';
import { eventTagIds, tagLabel } from '@/api/event-taxonomy';
import { useEventBrowseStore } from '@/stores/event-browse-store';
import { CLEAR, HIDE, SAVE, useEventFeedback } from '@/api/events';
import type { EventCard as EventCardModel, EventFeedback } from '@/api/types';
import { showToast } from '@/stores/toast-store';
import { colors, radius, shadows, spacing } from '@/theme';
import { successFeedback, tapFeedback } from '@/utils/haptics';
import { AppText } from './app-text';
import { Icon } from './icon';

const conflictColors: Record<ConflictStatus['tone'], string> = {
  conflict: colors.brandDeep,
  unknown: colors.agenda.deadline.text,
  clear: colors.success,
};

export function ConflictLine({ event }: { event: Pick<EventCardModel, 'conflict_ids' | 'conflict_check_complete'> }) {
  const status = conflictStatus(event);
  return (
    <AppText variant="caption" style={{ color: conflictColors[status.tone], fontWeight: '600' }}>
      {status.label}
    </AppText>
  );
}

/** Save/hide/clear with optimistic UI; failures roll back and explain why. */
export function useEventActions() {
  const feedback = useEventFeedback();
  const send = (event: EventCardModel, next: EventFeedback, done: string, undo?: EventFeedback) => {
    feedback.mutate(
      { event, feedback: next },
      {
        onSuccess: () => {
          if (next.saved) successFeedback();
          showToast(done, undo ? () => feedback.mutate({ event: { ...event, ...next }, feedback: undo }) : undefined);
        },
        onError: (error) => showToast(`Couldn’t update “${event.title}”. ${errorMessage(error)}`),
      },
    );
  };
  return {
    toggleSave: (event: EventCardModel) => {
      tapFeedback();
      if (event.saved) send(event, CLEAR, 'Removed from Saved', SAVE);
      else send(event, SAVE, 'Saved in BU One · not an RSVP', CLEAR);
    },
    hide: (event: EventCardModel) => {
      tapFeedback();
      send(event, HIDE, 'Hidden from your event lists', event.saved ? SAVE : CLEAR);
    },
    unhide: (event: EventCardModel) => send(event, CLEAR, 'Event restored'),
  };
}

export const openEvent = (id: string) => router.push({ pathname: '/event/[id]', params: { id } });

/** Event summary used in feeds, Saved, and assistant replies. */
export function EventCard({ event, showReasons = true }: { event: EventCardModel; showReasons?: boolean }) {
  const actions = useEventActions();
  const { type } = eventCategory(event);
  const today = eventToday(useEventBrowseStore((state) => state.asOf));
  const when = eventWhen(event, today);

  if (event.not_interested) {
    return (
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: 14, backgroundColor: colors.surfaceMuted, borderRadius: radius.xl, borderCurve: 'continuous' }}>
        <AppText variant="caption" numberOfLines={1} style={{ flex: 1 }}>
          Hidden · {event.title}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={`Undo hide ${event.title}`} hitSlop={8} onPress={() => actions.unhide(event)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText variant="label" style={{ color: colors.brand, fontSize: 13 }}>
            Undo
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.separator,
        borderRadius: radius.xl,
        borderCurve: 'continuous',
        boxShadow: shadows.card,
        overflow: 'hidden',
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${when}${event.location ? `, ${event.location}` : ''}`}
        accessibilityHint="Opens event details"
        onPress={() => openEvent(event.id)}
        style={({ pressed }) => ({ padding: 14, paddingBottom: spacing.sm, gap: 3, opacity: pressed ? 0.7 : 1 })}>
        <AppText variant="caption" style={{ color: colors.brand, fontWeight: '700' }}>
          {when}
        </AppText>
        <AppText variant="headline" numberOfLines={2}>
          {event.title}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          {[type, event.location].filter(Boolean).join(' · ')}
        </AppText>
        <ConflictLine event={event} />
        <EventTagChips tags={event.tags} />
        {showReasons && event.reasons?.length ? (
          <View style={{ marginTop: spacing.xs, backgroundColor: colors.surfaceSheet, borderRadius: radius.sm, padding: spacing.sm, gap: 2 }}>
            <AppText variant="micro" style={{ color: colors.label }}>
              WHY THIS EVENT?
            </AppText>
            {event.reasons.slice(0, 2).map((reason) => (
              <AppText key={reason} variant="caption" style={{ color: colors.inkSoft }}>
                {reason}
              </AppText>
            ))}
          </View>
        ) : null}
      </Pressable>
      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.separator }}>
        <CardAction
          icon="bookmark"
          filled={!!event.saved}
          label={event.saved ? 'Saved' : 'Save'}
          accessibilityLabel={event.saved ? `Remove ${event.title} from Saved` : `Save ${event.title}`}
          onPress={() => actions.toggleSave(event)}
        />
        <View style={{ width: 1, backgroundColor: colors.separator }} />
        <CardAction icon="hide" label="Not interested" accessibilityLabel={`Hide ${event.title}`} onPress={() => actions.hide(event)} />
      </View>
    </View>
  );
}

export function EventTagChips({ tags }: { tags?: Record<string, number | null> }) {
  const ids = eventTagIds(tags);
  if (!ids.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {ids.map((id) => (
        <View key={id} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.surfaceSheet }}>
          <AppText variant="micro">{tagLabel(id)}</AppText>
        </View>
      ))}
    </View>
  );
}

function CardAction({
  icon,
  label,
  filled,
  accessibilityLabel,
  onPress,
}: {
  icon: 'bookmark' | 'hide';
  label: string;
  filled?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!filled }}
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}>
      <Icon name={icon} size={16} color={filled ? colors.brand : colors.subtle} filled={filled} />
      <AppText variant="label" style={{ fontSize: 13, color: filled ? colors.brand : colors.label }}>
        {label}
      </AppText>
    </Pressable>
  );
}
