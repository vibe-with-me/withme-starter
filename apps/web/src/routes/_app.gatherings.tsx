import type { GatheringListItem } from '@withme/contract';
import { createFileRoute, Link, useLoaderData, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { shellStates } from '../components/CalmStates.tsx';
import { asSignedInAccount } from '../lib/account-scope.ts';
import { api } from '../lib/api.ts';
import { tomorrowEvening, whenAndWhere } from '../lib/format-time.ts';
import { goingLine, withLine } from '../lib/going.ts';

/**
 * The Events tab: what is happening in the domain, and your own calendar.
 * "Happening" is every upcoming gathering the viewer may see — a bulletin
 * board, not a directory: a row carries the headcount and names only the
 * viewer's connections among the members (docs/the-slice.md). The tap is
 * still how people meet; the list is how they find out where.
 */
export const Route = createFileRoute('/_app/gatherings')({
  ...shellStates,
  head: () => ({ meta: [{ title: 'Events — withme' }] }),
  loader: async () => {
    const [{ gatherings: happening }, { gatherings: mine }] = await asSignedInAccount(() =>
      Promise.all([api.app.gatherings.list(), api.app.gatherings.listMine()]),
    );
    return { happening, mine };
  },
  component: GatheringsPage,
});

function GatheringsPage() {
  const { happening, mine } = Route.useLoaderData();
  // The layout fetched the viewer's profile once; every _app child may read it.
  const { profile } = useLoaderData({ from: '/_app' });
  const viewerId = profile?.id ?? null;
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(tomorrowEvening);
  const [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = Date.now();
  const upcoming = mine.filter((g) => Date.parse(g.starts_at) >= now);
  // most recent first
  const past = mine.filter((g) => Date.parse(g.starts_at) < now).toReversed();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.app.gatherings.create({
        title: title.trim(),
        starts_at: new Date(startsAt).toISOString(),
        location: location.trim() === '' ? null : location.trim(),
      });
      setTitle('');
      setLocation('');
      setStartsAt(tomorrowEvening());
      // Wait for the re-fetch (sync) so the list never shows a stale set of gatherings.
      await router.invalidate({ sync: true });
    } catch {
      setError('Could not create the gathering. Check the fields and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <form className="card" onSubmit={create}>
        <h1>Create a gathering</h1>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            required
            maxLength={120}
            placeholder="e.g. Rooftop listening session"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="starts_at">Starts</label>
          <input
            id="starts_at"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="location">Location (optional)</label>
          <input
            id="location"
            maxLength={160}
            placeholder="Where to find it"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn" type="submit" disabled={busy || !title.trim() || !startsAt}>
          {busy ? 'Creating…' : 'Create gathering'}
        </button>
      </form>

      <section aria-labelledby="happening">
        <h2 className="section-title" id="happening">
          Happening
        </h2>
        {happening.length === 0 ? (
          <p className="empty">Nothing happening yet. Create the first one.</p>
        ) : (
          happening.map((g) => <GatheringRow key={g.id} gathering={g} viewerId={viewerId} />)
        )}
      </section>

      <section aria-labelledby="yours">
        <h2 className="section-title" id="yours">
          Yours
        </h2>
        {mine.length === 0 ? (
          <p className="empty">Join one above, or create your own.</p>
        ) : upcoming.length === 0 ? (
          <p className="empty">Nothing coming up.</p>
        ) : (
          upcoming.map((g) => <GatheringRow key={g.id} gathering={g} viewerId={viewerId} />)
        )}
        {past.length > 0 ? (
          <>
            <h2 className="section-title">Past</h2>
            {past.map((g) => (
              <GatheringRow key={g.id} gathering={g} viewerId={viewerId} />
            ))}
          </>
        ) : null}
      </section>
    </div>
  );
}

function GatheringRow({
  gathering,
  viewerId,
}: {
  gathering: GatheringListItem;
  viewerId: string | null;
}) {
  const mark =
    viewerId !== null && gathering.host_id === viewerId
      ? 'Hosting'
      : gathering.is_member
        ? 'Going'
        : null;
  const line = [mark, whenAndWhere(gathering), goingLine(gathering.member_count)]
    .filter(Boolean)
    .join(' · ');
  const names = withLine(gathering.members, viewerId);
  return (
    <div className="row">
      <div className="row-body">
        <span className="name">{gathering.title}</span>
        <span className="sub">{line}</span>
        {names ? <span className="sub">{names}</span> : null}
      </div>
      <div className="row-actions">
        <Link className="btn btn--quiet" to="/gatherings/$id" params={{ id: gathering.id }}>
          Open
        </Link>
      </div>
    </div>
  );
}
