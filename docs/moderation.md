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
| Report a gathering | **Report** on every gathering you don't host, web and mobile. Filed against the host, with the gathering kept |
| Block a person | **Block** on connections; **Block host** on a gathering; **Also block** in the report step |
| Act within 24 hours | You: a webhook tells you, a daily check backs it up. This page |
| Published contact information | The terms and privacy pages (`[contact email]`), and your App Store and Play listings' support URL |
| A filter for objectionable material | Not shipped. See [Adding a filter](#adding-a-filter) |
| Account deletion | Profile → Account |

## Where reports land

`public.reports`, in your Supabase project. Only the service role and your
operators can read it (operators through `/admin`, see
[Your first operator](#your-first-operator)): the person who reported
cannot read it back, the person reported never learns of it, and nothing
about it is public
([the safety model](safety-model.md#reports-are-private)). Each row has the
reason, what the reporter wrote, and a snapshot of the reported card as it
was when they reported it (`snapshot`: name, bio, photo path), so an edit
afterwards does not erase what was reported.

A report about a gathering is filed against its host. It carries the
gathering's id in `gathering_id` and the gathering as it was in
`snapshot -> 'gathering'` (title, start time, location, plus any field a
fork adds that a host types and every viewer sees: customize-gathering §2
puts it in `report_gathering`'s snapshot, as Golf With Me does with the
course). A gathering
listed to everyone (the default visibility) is seen by every signed-in
person; a connections-only one by its host, its members and the host's
connections; in both cases minus anyone who blocked the host or whom the
host blocked. Either way it reaches people the host may not know, so this
is the report a scam ("$20 on Venmo to hold your spot") or a lure to a
place arrives as. Only someone who can see a gathering can report it. `gathering_id` is
cleared if the gathering is deleted; the snapshot stays.

If the reported person deletes their account, the report stays for 90 days
(`reported_id` null, `reported_deleted_at` set, the snapshot intact), then
is purged. The stack runs no background jobs, so the purge happens when
something runs it: every new report, every account deletion, and the
"Open reports" query below, which purges first. Run that query daily (as
this page asks anyway) and nothing outlives its 90 days by more than a
day. A reporter who deletes their account leaves their reports
behind with `reporter_id` null.

## How you find out

**A webhook (recommended).** Point the `report_webhook_url` setting at a Slack or
Discord incoming webhook (both free) and every new report posts "A report
was filed: <id>" to that channel. The id only: no names, no reason, no
text, so the channel never holds what the report says. In the SQL Editor:

```sql
update private.settings
   set value = 'https://hooks.slack.com/services/…'  -- or a Discord webhook URL
 where key = 'report_webhook_url';
```

Treat the URL as a secret (anyone holding it can post to the channel): it
lives in the database, never in the repository. Set it to `null` to turn
notifications off. Delivery goes through pg_net and is not retried, so
the daily check below still stands.

**The daily check.** Pick one person who owns this, and make it part of
their day:

- **Admin:** `/admin` on your web app, signed in as an operator. Its
  reports page is coming (#135); until it lands, use one of the two below.
- **Studio:** Table Editor → `reports`, filtered to `status = open`.
- **SQL:** save this in the SQL Editor as "Open reports" and run it:

```sql
-- Purge reports about accounts deleted more than 90 days ago, then list
-- open reports, oldest first, with how many open reports each person has
-- (none for a deleted account: its reports no longer share an id).
select private.purge_expired_reports();

select r.created_at,
       r.reason,
       r.details,
       r.snapshot ->> 'display_name' as reported_name,
       r.snapshot -> 'gathering' ->> 'title' as gathering_title,
       -- the whole gathering as reported, a fork's own fields included
       r.snapshot -> 'gathering' as gathering_snapshot,
       r.reported_id,
       r.gathering_id,
       case when r.reported_id is not null
            then count(*) over (partition by r.reported_id)
       end as open_reports_about_them,
       r.id
  from public.reports r
 where r.status = 'open'
 order by r.created_at;
```

Run it at least once a day, every day the app is live, webhook or not:
that is what makes the 24-hour promise true when a notification is
missed.

The API also logs `report filed` (no ids, no names) in the API Worker's
logs, which tells you reports are arriving but not what they say.

## Your first operator

An operator is a signed-in account the database knows runs the
community: it can open `/admin` on the web app and read reports there.
Nobody becomes one from the app. You make each one in the SQL Editor:

1. Sign up in your app with the account that will be the operator, and
   create its profile.
2. In the Supabase dashboard, find its id (Authentication → Users), then
   run:

```sql
insert into private.operators (user_id)
values ('<their user id>');
```

3. Sign in as them and open `/admin`. Nothing in the app links there:
   bookmark it.

To take the role away: `delete from private.operators where user_id =
'<their user id>';`. Deleting the account removes it too. To see who
has it: `select * from private.operators;`.

Locally, `bun run db:seed` makes `operator@demo.withme.local` (password
`withme-demo-1`) an operator, and `bun run db:operator <email>` makes any
local account one. The seed never makes an operator on a hosted project:
demo logins are shared, and whoever held one would read every report.
How operators are checked is in
[the safety model](safety-model.md#operators).

## What you do with one

1. **Read it.** The snapshot is what they saw. Check the person's current
   card too (`select * from public.profiles where id = '<reported_id>'`).
2. **Decide.** Does it break section 3 of your terms?
3. **Act.**
   - *Content only* (a name, bio or photo): edit it out in Studio, or ask
     them to. For a photo, delete the file in Storage → avatars and set
     `profiles.avatar_path` to null.
   - *A gathering*: delete it, which removes it from everyone's Events tab
     and tags aimed at it fall back to their owners' profiles
     (`delete from public.gatherings where id = '<gathering_id>';`). A
     host who posts scams or lures is an account problem too: read their
     other gatherings (`select * from public.gatherings where host_id =
     '<reported_id>';`) before you decide.
   - *The account*: delete the user in Authentication → Users. Deleting
     the auth user cascades exactly as the person's own deletion does
     (profile, connections, gatherings, photos' pointer, tags released).
     Remove their photo files from Storage → avatars → `<their id>/`
     first, since the cascade does not reach Storage. Reports about them
     stay for 90 days with `reported_id` cleared; record what you did
     (step 4) before you delete, while the id still links them.
   - *Nothing breaks the rules*: dismiss it.
4. **Record it.** Mark the report with what you did:

```sql
update public.reports
   set status = 'actioned',            -- or 'dismissed'
       resolution_note = 'Removed the account: threats in bio.',
       resolved_at = now()
 where id = '<report id>';
```

An `underage` report says someone seems younger than your terms allow
(section 2). If what their card shows, or what they tell you when you ask
at the contact email, confirms it, remove the account.

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
