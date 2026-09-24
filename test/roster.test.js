'use strict';

/**
 * Acceptance tests for the roster views and the volunteer's own schedule:
 * the coordinator sees which positions are filled and which are open; a
 * volunteer sees only their own assignments and gets an empty list (not an
 * error) when they have none.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, seedProduction, seedVolunteer } = require('./helpers');

test('the roster shows filled and open positions for every role in the call', async (t) => {
  const s = await startTestServer(t);
  const col = await seedVolunteer(s, { name: 'Col Hendricks' });
  const { performanceId } = await seedProduction(s); // evening call: 8 roles

  await s.post(`/api/performances/${performanceId}/assignments`, { volunteerId: col.id, role: 'Stage Manager' });

  const roster = await s.get(`/api/performances/${performanceId}/roster`);
  const sm = roster.body.find((r) => r.role === 'Stage Manager');
  const bar = roster.body.find((r) => r.role === 'Bar');
  assert.equal(sm.filled, 1);
  assert.equal(sm.open, 0);
  assert.equal(bar.filled, 0);
  assert.equal(bar.open, 2, 'the two bar positions are both open');
});

test('the production roster covers every performance in date order', async (t) => {
  const s = await startTestServer(t);
  const production = await s.post('/api/productions', { title: 'The Weather House' });
  const id = production.body.id;
  await s.post(`/api/productions/${id}/performances`, { date: '2026-09-06', startTime: '14:00', callTemplate: 'matinee' });
  await s.post(`/api/productions/${id}/performances`, { date: '2026-09-04', startTime: '19:30' });

  const res = await s.get(`/api/productions/${id}/roster`);
  assert.equal(res.body.production.title, 'The Weather House');
  assert.deepEqual(
    res.body.performances.map((p) => p.date),
    ['2026-09-04', '2026-09-06']
  );
  const holes = res.body.performances.flatMap((p) => p.roster).filter((r) => r.open > 0);
  assert.ok(holes.length > 0, 'an unstaffed roster shows open positions');
});

test('a volunteer sees their own assignments with production, date, time and role', async (t) => {
  const s = await startTestServer(t);
  const kylie = await seedVolunteer(s, { name: 'Kylie Toomey' });
  const trish = await seedVolunteer(s, { name: 'Trish Baumann' });
  const { performanceId } = await seedProduction(s);

  await s.post(`/api/performances/${performanceId}/assignments`, { volunteerId: kylie.id, role: 'Box Office' });
  await s.post(`/api/performances/${performanceId}/assignments`, { volunteerId: trish.id, role: 'Usher' });

  const mine = await s.get(`/api/volunteers/${kylie.id}/assignments`);
  assert.equal(mine.body.length, 1, 'only my own assignments, not the whole company\u2019s');
  const row = mine.body[0];
  assert.equal(row.production, 'The Weather House');
  assert.equal(row.date, '2026-09-04');
  assert.equal(row.startTime, '19:30');
  assert.equal(row.role, 'Box Office');
});

test('a volunteer with no assignments gets an empty list rather than an error', async (t) => {
  const s = await startTestServer(t);
  const ravi = await seedVolunteer(s, { name: 'Ravi Chandrasekaran' });
  const res = await s.get(`/api/volunteers/${ravi.id}/assignments`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});
