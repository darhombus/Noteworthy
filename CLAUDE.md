You are an expert Next.js 14 / TypeScript / Supabase developer.
You are helping build a digital journaling web app called Noteworthy.
The full PRD is available if needed. Follow these rules on every file you generate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TECH STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Framework   : Next.js 14 App Router
Language    : TypeScript strict mode — never use 'any'
Styling     : Tailwind CSS v3, darkMode: 'class'
Database    : Supabase (Postgres + Auth + Storage)
Editor      : Tiptap (@tiptap/react) — MIT, free
State       : Zustand (UI only), Server Components (data)
Forms       : React Hook Form + Zod (schema first, type inferred)
Charts      : Chart.js + react-chartjs-2
Toasts      : Sonner

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CODING RULES (non-negotiable)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1.  TypeScript strict mode. Never use 'any'. Use types/supabase.ts for all DB queries.
2.  Prefer React Server Components. Add 'use client' ONLY for hooks, events, browser APIs.
3.  All DB WRITES go through Server Actions or Route Handlers — never from client components.
4.  DB READS may use the Supabase server client directly inside Server Components.
5.  Zustand = UI state only (sidebar, theme). Server data lives in props or Server Components.
6.  Optimistic UI: update local state immediately, revert + toast on server error.
7.  Forms: define Zod schema → infer type → pass to zodResolver. Always.
8.  RLS is the security layer — never rely on user_id filters in app code alone.
9.  Tiptap content stored as JSONB (JSONContent). Never raw HTML. Use Tiptap read-only editor for previews.
10. Concurrency: send updated_at as If-Unmodified-Since on every save.
    On 409 Conflict → show conflict dialog (Keep mine / Load server version).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DESIGN RULES (apply to every component)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Light bg: #FAFAFA  Surface: #FFFFFF  Border: #E0E0E0
Dark  bg: #121212  Surface: #1E1E1E  Border: #3A3A3A
Brand (both modes): #1976D2
Sidebar light: #F5F5F5  Sidebar dark: #2C2C2C
Text primary light: #212121  Text primary dark: #F5F5F5
Text secondary light: #757575  Text secondary dark: #9E9E9E
Active nav bg light: #1976D2  Active nav bg dark: #1E3A5F
Font UI: Inter  |  Font content: Georgia serif 18px / 1.75 line-height
Cards: rounded-xl shadow-sm border border-[#E0E0E0] dark:border-[#3A3A3A]

DO NOT: gradients on buttons, neon colours, glass-morphism, animated blobs,
        centre-aligned body text, emoji as chrome, hard-coded light-mode colours.
DO    : generous whitespace, clear typographic scale, single brand colour.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRAMEWORK QUIRKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- This project runs Next.js 16, which deprecates `middleware.ts` in favour of `proxy.ts`.
  NEVER create or rename to `middleware.ts` — it will trigger a deprecation warning and
  the file will be ignored. All route-guard and session-refresh logic lives in `proxy.ts`.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIGMA DESIGNS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The designs live in a Figma Make file (not a standard Figma design file).

  URL      : https://www.figma.com/make/8L2AKy4gSzUuNw1T4HUE95/JournalApp-design-screens
  fileKey  : 8L2AKy4gSzUuNw1T4HUE95

How to query the designs:
1. NEVER pass a nodeId — Figma Make files have no node tree.
2. Call mcp__figma__get_design_context with fileKey = "8L2AKy4gSzUuNw1T4HUE95" and no nodeId.
3. If the first call times out or returns partial data, retry once — Figma Make files
   can be slow to parse on the first request.
4. The tool returns React component source code (not a node tree). Treat it as a
   reference implementation and adapt it to this project's stack and conventions.
5. Use the Agent tool (subagent_type: general-purpose) to fetch Figma context when
   multiple retries may be needed — subagents handle retries automatically.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD DISCIPLINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Build ONLY what the current module prompt specifies.
- Do not scaffold future modules or leave TODO placeholders.
- When done, summarise what was built and list the verification steps.
- If a requirement is unclear, ask before coding. Do not assume.
