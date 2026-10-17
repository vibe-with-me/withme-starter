# provision-tags — reference

## A leaked encode list

(From §4.) If a `provisioned-tags.*` file was ever committed, deleting it does not
remove it from history: every UID in it that is still unclaimed is
compromised. With the owner's OK (the stop in §2), run in the project's SQL
editor, with exactly the UIDs from that file:

```sql
delete from public.tags
where uid in ('04A1B2C3D4E5F6', '04A1B2C3D4E5F7') and status = 'unclaimed'
returning uid;
```

Or `update public.tags set status = 'disabled' where …` with the same
`where`, to keep the rows. Either way nobody can claim those tags any
more; replace them from a new batch.

Those statements skip the list's claimed UIDs, and someone holding the
list may have claimed one before its tag reached the customer. Have the
owner review them in the SQL editor, not a terminal or CI log, with the
same UIDs:

```sql
select t.uid, t.claimed_by, t.updated_at, p.display_name
from public.tags t join public.profiles p on p.id = t.claimed_by
where t.uid in ('04A1B2C3D4E5F6', '04A1B2C3D4E5F7');
```

The schema keeps no claim time: `updated_at` is the row's last change (the
claim, or a later destination or on/off change). The owner checks each
claimant against who was sent that tag. A claim by the customer who has
the tag is legitimate: leave it, since disabling it takes their tag away.
For a claim the owner judges illegitimate, and only with the owner's OK
for that UID:

```sql
update public.tags
set status = 'disabled', claimed_by = null, destination = null
where uid = '04A1B2C3D4E5F6' and claimed_by = '<claimed_by from the review>'
returning uid;
```

No row back means the tag changed hands since the review (its owner
deleted their account, and someone may have claimed it since): run the
review again.

Clearing `claimed_by` matters: a disabled row that keeps its owner stays
in that account's My tags, which can switch it back on. The tag then
resolves as disabled and nobody can claim it. Send the rightful holder a
new tag from a fresh batch.
