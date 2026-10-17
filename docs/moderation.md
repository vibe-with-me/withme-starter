# Reports and moderation

A fork that ships to the App Store or Google Play must let people report
abusive users, and must act on those reports. The starter builds the
reporting half; this page is the operator's half: where reports land, how
you find out, what you do, and the promise you are making.

## What the store rules ask for

Apple's [Guideline 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content)
says an app with user-generated content must include:

> - A method for filtering objectionable material from being posted to the app
> - A mechanism to report offensive content and timely responses to concerns
> - The ability to block abusive users from the service
> - Published contact information so users can easily reach you

App Review's rejection notes for 1.2 add two requirements that are not in
the guideline text: users must agree to terms (an EULA) saying there is no
tolerance for objectionable content or abusive users, and the developer
must act on reports within 24 hours by removing the content and ejecting
the user who posted it.

Google Play's [user-generated content policy](https://support.google.com/googleplay/android-developer/answer/9876937)
requires that the app make users accept its terms of use before they create
or upload content, define objectionable content and behaviour in those terms
and prohibit it, provide in-app reporting and blocking of objectionable
content and users, and take action against content or users where
appropriate.

| Requirement | Where the starter meets it |
| --- | --- |
| Terms users agree to, saying abuse is not tolerated | Sign-up checkbox and the re-ask screen; placeholder text in [terms-template.md](terms-template.md) |
| Report a person | **Report** on every card (resolver, connections, requests, blocked list), web and mobile |
| Block a person | **Block** on connections; **Also block** in the report step |
| Act within 24 hours | You. This page |
| Published contact information | The terms and privacy pages (`[contact email]`), and your App Store and Play listings' support URL |
| A filter for objectionable material | Not shipped. See [Adding a filter](#adding-a-filter) |
| Account deletion | Profile → Account |

## Where reports land

`public.reports`, in your Supabase project. Only the service role can read
it: the person who reported cannot read it back, the person reported never
learns of it, and nothing about it is public
([the safety model](safety-model.md#reports-are-private)). Each row has the
reason, what the reporter wrote, and a snapshot of the reported card as it
was when they reported it (`snapshot`: name, bio, photo path), so an edit
afterwards does not erase what was reported.

## How you find out

The starter sends no notifications: a mail or chat integration is a
service, and the starter adds none. You check. Pick one person who owns
this, and make it part of their day:

- **Studio:** Table Editor → `reports`, filtered to `status = open`.
- **SQL:** save this in the SQL Editor as "Open reports" and run it:

```sql
-- Open reports, oldest first, with how many open reports each person has.
select r.created_at,
       r.reason,
       r.details,
       r.snapshot ->> 'display_name' as reported_name,
       r.reported_id,
       count(*) over (partition by r.reported_id) as open_reports_about_them,
       r.id
  from public.reports r
 where r.status = 'open'
 order by r.created_at;
```

Run it at least once a day, every day the app is live. That is what makes
the 24-hour promise true. If one daily check is not enough for your
traffic, or nobody can promise it, add a notification before launch: a
Supabase Database Webhook on `reports` inserts calling a Worker that mails
you (Cloudflare Email Routing can send to your own verified address at no
cost) is the shortest path. Keep names and report text out of the
notification itself; send the report id and read the row in Studio.

The API also logs `report filed` (no ids, no names) in the API Worker's
logs, which tells you reports are arriving but not what they say.

## What you do with one

1. **Read it.** The snapshot is what they saw. Check the person's current
   card too (`select * from public.profiles where id = '<reported_id>'`).
2. **Decide.** Does it break section 3 of your terms?
3. **Act.**
   - *Content only* (a name, bio or photo): edit it out in Studio, or ask
     them to. For a photo, delete the file in Storage → avatars and set
     `profiles.avatar_path` to null.
   - *The account*: delete the user in Authentication → Users. Deleting
     the auth user cascades exactly as the person's own deletion does
     (profile, connections, gatherings, photos' pointer, tags released).
     Remove their photo files from Storage → avatars → `<their id>/`
     first, since the cascade does not reach Storage. Reports about them
     go with the account, so record what you did before you delete.
   - *Nothing breaks the rules*: dismiss it.
4. **Record it.** Mark the report with what you did:

```sql
update public.reports
   set status = 'actioned',            -- or 'dismissed'
       resolution_note = 'Removed the account: threats in bio.',
       resolved_at = now()
 where id = '<report id>';
```

Child safety reports (`reason = 'child_safety'`) come first. Depending on
where you operate, you may be legally required to report child sexual abuse
material to the authorities (in the US, to NCMEC) and to preserve evidence
before you delete anything. Find out what applies to you before launch.

## The promise forks make

Your terms say you review every report within 24 hours (section 5 of
[terms-template.md](terms-template.md)), and Apple expects it. Before
launch, write down who checks, when, and who covers for them; `go-live`
section 5 asks for the name. If you cannot keep 24 hours, do not launch a
store app until you can.

## Adding a filter

Guideline 1.2 also asks for "a method for filtering objectionable material
from being posted". The starter ships none: the good ones are paid services,
and the starter adds nothing that bills. Its text is plain (no links in
names or bios, control and invisible characters refused), which narrows
what can be posted, but it is not a filter. Two places to add one:

- **Text** (names, bios, gathering titles, links): a refine on the
  contract schemas in `packages/contract/src/schemas/` (`DisplayNameSchema`,
  `BioSchema`, the gathering title), so web, mobile and the API refuse it
  alike, mirrored in the database CHECKs that already call
  `private.is_plain_text`. A word list catches the worst; a moderation API
  catches more.
- **Photos**: `uploadAvatar` in `apps/api/src/routers/app.ts`, after the
  bytes are sniffed and before they are stored. Call an image moderation
  service there and refuse with `BAD_REQUEST`; the photo never reaches
  Storage. Most of these services bill per image: get the owner's OK.

Either way, keep the reports flow: a filter misses things, and reports
are how you find out.
