# Deployment notes

The application is designed so that the handover is the code plus the README:
it runs from a clean checkout with `npm install && npm start`, no undocumented
setup, no files that exist only on one machine.

## Environments

| Aspect | Development | Test | Production |
|--------|-------------|------|------------|
| `NODE_ENV` | `development` (default) | `test` | `production` |
| Database | `./data/tinshed.db` (local file) | `:memory:` (per test run) | Docker volume `/app/data/tinshed.db` |
| Config source | `.env` (optional, git-ignored) | code defaults | environment variables in `docker-compose.yml` |
| Web server | `npm start` | in-process app factory | `CMD node src/server.js` |

## How the pieces fit

1. **`.env.example`** documents every supported variable with safe defaults;
   the real `.env` is git-ignored so secrets never reach the repository.
2. **`src/config.js`** is the single place configuration is read. Routes never
   read `process.env` directly, which keeps environment concerns in one file.
3. **`Dockerfile`** uses a multi-stage build (install stage + slim runtime
   stage), runs as the non-root `node` user, and keeps the SQLite file on a
   named volume.
4. **`docker-compose.yml`** wires the image, port mapping, environment and the
   data volume together for one-command deployment (`docker compose up`).

## One-command deployment

```bash
docker compose up --build -d   # build and start on http://localhost:3000
docker compose logs -f app     # follow the logs
docker compose down            # stop (data survives in the roster-data volume)
```

## What is deliberately *not* here

No CI/CD pipeline is configured because the team has no CI runner; the
Dockerfile and `npm test` are the seam where a GitHub Actions workflow could be
added in the next sprint without changing application code.
