const pool = require('../db/pool');
const fs = require('fs');
const path = require('path');

async function safeCleanup() {
  console.log('=== STEP 1: IDENTIFY DUMMY RECORDS & PREPARE BACKUP ===');

  // 1. Identify dummy reservations
  const dummyRes = await pool.query(
    "SELECT * FROM reservations WHERE reservation_code LIKE 'TEST-%' OR tenant_name LIKE 'Test Guest%';"
  );
  const dummyResIds = dummyRes.map(r => r.id);
  console.log(`Found ${dummyRes.length} dummy reservations:`, dummyResIds);

  // Backup child records of dummy reservations
  let paymentTxns = [];
  let bookingAuths = [];
  let statusHistory = [];
  let staffAssignments = [];
  let receipts = [];
  let receptionistLogs = [];

  if (dummyResIds.length > 0) {
    paymentTxns = await pool.query("SELECT * FROM payment_transactions WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
    bookingAuths = await pool.query("SELECT * FROM booking_authentications WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
    statusHistory = await pool.query("SELECT * FROM reservation_status_history WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
    staffAssignments = await pool.query("SELECT * FROM reservation_staff_assignments WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
    receipts = await pool.query("SELECT * FROM payment_receipts WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
    receptionistLogs = await pool.query("SELECT * FROM receptionist_activity_logs WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
  }

  // 2. Identify dummy operations & tasks
  const dummyOps = await pool.query(
    "SELECT * FROM central_operations WHERE title LIKE 'TEST-SCENARIO-%' OR operation_code LIKE 'OPS-%TEST%';"
  );
  const dummyOpIds = dummyOps.map(o => o.id);
  console.log(`Found ${dummyOps.length} dummy central operations:`, dummyOpIds);

  let dummyTasks = [];
  let dummyOpRecipients = [];
  let dummyOpEvents = [];
  let dummyMemos = [];
  let dummyTaskBlockers = [];

  if (dummyOpIds.length > 0) {
    dummyTasks = await pool.query("SELECT * FROM operational_tasks WHERE central_operation_id = ANY($1::int[]);", [dummyOpIds]);
    dummyOpRecipients = await pool.query("SELECT * FROM central_operation_recipients WHERE operation_id = ANY($1::int[]);", [dummyOpIds]);
    dummyOpEvents = await pool.query("SELECT * FROM central_operation_events WHERE operation_id = ANY($1::int[]);", [dummyOpIds]);
    dummyMemos = await pool.query("SELECT * FROM operations_memos WHERE operation_id = ANY($1::int[]);", [dummyOpIds]);
  }

  const dummyTaskIds = dummyTasks.map(t => t.id);
  if (dummyTaskIds.length > 0) {
    dummyTaskBlockers = await pool.query("SELECT * FROM task_blockers WHERE task_id = ANY($1::int[]);", [dummyTaskIds]);
  }

  // 3. Identify duplicate test [OPS] threads
  const dummyThreads = await pool.query(
    "SELECT * FROM chat_threads WHERE title LIKE '[OPS]%TEST-SCENARIO%';"
  );
  const dummyThreadIds = dummyThreads.map(t => t.id);
  console.log(`Found ${dummyThreads.length} dummy test threads:`, dummyThreadIds);

  let dummyMessages = [];
  let dummyParticipants = [];
  if (dummyThreadIds.length > 0) {
    dummyMessages = await pool.query("SELECT * FROM chat_messages WHERE thread_id = ANY($1::int[]);", [dummyThreadIds]);
    dummyParticipants = await pool.query("SELECT * FROM chat_thread_participants WHERE thread_id = ANY($1::int[]);", [dummyThreadIds]);
  }

  // Write full JSON backup file
  const backupData = {
    timestamp: new Date().toISOString(),
    dummyReservations: dummyRes,
    paymentTransactions: paymentTxns,
    bookingAuthentications: bookingAuths,
    reservationStatusHistory: statusHistory,
    reservationStaffAssignments: staffAssignments,
    paymentReceipts: receipts,
    receptionistActivityLogs: receptionistLogs,
    dummyOperations: dummyOps,
    dummyTasks: dummyTasks,
    dummyTaskBlockers: dummyTaskBlockers,
    dummyOperationRecipients: dummyOpRecipients,
    dummyOperationEvents: dummyOpEvents,
    dummyMemos: dummyMemos,
    dummyThreads: dummyThreads,
    dummyMessages: dummyMessages,
    dummyParticipants: dummyParticipants,
  };

  const backupFilePath = path.resolve(__dirname, '../db/backups/cleanup_backup_20261124.json');
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`\nSuccessfully created recoverable backup at: ${backupFilePath}`);

  console.log('\n=== STEP 2: TRANSACTIONALLY PURGE DUMMY RECORDS ===');
  await pool.withTransaction(async (conn) => {
    // 1. Delete reservation child records
    if (dummyResIds.length > 0) {
      await conn.query("DELETE FROM payment_transactions WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
      await conn.query("DELETE FROM booking_authentications WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
      await conn.query("DELETE FROM reservation_status_history WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
      await conn.query("DELETE FROM reservation_staff_assignments WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
      await conn.query("DELETE FROM payment_receipts WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
      await conn.query("DELETE FROM receptionist_activity_logs WHERE reservation_id = ANY($1::int[]);", [dummyResIds]);
      
      // Delete dummy reservations
      const delRes = await conn.query("DELETE FROM reservations WHERE id = ANY($1::int[]);", [dummyResIds]);
      console.log(`Deleted ${dummyResIds.length} dummy reservations.`);
    }

    // 2. Delete task child records & tasks
    if (dummyTaskIds.length > 0) {
      await conn.query("DELETE FROM task_blockers WHERE task_id = ANY($1::int[]);", [dummyTaskIds]);
      await conn.query("DELETE FROM operational_tasks WHERE id = ANY($1::int[]);", [dummyTaskIds]);
      console.log(`Deleted ${dummyTaskIds.length} dummy operational tasks.`);
    }

    // 3. Delete operation child records & operations
    if (dummyOpIds.length > 0) {
      await conn.query("DELETE FROM central_operation_recipients WHERE operation_id = ANY($1::int[]);", [dummyOpIds]);
      await conn.query("DELETE FROM central_operation_events WHERE operation_id = ANY($1::int[]);", [dummyOpIds]);
      await conn.query("DELETE FROM operations_memos WHERE operation_id = ANY($1::int[]);", [dummyOpIds]);
      await conn.query("DELETE FROM central_operations WHERE id = ANY($1::int[]);", [dummyOpIds]);
      console.log(`Deleted ${dummyOpIds.length} dummy central operations.`);
    }

    // 4. Delete dummy test chat threads
    if (dummyThreadIds.length > 0) {
      await conn.query("DELETE FROM chat_messages WHERE thread_id = ANY($1::int[]);", [dummyThreadIds]);
      await conn.query("DELETE FROM chat_thread_participants WHERE thread_id = ANY($1::int[]);", [dummyThreadIds]);
      await conn.query("DELETE FROM chat_threads WHERE id = ANY($1::int[]);", [dummyThreadIds]);
      console.log(`Deleted ${dummyThreadIds.length} dummy test chat threads.`);
    }
  });

  console.log('\n=== STEP 3: VERIFY INTEGRITY OF REMAINING REAL RECORDS ===');
  const remainingRes = await pool.query("SELECT id, reservation_code, tenant_name, status, total_amount FROM reservations ORDER BY id ASC;");
  console.log(`Remaining real reservations (${remainingRes.length}):`);
  remainingRes.forEach(r => console.log(`  Res #${r.id} (${r.reservation_code}) "${r.tenant_name}" [${r.status}] total=${r.total_amount}`));

  const remainingOps = await pool.query("SELECT id, operation_code, title, status FROM central_operations ORDER BY id ASC;");
  console.log(`\nRemaining real central operations (${remainingOps.length}):`);
  remainingOps.forEach(o => console.log(`  Op #${o.id} (${o.operation_code}) "${o.title}" [${o.status}]`));

  const remainingTasks = await pool.query("SELECT id, task_code, title, status FROM operational_tasks ORDER BY id ASC;");
  console.log(`\nRemaining real operational tasks (${remainingTasks.length}):`);
  remainingTasks.forEach(t => console.log(`  Task #${t.id} (${t.task_code}) "${t.title}" [${t.status}]`));

  console.log('\nDummy data cleanup completed safely and verified!');
  process.exit(0);
}

safeCleanup().catch(err => {
  console.error('Error during cleanup:', err);
  process.exit(1);
});
