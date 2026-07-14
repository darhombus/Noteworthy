# Noteworthy

A private digital journaling web app built with Next.js, Supabase, and Tiptap.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase (Postgres + Auth + Storage)
- **Editor**: Tiptap
- **Styling**: Tailwind CSS v3
- **Language**: TypeScript (strict mode)

## Local Supabase stack

Feature work runs against a local Supabase Docker stack (`npx supabase start`).
Its service ports are **offset by +10 from the CLI defaults** so this stack can
run at the same time as another project's default-port stack without collisions.

| Service           | CLI default | Noteworthy (+10) |
| ----------------- | ----------- | ---------------- |
| API gateway       | 54321       | **54331**        |
| Postgres DB       | 54322       | **54332**        |
| Studio            | 54323       | **54333**        |
| Inbucket (email)  | 54324       | **54334**        |
| DB shadow         | 54320       | **54330**        |
| Connection pooler | 54329       | **54339**        |
| Analytics         | 54327       | **54337**        |
| Edge inspector    | 8083        | **8093**         |

Key local URLs: API `http://127.0.0.1:54331`, Studio `http://127.0.0.1:54333`.
The offsets live in `supabase/config.toml`. See `CONTRIBUTING.md` for the
branch/migration workflow.
