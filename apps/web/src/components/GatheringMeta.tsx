import { mapsSearchUrl } from '@withme/contract';
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
