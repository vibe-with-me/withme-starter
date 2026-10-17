import {
  GATHERING_CAPACITY_MAX,
  GATHERING_CAPACITY_MIN,
  type GatheringVisibility,
} from '@withme/contract';
import { useId } from 'react';
import { SPOTS_HELP, VISIBILITY_CHOICES, parseSpots } from '../lib/going.ts';

/**
 * The host's two controls, shared by the create and edit forms: who can see
 * the gathering, and how many spots it has. The database enforces both; this
 * only asks.
 */
export function GatheringControls({
  visibility,
  onVisibility,
  spots,
  onSpots,
  editing = false,
}: {
  visibility: GatheringVisibility;
  onVisibility: (value: GatheringVisibility) => void;
  spots: string;
  onSpots: (value: string) => void;
  editing?: boolean;
}) {
  const id = useId();
  const invalid = parseSpots(spots) === undefined;
  return (
    <>
      <fieldset className="choices">
        <legend>Who can see it</legend>
        {VISIBILITY_CHOICES.map((choice) => (
          <label key={choice.value} className="choice">
            <input
              type="radio"
              name={`${id}-visibility`}
              value={choice.value}
              checked={visibility === choice.value}
              onChange={() => onVisibility(choice.value)}
            />
            <span>
              {choice.label}
              <span className="choice-help">{choice.help}</span>
            </span>
          </label>
        ))}
        {editing ? (
          <p className="hint">Anyone already going stays, whichever you pick.</p>
        ) : null}
      </fieldset>
      <div className="field">
        <label htmlFor={`${id}-spots`}>Spots (optional)</label>
        <input
          id={`${id}-spots`}
          type="number"
          inputMode="numeric"
          min={GATHERING_CAPACITY_MIN}
          max={GATHERING_CAPACITY_MAX}
          step={1}
          placeholder="No limit"
          value={spots}
          aria-invalid={invalid}
          aria-describedby={`${id}-spots-help`}
          onChange={(e) => onSpots(e.target.value)}
        />
        <p className="hint" id={`${id}-spots-help`}>
          {SPOTS_HELP}
          {editing ? ' Lowering it keeps everyone already going.' : ''}
        </p>
      </div>
    </>
  );
}
