/** What the OS says about notifications for this app. */
export type PushPermission = 'granted' | 'denied' | 'undetermined';

/** What this person chose on this device; null until they answer the offer. */
export type PushChoice = 'on' | 'off' | null;

/**
 * The one state the Profile switch and the consent card read:
 * - 'unasked': never offered here; the card may appear (once).
 * - 'on' / 'off': the switch's position.
 * - 'denied': the OS refuses; only Settings can change it.
 */
export type PushSetting = 'unasked' | 'on' | 'off' | 'denied';

export function pushSetting(permission: PushPermission, choice: PushChoice): PushSetting {
  if (permission === 'denied') return 'denied';
  if (choice === null) return 'unasked';
  // "On" with no OS grant (permission reset, app restored) is not on: the
  // switch shows off and turning it on asks again.
  return choice === 'on' && permission === 'granted' ? 'on' : 'off';
}
