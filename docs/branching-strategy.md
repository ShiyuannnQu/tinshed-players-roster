# Branching strategy

This project follows a **GitHub Flow with a long-lived `develop` line**, which
is the middle ground chosen after comparing the three mainstream strategies.
The decision is recorded here so the marker — and the next team — can see not
just *what* was done but *why*.

## Why this strategy?

| Strategy | Strengths | Weaknesses for this project |
|----------|-----------|-----------------------------|
| **Git Flow** | Separate release/hotfix branches, formal releases | Heavyweight ceremony for a single-sprint, four-person team; the `release` branch adds process without adding safety at this scale. |
| **Trunk-based** | Fastest feedback, smallest mental overhead | Requires a mature CI/CD pipeline and high-frequency commits to be safe; the team has no CI runner on this project, so direct-to-main changes could break the only deployable branch. |
| **GitHub Flow + `develop`** | Feature branches with pull requests and review; `main` stays releasable | Slightly more ceremony than trunk-based. |

**Choice: GitHub Flow with a `develop` integration branch.** `main` is the
releasable line and is only updated by reviewed pull requests from `develop`;
day-to-day work happens on short-lived `feature/*` branches merged into
`develop` through pull requests. This delivers the review discipline the
Definition of Done requires (every story merged through a pull request)
without Git Flow's release-branch overhead, and it keeps `main` shippable even
though no CI runner protects it.

## Branches

- `main` — always releasable. Updated only via pull request from `develop`
  (no direct commits).
- `develop` — integration branch. Feature branches merge here after review.
- `feature/<slug>` — one branch per user story or coherent task, e.g.
  `feature/volunteer-crud`, `feature/one-role-rule`.

## Naming convention

`feature/<short-slug>` with a lowercase, hyphenated slug naming the story or
capability the branch delivers.

## Merge workflow

1. Create the feature branch from the tip of `develop`.
2. Commit small, conventional commits (`feat:`, `fix:`, `test:`, `docs:`,
   `chore:`, `refactor:`) as the story is built.
3. Open a pull request `feature/<slug>` → `develop`; a team member reviews it.
4. Address review comments, then merge (merge commit, no squash, so the
   feature history survives).
5. Delete the merged feature branch.
6. At sprint close, open a release pull request `develop` → `main` and merge
   after review; tag the merge commit (`v1.0.0`).

## Commit message convention

Conventional Commits, imperative mood, one change per commit:

- `feat:` new capability
- `fix:` bug fix
- `test:` tests only
- `docs:` documentation
- `chore:` tooling, config, deployment files
- `refactor:` behaviour-preserving restructuring

## Tags and releases

Merge commits on `main` are tagged with a semantic version (`v1.0.0`) and the
release is recorded in `CHANGELOG.md` (Keep a Changelog format).
