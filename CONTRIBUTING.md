# Contributing to Noteworthy

## Branching model

Noteworthy uses a four-tier branch structure:

```
feature/* → dev → staging → main
```

| Branch      | Role                                            | Protection                                                     | Deploys to                   |
| ----------- | ----------------------------------------------- | -------------------------------------------------------------- | ---------------------------- |
| `main`      | Production.                                      | Gated — PR required, CI must pass; no force-push / deletion    | Vercel production            |
| `staging`   | Pre-production validation.                       | Gated — PR required, CI must pass; no force-push / deletion    | `noteworthy-staging` preview |
| `dev`       | Low-friction integration branch for daily work.  | Light — no force-push / deletion; direct pushes allowed        | `noteworthy-dev` preview     |
| `feature/*` | Short-lived work branches.                       | none                                                           | per-commit previews          |

## Workflow

1. Branch off `dev`:

   ```bash
   git checkout dev && git pull
   git checkout -b feature/<short-description>
   ```

2. Merge your work into `dev`. By convention this is done via a pull request,
   but it is **not enforced** — direct pushes and direct merges to `dev` are
   permitted when convenient. `dev` is the low-friction integration branch.

3. Promote up the chain via pull requests, in order:
   `dev → staging → main`. Never skip a tier. Merges into `staging` and `main`
   **require** a pull request, and the CI status check (lint, typecheck, build)
   **must pass** before merging.

4. A merge to `main` deploys production and applies any new database
   migrations to the hosted Supabase project.

## Branch protection summary

- **`dev`** — low-friction integration branch. Force pushes and branch deletion
  are blocked, but direct pushes and direct merges are allowed. Opening a PR into
  `dev` is a convention, not a requirement.
- **`staging` and `main`** — the gated branches. Pull requests are mandatory, the
  CI status check must pass before merging, and force pushes and branch deletion
  are blocked.

## Hotfixes

Urgent production fixes branch off `main`:

```bash
git checkout main && git pull
git checkout -b feature/hotfix-<short-description>
```

After the fix merges into `main`, back-merge it down into `staging` and `dev`
so all three tiers stay in sync.

## Migrations

- Create new migrations with `supabase migration new <name>` (generates a
  timestamped file). Existing `001_`–`030_` files are retained as-is.
- Never edit a migration after it has been applied to the hosted database;
  write a new migration instead.
- Schema changes reach the hosted database only via `supabase db push` (run by
  CI on merge to `main`) — not through Studio.
