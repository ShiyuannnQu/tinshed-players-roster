'use strict';

/**
 * Acceptance tests for the seed stories "create a production and record its
 * performances" and "the season is visible in one place": title, performances
 * with date and start time, date/time ordering, editing one performance
 * without affecting the others, and the per-performance crew call.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

test('a production is created with a title', async (t) => {
  const s = await startTestServer(t);
  const res = await s.post('/api/productions', { title: 'Salt on the Wind' });
  assert.equal(res.status, 201);
  assert.equal(res.body.title, 'Salt on the Wind');
});

test('a production without a title is refused', async (t) => {
  const s = await startTestServer(t);
  const res = await s.post('/api/productions', { title: '   ' });
  assert.equal(res.status, 400);
});

test('performances are listed in date and time order', async (t) => {
  const s = await startTestServer(t);
  const production = await s.post('/api/productions', { title: 'The Cracked Pot' });
  const id = production.body.id;
  await s.post(`/api/productions/${id}/performances`, { date: '2026-02-22', startTime: '14:00', callTemplate: 'matinee' });
  await s.post(`/api/productions/${id}/performances`, { date: '2026-02-20', startTime: '19:30', callTemplate: 'evening' });
  await s.post(`/api/productions/${id}/performances`, { date: '2026-02-21', startTime: '19:30', callTemplate: 'evening' });

  const res = await s.get(`/api/productions/${id}/performances`);
  const dates = res.body.map((p) => `${p.date} ${p.startTime}`);
  assert.deepEqual(dates, [
    '2026-02-20 19:30',
    '2026-02-21 19:30',
    '2026-02-22 14:00',
  ]);
});

test('changing one performance leaves the others unaffected', async (t) => {
  const s = await startTestServer(t);
  const production = await s.post('/api/productions', { title: 'The Weather House' });
  const id = production.body.id;
  const a = await s.post(`/api/productions/${id}/performances`, { date: '2026-09-04', startTime: '19:30' });
  const b = await s.post(`/api/productions/${id}/performances`, { date: '2026-09-05', startTime: '14:00', callTemplate: 'matinee' });

  await s.put(`/api/productions/${id}/performances/${a.body.id}`, { date: '2026-09-11', startTime: '19:30' });

  const list = await s.get(`/api/productions/${id}/performances`);
  const byId = Object.fromEntries(list.body.map((p) => [p.id, p]));
  assert.equal(byId[a.body.id].date, '2026-09-11');
  assert.equal(byId[b.body.id].date, '2026-09-05');
  assert.equal(byId[b.body.id].startTime, '14:00');
});

test('removing a performance leaves the production and its other performances intact', async (t) => {
  const s = await startTestServer(t);
  const production = await s.post('/api/productions', { title: 'Jack and the Beanstalk' });
  const id = production.body.id;
  const a = await s.post(`/api/productions/${id}/performances`, { date: '2026-11-27', startTime: '19:30' });
  const b = await s.post(`/api/productions/${id}/performances`, { date: '2026-11-28', startTime: '14:00', callTemplate: 'matinee' });

  const removed = await s.del(`/api/productions/${id}/performances/${a.body.id}`);
  assert.equal(removed.status, 204);

  const list = await s.get(`/api/productions/${id}/performances`);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, b.body.id);
});

test('an evening call has a bar; a matinee call does not', async (t) => {
  const s = await startTestServer(t);
  const production = await s.post('/api/productions', { title: 'The Weather House' });
  const id = production.body.id;

  const evening = await s.post(`/api/productions/${id}/performances`, { date: '2026-09-04', startTime: '19:30', callTemplate: 'evening' });
  const matinee = await s.post(`/api/productions/${id}/performances`, { date: '2026-09-05', startTime: '14:00', callTemplate: 'matinee' });

  const eveningRoles = await s.get(`/api/productions/${id}/performances/${evening.body.id}/roles`);
  const matineeRoles = await s.get(`/api/productions/${id}/performances/${matinee.body.id}/roles`);

  const eveningMap = Object.fromEntries(eveningRoles.body.map((r) => [r.role, r.required_count]));
  const matineeMap = Object.fromEntries(matineeRoles.body.map((r) => [r.role, r.required_count]));

  assert.equal(eveningMap['Bar'], 2);
  assert.equal(eveningMap['Usher'], 2);
  assert.equal(matineeMap['Bar'], undefined);
  assert.equal(matineeMap['Usher'], 2);
});

test('the crew call of one performance can be revised without touching another', async (t) => {
  const s = await startTestServer(t);
  const production = await s.post('/api/productions', { title: 'The Weather House' });
  const id = production.body.id;
  const a = await s.post(`/api/productions/${id}/performances`, { date: '2026-09-04', startTime: '19:30' });
  const b = await s.post(`/api/productions/${id}/performances`, { date: '2026-09-05', startTime: '14:00' });

  const revised = await s.put(`/api/productions/${id}/performances/${a.body.id}/roles`, {
    roles: [
      { role: 'Stage Manager', required_count: 1 },
      { role: 'Bar', required_count: 3 },
    ],
  });
  assert.equal(revised.status, 200);
  assert.equal(revised.body.length, 2);

  const bRoles = await s.get(`/api/productions/${id}/performances/${b.body.id}/roles`);
  assert.ok(bRoles.body.some((r) => r.role === 'Usher'), 'other performance keeps its call');
});
