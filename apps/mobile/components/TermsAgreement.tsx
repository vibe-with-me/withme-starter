import { StyleSheet, View } from 'react-native';
import { openDocument, PRIVACY_URL, TERMS_URL } from '../lib/legal';
import { space } from '../lib/tokens';
import { Button, Choice } from './ui';

/** What agreeing means. Mirrors web's TermsSummary (components/TermsAgreement.tsx). */
export const TERMS_SENTENCE =
  'the Terms of Use and Privacy Policy. Abusive behaviour and objectionable content aren’t tolerated: people can be reported, and accounts that break the terms are removed.';

/**
 * The fork's documents, as their own buttons: a link nested inside the
 * checkbox's label would be unreachable for a screen reader. Nothing when
 * the URLs are unset (go-live sets both).
 */
export function TermsLinks() {
  const docs = [
    { label: 'Terms of Use', url: TERMS_URL },
    { label: 'Privacy Policy', url: PRIVACY_URL },
  ].flatMap(({ label, url }) => (url ? [{ label, url }] : []));
  if (docs.length === 0) return null;
  return (
    <View style={styles.links}>
      {docs.map(({ label, url }) => (
        <Button
          key={label}
          inline
          kind="quiet"
          label={label}
          onPress={() => {
            openDocument(url).catch(() => undefined);
          }}
        />
      ))}
    </View>
  );
}

/** The sign-up checkbox and the documents it refers to. Creating a profile requires it. */
export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <>
      <Choice checked={checked} onPress={() => onChange(!checked)} label={`I agree to ${TERMS_SENTENCE}`} />
      <TermsLinks />
    </>
  );
}

const styles = StyleSheet.create({
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.s2,
  },
});
