import {
  LINK_PLATFORM_IDS,
  LINK_PLATFORMS,
  linkHref,
  linkLabel,
  normalizeLinkValue,
  type LinkKind,
  type LinkPlatformId,
  type ProfileLink,
} from '@withme/contract';
import { useRouter } from '@tanstack/react-router';
import { useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api } from '../lib/api.ts';
import type { Loaded } from '../lib/loaded.ts';

/** The keyboard a kind wants; the browser's own validation stays off (normalizeLinkValue is the judge). */
const INPUT_MODE: Record<LinkKind, 'text' | 'tel' | 'email' | 'url'> = {
  handle: 'text',
  phone: 'tel',
  email: 'email',
  url: 'url',
};

const INVALID: Record<LinkKind, string> = {
  handle: 'Letters, numbers, dots, dashes and underscores only.',
  phone: 'Enter a phone number with its country code.',
  email: 'Enter an email address.',
  url: 'Enter a web address.',
};

interface Row {
  platform: LinkPlatformId;
  value: string;
  error: string | null;
}

/**
 * Profile → Links: the places people can reach you, one per platform, from
 * a picker of every platform the starter knows. Saved as a whole list
 * through app.links.replace; only your connections ever read it.
 */
export function LinksEditor({ links }: { links: Loaded<ProfileLink[]> }) {
  const router = useRouter();
  const headingId = useId();
  const [retrying, setRetrying] = useState(false);

  async function retry() {
    setRetrying(true);
    try {
      await router.invalidate({ sync: true });
    } finally {
      setRetrying(false);
    }
  }

  // A failed load must not render an empty editor: saving it would clear the
  // list. The form mounts only once the list is here, so its draft starts
  // from the stored list, a retry included.
  if (!links.ok) {
    return (
      <section className="card" aria-labelledby={headingId}>
        <h2 id={headingId} className="section-title">
          Links
        </h2>
        {retrying ? (
          <p className="empty" aria-busy="true">
            Loading…
          </p>
        ) : (
          <div className="list-error" role="alert">
            <p>Couldn't load your links.</p>
            <button type="button" className="btn btn--quiet" onClick={retry}>
              Try again
            </button>
          </div>
        )}
      </section>
    );
  }
  return <LinksForm initial={links.data} headingId={headingId} />;
}

