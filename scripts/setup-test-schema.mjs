// Provisions the isolated "test" sandbox for the test admin account.
//
// It creates a `test` schema in the SAME database as the live clinic data and
// runs every migration into it, giving the test admin a full, empty copy of the
// schema (tables, enums, indexes, FKs + the 8 seeded services). Live data in the
// `public` schema is never touched.
//
// Safe to re-run (idempotent). Run once per environment you want the sandbox on:
//   npm run test-schema:setup                 # local dev DB
//   DATABASE_URL=... npm run test-schema:setup # Supabase / production DB
import 'dotenv/config';
import { liveDataSource, testDataSource } from '../src/db/index.js';

async function main() {
  // 1. Create the schema via the live (public) connection.
  await liveDataSource.initialize();
  await liveDataSource.query('CREATE SCHEMA IF NOT EXISTS test');
  console.log('Ensured schema "test" exists.');
  await liveDataSource.destroy();

  // 2. Run migrations INTO the test schema. The test DataSource pins its
  //    search_path to `test`, so the unqualified DDL lands there.
  await testDataSource.initialize();
  console.log('Connected to the test schema. Running migrations...');
  const applied = await testDataSource.runMigrations();
  if (applied.length === 0) {
    console.log('Test schema already up to date.');
  } else {
    applied.forEach((m) => console.log(`  ✓ ${m.name}`));
    console.log(`${applied.length} migration(s) applied to the test schema.`);
  }
  await testDataSource.destroy();
  console.log('Test sandbox ready. The test admin can now log in and make entries safely.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test-schema setup failed:', err);
    process.exit(1);
  });
