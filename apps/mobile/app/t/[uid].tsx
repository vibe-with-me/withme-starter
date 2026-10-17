import type { GatheringSummary, ResolveOutput } from '@withme/contract';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { PushOffer } from '../../components/Push';
import { Avatar, Button, Card, Muted, Title } from '../../components/ui';
import { api } from '../../lib/api';
import { gatheringLine } from '../../lib/format-time';
import { gatheringHref } from '../../lib/gathering-link';
import { supabase } from '../../lib/supabase';
import { space, useTokens } from '../../lib/tokens';

/**
 * The resolver — a physical tap (deep link) or a scan lands here and a
 * person appears. Unknown and malformed UIDs land on a calm card, never a
 * crash.
 */
export default function ResolveScreen() {
  const t = useTokens();
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const [result, setResult] = useState<ResolveOutput | 'error' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const normalized = (uid ?? '').trim().toUpperCase();
    Promise.all([
      api.public.resolve({ uid: normalized }),
      // A scan is logged for real taps; failures never break the resolve.
      api.public
        .logScan({ uid: normalized, user_agent: `withme-mobile/${Platform.OS}` })
        .catch(() => undefined),
    ])
      .then(async ([resolved]) => {
        if (cancelled) return;
        if (resolved.status === 'unclaimed') {
          // claim/[uid] is auth-gated: a signed-out user routed there would
          // bounce to login WITHOUT the uid. Carry it through explicitly.
          const { data } = await supabase.auth.getSession();
          if (cancelled) return;
          if (data.session) {
            router.replace({ pathname: '/claim/[uid]', params: { uid: resolved.uid } });
          } else {
            router.replace({
              pathname: '/login',
              params: { redirect: `/claim/${resolved.uid}` },
            });
          }
          return;
        }
        setResult(resolved);
      })
      .catch(() => {
        if (!cancelled) setResult('error');
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (result === null) {
    // The card arrives before its contents: an empty shell the settle
    // fills. A blank screen on venue Wi-Fi reads as a broken tag.
    return (
      <View style={[styles.page, { backgroundColor: t.bg }]} accessibilityLabel="Loading">
        <Card>
          <View
            style={[styles.avatarShell, { backgroundColor: t.border }]}
            accessibilityElementsHidden
          />
        </Card>
      </View>
    );
  }

  if (result === 'error' || result.status === 'disabled') {
    return (
      <View style={[styles.page, { backgroundColor: t.bg }]}>
        <Card settle>
          <Title>{result === 'error' ? 'Nothing here' : 'This tag is inactive'}</Title>
          <Muted>
            {result === 'error'
              ? "This doesn't look like a live tag. Give it another tap in a moment."
              : "There's nothing connected to it right now."}
          </Muted>
          <Button label="Close" kind="quiet" onPress={() => router.replace('/')} />
        </Card>
      </View>
    );
  }

  // 'unclaimed' has already triggered the claim redirect; render nothing
  // for the in-between frame.
  if (result.status !== 'claimed') return null;

  // A gathering tag: the host's card is the invitation, the gathering is the
  // detail. `gathering` is non-null only alongside a gathering destination;
  // a deleted gathering (or one the owner left) degrades upstream.
  if (result.destination.type === 'gathering' && result.gathering) {
    return (
      <View style={[styles.page, { backgroundColor: t.bg }]}>
        <Card settle>
          <Avatar name={result.profile.display_name} path={result.profile.avatar_path} />
          <Title>{result.profile.display_name}</Title>
          {result.profile.bio ? <Muted>{result.profile.bio}</Muted> : null}
          <Muted>{gatheringLine(result.gathering)}</Muted>
          <GatheringInvite gathering={result.gathering} ownerId={result.profile.id} />
          <CardReport profileId={result.profile.id} name={result.profile.display_name} uid={result.uid} />
        </Card>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: t.bg }]}>
      <Card settle>
        <Avatar name={result.profile.display_name} path={result.profile.avatar_path} />
        <Title>{result.profile.display_name}</Title>
        {result.profile.bio ? <Muted>{result.profile.bio}</Muted> : null}
        <ConnectAction profileId={result.profile.id} uid={result.uid} />
        <CardReport profileId={result.profile.id} name={result.profile.display_name} uid={result.uid} />
      </Card>
    </View>
  );
}

/**
 * gathering/[id] sits behind Stack.Protected: a signed-out push would bounce
 * to the anchor and lose the id, so the signed-out path carries the id and
 * the display hints through login. The tag's owner and other members have
 * nothing to join and get "Open gathering" in the default style. Until we
 * know which, no button: guessing "Join" would flash the accent at a member.
 */
