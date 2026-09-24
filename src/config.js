'use strict';

/**
 * Application configuration, read from environment variables so that the
 * development, test and production environments stay separated. Every value
 * has a sensible default; the full list of supported variables is documented
 * in .env.example. No secrets live in this file.
 *
 * dotenv loads an optional .env file for local development; the application
 * runs from a clean checkout without one (defaults apply), which keeps the
 * README-only setup promise.
 *
 * @module config
 */

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'tinshed.db'),
};

module.exports = config;
