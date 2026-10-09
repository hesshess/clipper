# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

- **vinext**, not Next.js: the Next.js App Router API (`app/`, route handlers, `export const dynamic`) running on Vite and deployed to **Cloudflare Workers**. `next.config.ts` is mostly vestigial. Build and plugin config lives in `vite.config.ts`. Don't use Node-only APIs in server code because it runs in the Workers runtime.
- Database: **Cloudflare D1** (SQLite) through **Drizzle ORM**. Get a client with `getDatabase()` from `lib/clipper/db.ts`, which reads the `DB` binding from `cloudflare:workers`. Don't create connections any other way.
- UI: shadcn/ui ("new-york", lucide icons) in `components/ui/`. App components go in `components/clipper/`. Tailwind v4 with CSS variables in `app/globals.css`.
- Import paths use the `@/*` alias, which maps to the repo root.

## Database workflow

- Schema lives in `db/schema.ts`. After changing it, run `npx drizzle-kit generate` to write SQL into `drizzle/`, then `npm run db:migrate:local`. Never edit migrations that have already been applied.
- `npm run db:seed:local` **deletes all rows** before reseeding from `scripts/seed.sql`. If you add a table or column, update `seed.sql` to match.
- Local D1 state lives in `.wrangler/` (gitignored). If you change bindings in `wrangler.jsonc`, run `npm run cf-typegen` to regenerate `worker-configuration.d.ts`.

## Verifying changes

There is no test suite. Run `npm run lint` (ESLint flat config, including the React Compiler-era `react-hooks` rules such as `set-state-in-effect`), then `npx tsc --noEmit`, then `npm run build` to confirm the Worker still builds.
