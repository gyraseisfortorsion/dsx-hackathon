import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { errorMessage } from '@/api/client';
import {
  CATEGORY_OPTIONS,
  CONDITION_OPTIONS,
  useAnalyzeListing,
  useCommunityConfig,
  useCreateListing,
  useEditListing,
  useInquireListing,
  useListing,
  useListings,
  useListingStatus,
  useRelatedListings,
  useReportCommunity,
  useSaveListing,
  useUploadListingPhoto,
  type Listing,
  type ListingCategory,
  type ListingCondition,
  type ListingScope,
  type ListingStatus,
} from '@/api/community';
import { useCurrentUser } from '@/stores/session-store';
import { showToast } from '@/stores/toast-store';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { DemoBanner, EmptyState, InlineError } from '@/components/feedback';
import { ChoiceField, TextField } from '@/components/form';
import { ListRow } from '@/components/list-row';
import { Pill } from '@/components/pill';
import { QueryView } from '@/components/query-view';
import { Screen } from '@/components/screen';
import { Section } from '@/components/section';
import { colors, radius, spacing } from '@/theme';
import { successFeedback } from '@/utils/haptics';

const SCOPES: { id: ListingScope; label: string }[] = [
  { id: 'active', label: 'Browse' },
  { id: 'saved', label: 'Saved' },
  { id: 'mine', label: 'My listings' },
];

const SELLER_STATUSES: ListingStatus[] = ['active', 'reserved', 'sold', 'withdrawn'];

/** Valid 1×1 PNG used as a demo attachment — the API requires a real photo id. */
const DEMO_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function MarketplaceScreen() {
  const [scope, setScope] = useState<ListingScope>('active');
  const [category, setCategory] = useState<ListingCategory | null>(null);
  const [query, setQuery] = useState('');
  const listings = useListings({ scope, category, q: query.trim() || undefined });
  const config = useCommunityConfig();

  return (
    <Screen onRefresh={() => listings.refetch()}>
      {config.data?.is_mock ? <DemoBanner title="Student marketplace">{config.data.expectations}</DemoBanner> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
        {SCOPES.map((item) => (
          <Pill key={item.id} label={item.label} active={scope === item.id} onPress={() => setScope(item.id)} />
        ))}
      </View>
      <TextField label="Search" value={query} onChangeText={setQuery} placeholder="Textbook, lamp, calculator…" returnKeyType="search" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
        <Pill label="All" active={category == null} onPress={() => setCategory(null)} />
        {CATEGORY_OPTIONS.map((item) => (
          <Pill key={item.id} label={item.label} active={category === item.id} onPress={() => setCategory(item.id)} />
        ))}
      </View>
      <Button title="Sell something" onPress={() => router.push('/marketplace/new')} style={{ marginBottom: spacing.lg }} />
      <QueryView query={listings} loadingLabel="Loading listings…">
        {(page) =>
          page.items.length ? (
            page.items.map((item) => <ListingRow key={item.id} item={item} />)
          ) : (
            <EmptyState
              title={scope === 'mine' ? 'You have no listings' : scope === 'saved' ? 'Nothing saved' : 'No listings yet'}
              subtitle={scope === 'mine' ? 'Post a book or item for campus pickup.' : 'Check back, or post something of your own.'}
            />
          )
        }
      </QueryView>
    </Screen>
  );
}

function ListingRow({ item }: { item: Listing }) {
  return (
    <ListRow
      leading={
        item.thumbnail ? (
          <Image source={{ uri: item.thumbnail }} style={{ width: 44, height: 44, borderRadius: 10 }} />
        ) : (
          <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.chip }} />
        )
      }
      title={item.title}
      subtitle={`${item.seller_name} · ${item.pickup_area}`}
      value={item.price_label}
      minHeight={73}
      onPress={() => router.push({ pathname: '/marketplace/[id]', params: { id: item.id } })}
    />
  );
}

export function ListingScreen({ id }: { id: string }) {
  const user = useCurrentUser();
  const listing = useListing(id);
  const related = useRelatedListings(id);
  const config = useCommunityConfig();

  return (
    <Screen onRefresh={() => Promise.all([listing.refetch(), related.refetch()])}>
      <QueryView query={listing} loadingLabel="Loading listing…">
        {(item) => <ListingDetail item={item} mine={item.seller_id === user} related={related.data ?? []} expectations={item.expectations || config.data?.expectations} />}
      </QueryView>
    </Screen>
  );
}

