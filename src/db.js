'use strict';

/**
 * Database layer for the Tinshed Crew Roster.
 *
 * Uses Node's built-in `node:sqlite` module (no native compilation, no extra
 * dependency). The schema enforces the company's operating rule that a
 * volunteer may hold at most one role in any single performance at the
 * database level: UNIQUE(performance_id, volunteer_id) on `assignments`.
 *
 * @module db
 */

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS volunteers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  phone             TEXT NOT NULL,
  email             TEXT,
  emergency_contact TEXT,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS productions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS performances (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  production_id    INTEGER NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  performance_date TEXT NOT NULL,
  start_time       TEXT NOT NULL
);

-- The crew call is recorded per performance, as the case study requires:
-- an evening call and a matinee call at the same venue need different roles.
CREATE TABLE IF NOT EXISTS crew_roles (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  performance_id INTEGER NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,
  required_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(performance_id, role)
);

CREATE TABLE IF NOT EXISTS assignments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  performance_id INTEGER NOT NULL REFERENCES performances(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,
  volunteer_id   INTEGER NOT NULL REFERENCES volunteers(id),
  confirmed      INTEGER NOT NULL DEFAULT 0,
  notified       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  -- The company's operating rule: a volunteer may hold at most one role in
  -- any single performance. Enforced here so no code path can bypass it.
  UNIQUE(performance_id, volunteer_id)
);
`;

/**
 * The default crew call templates from the case study's crew call sheet.
 * Matinees run the same call without the bar, which does not open.
 */
const CALL_TEMPLATES = {
  evening: [
    { role: 'Stage Manager', required_count: 1 },
    { role: 'Lighting Operator', required_count: 1 },
    { role: 'Sound Operator', required_count: 1 },
    { role: 'Front of House Manager', required_count: 1 },
    { role: 'Box Office', required_count: 1 },
    { role: 'Bar', required_count: 2 },
    { role: 'Usher', required_count: 2 },
  ],
  matinee: [
    { role: 'Stage Manager', required_count: 1 },
    { role: 'Lighting Operator', required_count: 1 },
    { role: 'Sound Operator', required_count: 1 },
    { role: 'Front of House Manager', required_count: 1 },
    { role: 'Box Office', required_count: 1 },
    { role: 'Usher', required_count: 2 },
  ],
};

/** Create a database handle. If no file path is given, use config.dbPath. */
function createDb(filePath = config.dbPath) {
  if (filePath !== ':memory:') {
    const dir = path.dirname(filePath);
    require('node:fs').mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** Is an error a violation of the one-role-per-performance rule? */
function isOneRoleConflict(err) {
  return (
    err &&
    err.code === 'ERR_SQLITE_ERROR' &&
    /UNIQUE constraint failed: assignments\.performance_id, assignments\.volunteer_id/.test(
      String(err.message)
    )
  );
}

module.exports = { createDb, isOneRoleConflict, CALL_TEMPLATES };