function LinksForm({ initial, headingId }: { initial: ProfileLink[]; headingId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => initial.map((link) => ({ ...link, error: null })));
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const inputs = useRef(new Map<LinkPlatformId, HTMLInputElement>());
  const addButton = useRef<HTMLButtonElement>(null);
  const taken = new Set(rows.map((row) => row.platform));
  const available = LINK_PLATFORM_IDS.filter((platform) => !taken.has(platform));

  function add(platform: LinkPlatformId) {
    // Flushed so the new input exists to take focus.
    flushSync(() => {
      setRows((prev) => [...prev, { platform, value: '', error: null }]);
      setChoosing(false);
      setStatus(null);
    });
    inputs.current.get(platform)?.focus();
  }

  function remove(platform: LinkPlatformId) {
    // The row's own controls go with it: keep keyboard focus on the section.
    flushSync(() => {
      setRows((prev) => prev.filter((row) => row.platform !== platform));
      setStatus(null);
    });
    addButton.current?.focus();
  }

  function edit(platform: LinkPlatformId, value: string) {
    setRows((prev) =>
      prev.map((row) => (row.platform === platform ? { ...row, value, error: null } : row)),
    );
    // A draft is not saved: drop "Links saved." (or a failure) once a value changes.
    setStatus(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setStatus(null);
    const checked = rows.map((row) => {
      const value = normalizeLinkValue(row.platform, row.value);
      return value === null
        ? { ...row, error: INVALID[LINK_PLATFORMS[row.platform].kind] }
        : { ...row, value, error: null };
    });
    const firstInvalid = checked.find((row) => row.error);
    if (firstInvalid) {
      flushSync(() => setRows(checked));
      inputs.current.get(firstInvalid.platform)?.focus();
      return;
    }
    setBusy(true);
    try {
      const saved = await api.app.links.replace({
        links: checked.map(({ platform, value }) => ({ platform, value })),
      });
      setRows(saved.links.map((link) => ({ ...link, error: null })));
      await router.invalidate();
      setStatus('Links saved.');
    } catch {
      setStatus('That didn’t go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" aria-labelledby={headingId} onSubmit={save} noValidate>
      <h2 id={headingId} className="section-title">
        Links
      </h2>
      <p className="hint">
        Where people can reach you. Only the people you’ve connected with can see these.
      </p>
      {rows.map((row) => (
        <LinkRow
          key={row.platform}
          row={row}
          disabled={busy}
          inputRef={(el) => {
            if (el) inputs.current.set(row.platform, el);
            else inputs.current.delete(row.platform);
          }}
          onChange={(value) => edit(row.platform, value)}
          onRemove={() => remove(row.platform)}
        />
      ))}
      {available.length > 0 ? (
        <button
          ref={addButton}
          type="button"
          className="btn btn--quiet"
          aria-expanded={choosing}
          // A save's response replaces the rows: a platform added mid-save would vanish.
          disabled={busy}
          onClick={() => setChoosing((open) => !open)}
        >
          {rows.length === 0 ? 'Add a link' : 'Add another link'}
        </button>
      ) : null}
      {choosing ? (
        <div className="chooser" role="group" aria-label="Choose a platform">
          {available.map((platform) => (
            <button
              key={platform}
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => add(platform)}
            >
              {LINK_PLATFORMS[platform].label}
            </button>
          ))}
        </div>
      ) : null}
      {/* Always mounted: a live region created with its message is not announced. */}
      <p className="hint" role="status">
        {status}
      </p>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save links'}
      </button>
    </form>
  );
}

function LinkRow({
  row,
  disabled,
  inputRef,
  onChange,
  onRemove,
}: {
  row: Row;
  disabled: boolean;
  inputRef: (el: HTMLInputElement | null) => void;
  onChange: (value: string) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const { label, kind, placeholder } = LINK_PLATFORMS[row.platform];
  return (
    <div className="link-row">
      <div className="field">
        <label htmlFor={id}>{label}</label>
        <input
          ref={inputRef}
          id={id}
          value={row.value}
          placeholder={placeholder}
          inputMode={INPUT_MODE[kind]}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={200}
          disabled={disabled}
          aria-invalid={row.error ? true : undefined}
          aria-describedby={row.error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {row.error ? (
          <p id={`${id}-error`} className="field-error">
            {row.error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className="btn btn--quiet"
        disabled={disabled}
        aria-label={`Remove ${label}`}
        onClick={onRemove}
      >
        Remove
      </button>
    </div>
  );
}

/**
 * Someone's links as chips: a link where the platform has a public page,
 * plain text where it has none (Discord, Signal). Shown only on a
 * connection's row — the database admits them nowhere else.
 */
export function LinkList({ links, name }: { links: ProfileLink[]; name: string }) {
  if (links.length === 0) return null;
  return (
    <ul className="links" aria-label={`${name}’s links`}>
      {links.map((link) => {
        const { label } = LINK_PLATFORMS[link.platform];
        const href = linkHref(link.platform, link.value);
        const text = linkLabel(link.platform, link.value);
        return (
          <li key={link.platform}>
            {href ? (
              // noreferrer: the platform must not learn which app sent the visit.
              <a className="link" href={href} target="_blank" rel="noopener noreferrer">
                <span className="link__platform">{label}</span>
                <span className="link__value">{text}</span>
              </a>
            ) : (
              <span className="link">
                <span className="link__platform">{label}</span>
                <span className="link__value">{text}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
