import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { normalizePhone, OTP_CODE_LENGTH } from '@withme/contract';
import { useState } from 'react';
import { safeReturnTo } from '../lib/auth-guard.ts';
import { getSupabase } from '../lib/supabase.ts';

export const Route = createFileRoute('/login')({
  ssr: false,
  head: () => ({ meta: [{ title: 'Sign in — withme' }] }),
  validateSearch: (search): { returnTo?: string } => {
    const returnTo = safeReturnTo(search.returnTo);
    return returnTo ? { returnTo } : {};
  },
  component: LoginPage,
});

function LoginPage() {
  const { returnTo } = Route.useSearch();
  const navigate = useNavigate();
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = returnTo ?? '/gatherings';
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const auth = getSupabase().auth;
    const { data, error: authError } =
      mode === 'signin'
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({
            email,
            password,
            options: {
              // The confirmation link must lead back to where the tap left
              // off — same contract as the OAuth path.
              emailRedirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(destination)}`,
            },
          });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    // Signup with email confirmations enabled returns no session yet.
    if (mode === 'signup' && !data.session) {
      setAwaitingConfirmation(true);
      return;
    }
    navigate({ href: destination });
  }

  async function google() {
    setError(null);
    const { error: authError } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(destination)}`,
      },
    });
    if (authError) setError(authError.message);
  }

  if (awaitingConfirmation) {
    return (
      <main className="page">
        <div className="card">
          <h1>Check your email</h1>
          <p className="bio" role="status">
            We sent a confirmation link to {email}. Come back here after clicking it.
          </p>
        </div>
      </main>
    );
  }

  // The tapper arrives here mid-handshake; keep the thread visible. The
  // create page shares the detail's prefix but is nobody's invitation.
  const context = returnTo?.startsWith('/t/')
    ? 'to connect with the person whose tag you tapped'
    : returnTo?.startsWith('/gatherings/') && returnTo !== '/gatherings/new'
      ? 'to join the gathering you were invited to'
      : null;

  if (method === 'phone') {
    return (
      <PhoneSignIn
        context={context}
        onSignedIn={() => navigate({ href: destination })}
        onUseEmail={() => setMethod('email')}
      />
    );
  }

  return (
    <main className="page">
      <form className="card" onSubmit={submit}>
        <p className="hint">withme</p>
        <h1>{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
        {context ? <p className="bio">{context}</p> : null}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            // supabase/config.toml's minimum_password_length; sign-in leaves it to the server.
            minLength={mode === 'signup' ? 10 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
        <button className="btn" type="button" onClick={google}>
          Continue with Google
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setError(null);
            setMethod('phone');
          }}
        >
          Use phone instead
        </button>
        <button
          className="btn btn--quiet"
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}

/**
 * Passwordless: a number, then the code texted to it. Supabase creates the
 * account on first verify, so there is no separate sign-up here.
 */
function PhoneSignIn({
  context,
  onSignedIn,
  onUseEmail,
}: {
  context: string | null;
  onSignedIn: () => void;
  onUseEmail: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    const e164 = normalizePhone(phone);
    if (!e164) {
      setError('Include your country code, like +1 555 555 0100.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: authError } = await getSupabase().auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setCode('');
    setSentTo(e164);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const { error: authError } = await getSupabase().auth.verifyOtp({
      phone: sentTo,
      token: code,
      type: 'sms',
    });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    onSignedIn();
  }

  const errorText = error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null;

  if (sentTo) {
    return (
      <main className="page">
        <form className="card" onSubmit={verify}>
          <p className="hint">withme</p>
          <h1>Enter your code</h1>
          <p className="bio" role="status">
            We texted a {OTP_CODE_LENGTH}-digit code to {sentTo}.
          </p>
          <div className="field">
            <label htmlFor="code">Code</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern={`\\d{${OTP_CODE_LENGTH}}`}
              maxLength={OTP_CODE_LENGTH}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {errorText}
          <button className="btn" type="submit" disabled={busy || code.length !== OTP_CODE_LENGTH}>
            {busy ? 'One moment…' : 'Sign in'}
          </button>
          <button
            className="btn btn--quiet"
            type="button"
            disabled={busy}
            onClick={() => sendCode()}
          >
            Send a new code
          </button>
          <button
            className="btn btn--quiet"
            type="button"
            onClick={() => {
              setError(null);
              setSentTo(null);
            }}
          >
            Use a different number
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="page">
      <form className="card" onSubmit={sendCode}>
        <p className="hint">withme</p>
        <h1>Sign in with phone</h1>
        {context ? <p className="bio">{context}</p> : null}
        <div className="field">
          <label htmlFor="phone">Phone number</label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+1 555 555 0100"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {errorText}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'One moment…' : 'Text me a code'}
        </button>
        <button className="btn btn--quiet" type="button" onClick={onUseEmail}>
          Use email instead
        </button>
      </form>
    </main>
  );
}
