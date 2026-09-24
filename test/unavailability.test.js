'use strict';

/**
 * Acceptance tests for the derived story "record when a volunteer cannot be
 * rostered", from Bec's interview ("people tell me on Facebook and it's gone
 * off the top of the thread in an hour") and the paper volunteer form
 * (Kylie Toomey: "UNAVAILABLE DATES: 11–13 Sept — wedding in Toowoomba").
 *
 * The rule: a performance whose date falls inside a volunteer's recorded
 * unavailability refuses the assignment, with a reason — the same refusal
 * shape as the one-role-per-performance rule.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, seedProduction } = require('./helpers');

test('a volunteer can record a date range they cannot be rostered', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await s.post('/api/volunteers', { name: 'Kylie Toomey', phone: '0409 226 731' });
  const res = await s.post(`/api/volunteers/${volunteer.body.id}/unavailability`, {
    startsOn: '2026-09-11',
    endsOn: '2026-09-13',
    reason: 'wedding in Toowoomba',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.startsOn, '2026-09-11');
  assert.equal(res.body.endsOn, '2026-09-13');
  assert.equal(res.body.reason, 'wedding in Toowoomba');

  const list = await s.get(`/api/volunteers/${volunteer.body.id}/unavailability`);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].reason, 'wedding in Toowoomba');
});

test('a range with startsOn after endsOn is refused', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await s.post('/api/volunteers', { name: 'Marion D\'Souza', phone: '0400 555 666' });
  const res = await s.post(`/api/volunteers/${volunteer.body.id}/unavailability`, {
    startsOn: '2026-09-13',
    endsOn: '2026-09-11',
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /after endsOn/i);
});

test('a performance inside an unavailable range refuses the assignment with a reason', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await s.post('/api/volunteers', { name: 'Kylie Toomey', phone: '0409 226 731' });
  await s.post(`/api/volunteers/${volunteer.body.id}/unavailability`, {
    startsOn: '2026-09-11',
    endsOn: '2026-09-13',
    reason: 'wedding in Toowoomba',
  });
  // The Weather House runs Fri 4 – Sun 13 Sep; 12 Sep falls inside the range.
  const { performanceId } = await seedProduction(s, { date: '2026-09-12' });
  const res = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.body.id,
    role: 'Box Office',
  });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /unavailable on 2026-09-12/);
  assert.match(res.body.error, /wedding in Toowoomba/);
});

test('the first and last day of the range are also refused (inclusive boundaries)', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await s.post('/api/volunteers', { name: 'Kylie Toomey', phone: '0409 226 731' });
  await s.post(`/api/volunteers/${volunteer.body.id}/unavailability`, {
    startsOn: '2026-09-11',
    endsOn: '2026-09-13',
  });
  const { performanceId } = await seedProduction(s, { date: '2026-09-11' });
  const onFirstDay = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.body.id,
    role: 'Usher',
  });
  assert.equal(onFirstDay.status, 409);

  const second = await seedProduction(s, { date: '2026-09-13' });
  const onLastDay = await s.post(`/api/performances/${second.performanceId}/assignments`, {
    volunteerId: volunteer.body.id,
    role: 'Usher',
  });
  assert.equal(onLastDay.status, 409);
});

test('a performance outside the range is accepted', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await s.post('/api/volunteers', { name: 'Kylie Toomey', phone: '0409 226 731' });
  await s.post(`/api/volunteers/${volunteer.body.id}/unavailability`, {
    startsOn: '2026-09-11',
    endsOn: '2026-09-13',
    reason: 'wedding in Toowoomba',
  });
  const { performanceId } = await seedProduction(s, { date: '2026-09-05' });
  const res = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.body.id,
    role: 'Usher',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.role, 'Usher');
});

test('moving an assignment to an unavailable date is refused', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await s.post('/api/volunteers', { name: 'Col Hendricks', phone: '0400 333 444' });
  await s.post(`/api/volunteers/${volunteer.body.id}/unavailability`, {
    startsOn: '2026-09-12',
    endsOn: '2026-09-12',
    reason: 'away',
  });
  const first = await seedProduction(s, { date: '2026-09-05' });
  const created = await s.post(`/api/performances/${first.performanceId}/assignments`, {
    volunteerId: volunteer.body.id,
    role: 'Stage Manager',
  });
  assert.equal(created.status, 201);

  const blocked = await seedProduction(s, { date: '2026-09-12' });
  const moved = await s.put(`/api/assignments/${created.body.id}`, {
    performanceId: blocked.performanceId,
  });
  assert.equal(moved.status, 409);
  assert.match(moved.body.error, /unavailable on 2026-09-12/);
});

test('removing the recorded range allows the volunteer to be rostered again', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await s.post('/api/volunteers', { name: 'Kylie Toomey', phone: '0409 226 731' });
  const range = await s.post(`/api/volunteers/${volunteer.body.id}/unavailability`, {
    startsOn: '2026-09-12',
    endsOn: '2026-09-12',
  });
  const removed = await s.del(`/api/volunteers/${volunteer.body.id}/unavailability/${range.body.id}`);
  assert.equal(removed.status, 204);

  const { performanceId } = await seedProduction(s, { date: '2026-09-12' });
  const res = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.body.id,
    role: 'Usher',
  });
  assert.equal(res.status, 201);
});