function GatheringInvite({ gathering, ownerId }: { gathering: GatheringSummary; ownerId: string }) {
  const [viewer, setViewer] = useState<'loading' | 'anon' | 'member' | 'other'>('loading');

  useEffect(() => {
    let cancelled = false;
    // A new tag or gathering: the previous verdict does not carry over.
    setViewer('loading');
    (async (): Promise<'anon' | 'member' | 'other'> => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return 'anon';
      // The tag's owner: a member by construction, not necessarily the host.
      if (userId === ownerId) return 'member';
      // Already in it? The member list is the viewer's view, so their own
      // row is in it iff they joined. A hidden gathering (NOT_FOUND) reads
      // as not a member: the detail then says it isn't available.
      return api.app.gatherings.get({ id: gathering.id }).then(
        ({ members }) => (members.some((m) => m.profile.id === userId) ? 'member' : 'other'),
        () => 'other' as const,
      );
    })()
      // A failed session read falls back to the safe default, never a stuck card.
      .catch(() => 'other' as const)
      .then((next) => {
        if (!cancelled) setViewer(next);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId, gathering.id]);

  if (viewer === 'loading') return null;
  const isMember = viewer === 'member';
  return (
    <Button
      kind={isMember ? 'default' : 'connect'}
      label={isMember ? 'Open gathering' : 'Join this gathering'}
      onPress={async () => {
        // Decided at tap time, not from the mount verdict: a session read that
        // failed then fell back to 'other', and a signed-out push to the
        // protected detail would bounce and lose the id.
        const { data } = await supabase.auth
          .getSession()
          .catch(() => ({ data: { session: null } }));
        if (!data.session) {
          router.push({
            pathname: '/login',
            params: { redirect: gatheringHref(gathering.id, gathering) },
          });
          return;
        }
        router.push({
          pathname: '/gathering/[id]',
          params: { id: gathering.id, title: gathering.title, starts_at: gathering.starts_at },
        });
      }}
    />
  );
}

/**
 * Report this person (Guideline 1.2): anyone but the owner. Signed out, it
 * goes through login and back to this card. Nothing until the session read
 * settles, so the owner never sees it flash.
 */
function CardReport({ profileId, name, uid }: { profileId: string; name: string; uid: string }) {
  const [viewer, setViewer] = useState<'loading' | 'anon' | 'self' | 'other'>('loading');
  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const userId = data.session?.user.id;
        setViewer(!userId ? 'anon' : userId === profileId ? 'self' : 'other');
      })
      .catch(() => {
        if (!cancelled) setViewer('anon');
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);
  if (viewer === 'loading' || viewer === 'self') return null;
  return (
    <Button
      kind="quiet"
      label="Report"
      onPress={() => {
        if (viewer === 'anon') {
          router.push({ pathname: '/login', params: { redirect: `/t/${uid}` } });
          return;
        }
        router.push({ pathname: '/report/[id]', params: { id: profileId, name } });
      }}
    />
  );
}

function ConnectAction({ profileId, uid }: { profileId: string; uid: string }) {
  const [viewer, setViewer] = useState<'loading' | 'anon' | 'self' | 'other'>('loading');
  const [send, setSend] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (cancelled) return;
        const userId = data.session?.user.id;
        if (!userId) setViewer('anon');
        else if (userId === profileId) setViewer('self');
        else setViewer('other');
      })
      // A failed session read must not leave the card without its action:
      // fall back to the signed-out path, which goes through login.
      .catch(() => {
        if (!cancelled) setViewer('anon');
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  // Nothing until the session read settles: the owner must never see Connect first.
  if (viewer === 'loading') return null;

  if (viewer === 'self') {
    return (
      <>
        <Muted>This is your tag.</Muted>
        {/* Pop back to the tabs (or push them if this was a cold deep link). */}
        <Button label="Edit profile" onPress={() => router.dismissTo('/profile')} />
      </>
    );
  }

  if (send === 'sent') {
    return (
      <>
        <Muted>Request sent. They'll see it when they check in.</Muted>
        {/* The first request is the moment a notification explains itself. */}
        <PushOffer bare />
      </>
    );
  }

  return (
    <Button
      kind="connect"
      disabled={send === 'sending'}
      label={send === 'sending' ? 'Connecting…' : send === 'failed' ? 'Try again' : 'Connect'}
      onPress={async () => {
        if (viewer === 'anon') {
          router.push({ pathname: '/login', params: { redirect: `/t/${uid}` } });
          return;
        }
        // ref guard: two taps in one frame both pass the disabled check
        if (inFlight.current) return;
        inFlight.current = true;
        setSend('sending');
        try {
          // Consent is mutual: your card must exist before you can ask.
          const { profile } = await api.app.profile.get();
          if (!profile) {
            setSend('idle'); // this screen stays mounted under the push
            router.push({ pathname: '/profile', params: { redirect: `/t/${uid}` } });
            return;
          }
          await api.app.requests.send({ recipient_id: profileId });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setSend('sent');
        } catch {
          setSend('failed');
        } finally {
          inFlight.current = false;
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    justifyContent: 'center',
    padding: space.s5,
  },
  avatarShell: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
});
