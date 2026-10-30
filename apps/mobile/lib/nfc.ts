/**
 * Feature-gated NFC: react-native-nfc-manager is a native module, so it only
 * exists in development builds — in Expo Go these functions report
 * unavailable and the UI hides the scan and write affordances. Deep links and
 * manual UID entry work everywhere.
 */
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import {
  tagFromHold,
  writeSticker,
  type HeldTag,
  type NdefRecordLike,
  type StickerSession,
  type StickerStatus,
  type WriteResult,
} from './tag-writer';
import { webUrl } from './web-url';

interface NfcModule {
  isSupported(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
  start(): Promise<void>;
  requestTechnology(tech: unknown, options?: { alertMessage?: string }): Promise<unknown>;
  getTag(): Promise<{ id?: string; ndefMessage?: NdefRecordLike[] } | null>;
  cancelTechnologyRequest(): Promise<void>;
  ndefHandler: {
    getNdefStatus(): Promise<{ status: number; capacity: number }>;
    getNdefMessage(): Promise<{ ndefMessage?: NdefRecordLike[] } | null>;
    writeNdefMessage(bytes: number[]): Promise<void>;
    makeReadOnly(): Promise<unknown>;
  };
}

interface NfcLibrary {
  manager: NfcModule;
  /** Every NTAG offers NfcA, and on iOS it opens the tag session the TAG entitlement covers. */
  readTech: unknown;
  /**
   * iOS writes in that same session: NfcTech.Ndef there would need the NDEF
   * entitlement. Android's lock call needs an Ndef session, and NfcA after it
   * connects a chip with no NDEF, so it is refused instead of never answering.
   */
  writeTech: unknown;
  encodeUrl(url: string): number[];
  statusOf: { readWrite: number; readOnly: number };
}

function loadNfc(): NfcLibrary | null {
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
      NfcTech: { NfcA: unknown; Ndef: unknown };
      NdefStatus: { ReadWrite: number; ReadOnly: number };
      Ndef: {
        uriRecord(url: string): unknown;
        encodeMessage(records: unknown[]): number[];
      };
    };
    return {
      manager: mod.default,
      readTech: mod.NfcTech.NfcA,
      writeTech:
        Platform.OS === 'ios' ? mod.NfcTech.NfcA : [mod.NfcTech.Ndef, mod.NfcTech.NfcA],
      encodeUrl: (url) => mod.Ndef.encodeMessage([mod.Ndef.uriRecord(url)]),
      statusOf: { readWrite: mod.NdefStatus.ReadWrite, readOnly: mod.NdefStatus.ReadOnly },
    };
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

/** Reads one tag and says which it is, or null on cancel/failure. */
export async function readTag(): Promise<HeldTag | null> {
  const nfc = loadNfc();
  if (!nfc) return null;
  try {
    await nfc.manager.start();
    await nfc.manager.requestTechnology(nfc.readTech);
    const tag = await nfc.manager.getTag();
    return tag ? tagFromHold({ records: tag.ndefMessage, chipId: tag.id, origin: webUrl }) : null;
  } catch {
    return null;
  } finally {
    await nfc.manager.cancelTechnologyRequest().catch(() => undefined);
  }
}

function stickerSession(nfc: NfcLibrary): StickerSession {
  const { manager, statusOf } = nfc;
  return {
    async status(): Promise<StickerStatus> {
      const { status, capacity } = await manager.ndefHandler.getNdefStatus();
      if (status === statusOf.readWrite) return { state: 'writable', capacity };
      if (status === statusOf.readOnly) return { state: 'locked', capacity };
      return { state: 'unsupported', capacity: 0 };
    },
    // getTag, not getNdefMessage: on iOS reading a blank chip through that one
    // is an error, and blank is the case that matters most here.
    read: async () => (await manager.getTag())?.ndefMessage,
    urlBytes: (url) => nfc.encodeUrl(url).length,
    write: (url) => manager.ndefHandler.writeNdefMessage(nfc.encodeUrl(url)),
    readBack: async () => (await manager.ndefHandler.getNdefMessage())?.ndefMessage,
    lock: async () => {
      await manager.ndefHandler.makeReadOnly();
    },
  };
}

/** Writes one held sticker (tag-writer.ts decides what to do); null on cancel. */
export async function writeTag({
  origin,
  uid,
  mint,
}: {
  origin: string;
  uid: string | null;
  mint: () => Promise<string>;
}): Promise<WriteResult | null> {
  const nfc = loadNfc();
  if (!nfc) return null;
  try {
    await nfc.manager.start();
    await nfc.manager.requestTechnology(nfc.writeTech, {
      alertMessage: 'Hold your sticker against the phone.',
    });
  } catch {
    // The person closed the sheet, or left the screen.
    await nfc.manager.cancelTechnologyRequest().catch(() => undefined);
    return null;
  }
  try {
    return await writeSticker({ session: stickerSession(nfc), origin, uid, mint });
  } finally {
    await nfc.manager.cancelTechnologyRequest().catch(() => undefined);
  }
}
