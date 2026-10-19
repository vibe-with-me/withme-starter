import type { GatheringVisibility } from '@withme/contract';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { shellStates } from '../components/CalmStates.tsx';
import { GatheringControls } from '../components/GatheringControls.tsx';
import { api } from '../lib/api.ts';
import { tomorrowEvening } from '../lib/format-time.ts';
import { parseSpots } from '../lib/going.ts';

/**
 * Create a gathering, linked from the Events tab. A created gathering
 * replaces this page with its own (replace, so Back from there returns to
 * Events rather than to an emptied form). A static segment, so the router
 * matches it ahead of /gatherings/$id.
 */
export const Route = createFileRoute('/_app/gatherings_/new')({
  ...shellStates,
  head: () => ({ meta: [{ title: 'New gathering — withme' }] }),
  component: NewGatheringPage,
});

function NewGatheringPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(tomorrowEvening);
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<GatheringVisibility>('everyone');
  const [spots, setSpots] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { gathering } = await api.app.gatherings.create({
        title: title.trim(),
        starts_at: new Date(startsAt).toISOString(),
        location: location.trim() === '' ? null : location.trim(),
        visibility,
        capacity: parseSpots(spots) ?? null,
      });
      await navigate({ to: '/gatherings/$id', params: { id: gathering.id }, replace: true });
    } catch {
      setError('Could not create the gathering. Check the fields and try again.');
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
        <GatheringControls
          visibility={visibility}
          onVisibility={setVisibility}
          spots={spots}
          onSpots={setSpots}
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button
          className="btn"
          type="submit"
          disabled={busy || !title.trim() || !startsAt || parseSpots(spots) === undefined}
        >
          {busy ? 'Creating…' : 'Create gathering'}
        </button>
        <Link className="btn btn--quiet" to="/gatherings">
          Cancel
        </Link>
      </form>
    </div>
  );
}
