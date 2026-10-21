/**
 * Feature-gated NFC: react-native-nfc-manager is a native module, so it only
 * exists in development builds — in Expo Go these functions report
 * unavailable and the UI hides the scan affordance. Deep links and manual
 * UID entry work everywhere.
 */
import { NativeModules, TurboModuleRegistry } from 'react-native';

interface NfcModule {
  isSupported(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  start(): Promise<void>;
  requestTechnology(tech: unknown): Promise<unknown>;
  getTag(): Promise<{ id?: string } | null>;
  cancelTechnologyRequest(): Promise<void>;
}

function loadNfc(): { manager: NfcModule; tech: unknown } | null {
  // Expo Go has no NfcManager native module, and react-native-nfc-manager 4
  // throws while loading without it. A require made outside module loading
  // (here, from an effect) reports that throw to LogBox as an uncaught error
  // even inside try/catch, so check for the module before requiring.
  if (!TurboModuleRegistry.get('NfcManager') && !NativeModules.NfcManager) return null;
  try {
    // Dynamic require: development builds only (see above).
    // oxlint-disable-next-line no-require-imports
    const mod = require('react-native-nfc-manager') as {
      default: NfcModule;
      NfcTech: { NfcA: unknown };
    };
    return { manager: mod.default, tech: mod.NfcTech.NfcA };
  } catch {
    return null;
  }
}

export async function isNfcAvailable(): Promise<boolean> {
  const nfc = loadNfc();
  if (!nfc) return false;
  try {
    if (!(await nfc.manager.isSupported())) return false;
    // Android reports supported hardware with the radio toggled off.
    return await nfc.manager.isEnabled();
  } catch {
    return false;
  }
}

/** Releases any pending technology request (e.g. leaving the scan screen mid-read). */
export async function cancelRead(): Promise<void> {
  const nfc = loadNfc();
  if (!nfc) return;
  await nfc.manager.cancelTechnologyRequest().catch(() => undefined);
}

/** Reads one tag and returns its UID as uppercase hex, or null on cancel/failure. */
export async function readTagUid(): Promise<string | null> {
  const nfc = loadNfc();
  if (!nfc) return null;
  try {
    await nfc.manager.start();
    await nfc.manager.requestTechnology(nfc.tech);
    const tag = await nfc.manager.getTag();
    return tag?.id ? tag.id.toUpperCase() : null;
  } catch {
    return null;
  } finally {
    await nfc.manager.cancelTechnologyRequest().catch(() => undefined);
  }
}
