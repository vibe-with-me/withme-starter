import AsyncStorage from '@react-native-async-storage/async-storage';
import { pushPath } from '@withme/contract';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from './api';
import { pushSetting, type PushChoice, type PushPermission, type PushSetting } from './push-state';

/**
 * Push notifications, transactional only: a request to you, yours
 * accepted, people joined your gathering. The database sends them (see
 * the push_notifications migration); this file only holds this device's
 * token, asks the OS at a moment that explains why, and opens what a
 * tapped notification points at.
 *
 * Per device, like the OS setting: the choice and the token live here, and
 * the server holds only the token.
 */

const CHOICE_KEY = 'push.choice';
const TOKEN_KEY = 'push.token';

// A push that lands while the app is open still shows, without a sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function readChoice(): Promise<PushChoice> {
  try {
    const value = await AsyncStorage.getItem(CHOICE_KEY);
    return value === 'on' || value === 'off' ? value : null;
  } catch {
    return null;
  }
}

async function readPermission(): Promise<PushPermission> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted' || status === 'denied' ? status : 'undetermined';
}

export async function readPushSetting(): Promise<PushSetting> {
  const [permission, choice] = await Promise.all([readPermission(), readChoice()]);
  return pushSetting(permission, choice);
}

/** Fetch this device's Expo token and hand it to the API (which refreshes last-seen). */
async function registerThisDevice(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const previous = await AsyncStorage.getItem(TOKEN_KEY);
  await api.app.push.register({ token, platform: Platform.OS });
  await AsyncStorage.setItem(TOKEN_KEY, token);
  // The OS rotated the token: the old one would otherwise wait out the 30-day sweep.
  if (previous && previous !== token) {
    await api.app.push.unregister({ token: previous }).catch(() => undefined);
  }
}

/** Ask the OS (Android needs a channel first), then register. Returns the new setting. */
export async function turnPushOn(): Promise<PushSetting> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Requests and gatherings',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    await AsyncStorage.setItem(CHOICE_KEY, 'off');
    return status === 'denied' ? 'denied' : 'off';
  }
  await registerThisDevice();
  await AsyncStorage.setItem(CHOICE_KEY, 'on');
  return 'on';
}

/** Off on this device: the server forgets the token. */
export async function turnPushOff(): Promise<PushSetting> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) await api.app.push.unregister({ token });
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.setItem(CHOICE_KEY, 'off');
  return readPushSetting();
}

/** "Not now" on the consent card: asked, answered, never shown again. */
export async function declinePushOffer(): Promise<void> {
  await AsyncStorage.setItem(CHOICE_KEY, 'off');
}

/**
 * Before signing out: this device stops receiving this account's pushes,
 * and whoever signs in next is asked afresh. Best effort, and bounded so
 * a dead network never holds the sign-out hostage; a token left behind is
 * moved to the next account on this phone, or dies in the 30-day sweep.
 * Returns how to undo it, for a sign-out that then fails.
 */
export async function forgetThisDevice(): Promise<() => Promise<void>> {
  const choice = await readChoice();
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) {
      await Promise.race([
        api.app.push.unregister({ token }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
  } catch {
    // Signing out matters more than this request.
  }
  await AsyncStorage.multiRemove([TOKEN_KEY, CHOICE_KEY]).catch(() => undefined);
  return async () => {
    try {
      // The OS grant is still there, so turning back on asks nothing.
      if (choice === 'on') await turnPushOn();
      else if (choice === 'off') await AsyncStorage.setItem(CHOICE_KEY, 'off');
    } catch {
      // The next launch re-registers if the choice was restored.
    }
  };
}

/** After account deletion: the server already dropped the token with the account. */
export async function clearThisDevice(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, CHOICE_KEY]).catch(() => undefined);
}

/**
 * The setting, kept current: re-read when the app returns to the
 * foreground, because the person may have changed it in Settings.
 */
export function usePushSetting(): [PushSetting | null, (next: PushSetting) => void] {
  const [setting, setSetting] = useState<PushSetting | null>(null);
  const refresh = useCallback(() => {
    readPushSetting()
      .then(setSetting)
      .catch(() => setSetting(null));
  }, []);
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  return [setting, setSetting];
}

/**
 * Signed-in only (mounted under the session guard): refresh this device's
 * token on launch and when the OS rotates it, and open what a tapped
 * notification points at — only the paths the contract allows.
 */
export function usePushRouting(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn) return;
    readPushSetting()
      .then((setting) => (setting === 'on' ? registerThisDevice() : undefined))
      .catch(() => undefined);
    const sub = Notifications.addPushTokenListener(() => {
      readPushSetting()
        .then((setting) => (setting === 'on' ? registerThisDevice() : undefined))
        .catch(() => undefined);
    });
    return () => sub.remove();
  }, [signedIn]);

  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!signedIn || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const path = pushPath(response.notification.request.content.data);
    if (path) router.push(path as never);
  }, [signedIn, response]);
}
