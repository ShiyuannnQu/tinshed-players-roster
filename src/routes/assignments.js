'use strict';

/**
 * Assignments: a volunteer assigned to a role for a particular performance.
 *
 * The company's operating rule is that a volunteer may hold at most one role
 * in any single performance. The database enforces it with a unique
 * constraint; this route catches the violation and returns a refusal with a
 * reason instead of accepting the assignment — exactly what the case study
 * asks for. The same check applies when an existing assignment is moved to a
 * different performance.
 *
 * @module routes/assignments
 */

const express = require('express');
const { isOneRoleConflict } = require('../db');

function assignmentsRouter(db) {
  const router = express.Router();

  // Assign a volunteer to a role for a performance. New assignments start
  // unconfirmed.
  router.post('/performances/:perfId/assignments', (req, res) => {
    const perf = db.prepare('SELECT * FROM performances WHERE id = ?').get(req.params.perfId);
    if (!perf) return res.status(404).json({ error: 'Performance not found.' });
    const { volunteerId, volunteer_id: volunteerIdAlt, role } = req.body || {};
    const vid = volunteerId ?? volunteerIdAlt;
    if (!vid || !role) {
      return res.status(400).json({ error: 'An assignment needs a volunteerId and a role.' });
    }
    const volunteer = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(vid);
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });
    if (!volunteer.active) {
      return res.status(400).json({ error: `${volunteer.name} is inactive and cannot be rostered.` });
    }
    const call = db
      .prepare('SELECT role FROM crew_roles WHERE performance_id = ? AND role = ?')
      .get(perf.id, String(role));
    if (!call) {
      return res
        .status(400)
        .json({ error: `"${role}" is not part of the crew call for this performance.` });
    }

    try {
      const result = db
        .prepare(
          `INSERT INTO assignments (performance_id, role, volunteer_id)
           VALUES (?, ?, ?)`
        )
        .run(perf.id, String(role), Number(vid));
      const row = db.prepare('SELECT * FROM assignments WHERE id = ?').get(result.lastInsertRowid);
      return res.status(201).json(toApi(row, db));
    } catch (err) {
      if (isOneRoleConflict(err)) {
        return res.status(409).json({
          error:
            `Refused: ${volunteer.name} is already assigned to another role for this ` +
            `performance. A volunteer may hold at most one role per performance.`,
        });
      }
      throw err;
    }
  });

  // All assignments for a performance.
  router.get('/performances/:perfId/assignments', (req, res) => {
    const perf = db.prepare('SELECT * FROM performances WHERE id = ?').get(req.params.perfId);
    if (!perf) return res.status(404).json({ error: 'Performance not found.' });
    const rows = db
      .prepare(
        `SELECT a.*, v.name AS volunteer_name
         FROM assignments a JOIN volunteers v ON v.id = a.volunteer_id
         WHERE a.performance_id = ? ORDER BY a.id`
      )
      .all(perf.id);
    res.json(rows.map((r) => toApi(r, db)));
  });

  // Change an assignment (replace the volunteer, or move it to another role
  // or performance). The one-role rule is checked again on the target.
  router.put('/assignments/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assignment not found.' });
    const { volunteerId, volunteer_id: vidAlt, role, performanceId } = req.body || {};
    const vid = volunteerId ?? vidAlt ?? existing.volunteer_id;
    const newRole = role !== undefined ? String(role) : existing.role;
    const newPerf = performanceId !== undefined ? Number(performanceId) : existing.performance_id;

    const perf = db.prepare('SELECT * FROM performances WHERE id = ?').get(newPerf);
    if (!perf) return res.status(404).json({ error: 'Performance not found.' });
    const volunteer = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(vid);
    if (!volunteer) return res.status(404).json({ error: 'Volunteer not found.' });

    try {
      db.prepare(
        'UPDATE assignments SET performance_id = ?, role = ?, volunteer_id = ? WHERE id = ?'
      ).run(newPerf, newRole, Number(vid), existing.id);
      return res.json(toApi(getAssignment(db, existing.id), db));
    } catch (err) {
      if (isOneRoleConflict(err)) {
        return res.status(409).json({
          error:
            `Refused: ${volunteer.name} already holds a role for that performance. ` +
            `A volunteer may hold at most one role per performance.`,
        });
      }
      throw err;
    }
  });

  // Remove an assignment; the position opens up on the roster again.
  router.delete('/assignments/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assignment not found.' });
    db.prepare('DELETE FROM assignments WHERE id = ?').run(existing.id);
    res.status(204).end();
  });

  // Mark an assignment confirmed (the volunteer has answered).
  router.post('/assignments/:id/confirm', (req, res) => {
    const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assignment not found.' });
    db.prepare('UPDATE assignments SET confirmed = 1 WHERE id = ?').run(existing.id);
    res.json(toApi(getAssignment(db, existing.id), db));
  });

  return router;
}

/** Fetch one assignment joined with the volunteer's name. */
function getAssignment(db, id) {
  return db
    .prepare(
      `SELECT a.*, v.name AS volunteer_name
       FROM assignments a JOIN volunteers v ON v.id = a.volunteer_id
       WHERE a.id = ?`
    )
    .get(id);
}

function toApi(row, db) {
  return {
    id: row.id,
    performanceId: row.performance_id,
    role: row.role,
    volunteerId: row.volunteer_id,
    volunteerName: row.volunteer_name,
    confirmed: Boolean(row.confirmed),
    notified: Boolean(row.notified),
    createdAt: row.created_at,
  };
}

module.exports = assignmentsRouter;
