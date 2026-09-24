'use strict';

/**
 * Volunteer records: create, find, update, deactivate.
 * Deactivation is soft (active = 0) so a volunteer's historical assignments
 * are never destroyed — an acceptance criterion from the seed story
 * "add a volunteer to the company's list".
 *
 * @module routes/volunteers
 */

const express = require('express');

function volunteersRouter(db) {
  const router = express.Router();

  // List volunteers; ?active=all includes inactive ones (default: active only).
  router.get('/', (req, res) => {
    const all = req.query.active === 'all';
    const rows = all
      ? db.prepare('SELECT * FROM volunteers ORDER BY name COLLATE NOCASE').all()
      : db.prepare('SELECT * FROM volunteers WHERE active = 1 ORDER BY name COLLATE NOCASE').all();
    res.json(rows.map(toApi));
  });

  // Add a volunteer: name and a contact method are the minimum, per the seed story.
  router.post('/', (req, res) => {
    const { name, phone, email, emergency_contact: emergencyContact } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'A name is required.' });
    }
    if (!phone && !email) {
      return res
        .status(400)
        .json({ error: 'A way to contact the volunteer is required (phone or email).' });
    }
    const result = db
      .prepare(
        `INSERT INTO volunteers (name, phone, email, emergency_contact)
         VALUES (?, ?, ?, ?)`
      )
      .run(String(name).trim(), String(phone ?? '').trim(), email ? String(email).trim() : null,
        emergencyContact ? String(emergencyContact).trim() : null);
    const row = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(toApi(row));
  });

  // Find one volunteer.
  router.get('/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Volunteer not found.' });
    res.json(toApi(row));
  });

  // Update contact details.
  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Volunteer not found.' });
    const { name, phone, email, emergency_contact: emergencyContact } = req.body || {};
    db.prepare(
      `UPDATE volunteers SET name = ?, phone = ?, email = ?, emergency_contact = ? WHERE id = ?`
    ).run(
      name !== undefined ? String(name).trim() : existing.name,
      phone !== undefined ? String(phone).trim() : existing.phone,
      email !== undefined ? (email ? String(email).trim() : null) : existing.email,
      emergencyContact !== undefined
        ? (emergencyContact ? String(emergencyContact).trim() : null)
        : existing.emergency_contact,
      existing.id
    );
    const row = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(existing.id);
    res.json(toApi(row));
  });

  // Make inactive without destroying assignments already worked.
  router.post('/:id/deactivate', (req, res) => {
    const existing = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Volunteer not found.' });
    db.prepare('UPDATE volunteers SET active = 0 WHERE id = ?').run(existing.id);
    const row = db.prepare('SELECT * FROM volunteers WHERE id = ?').get(existing.id);
    res.json(toApi(row));
  });

  return router;
}

function toApi(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    emergencyContact: row.emergency_contact,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

module.exports = volunteersRouter;
