// Creates the isolated test database (if missing) and runs all migrations against
// it. Safe to re-run. Invoked by `npm run test:setup` (and `test:all`).
import './env.mjs';
import pg from 'pg';

const dbName = process.env.DB_NAME;

const admin = new pg.Client({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD,
  database: 'postgres',
});

await admin.connect();
const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (rowCount === 0) {
  await admin.query(`CREATE DATABASE "${dbName}"`);
  console.log(`Created test database "${dbName}".`);
} else {
  console.log(`Test database "${dbName}" already exists.`);
}
await admin.end();

// Run migrations against the test DB.
const { AppDataSource } = await import('../src/db/index.js');
await AppDataSource.initialize();
const applied = await AppDataSource.runMigrations();
console.log(`Migrations applied: ${applied.length === 0 ? '(already up to date)' : applied.map((m) => m.name).join(', ')}`);
await AppDataSource.destroy();
