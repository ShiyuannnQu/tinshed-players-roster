'use strict';

/**
 * Roster views: where the holes are.
 *
 * - A performance roster shows each position in the crew call, who fills it
 *   and how many of that position are still open (Bec's "open a page and see
 *   the holes").
 * - A production roster shows the same across every performance.
 * - A volunteer's own view lists only their assignments — the volunteer sees
 *   their schedule without asking anyone, and a volunteer with no
 *   assignments gets an empty list, not an error.
 *
 * @module routes/roster
 */

const express = require('express');

function rosterRouter(db) {
  const router = express.Router();

  // Full roster for one performance, position by position.
  router.get('/performances/:perfId/roster', (req, res) => {
    const perf = db.prepare('SELECT * FROM performances WHERE id = ?').get(req.params.perfId);
    if (!perf) return res.status(404).json({ error: 'Performance not found.' });
    res.json(buildPerformanceRoster(db, perf.id));
  });

  // Roster across every performance of a production.
  router.get('/productions/:id/roster', (req, res) => {
    const production = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    if (!production) return res.status(404).json({ error: 'Production not found.' });
    const perfs = db
      .prepare(
        `SELECT * FROM performances WHERE production_id = ?
         ORDER BY performance_date ASC, start_time ASC`
      )
      .all(production.id);
    res.json({
      production: { id: production.id, title: production.title },
      performances: perfs.map((p) => ({
        id: p.id,
        date: p.performance_date,
        startTime: p.start_time,
        roster: buildPerformanceRoster(db, p.id),
      })),
    });
  });

  // A volunteer's own assignments, newest first. Empty list when there are none.
  router.get('/volunteers/:id/assignments', (req, res) => {
    const volunteer = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(req.params.id);
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });
    const rows = db
      .prepare(
        `SELECT a.id, a.role, a.confirmed,
                p.id AS production_id, p.title AS production_title,
                f.id AS performance_id, f.performance_date, f.start_time
         FROM assignments a
         JOIN performances f ON f.id = a.performance_id
         JOIN productions p ON p.id = f.production_id
         WHERE a.volunteer_id = ?
         ORDER BY f.performance_date ASC, f.start_time ASC`
      )
      .all(volunteer.id);
    res.json(
      rows.map((r) => ({
        id: r.id,
        production: r.production_title,
        date: r.performance_date,
        startTime: r.start_time,
        role: r.role,
        confirmed: Boolean(r.confirmed),
      }))
    );
  });

  return router;
}

function buildPerformanceRoster(db, performanceId) {
  const call = db
    .prepare('SELECT role, required_count FROM crew_roles WHERE performance_id = ? ORDER BY id')
    .all(performanceId);
  const filled = db
    .prepare(
      `SELECT a.role, v.id AS volunteer_id, v.name AS volunteer_name, a.confirmed, a.id AS assignment_id
       FROM assignments a JOIN volunteers v ON v.id = a.volunteer_id
       WHERE a.performance_id = ?`
    )
    .all(performanceId);

  return call.map((position) => {
    const people = filled.filter((f) => f.role === position.role);
    return {
      role: position.role,
      required: position.required_count,
      filled: people.length,
      open: Math.max(position.required_count - people.length, 0),
      assignments: people.map((p) => ({
        id: p.assignment_id,
        volunteerId: p.volunteer_id,
        volunteerName: p.volunteer_name,
        confirmed: Boolean(p.confirmed),
      })),
    };
  });
}

module.exports = rosterRouter;
