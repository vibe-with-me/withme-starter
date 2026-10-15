import { normalizePhone, OTP_CODE_LENGTH } from '@withme/contract';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, Card, ErrorText, Field, Muted, Title } from '../components/ui';
import { safeRedirect } from '../lib/safe-redirect';
import { supabase } from '../lib/supabase';
import { space, useTokens } from '../lib/tokens';

export default function LoginScreen() {
  const t = useTokens();
  const params = useLocalSearchParams<{ redirect?: string }>();
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    const { data, error: authError } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    if (mode === 'signup' && !data.session) {
      setAwaitingConfirmation(true);
      return;
    }
    router.replace(safeRedirect(params.redirect) ?? '/gatherings');
  }

  const context = params.redirect?.startsWith('/gathering/') ? (
    <Muted>to join the gathering you were invited to</Muted>
  ) : params.redirect?.startsWith('/t/') || params.redirect?.startsWith('/claim/') ? (
    <Muted>to connect over the tag you just tapped</Muted>
  ) : null;

  if (awaitingConfirmation) {
    return (
      <View style={[styles.page, { backgroundColor: t.bg }]}>
        <Card>
          <Title>Check your email</Title>
          <Muted>We sent a confirmation link to {email}. Come back after clicking it.</Muted>
        </Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.page, { backgroundColor: t.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {method === 'phone' ? (
        <PhoneSignIn
          context={context}
          onSignedIn={() => router.replace(safeRedirect(params.redirect) ?? '/gatherings')}
          onUseEmail={() => setMethod('email')}
        />
      ) : (
        <Card>
          <Title>{mode === 'signin' ? 'Sign in' : 'Create account'}</Title>
          {context}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
          {error ? <ErrorText>{error}</ErrorText> : null}
          <Button
            label={busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
            onPress={submit}
            // supabase/config.toml's minimum_password_length; sign-in leaves it to the server.
            disabled={busy || !email || password.length < (mode === 'signup' ? 10 : 1)}
          />
          <Button
            label={mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
            kind="quiet"
            onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          />
          <Button
            label="Use phone instead"
            onPress={() => {
              setError(null);
              setMethod('phone');
            }}
          />
        </Card>
      )}
    </KeyboardAvoidingView>
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
  context: ReactNode;
  onSignedIn: () => void;
  onUseEmail: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const e164 = normalizePhone(phone);
    if (!e164) {
      setError('Include your country code, like +1 555 555 0100.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setCode('');
    setSentTo(e164);
  }

  async function verify() {
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.verifyOtp({
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

  if (sentTo) {
    return (
      <Card>
        <Title>Enter your code</Title>
        <Muted>
          We texted a {OTP_CODE_LENGTH}-digit code to {sentTo}.
        </Muted>
        <Field
          label="Code"
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={OTP_CODE_LENGTH}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
        <Button
          label={busy ? 'One moment…' : 'Sign in'}
          onPress={verify}
          disabled={busy || code.length !== OTP_CODE_LENGTH}
        />
        <Button label="Send a new code" kind="quiet" onPress={sendCode} disabled={busy} />
        <Button
          label="Use a different number"
          kind="quiet"
          onPress={() => {
            setError(null);
            setSentTo(null);
          }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <Title>Sign in with phone</Title>
      {context}
      <Field
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        placeholder="+1 555 555 0100"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
      />
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Button
        label={busy ? 'One moment…' : 'Text me a code'}
        onPress={sendCode}
        disabled={busy || !phone}
      />
      <Button label="Use email instead" kind="quiet" onPress={onUseEmail} />
    </Card>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    padding: space.s5,
  },
});
