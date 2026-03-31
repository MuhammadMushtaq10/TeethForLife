import 'dotenv/config';
import { AppDataSource } from '../db/index.js';

async function runMigrations() {
  try {
    await AppDataSource.initialize();
    console.log('Database connected.');

    console.log('Running migrations...');
    const migrations = await AppDataSource.runMigrations();

    if (migrations.length === 0) {
      console.log('No new migrations to run.');
    } else {
      migrations.forEach(m => console.log(`  ✓ ${m.name}`));
      console.log(`${migrations.length} migration(s) executed successfully.`);
    }

    await AppDataSource.destroy();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigrations();
