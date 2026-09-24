# The Tinshed Players — Crew Roster

A show scheduling and volunteer crew rostering system for The Tinshed Players
Inc., a community theatre company resident at the Wynnum School of Arts Hall,
Brisbane. This project is the software artefact for ISYS3001 Assessment 2
(Configuration and Procurement Management) and Assessment 3.

It replaces Bec Tanaka's exercise book, the Facebook thread and the wall
planner. The coordinator can build a roster and see where the holes are; a
volunteer can see what they have been put down for without asking anyone.

## What it does

- **Volunteers** — create, find, update and deactivate volunteers (name plus a
  contact method at minimum). Deactivation keeps the assignments they have
  already worked.
- **Productions & performances** — a production holds its performances, each
  with a date, a start time and its own crew call (evening calls include a
  two-person bar; matinees do not).
- **Assignments** — assign a volunteer to a role for a performance. New
  assignments start unconfirmed; they can be changed, confirmed or removed.
- **The company's operating rule** — a volunteer may hold at most one role in
  any single performance. A second role in the same performance is refused,
  with a reason, and the rule is enforced in the database itself.
- **Unavailability** — a volunteer can record date ranges they cannot be
  rostered. An assignment whose performance date falls inside a recorded range
  is refused with the reason shown (Bec's "people tell me on Facebook and it's
  gone in an hour").
- **Roster views** — a performance or production roster shows which positions
  are filled and which are open; a volunteer sees only their own assignments.

Out of scope (backlog, not built): skills matching, membership and certificate
checks, ticketing, membership renewals, rehearsal scheduling, venue booking,
hours reporting, equipment inventory, email/SMS and shift swapping.

## Prerequisites

- Node.js 22.5 or newer (the application uses the built-in `node:sqlite`
  module; no native compilation and no external database server)
- npm (bundled with Node.js)

## Run from a clean checkout

```bash
git clone https://github.com/ShiyuannnQu/tinshed-players-roster
cd tinshed-players-roster
npm install        # installs express and dotenv, locked by package-lock.json
cp .env.example .env   # optional: defaults work without a .env file
npm start          # serves on http://localhost:3000
```

The SQLite database is created automatically at `data/tinshed.db` on first
start (the `data/` directory is git-ignored).

## Run the tests

```bash
npm test           # 34 tests with node:test, including the one-role rule
```

## Configuration

All configuration is read from environment variables with safe defaults; see
`.env.example` for the complete list. Secrets belong in `.env`, which is
git-ignored and never committed.

| Variable  | Default               | Purpose                            |
|-----------|-----------------------|------------------------------------|
| `NODE_ENV`| `development`         | `development` / `test` / `production` |
| `PORT`    | `3000`                | TCP port for the web server        |
| `DB_PATH` | `./data/tinshed.db`   | SQLite database file location      |

## Deploy with Docker

```bash
docker build -t tinshed-crew-roster .
docker run -p 3000:3000 -e PORT=3000 tinshed-crew-roster
# or with Docker Compose:
docker compose up --build
```

## Project layout

```
src/            Express application (config, db, routes, server)
public/         single-page front end (no build step)
test/           node:test acceptance tests (helpers.js boots an in-memory app)
docs/           branching strategy and deployment notes
```

## License

MIT — see [LICENSE](LICENSE). Case-study names and details are fictional,
created for teaching purposes.
