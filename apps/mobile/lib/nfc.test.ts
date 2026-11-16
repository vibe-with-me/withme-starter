import { beforeEach, describe, expect, mock, test } from 'bun:test';

// nfc.ts against a stand-in for react-native-nfc-manager, shaped like its
// Android side: getNdefStatus answers NotSupported for any failed query (the
// library catches the exception), and getTag carries the chip's tech list.
const NDEF = 'android.nfc.tech.Ndef';
const NFC_A = 'android.nfc.tech.NfcA';
const ULTRALIGHT = 'android.nfc.tech.MifareUltralight';
const NdefStatus = { NotSupported: 1, ReadWrite: 2, ReadOnly: 3 };
const CHIP_ID = '04a1b2c3d4e5f6';

let tag: { id?: string; techTypes?: string[] } | null;
let ndefStatus: { status: number; capacity: number };
let calls: string[];

const manager = {
  isSupported: async () => true,
  isEnabled: async () => true,
  start: async () => {},
  requestTechnology: async () => null,
  getTag: async () => tag,
  cancelTechnologyRequest: async () => {},
  ndefHandler: {
    getNdefStatus: async () => ndefStatus,
    getNdefMessage: async () => {
      calls.push('read');
      return { ndefMessage: [] };
    },
    writeNdefMessage: async () => {
      calls.push('write');
    },
    makeReadOnly: async () => {
      calls.push('lock');
      return true;
    },
  },
};

// Module mocks are process-wide in bun, and terms-gate.test.ts mocks
// react-native too, so each stand-in carries the names the other needs.
mock.module('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  NativeModules: { NfcManager: {} },
  TurboModuleRegistry: { get: () => null },
}));
mock.module('react-native-nfc-manager', () => ({
  default: manager,
  NfcTech: { Ndef: 'Ndef', NfcA: 'NfcA' },
  NdefStatus,
  NfcError: { ZeroLengthMessage: class extends Error {} },
  Ndef: { uriRecord: (url: string) => url, encodeMessage: () => [0xd1, 0x01] },
}));

const { readTag, writeTag } = await import('./nfc');

beforeEach(() => {
  calls = [];
  tag = { id: CHIP_ID, techTypes: [NFC_A, ULTRALIGHT, NDEF] };
  ndefStatus = { status: NdefStatus.ReadWrite, capacity: 137 };
});

const write = () =>
  writeTag({ origin: 'https://tags.example.com', uid: null, mint: async () => '04A3B2C1D05E80' });

describe('readTag', () => {
  test('a stale-tag NotSupported on a chip with Ndef is a failed read, not its chip UID', async () => {
    ndefStatus = { status: NdefStatus.NotSupported, capacity: 0 };
    expect(await readTag()).toBeNull();
    expect(calls).toEqual([]);
  });

  test('a chip with no Ndef in its tech list still falls back to its chip UID', async () => {
    ndefStatus = { status: NdefStatus.NotSupported, capacity: 0 };
    tag = { id: CHIP_ID, techTypes: [NFC_A] };
    expect(await readTag()).toEqual({ kind: 'uid', uid: CHIP_ID.toUpperCase() });
  });

  test('NotSupported with no tech list (iOS) is trusted', async () => {
    ndefStatus = { status: NdefStatus.NotSupported, capacity: 0 };
    tag = { id: CHIP_ID };
    expect(await readTag()).toEqual({ kind: 'uid', uid: CHIP_ID.toUpperCase() });
  });

  test('a readable blank Ndef chip reads its records', async () => {
    expect(await readTag()).toEqual({ kind: 'uid', uid: CHIP_ID.toUpperCase() });
    expect(calls).toEqual(['read']);
  });
});

describe('writeTag', () => {
  test('a stale-tag NotSupported on a chip with Ndef is a lost hold, not a refusal', async () => {
    ndefStatus = { status: NdefStatus.NotSupported, capacity: 0 };
    expect(await write()).toEqual({ kind: 'lost' });
    expect(calls).toEqual([]);
  });

  test('a chip with no Ndef is refused as unsupported', async () => {
    ndefStatus = { status: NdefStatus.NotSupported, capacity: 0 };
    tag = { id: CHIP_ID, techTypes: [NFC_A] };
    expect(await write()).toEqual({ kind: 'refused', reason: 'unsupported' });
    expect(calls).toEqual([]);
  });
});
