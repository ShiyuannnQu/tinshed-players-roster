'use strict';

/**
 * Express application factory.
 *
 * The app is built by a factory that receives a database handle so the tests
 * can construct an isolated instance over an in-memory database, while the
 * real server (src/server.js) wires in the file-backed database from
 * src/config.js.
 *
 * @module app
 */

const path = require('node:path');
const express = require('express');
const volunteersRouter = require('./routes/volunteers');
const productionsRouter = require('./routes/productions');
const assignmentsRouter = require('./routes/assignments');
const rosterRouter = require('./routes/roster');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'tinshed-crew-roster' });
  });

  app.use('/api/volunteers', volunteersRouter(db));
  app.use('/api/productions', productionsRouter(db));
  app.use('/api', assignmentsRouter(db));
  app.use('/api', rosterRouter(db));

  // JSON error handler: unknown routes get a clean 404, unexpected failures a 500.
  app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}

module.exports = createApp;
