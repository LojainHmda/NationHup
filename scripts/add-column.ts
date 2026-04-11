import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log('Adding items_removed_by_staff column to orders table...');
  await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_removed_by_staff jsonb DEFAULT '[]'`;
  console.log('SUCCESS: column added (or already existed)');
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});
