# Ireland project — Studio-resident configuration capture

**Phase 0, Section 5 Part A (EXT-16).** Captured before the pause because none of
this lives in Postgres and none of it is reachable once the project is paused.
Reproduced by hand on Frankfurt at Section 6 step 7.

Rules while filling this in:

- Copy exact strings. Do not paraphrase, do not summarise a list as "the usual ones".
- Where a category is genuinely empty or unmodified, **write that explicitly**.
  An absent section reads as "forgot to check" a month from now.
- Secrets are not copied. Note that one is set and must be reissued.

Captured on: 27/08/2026
Captured by: Ferrin

---

## A1 — Site URL

`Authentication` → `URL Configuration` → Site URL

```
https://noteworthy-alpha.vercel.app
```

---

## A2 — Redirect allowlist

`Authentication` → `URL Configuration` → Redirect URLs

Every entry, verbatim, including wildcards. One per line.

```
https://noteworthy-staging1.vercel.app/**
https://noteworthy-dev.vercel.app/**
```

Count: 2

Structure note: the Site URL (`noteworthy-alpha.vercel.app`) has no
corresponding entry in this list. Supabase implicitly permits the Site URL
itself, so production redirects worked without one. Recorded so Phase 1 knows
the shape was two environment entries plus an implicitly-covered production,
not three entries with one missing.

---

## A3 — Auth providers

`Authentication` → `Sign In / Providers`

### Email
- Enabled: On
- Confirm email:Off
- Secure password change:Off
- Minimum password length:6 characters
- Secret: n/a

### Providers NOT enabled
All other providers are not toggled on

---

## A4 — Email templates

`Authentication` → `Emails` → `Templates`

For each: subject line and full body. If untouched, write
**"unmodified from Supabase default"** — do not leave blank.

### Confirm signup
Subject:
```
Confirm Your Signup
```
Body:
```html
<h2>Confirm your signup</h2>

<p>Follow this link to confirm your user:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your mail</a></p>
```

### Invite user
Subject:
```
You have been invited
```
Body:
```html
<h2>You have been invited</h2>

<p>You have been invited to create a user on {{ .SiteURL }}. Follow this link to accept the invite:</p>
<p><a href="{{ .ConfirmationURL }}">Accept the invite</a></p>
```

### Magic Link
Subject:
```
Your Magic Link
```
Body:
```html
<h2>Magic Link</h2>

<p>Follow this link to login:</p>
<p><a href="{{ .ConfirmationURL }}">Log In</a></p>
```

### Change email address
Subject:
```
Confirm Email Change
```
Body:
```html
<h2>Confirm Change of Email</h2>

<p>Follow this link to confirm the update of your email from {{ .Email }} to {{ .NewEmail }}:</p>
<p><a href="{{ .ConfirmationURL }}">Change Email</a></p>
```

### Reset password
Subject:
```
Reset Your Password
```
Body:
```html
<h2>Reset Password</h2>

<p>Follow this link to reset the password for your user:</p>
<p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
```

### Reauthentication
Subject:
```
Confirm Reauthentication
```
Body:
```html
<h2>Confirm reauthentication</h2>

<p>Enter the code: {{ .Token }}</p>
```

Custom SMTP configured:
```
Not configured
```

---

## A5 — Auth settings, and the JWT signing algorithm

### Session behaviour
`Authentication` → `Sessions`

- JWT expiry (access token lifetime, seconds):3600 seconds
- Refresh token rotation enabled:Yes
- Reuse interval:10 seconds
- Inactivity timeout:0
- Time-box user sessions:0

### Sign-in policy
`Authentication` → `Sign In / Providers`

- Confirm email required:Off
- Allow anonymous sign-ins:Off
- Minimum password length:6 characters
- Password requirements:default
- Leaked password protection:Off

### Rate limits
`Authentication` → `Rate Limits` — note only what differs from default.

```
All defaults
```

