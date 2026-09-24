'use strict';

/**
 * Acceptance tests for the seed story "add a volunteer to the company's list":
 * record a name and a contact method, survive a restart, and deactivate
 * without destroying assignments already worked.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, seedProduction } = require('./helpers');

test('a volunteer can be added with name and contact details', async (t) => {
  const s = await startTestServer(t);
  const res = await s.post('/api/volunteers', {
    name: 'Bec Tanaka',
    phone: '0412 345 678',
    email: 'bec@example.com',
    emergencyContact: 'Steve Tanaka 0499 000 000',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'Bec Tanaka');
  assert.equal(res.body.phone, '0412 345 678');
  assert.equal(res.body.active, true);
});

test('a volunteer with no contact method is refused', async (t) => {
  const s = await startTestServer(t);
  const res = await s.post('/api/volunteers', { name: 'No Contact' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /contact/i);
});

test('a volunteer can be found again and listed', async (t) => {
  const s = await startTestServer(t);
  const created = await s.post('/api/volunteers', { name: 'Ravi Chandrasekaran', phone: '0422 000 111' });
  const found = await s.get(`/api/volunteers/${created.body.id}`);
  assert.equal(found.status, 200);
  assert.equal(found.body.name, 'Ravi Chandrasekaran');
  const list = await s.get('/api/volunteers');
  assert.equal(list.body.length, 1);
});

test('contact details can be updated', async (t) => {
  const s = await startTestServer(t);
  const created = await s.post('/api/volunteers', { name: 'Hamish Grady', phone: '0400 000 000' });
  const updated = await s.put(`/api/volunteers/${created.body.id}`, { phone: '0455 123 789' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.phone, '0455 123 789');
  assert.equal(updated.body.name, 'Hamish Grady');
});

test('deactivating a volunteer keeps their historical assignments', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await s.post('/api/volunteers', { name: 'Nia Roberts', phone: '0400 111 222' });
  const { performanceId } = await seedProduction(s);
  const assignment = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.body.id,
    role: 'Usher',
  });
  assert.equal(assignment.status, 201);

  const deactivated = await s.post(`/api/volunteers/${volunteer.body.id}/deactivate`);
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.body.active, false);

  // Historical assignments survive; the volunteer's own view still lists them.
  const schedule = await s.get(`/api/volunteers/${volunteer.body.id}/assignments`);
  assert.equal(schedule.body.length, 1);
  assert.equal(schedule.body[0].role, 'Usher');

  // Inactive volunteers drop out of the default list but appear with ?active=all.
  const activeOnly = await s.get('/api/volunteers');
  assert.equal(activeOnly.body.length, 0);
  const all = await s.get('/api/volunteers?active=all');
  assert.equal(all.body.length, 1);
  assert.equal(all.body[0].active, false);
});

test('an inactive volunteer cannot be rostered on a new assignment', async (t) => {
  const s = await startTestServer(t);
  const volunteer = await s.post('/api/volunteers', { name: 'Col Hendricks', phone: '0400 333 444' });
  await s.post(`/api/volunteers/${volunteer.body.id}/deactivate`);
  const { performanceId } = await seedProduction(s);
  const res = await s.post(`/api/performances/${performanceId}/assignments`, {
    volunteerId: volunteer.body.id,
    role: 'Stage Manager',
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /inactive/i);
});
