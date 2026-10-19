# Terms of use and privacy policy: placeholder text

> **PLACEHOLDER. Replace before launch.** This is starting text for a fork,
> not legal advice and not anyone's real terms. Every `[bracket]` must be
> filled in, every section read against what your app actually does, and
> the result reviewed by someone qualified for the places your users live.
> The upstream starter publishes no terms of its own: it runs no app.

Your app links to two documents: sign-up asks people to agree to them, and
the app asks again whenever you change `TERMS_VERSION` in
`packages/contract/src/schemas/terms.ts`. Publish each one at a stable
https URL (your marketing site, a hosted page, a public doc), then set the
URLs (`make-it-yours` step 7b, `go-live`):

- `VITE_TERMS_URL` / `EXPO_PUBLIC_TERMS_URL`: the terms of use below.
- `VITE_PRIVACY_URL` / `EXPO_PUBLIC_PRIVACY_URL`: the privacy policy below.

App Store Review Guideline 1.2 and Google Play's user-generated content
policy both require the terms to say that objectionable content and
abusive users are not tolerated, and both expect you to act on reports.
Keep section 3 and section 5 of the terms in substance, whatever else you
change. `docs/moderation.md` is how the starter's reports reach you.

---

## Terms of Use

*Last updated: [date]. Version: [the value of TERMS_VERSION].*

### 1. Who we are

[App name] ("we", "us") is run by [legal name of the person or company],
[address]. You can reach us at [contact email], which is also where
reports and questions about these terms go.

### 2. Who can use [App name]

You must be at least [13 / 16 / 18, whichever your market and stores
require] to create an account. You are responsible for what happens under
your account, and for keeping your sign-in to yourself.

### 3. No tolerance for objectionable content or abusive behaviour

[App name] is for meeting people in person and keeping in touch. You agree
not to post, share, or send, in your name, photo, bio, links, gathering
titles, or anywhere else in the app, anything that:

- harasses, bullies, threatens, or intimidates anyone;
- attacks people for who they are (hate speech, slurs, hateful symbols);
- is sexually explicit, or sexualises anyone under 18 in any way;
- promotes violence, self-harm, or illegal activity;
- impersonates another person or organisation;
- is spam, a scam, or misleading;
- infringes someone else's rights, including their privacy or copyright.

There is no tolerance for this content or for people who post it. We remove
it, and we remove accounts that break these rules, without notice where we
judge that necessary.

### 4. Blocking and reporting

You can block anyone, from their card or your connections. A blocked person
can no longer see your card, connect with you, or join your gatherings, and
is not told. You can report anyone from their card or from your lists; you
can block them in the same step. Reports go to us only: the person you
report is never told who reported them, or that anyone did.

### 5. What we do with reports

We review every report within 24 hours. When content or behaviour breaks
section 3, we remove the content and remove the account that posted it. We
may also keep a record of the report and what we did, as section 3 of the
privacy policy describes. [If your app has a different or faster process,
say so here, and make sure it is one you can keep.]

### 6. Your content

You keep ownership of what you add (your name, photo, bio, links,
gatherings). You give us permission to store it and to show it to the
people the app shows it to (people who tap your tag or scan your code, your connections),
only to run [App name].

### 7. Tags

[If you sell or hand out NFC tags: who owns a tag, what happens to a lost
tag, and that a tag you turn off shows nothing.]

### 8. Deleting your account

You can delete your account at any time from Profile → Account. Your
profile, connections, requests, blocks, gatherings, photos, and tag
history are deleted, and your tags are released.

### 9. Changes to these terms

We may update these terms. When we do, the app asks you to agree to the new
version before you continue. If you do not agree, you can delete your
account.

### 10. Disclaimers and liability

[Your jurisdiction's standard disclaimer and limitation of liability.
Have a lawyer write this section.]

### 11. Governing law

[The law and courts that govern these terms.]

### 12. Contact

[Contact email]. [Postal address.]

---

## Privacy Policy

*Last updated: [date].*

### 1. What we collect

- **Your account:** your email address or phone number, used to sign you in.
- **Your profile:** your name, and if you add them, your photo, bio, and links.
- **Your relationships:** who you connected with, requests you sent or
  received, who you blocked, and the gatherings you host or join.
- **Your tags:** which tags you claimed and where they point. When someone
  taps your tag or scans your code we record the time, the browser or app
  it came from (the user-agent string), and whether it was a tap or a scan.
  Nothing else: not their location, not their IP address.
- **Reports:** when you report someone, the reason, anything you write, and
  what their card said at that moment.

We do not use analytics, advertising, or tracking services. [If your fork
adds any, list them here.]

### 2. Who sees what

- Anyone who taps your tag or scans your code sees your card: name, photo, bio.
- Your connections also see your links.
- Nobody can browse or search for people.
- Reports are seen only by us.

### 3. How long we keep it

Until you delete your account. Deleting it deletes your profile, photos,
connections, requests, blocks, gatherings, and tag history, at once.

Two exceptions, both for keeping people safe (our legitimate interest in
acting on abuse):

- Reports **about** you are kept for 90 days after you delete your account,
  without the link to your account but with what your card said when you
  were reported, then deleted at our next daily check. This stops someone erasing reports against
  them by deleting their account, and lets us recognise them if they
  return.
- Reports you **filed** are kept without your name or account attached, so
  a report about someone abusive still counts after you leave.

### 4. Who processes it for us

[App name] runs on Supabase (database, sign-in, photo storage) and
Cloudflare (the app's servers). [Your email or SMS provider, if you set one
up for sign-in.] [The chat service that receives report notifications, if
you set one up: it receives a report's id only, never names or content.]
[Add any other provider.]

### 5. Your rights

You can see and change your profile in the app, and delete your account at
any time. [Rights under the laws that apply to your users, such as GDPR or
CCPA, and how to exercise them.]

### 6. Children

[App name] is not for children under [the age in the terms, section 2]. If
you believe a child has an account, report it from their card or write to
[contact email].

### 7. Contact

[Contact email]. [Postal address.]
