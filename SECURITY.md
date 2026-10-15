# Security policy

The safety model is the product. withme-starter promises the people who
use a fork that nobody can list them, that a block is absolute and
invisible, and that a connections-tier field reaches only accepted
connections. [docs/safety-model.md](docs/safety-model.md) states each
promise and the test that proves it. A way to break one of those promises
is a vulnerability, even when nothing crashes and no data is "stolen" in
the usual sense.

## What counts

Report it privately if you find any of these, in the starter as shipped
or in what a skill in `.agents/skills/` tells a fork to build:

- **An RLS bypass.** A query, RPC, or Storage call that reads or writes a
  row the caller's policies should refuse: another user's profile,
  requests, blocks, tags, gathering membership, or photos.
- **An enumeration oracle.** Any way to list or confirm people, tags, or
  gatherings you have not been handed: a search or browse surface, but
  also a foreign-key error, a distinguishable error code or response
  shape, a timing difference, a count, or a rate-limit response that
  reveals whether a row exists.
- **A block leak.** Anything that lets a blocked person see something a
  stranger would not, or tells them they were blocked: a card, a
  gathering, a different answer from `resolve_tag`, `send_connect_request`,
  or `join_gathering`.
- **A connections-tier field reaching a non-connection.** A field meant
  for accepted connections only, readable by a pending-request recipient,
  a gathering co-member, a stranger holding the tag, or either side of a
  block.
- **Service-role exposure.** The service-role key reachable from a client,
  a Worker, a build artifact, or a log, or any path where the API runs a
  query as something other than the caller.

Also in scope: auth bypasses in the API, a tag claimable by someone other
than the first presenter of its UID, scans storing more than a user-agent
string and a timestamp, and a profile photo that can point off-site.

Out of scope: the local stack's shared development keys (they are the
same on every machine and only reach `127.0.0.1`), a fork's own
deployment and configuration, denial of service by volume, and findings
in Supabase, Cloudflare, or other upstream projects, which belong with
those projects.

## How to report

Use GitHub's private vulnerability reporting: the **Security** tab of
this repository, then **Report a vulnerability**. That opens a private
advisory only the maintainers can see.

Please do not open a public issue, pull request, or discussion for a
vulnerability. A failing RLS test that reproduces the problem is the most
useful thing you can include; `packages/db/test/enumeration.test.ts` and
`blocks.test.ts` show the shape. Say which promise breaks, the steps, and
what the caller sees versus what a stranger would see.

## What to expect

withme-starter is maintained on a best-effort basis, with no support SLA.
We aim to acknowledge a report within a week and to keep you posted while
we work on it, but we cannot promise a fix date. When a fix lands we will
publish an advisory and credit you unless you would rather stay anonymous.

Only the latest commit on `main` is supported. The project is v0.x and
has no maintained release branches; forks pick up fixes by merging from
upstream.
