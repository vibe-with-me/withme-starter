import type { GatheringVisibility } from '@withme/contract';
import { StyleSheet, Text, View } from 'react-native';
import { SPOTS_HELP, VISIBILITY_CHOICES } from '../lib/going';
import { fonts, useTokens } from '../lib/tokens';
import { Choice, Field, Muted } from './ui';

/**
 * The host's two controls, shared by the create and edit forms: who can see
 * the gathering, and how many spots it has (mirrors web's
 * GatheringControls). The database enforces both; this only asks.
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
  const t = useTokens();
  return (
    <>
      <View accessibilityRole="radiogroup" accessibilityLabel="Who can see it" style={styles.group}>
        <Text style={[styles.legend, { color: t.ink }]}>Who can see it</Text>
        {VISIBILITY_CHOICES.map((choice) => (
          <Choice
            key={choice.value}
            kind="radio"
            checked={visibility === choice.value}
            onPress={() => onVisibility(choice.value)}
            accessibilityLabel={`${choice.label}. ${choice.help}`}
            label={
              <>
                {choice.label}
                {'\n'}
                <Text style={{ color: t.inkMuted }}>{choice.help}</Text>
              </>
            }
          />
        ))}
        {editing ? <Muted>Anyone already going stays, whichever you pick.</Muted> : null}
      </View>
      <Field
        label="Spots (optional)"
        value={spots}
        onChangeText={onSpots}
        // Not number-pad: it has no return key, so the keyboard could not close.
        keyboardType="numbers-and-punctuation"
        maxLength={3}
        placeholder="No limit"
        accessibilityHint={SPOTS_HELP}
      />
      <Muted>
        {SPOTS_HELP}
        {editing ? ' Lowering it keeps everyone already going.' : ''}
      </Muted>
    </>
  );
}

const styles = StyleSheet.create({
  group: { width: '100%' },
  legend: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
});
