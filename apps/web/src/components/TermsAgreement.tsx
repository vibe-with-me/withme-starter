import { PRIVACY_URL, TERMS_URL } from '../lib/legal.ts';

function DocLink({ href, children }: { href: string | null; children: string }) {
  if (!href) return <>{children}</>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/**
 * What agreeing means, with links to the fork's documents. Used by the
 * sign-up checkbox and by the re-ask screen after TERMS_VERSION changes.
 */
export function TermsSummary() {
  return (
    <>
      the <DocLink href={TERMS_URL}>Terms of Use</DocLink> and{' '}
      <DocLink href={PRIVACY_URL}>Privacy Policy</DocLink>. Abusive behaviour and objectionable
      content aren’t tolerated: people can be reported, and accounts that break the terms are removed.
    </>
  );
}

/** The sign-up checkbox. Creating a profile requires it. */
export function TermsCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="choice">
      <input type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        I agree to <TermsSummary />
      </span>
    </label>
  );
}
