// Isolated enum filtering; no production data, users, or sessions.
import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { NON_PENDING_PERMIT_STATUSES } from '../../../src/lib/pendingPermitFilter.ts';

Deno.test('pending counts include submitted, under_review, and future pending roles, not rework or settled permits', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TYPE permit_status AS ENUM ('draft','submitted','under_review','pending_new_department','rework_needed','approved','rejected','closed','cancelled','superseded');
      CREATE TABLE permits (status permit_status);
      INSERT INTO permits SELECT unnest(enum_range(NULL::permit_status));`);
    const excluded = NON_PENDING_PERMIT_STATUSES.map(status => `'${status}'`).join(',');
    const result = await db.query(`SELECT status FROM permits WHERE status NOT IN (${excluded}) ORDER BY status`);
    assertEquals(result.rows, [{status:'submitted'},{status:'under_review'},{status:'pending_new_department'}]);
  } finally { await db.close(); }
});