### JWT signing algorithm — the one that decides Phase 3

`Project Settings` → `JWT Keys` (or `API Keys` → `JWT`, depending on dashboard version)

**Record the algorithm by name.** Not "asymmetric signing enabled" — the actual
value. NW-15 carries this as unconfirmed and both branches are live.

- Algorithm (`RS256` / `ES256` / `HS256`):ECDSA with SHA256, ECC (P-256)
- Key type shown (signing key vs legacy shared secret):Signing Key
- Key ID / `kid`, if shown:2c5c7fdf-b3bc-424d-9c36-61b032b33f2c
- Standby key present:Not present
- JWKS URL, if shown:https://ahkixdhyhghzxhkqmazy.supabase.co/auth/v1/.well-known/jwks.json

Consequence, for the record: `RS256`/`ES256` means Phase 3's `hooks.server.ts`
verifies locally against JWKS with no auth-server round trip. `HS256` means a
`getUser()` call per request. Either way NW-15's requirement stands — only the
cost differs.

---

## A6 — Screenshots

Saved alongside this file. Tick when captured.

- [✓] URL Configuration
- [✓] Sign In / Providers
- [✓] Emails → Templates (each one)
- [✓] Sessions
- [✓] Rate Limits
- [✓] JWT Keys
- [✓] Project Settings → General

---

## A7 — Platform-schema census

Captured at the Section 4 stop, while Ireland was reachable. This is the baseline
Section 6's new-vs-old diff is read against.

- `graphql` — 0 functions. Extension absent; dropped at some point.
- `graphql_public` — 1 function: `graphql(operationName text, query text, variables jsonb, extensions jsonb)`. This is the **placeholder** wrapper installed by `issue_graphql_placeholder`. Frankfurt will replace it with the real resolver when it provisions pg_graphql. Expected, pre-authorised at Section 6 step 5.
- `realtime` — 16 functions.
- `vault` — 5 functions.

Schema count: 10 live, 12 local. No live-only schema.
Local-only: `_realtime`, `supabase_functions` (local stack services).

Extensions on Ireland (7): _paste from the Section 2 inventory_

```
### Extensions

| Extension | Live | Replay | Schema |
|---|---|---|---|
| `pg_cron` | 1.6.4 | 1.6.4 | `pg_catalog` |
| `pg_stat_statements` | 1.11 | 1.11 | `extensions` |
| `pg_trgm` | 1.6 | 1.6 | `public` |
| `pgcrypto` | 1.3 | 1.3 | `extensions` |
| `plpgsql` | 1.0 | 1.0 | `pg_catalog` |
| `supabase_vault` | 0.3.1 | 0.3.1 | `vault` |
| `uuid-ossp` | 1.1 | 1.1 | `extensions` |
| `pg_graphql` | **absent** | 1.5.11 | `graphql` |

Exact version parity on all seven shared extensions — no version drift to allowlist. `pg_trgm` is present and installed into `public`, consistent with EXT-17 (the extension travels with the schema even though NW-7 defers the typo-fallback feature).

**Section 6 note:** enable exactly these seven on the new project. Do not add `pg_graphql` to match the local stack.
```

---

## A8 — Durable facts of the move

Recorded here rather than in `docs/EXT-devlog.md` because `docs/` is untracked by
design (EXT-18) and these cannot be reconstructed after the pause.

- Old project ref: `ahkixdhyhghzxhkqmazy`
- Old project region: `eu-west-1` (Ireland)
- Old Postgres version: 17.6
- Pause date (fill at B7):27/08/2026
- Restore deadline (pause + 1 year, EXT-11):27/08/2027
- New project ref (fill at Section 6):
- New project region: `eu-central-1` (Frankfurt)
- New Postgres version (must be 17, EXT-14):

---

## Anything else found in Studio

Settings the application depends on that are not covered above. If none, write
"none found" rather than leaving this empty.

```
None found
```