function ListingDetail({ item, mine, related, expectations }: { item: Listing; mine: boolean; related: Listing[]; expectations?: string }) {
  const save = useSaveListing();
  const inquire = useInquireListing();
  const status = useListingStatus();
  const report = useReportCommunity();
  const busy = save.isPending || inquire.isPending || status.isPending || report.isPending;
  const photo = item.photos[0] ?? item.thumbnail;

  return (
    <>
      {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: 220, borderRadius: radius.xl, marginBottom: spacing.lg }} contentFit="cover" /> : null}
      <AppText variant="eyebrow">{item.category} · {item.condition.replace('_', ' ')}</AppText>
      <AppText variant="largeTitle" style={{ marginTop: 6 }}>
        {item.title}
      </AppText>
      <AppText variant="heading" style={{ marginTop: 4, marginBottom: spacing.md }}>
        {item.price_label}
      </AppText>
      <AppText>{item.description}</AppText>
      <ListRow title={item.seller_name} subtitle={`${item.pickup_area} · pickup`} accessory="none" />
      {item.author || item.isbn || item.course_id ? (
        <AppText variant="caption" style={{ marginTop: spacing.sm }}>
          {[item.author, item.edition, item.isbn, item.course_id].filter(Boolean).join(' · ')}
        </AppText>
      ) : null}
      {expectations ? <DemoBanner title="No payment protection">{expectations}</DemoBanner> : null}

      {mine ? (
        <Section title="Your listing">
          <Button title="Edit listing" variant="secondary" onPress={() => router.push({ pathname: '/marketplace/edit/[id]', params: { id: item.id } })} style={{ marginBottom: spacing.md }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
            {SELLER_STATUSES.map((value) => (
              <Pill
                key={value}
                label={value}
                active={item.status === value}
                onPress={busy ? undefined : () => status.mutate({ id: item.id, status: value }, { onError: (error) => showToast(errorMessage(error)) })}
              />
            ))}
          </View>
        </Section>
      ) : (
        <View style={{ gap: 10, marginTop: spacing.lg }}>
          <Button
            title="Message seller"
            disabled={busy || item.status !== 'active'}
            onPress={() =>
              inquire.mutate(item.id, {
                onSuccess: (conversation) => {
                  successFeedback();
                  router.push({ pathname: '/inbox/[id]', params: { id: conversation.id } });
                },
                onError: (error) => showToast(errorMessage(error)),
              })
            }
          />
          <Button
            title={item.saved ? 'Saved' : 'Save'}
            variant={item.saved ? 'planned' : 'secondary'}
            disabled={busy}
            onPress={() => save.mutate({ id: item.id, enabled: !item.saved }, { onError: (error) => showToast(errorMessage(error)) })}
          />
          <Button
            title="Report listing"
            variant="ghost"
            disabled={busy}
            onPress={() =>
              report.mutate({ target_type: 'listing', target_id: item.id, reason: 'Reported from BU One marketplace' }, { onSuccess: () => showToast('Report sent') })
            }
          />
        </View>
      )}
      {save.error || inquire.error || status.error || report.error ? (
        <InlineError message={errorMessage(save.error ?? inquire.error ?? status.error ?? report.error)} />
      ) : null}

      {related.length ? (
        <Section title="Related">
          {related.map((entry) => (
            <ListingRow key={entry.id} item={entry} />
          ))}
        </Section>
      ) : null}
    </>
  );
}

export function NewListingScreen() { return <ListingForm />; }

export function EditListingScreen({ id }: { id: string }) {
  const listing = useListing(id);
  const user = useCurrentUser();
  return <QueryView query={listing}>{item => item.seller_id === user ? <ListingForm key={id} initial={item} /> : <Screen><InlineError message="You can only edit your own listings." /></Screen>}</QueryView>;
}

