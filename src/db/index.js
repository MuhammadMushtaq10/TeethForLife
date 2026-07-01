import 'reflect-metadata';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource } from 'typeorm';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import Patient from '../entities/Patient.js';
import Service from '../entities/Service.js';
import Appointment from '../entities/Appointment.js';
import Review from '../entities/Review.js';
import Treatment from '../entities/Treatment.js';
import Invoice from '../entities/Invoice.js';
import Payment from '../entities/Payment.js';
import Expense from '../entities/Expense.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isLambda = !!process.env.DATABASE_URL;

const entities = [Patient, Service, Appointment, Review, Treatment, Invoice, Payment, Expense];
const migrations = [__dirname + '/../migrations/*-*.js'];

// The "test" admin account works against a separate Postgres SCHEMA ("test") in
// the SAME database, so its data is fully isolated from the live clinic data in
// `public` — no second database/project needed. For the test DataSource we pin
// the connection search_path so BOTH TypeORM-generated queries and the raw SQL
// in services resolve to that schema. `extensions` is included so uuid-ossp /
// pgcrypto (which live there on Supabase) still resolve.
function buildOptions(schema) {
  const opts = {
    type: 'postgres',
    url: isLambda ? process.env.DATABASE_URL : undefined,
    host: !isLambda ? (process.env.DB_HOST || '127.0.0.1') : undefined,
    port: !isLambda ? parseInt(process.env.DB_PORT || '5432') : undefined,
    username: !isLambda ? (process.env.DB_USERNAME || 'postgres') : undefined,
    password: !isLambda ? (process.env.DB_PASSWORD || undefined) : undefined,
    database: !isLambda ? (process.env.DB_NAME || 'TeethForLife1') : undefined,
    synchronize: false,
    logging: process.env.NODE_ENV !== 'production',
    entities,
    migrations,
    ssl: isLambda ? { rejectUnauthorized: false } : false,
    extra: {
      max: 1,
      idleTimeoutMillis: 120000,
      connectionTimeoutMillis: 10000,
    },
  };
  if (schema) {
    opts.schema = schema;
    opts.extra = { ...opts.extra, options: `-c search_path=${schema},public,extensions` };
  }
  return opts;
}

// Live clinic data (public schema) — used by public routes, the live admin,
// migrations and the automated tests.
const liveDataSource = new DataSource(buildOptions(undefined));
// Isolated sandbox for the test admin (the `test` schema in the same database).
const testDataSource = new DataSource(buildOptions('test'));

// Holds the DataSource for the current request, set by the admin auth middleware
// based on the JWT `mode`. Falls back to live when there is no request context
// (public routes, migration runner, tests).
const dbContext = new AsyncLocalStorage();
function currentDataSource() {
  return dbContext.getStore() || liveDataSource;
}

// Transparent handle used across the app as `AppDataSource.*`. It forwards every
// access to the request's DataSource (live or test), so services need no change.
const AppDataSource = new Proxy(Object.create(null), {
  get(_target, prop) {
    const ds = currentDataSource();
    const value = ds[prop];
    return typeof value === 'function' ? value.bind(ds) : value;
  },
  set(_target, prop, value) {
    currentDataSource()[prop] = value;
    return true;
  },
});

export { AppDataSource, liveDataSource, testDataSource, dbContext };
