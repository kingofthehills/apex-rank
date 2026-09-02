# Apex Rank

A real-time gaming leaderboard dashboard built with React and Supabase. It displays the top-ranked players, lets you look up an individual player's rank, submit new scores, and seed the database with large amounts of test data — all with live updates pushed to every connected client via Supabase Realtime.

## Features

- **Top 10 leaderboard** — auto-refreshes every 10 seconds and also updates instantly through a Supabase Realtime subscription on the `leaderboard` table
- **Player rank lookup** — search for any player by user ID via the `get_player_rank` database function
- **Score submission** — submit a score for a user through the `submit_score` RPC, which atomically records the game session, updates their total score, and recalculates their rank
- **Database seeding** — one-click seeding to generate up to 1,000,000 users and 5,000,000 game sessions in batches, then refresh the leaderboard, for testing at scale
- **Live database status panel** — shows current row counts for users, game sessions, and the leaderboard
- Built with [shadcn/ui](https://ui.shadcn.com/) components (cards, tables, badges, toasts, etc.) on top of Tailwind CSS

## Tech Stack

- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 5](https://vitejs.dev/)
- [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) primitives + [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) — Postgres database, Row Level Security, RPC functions, `pg_cron` for scheduled leaderboard refreshes, and Realtime subscriptions
- [TanStack React Query](https://tanstack.com/query/latest) + [React Router](https://reactrouter.com/)
- [Vitest](https://vitest.dev/) + Testing Library for tests
- This project was originally scaffolded with [Lovable](https://lovable.dev/)

## Project Structure

```
apex-rank/
├── src/
│   ├── pages/
│   │   ├── Index.tsx          # Main leaderboard dashboard
│   │   └── NotFound.tsx
│   ├── components/ui/         # shadcn/ui component library
│   ├── integrations/supabase/ # Supabase client + generated types
│   ├── hooks/
│   ├── lib/
│   └── App.tsx                # Routing and app providers
├── supabase/
│   ├── config.toml
│   └── migrations/            # SQL: tables, RPC functions, RLS policies
└── vite.config.ts
```

### Database Schema

The Supabase migrations set up three tables (`users`, `game_sessions`, `leaderboard`) plus three Postgres functions:

- `refresh_leaderboard(top_n)` — recomputes ranks for the top N players from aggregated session scores
- `submit_score(user_id, score, game_mode)` — atomically inserts a game session and updates that player's leaderboard entry
- `get_player_rank(user_id)` — looks up a single player's current rank

Row Level Security is enabled on all tables with public read access, and the `leaderboard` table is added to the Realtime publication.

## Getting Started

### Prerequisites

- Node.js 18+ (or [Bun](https://bun.sh/), since a `bun.lockb` is included)
- A [Supabase](https://supabase.com/) project with the SQL migrations in `supabase/migrations/` applied

### Installation

```bash
git clone https://github.com/kingofthehills/apex-rank.git
cd apex-rank
npm install
```

### Environment Variables

Create a `.env` file in the project root with your Supabase project credentials:

```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
VITE_SUPABASE_PROJECT_ID=your_supabase_project_id
```

### Run the dev server

```bash
npm run dev
```

### Build for production

```bash
npm run build
npm run preview
```

### Tests

```bash
npm run test        # single run
npm run test:watch  # watch mode
```

### Lint

```bash
npm run lint
```
