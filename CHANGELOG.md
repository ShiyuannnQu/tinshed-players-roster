# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and commits follow [Conventional Commits](https://www.conventionalcommits.org/).

## [1.0.0] — 2026-09-24

First sprint release: the committed scope for the Tinshed Crew Roster.

### Added
- Volunteer records: create, find, update, deactivate (soft), list with
  `active=all` filter.
- Productions and performances: create/rename/remove productions; add, edit,
  reorder and remove performances; per-performance crew call seeded from
  evening/matinee templates and editable afterwards.
- Assignments: assign a volunteer to a role, replace the volunteer, move an
  assignment, remove it (position reopens), confirm it.
- The company's one-role-per-performance rule, enforced by a database unique
  constraint and surfaced as a 409 refusal with a reason.
- Roster views: performance roster and production roster showing filled/open
  positions; volunteer's own schedule view.
- Single-page front end (plain fetch + DOM, no build step).
- Configuration management: `.env.example`, environment-driven `src/config.js`,
  git-ignored `.env` and `data/`.
- Deployment configuration: `Dockerfile`, `docker-compose.yml`, run-from-clean-
  checkout instructions in the README.
- Automated tests: 27 tests on `node:test`, covering every seed story plus the
  one-role rule (creation and move cases).

### Changed
- `npm test` now uses Node's default test discovery (`node --test`).

### Fixed
- Replacing the volunteer on an assignment now returns the new volunteer's
  name (the updated row was previously fetched without the join).

## [Unreleased]
- Backlog candidates for the next sprint (see handover notes): skills/operator
  lists, membership and RSA checks, confirmations and reminders, shift
  swapping, hours reporting for grant acquittal.
