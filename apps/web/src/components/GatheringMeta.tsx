import {
  gatheringIcs,
  gatheringIcsFilename,
  gatheringUrl,
  mapsSearchUrl,
  type Gathering,
} from '@withme/contract';
import { MapPin } from 'lucide-react';
import type { MetaLine } from '../lib/format-time.ts';

/**
 * A gathering's location as a link that searches Google Maps for the text.
 * Nothing leaves the page until the viewer taps it (docs/safety-model.md).
 * Ink, not the accent: the accent is a screen's primary action only.
 */
export function MapsLink({ location }: { location: string }) {
  const href = mapsSearchUrl(location, 'web');
  if (!href) return <>{location}</>;
  return (
    // noreferrer: the maps site must not learn which page sent the visit.
    <a
      className="maps-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${location}, opens in Maps`}
    >
      <MapPin className="platform-icon" size={14} aria-hidden="true" focusable="false" />
      {location}
    </a>
  );
}

/** A meta line from lib/format-time.ts, inline in the caller's <p> or <span>, its location a Maps link. */
export function GatheringMeta({ line }: { line: MetaLine }) {
  const parts = [
    line.head || null,
    line.location ? <MapsLink key="where" location={line.location} /> : null,
    line.tail || null,
  ].filter((part) => part !== null);
  return <>{parts.flatMap((part, i) => (i === 0 ? [part] : [' · ', part]))}</>;
}

/**
 * Saves the gathering to the viewer's own calendar as an .ics file, built in
 * the page: no endpoint, and nothing leaves the browser until the viewer
 * opens the file. The file carries the title, time, location and a link
 * back, never who is going (packages/contract/src/schemas/calendar.ts).
 */
export function AddToCalendar({ gathering }: { gathering: Gathering }) {
  function download() {
    const ics = gatheringIcs(gathering, gatheringUrl(window.location.origin, gathering.id));
    const href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = gatheringIcsFilename(gathering.title);
    a.click();
    // After the click has started the download; revoking at once can cancel it in Safari.
    setTimeout(() => URL.revokeObjectURL(href), 0);
  }
  return (
    <button type="button" className="btn btn--quiet" onClick={download}>
      Add to calendar
    </button>
  );
}
