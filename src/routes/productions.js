'use strict';

/**
 * Productions and their performances.
 *
 * A production is created with a title and holds the performances that make
 * it up. Each performance has a date and a start time, plus its own crew
 * call (the roles it needs and how many people in each) — recorded per
 * performance rather than assumed, as the case study requires. Two call
 * templates are provided from the company's crew call sheet: `evening` and
 * `matinee` (the matinee runs without the bar).
 *
 * @module routes/productions
 */

const express = require('express');
const { CALL_TEMPLATES } = require('../db');

function productionsRouter(db) {
  const router = express.Router();

  // List all productions, newest first.
  router.get('/', (req, res) => {
    const rows = db.prepare('SELECT * FROM productions ORDER BY id DESC').all();
    res.json(rows.map(toApi));
  });

  // Create a production with a title.
  router.post('/', (req, res) => {
    const { title } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'A production title is required.' });
    }
    const result = db
      .prepare('INSERT INTO productions (title) VALUES (?)')
      .run(String(title).trim());
    const row = db.prepare('SELECT * FROM productions WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(toApi(row));
  });

  // Get one production with its performances in date and time order.
  router.get('/:id', (req, res) => {
    const production = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    if (!production) return res.status(404).json({ error: 'Production not found.' });
    const performances = db
      .prepare(
        `SELECT * FROM performances
         WHERE production_id = ?
         ORDER BY performance_date ASC, start_time ASC`
      )
      .all(production.id);
    res.json({ ...toApi(production), performances: performances.map(toApiPerformance) });
  });

  // Rename a production.
  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Production not found.' });
    const { title } = req.body || {};
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'A production title is required.' });
    }
    db.prepare('UPDATE productions SET title = ? WHERE id = ?').run(String(title).trim(), existing.id);
    const row = db.prepare('SELECT * FROM productions WHERE id = ?').get(existing.id);
    res.json(toApi(row));
  });

  // Remove a production (and, by cascade, its performances, calls and assignments).
  router.delete('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Production not found.' });
    db.prepare('DELETE FROM productions WHERE id = ?').run(existing.id);
    res.status(204).end();
  });

  // List the performances of a production in date and time order.
  router.get('/:id/performances', (req, res) => {
    const production = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    if (!production) return res.status(404).json({ error: 'Production not found.' });
    const rows = db
      .prepare(
        `SELECT * FROM performances
         WHERE production_id = ?
         ORDER BY performance_date ASC, start_time ASC`
      )
      .all(production.id);
    res.json(rows.map(toApiPerformance));
  });

  // Add a performance. `callTemplate` is 'evening' or 'matinee' and seeds the
  // crew call; the call can be edited afterwards.
  router.post('/:id/performances', (req, res) => {
    const production = db.prepare('SELECT * FROM productions WHERE id = ?').get(req.params.id);
    if (!production) return res.status(404).json({ error: 'Production not found.' });
    const { date, startTime, start_time: startTimeAlt, callTemplate } = req.body || {};
    const start = startTime || startTimeAlt;
    if (!date || !start) {
      return res
        .status(400)
        .json({ error: 'A performance needs a date and a start time.' });
    }
    const template = CALL_TEMPLATES[callTemplate] ? callTemplate : 'evening';
    const result = db
      .prepare('INSERT INTO performances (production_id, performance_date, start_time) VALUES (?, ?, ?)')
      .run(production.id, String(date), String(start));
    const performanceId = result.lastInsertRowid;
    const insertRole = db.prepare(
      'INSERT INTO crew_roles (performance_id, role, required_count) VALUES (?, ?, ?)'
    );
    for (const { role, required_count } of CALL_TEMPLATES[template]) {
      insertRole.run(performanceId, role, required_count);
    }
    const row = db.prepare('SELECT * FROM performances WHERE id = ?').get(performanceId);
    res.status(201).json(toApiPerformance(row));
  });

  // Change or remove a performance; other performances are unaffected.
  router.put('/:id/performances/:perfId', (req, res) => {
    const perf = db.prepare('SELECT * FROM performances WHERE id = ?').get(req.params.perfId);
    if (!perf) return res.status(404).json({ error: 'Performance not found.' });
    const { date, startTime, start_time: startTimeAlt } = req.body || {};
    db.prepare('UPDATE performances SET performance_date = ?, start_time = ? WHERE id = ?').run(
      date !== undefined ? String(date) : perf.performance_date,
      startTime !== undefined ? String(startTime) : startTimeAlt !== undefined ? String(startTimeAlt) : perf.start_time,
      perf.id
    );
    const row = db.prepare('SELECT * FROM performances WHERE id = ?').get(perf.id);
    res.json(toApiPerformance(row));
  });

  router.delete('/:id/performances/:perfId', (req, res) => {
    const perf = db.prepare('SELECT * FROM performances WHERE id = ?').get(req.params.perfId);
    if (!perf) return res.status(404).json({ error: 'Performance not found.' });
    db.prepare('DELETE FROM performances WHERE id = ?').run(perf.id);
    res.status(204).end();
  });

  // The crew call of a performance: roles and how many people each needs.
  router.get('/:id/performances/:perfId/roles', (req, res) => {
    const perf = db.prepare('SELECT * FROM performances WHERE id = ?').get(req.params.perfId);
    if (!perf) return res.status(404).json({ error: 'Performance not found.' });
    const rows = db
      .prepare('SELECT role, required_count FROM crew_roles WHERE performance_id = ? ORDER BY id')
      .all(perf.id);
    res.json(rows);
  });

  // Replace the whole crew call (kept in sync when the roster is revised).
  router.put('/:id/performances/:perfId/roles', (req, res) => {
    const perf = db.prepare('SELECT * FROM performances WHERE id = ?').get(req.params.perfId);
    if (!perf) return res.status(404).json({ error: 'Performance not found.' });
    const { roles } = req.body || {};
    if (!Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ error: 'roles must be a non-empty array.' });
    }
    for (const r of roles) {
      if (!r.role || !Number.isInteger(r.required_count) || r.required_count < 1) {
        return res
          .status(400)
          .json({ error: 'Each role needs a name and a required_count of at least 1.' });
      }
    }
    db.prepare('DELETE FROM crew_roles WHERE performance_id = ?').run(perf.id);
    const insert = db.prepare(
      'INSERT INTO crew_roles (performance_id, role, required_count) VALUES (?, ?, ?)'
    );
    for (const { role, required_count } of roles) insert.run(perf.id, role, required_count);
    const rows = db
      .prepare('SELECT role, required_count FROM crew_roles WHERE performance_id = ? ORDER BY id')
      .all(perf.id);
    res.json(rows);
  });

  return router;
}

function toApi(row) {
  return { id: row.id, title: row.title, createdAt: row.created_at };
}

function toApiPerformance(row) {
  return {
    id: row.id,
    productionId: row.production_id,
    date: row.performance_date,
    startTime: row.start_time,
  };
}

module.exports = productionsRouter;
