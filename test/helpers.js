'use strict';

/**
 * Test helpers: boot an isolated app instance over an in-memory database and
 * expose a small fetch-based client for the API tests.
 *
 * @module test/helpers
 */

const { createDb } = require('../src/db');
const createApp = require('../src/app');

async function startTestServer(t) {
  const db = createDb(':memory:');
  const app = createApp(db);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const api = async (method, path, body) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, body: data };
  };

  t.after(() => {
    server.close();
    db.close();
  });

  return {
    db,
    api,
    get: (path) => api('GET', path),
    post: (path, body) => api('POST', path, body),
    put: (path, body) => api('PUT', path, body),
    del: (path) => api('DELETE', path),
  };
}

/** Create a production with one performance and return both ids. */
async function seedProduction(testCtx, { title = 'The Weather House', date = '2026-09-04', startTime = '19:30', callTemplate = 'evening' } = {}) {
  const created = await testCtx.post('/api/productions', { title });
  const perf = await testCtx.post(`/api/productions/${created.body.id}/performances`, {
    date,
    startTime,
    callTemplate,
  });
  return { productionId: created.body.id, performanceId: perf.body.id };
}

async function seedVolunteer(testCtx, { name = 'Marion D\u2019Souza', phone = '0400 000 000' } = {}) {
  const created = await testCtx.post('/api/volunteers', { name, phone });
  return created.body;
}

module.exports = { startTestServer, seedProduction, seedVolunteer };
