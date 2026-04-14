import { initDb } from '../db.js';
import { runDatabaseMigrations } from '../db-migrations.js';

async function main() {
  const ready = await initDb();

  if (!ready) {
    console.log('Migration skipped: database is not available or DATABASE_URL is missing.');
    process.exit(0);
  }

  const summary = await runDatabaseMigrations();

  console.log(
    `Migration summary: applied=${summary.applied?.length || 0}, skipped=${summary.unchanged?.length || 0}, failed=${summary.failed || 0}`
  );

  if ((summary.failedSteps || []).length > 0) {
    for (const step of summary.failedSteps) {
      console.log(`Failed step: ${step.step} -> ${step.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
