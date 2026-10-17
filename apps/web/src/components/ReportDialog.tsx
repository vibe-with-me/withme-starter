import {
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASONS,
  type ReportReason,
} from '@withme/contract';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../lib/api.ts';

/** What a sent report says back. */
export function reportThanks(name: string, blocked: boolean): string {
  return `Thanks. Your report is in${blocked ? ` and ${name} is blocked` : ''}. They aren’t told.`;
}

/**
 * Report a person, or a gathering (filed against its host): a reason from
 * the fixed list, optional words, and the offer to block them in the same
 * step. A native modal <dialog>, so it works
 * the same inside a card and inside a list row. The report goes to the
 * fork's operator only; the person is never told.
 */
export function ReportButton({
  profileId,
  gatheringId,
  name,
  canBlock = true,
  onDone,
}: {
  profileId: string;
  /** Report this gathering instead; `profileId` is its host and `name` how to say them. */
  gatheringId?: string;
  name: string;
  /** False where they are already blocked (the Blocked list). */
  canBlock?: boolean;
  /**
   * After a sent report. When given, the caller says thanks (a list row may
   * vanish with the block); otherwise the button is replaced by the thanks.
   */
  onDone?: (blocked: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(canBlock);
  const [state, setState] = useState<'idle' | 'sending' | 'failed' | 'limited'>('idle');
  const [sent, setSent] = useState<null | { blocked: boolean }>(null);
  // The form exists only while the dialog is open: closed, it is not on
  // the page at all (no hidden copy of the name for a find to trip on).
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (isOpen) dialog.current?.showModal();
  }, [isOpen]);

  function open() {
    setReason(null);
    setDetails('');
    setBlock(canBlock);
    setState('idle');
    setIsOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) return;
    setState('sending');
    try {
      const report = {
        reason,
        details: details.trim() === '' ? undefined : details.trim(),
        block: canBlock && block,
      };
      if (gatheringId) {
        await api.app.gatherings.report({ id: gatheringId, ...report });
        // A gathering hidden since the page loaded files nothing, and so
        // blocks nothing: block the host directly (idempotent) so "blocked"
        // is true whatever the report found.
        if (report.block) await api.app.blocks.block({ user_id: profileId });
      } else {
        await api.app.reports.create({ reported_id: profileId, ...report });
      }
      const blocked = canBlock && block;
      dialog.current?.close();
      setState('idle');
      if (onDone) onDone(blocked);
      else setSent({ blocked });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      setState(code === 'TOO_MANY_REQUESTS' ? 'limited' : 'failed');
    }
  }

  return (
    <>
      {sent ? (
        <p className="hint" role="status">
          {reportThanks(name, sent.blocked)}
        </p>
      ) : (
        <button type="button" className="btn btn--quiet" onClick={open}>
          Report
        </button>
      )}
      {isOpen ? (
        <dialog
          ref={dialog}
          className="dialog"
          aria-labelledby={titleId}
          onClose={() => setIsOpen(false)}
        >
          <form className="stack" onSubmit={submit}>
            <h2 id={titleId} className="section-title">
              {gatheringId ? 'Report this gathering' : `Report ${name}`}
            </h2>
            <p className="hint">
              {gatheringId
                ? 'Only the people who run this app see reports. The host isn’t told who reported it, or that anyone did.'
                : `Only the people who run this app see reports. ${name} isn’t told who reported them, or that anyone did.`}
            </p>
            <fieldset className="choices">
              <legend>What’s wrong?</legend>
              {REPORT_REASONS.map((value) => (
                <label key={value} className="choice">
                  <input
                    type="radio"
                    name="reason"
                    value={value}
                    required
                    checked={reason === value}
                    onChange={() => setReason(value)}
                  />
                  <span>{REPORT_REASON_LABELS[value]}</span>
                </label>
              ))}
            </fieldset>
            <div className="field">
              <label htmlFor={`${titleId}-details`}>Anything else? (optional)</label>
              <textarea
                id={`${titleId}-details`}
                maxLength={REPORT_DETAILS_MAX}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </div>
            {canBlock ? (
              <label className="choice">
                <input
                  type="checkbox"
                  checked={block}
                  onChange={(e) => setBlock(e.target.checked)}
                />
                <span>Also block {name}</span>
              </label>
            ) : null}
            {state === 'failed' || state === 'limited' ? (
              <p className="form-error" role="alert">
                {state === 'limited'
                  ? 'You’ve sent a lot of reports today. Try again tomorrow.'
                  : 'That didn’t go through. Try again.'}
              </p>
            ) : null}
            <button type="submit" className="btn" disabled={!reason || state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
          </form>
        </dialog>
      ) : null}
    </>
  );
}