function ListingForm({ initial }: { initial?: Listing }) {
  const config = useCommunityConfig();
  const analyze = useAnalyzeListing();
  const upload = useUploadListingPhoto();
  const create = useCreateListing();
  const edit = useEditListing();

  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<ListingCategory>(initial?.category ?? 'books');
  const [condition, setCondition] = useState<ListingCondition>(initial?.condition ?? 'good');
  const [dollars, setDollars] = useState(initial ? String(initial.price_minor / 100) : '25');
  const [pickup, setPickup] = useState(initial?.pickup_area ?? 'Warren Towers');
  const [author, setAuthor] = useState(initial?.author ?? '');
  const [isbn, setIsbn] = useState(initial?.isbn ?? '');
  const [photoId, setPhotoId] = useState<string | null>(initial?.photo_ids[0] ?? null);
  const busy = analyze.isPending || upload.isPending || create.isPending || edit.isPending;
  const cents = Math.round(Number(dollars) * 100);

  const attachPhoto = () =>
    upload.mutate(DEMO_PHOTO, {
      onSuccess: (photo) => {
        setPhotoId(photo.id);
        showToast('Demo photo attached');
      },
      onError: (error) => showToast(errorMessage(error)),
    });

  return (
    <Screen>
      {config.data ? <DemoBanner title="Campus pickup only">{config.data.expectations}</DemoBanner> : null}
      <TextField label="Title" value={title} onChangeText={setTitle} maxLength={120} placeholder="CAS CS 111 textbook" />
      <TextField label="Description" value={description} onChangeText={setDescription} multiline maxLength={2000} showCount placeholder="Condition, edition, where to meet…" />
      <ChoiceField label="Category" options={CATEGORY_OPTIONS.map((item) => item.label)} value={CATEGORY_OPTIONS.find((item) => item.id === category)?.label ?? 'Books'} onChange={(label) => setCategory(CATEGORY_OPTIONS.find((item) => item.label === label)?.id ?? 'other')} />
      <ChoiceField label="Condition" options={CONDITION_OPTIONS.map((item) => item.label)} value={CONDITION_OPTIONS.find((item) => item.id === condition)?.label ?? 'Good'} onChange={(label) => setCondition(CONDITION_OPTIONS.find((item) => item.label === label)?.id ?? 'good')} />
      <TextField label="Price (USD)" value={dollars} onChangeText={setDollars} keyboardType="decimal-pad" />
      <TextField label="Pickup area" value={pickup} onChangeText={setPickup} placeholder="Warren Towers" />
      {category === 'books' ? (
        <>
          <TextField label="Author" value={author} onChangeText={setAuthor} />
          <TextField label="ISBN" value={isbn} onChangeText={setIsbn} />
        </>
      ) : null}

      <Button title={initial ? 'Replace with demo photo' : photoId ? 'Demo photo attached' : 'Attach demo photo'} variant="secondary" disabled={busy} onPress={attachPhoto} style={{ marginBottom: spacing.md }} />
      <Button
        title="Check listing text"
        variant="secondary"
        disabled={busy || title.trim().length < 1 || description.trim().length < 1}
        onPress={() =>
          analyze.mutate(
            { title: title.trim(), description: description.trim() },
            { onError: (error) => showToast(errorMessage(error)) },
          )
        }
      />
      {analyze.data ? (
        <AppText variant="caption" style={{ marginVertical: spacing.md }}>
          {analyze.data.flag_for_review ? 'Flagged for review. ' : ''}
          {analyze.data.reason}
        </AppText>
      ) : null}

      {create.error || edit.error || upload.error ? <InlineError message={errorMessage(create.error ?? edit.error ?? upload.error)} /> : null}
      <Button
        title={busy ? 'Saving…' : initial ? 'Save changes' : 'Post listing'}
        disabled={busy || !title.trim() || !description.trim() || !pickup.trim() || !photoId || !dollars.trim() || !Number.isFinite(cents) || cents < 0 || cents > 100000000}
        onPress={() =>
          (initial ? (body: Parameters<typeof create.mutate>[0], options: { onSuccess: (listing: Listing) => void }) => edit.mutate({ id: initial.id, listing: body }, options) : create.mutate)(
            {
              title: title.trim(),
              description: description.trim(),
              category,
              condition,
              price_minor: cents,
              pickup_area: pickup.trim(),
              photo_ids: initial && initial.photo_ids[0] === photoId ? initial.photo_ids : [photoId!],
              edition: initial?.edition ?? null,
              author: author.trim() || null,
              isbn: isbn.trim() || null,
              course_id: initial?.course_id ?? config.data?.courses.find((course) => title.toLowerCase().includes(course.code.toLowerCase()))?.id ?? null,
            },
            {
              onSuccess: (listing) => {
                successFeedback();
                router.replace({ pathname: '/marketplace/[id]', params: { id: listing.id } });
              },
            },
          )
        }
        style={{ marginTop: spacing.md }}
      />
    </Screen>
  );
}
