'use strict';

/**
 * Acceptance tests for the rostering stories, including the company's
 * operating rule: a volunteer may hold at most one role in any single
 * performance. An attempt to assign a second role must be refused with a
 * reason, and the same applies when an existing assignment is moved.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, seedProduction, seedVolunteer } = require('./helpers');

test('a volunteer is assigned to a role for a performance', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await seedVolunteer(s);
  const { performanceId } = await seedProduction(s);

  const res = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.id,
    role: 'Box Office',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.role, 'Box Office');
  assert.equal(res.body.volunteerId, volunteer.id);
  assert.equal(res.body.confirmed, false, 'a new assignment starts unconfirmed');
});

test('an assignment appears on the performance roster', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await seedVolunteer(s);
  const { performanceId } = await seedProduction(s);
  await s.post(`/api/performances/${performanceId}/assignments`, { volunteerId: volunteer.id, role: 'Usher' });

  const roster = await s.get(`/api/performances/${performanceId}/roster`);
  const usher = roster.body.find((r) => r.role === 'Usher');
  assert.equal(usher.filled, 1);
  assert.equal(usher.open, 1);
  assert.equal(usher.assignments[0].volunteerName, volunteer.name);
});

test('a role outside the crew call is refused', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await seedVolunteer(s);
  const { performanceId } = await seedProduction(s, { callTemplate: 'matinee' });
  const res = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.id,
    role: 'Bar',
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /crew call/i);
});

test('THE ONE-ROLE RULE: a second role in the same performance is refused with a reason', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await seedVolunteer(s, { name: 'Vera Sokolova' });
  const { performanceId } = await seedProduction(s);

  const first = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.id,
    role: 'Box Office',
  });
  assert.equal(first.status, 201);

  const second = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.id,
    role: 'Bar',
  });
  assert.equal(second.status, 409, 'must be refused, not accepted');
  assert.match(second.body.error, /at most one role/i);

  // The roster still shows exactly one assignment for the volunteer.
  const list = await s.get(`/api/performances/${performanceId}/assignments`);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].role, 'Box Office');
});

test('THE ONE-ROLE RULE: moving an assignment onto a performance the volunteer already works is refused', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await seedVolunteer(s, { name: 'Ade Okoro' });
  const p1 = await seedProduction(s, { date: '2026-09-04', startTime: '19:30' });
  const p2 = await seedProduction(s, { title: 'Other Show', date: '2026-09-05', startTime: '19:30' });

  await s.post(`/api/performances/${p1.performanceId}/assignments`, { volunteerId: volunteer.id, role: 'Bar' });
  const moved = await s.post(`/api/performances/${p2.performanceId}/assignments`, {
    volunteerId: volunteer.id,
    role: 'Usher',
  });
  assert.equal(moved.status, 201, 'a different performance is allowed');

  const conflict = await s.put(`/api/assignments/${moved.body.id}`, {
    performanceId: p1.performanceId,
  });
  assert.equal(conflict.status, 409, 'moving onto an already-crewed performance is refused');
  assert.match(conflict.body.error, /at most one role/i);
});

test('replacing the volunteer on an assignment keeps the position filled by the new person', async (t) => {
  const s = await startTestServer(t);
  const vera = await seedVolunteer(s, { name: 'Vera Sokolova' });
  const marion = await seedVolunteer(s, { name: 'Marion D\u2019Souza' });
  const { performanceId } = await seedProduction(s);

  const assignment = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: vera.id,
    role: 'Box Office',
  });
  const changed = await s.put(`/api/assignments/${assignment.body.id}`, { volunteerId: marion.id });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.volunteerName, 'Marion D\u2019Souza');
});

test('removing an assignment opens the position rather than deleting it', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await seedVolunteer(s);
  const { performanceId } = await seedProduction(s);
  const assignment = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.id,
    role: 'Sound Operator',
  });

  const removed = await s.del(`/api/assignments/${assignment.body.id}`);
  assert.equal(removed.status, 204);

  const roster = await s.get(`/api/performances/${performanceId}/roster`);
  const sound = roster.body.find((r) => r.role === 'Sound Operator');
  assert.equal(sound.filled, 0);
  assert.equal(sound.open, 1);
  assert.equal(sound.assignments.length, 0);
});

test('changing one assignment does not affect any other assignment', async (t) => {
  const s = await startTestServer(t);
  const vera = await seedVolunteer(s, { name: 'Vera Sokolova' });
  const hamish = await seedVolunteer(s, { name: 'Hamish Grady' });
  const { performanceId } = await seedProduction(s);

  const a = await s.post(`/api/performances/${performanceId}/assignments`, { volunteerId: vera.id, role: 'Bar' });
  const b = await s.post(`/api/performances/${performanceId}/assignments`, { volunteerId: hamish.id, role: 'Sound Operator' });

  await s.put(`/api/assignments/${a.body.id}`, { role: 'Box Office' });

  const bAfter = await s.get(`/api/performances/${performanceId}/assignments`);
  const hamishRow = bAfter.body.find((r) => r.id === b.body.id);
  assert.equal(hamishRow.role, 'Sound Operator');
  assert.equal(hamishRow.volunteerName, 'Hamish Grady');
});

test('an assignment can be confirmed', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await seedVolunteer(s);
  const { performanceId } = await seedProduction(s);
  const assignment = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.id,
    role: 'Stage Manager',
  });
  const confirmed = await s.post(`/api/assignments/${assignment.body.id}/confirm`);
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.confirmed, true);
});
