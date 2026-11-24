const pool = require('../db/pool');

async function investigate() {
  console.log('=== 1. CHAT THREADS INVESTIGATION ===');
  const threads = await pool.query("SELECT id, title, thread_type, status, created_at FROM chat_threads ORDER BY id ASC;");
  console.log(`Total chat threads: ${threads.length}`);
  threads.forEach(t => console.log(`  Thread #${t.id} [${t.thread_type}] title="${t.title}" status=${t.status}`));

  console.log('\n=== 2. CENTRAL OPERATIONS & TASKS INVESTIGATION ===');
  const ops = await pool.query("SELECT id, operation_code, title, category, priority, status, initiated_by_user_id, current_responsible_user_id, created_at FROM central_operations ORDER BY id ASC;");
  console.log(`Total central operations: ${ops.length}`);
  ops.forEach(o => console.log(`  Op #${o.id} (${o.operation_code}) "${o.title}" [status=${o.status}, initBy=${o.initiated_by_user_id}, respUser=${o.current_responsible_user_id}]`));

  const tasks = await pool.query("SELECT id, task_code, title, assigned_to_id, assigned_by_id, status, central_operation_id FROM operational_tasks ORDER BY id ASC;");
  console.log(`Total operational tasks: ${tasks.length}`);
  tasks.forEach(t => console.log(`  Task #${t.id} (${t.task_code}) "${t.title}" [status=${t.status}, assignedTo=${t.assigned_to_id}, opId=${t.central_operation_id}]`));

  console.log('\n=== 3. RESERVATIONS / BOOKINGS INVESTIGATION ===');
  const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'reservations' ORDER BY ordinal_position;");
  console.log('Reservations columns:', cols.map(c => c.column_name).join(', '));

  const bookings = await pool.query(`
    SELECT r.*, g.first_name, g.last_name, g.email
    FROM reservations r
    LEFT JOIN guests g ON r.guest_id = g.id
    ORDER BY r.id ASC;
  `);
  console.log(`Total reservations: ${bookings.length}`);
  bookings.forEach(b => {
    console.log(`  Booking #${b.id} guest="${b.first_name} ${b.last_name}" <${b.email}> dates=${b.check_in_date || b.check_in} to ${b.check_out_date || b.check_out} status=${b.status} apt=${b.apartment_id} prop=${b.property_id} amount=${b.total_amount || b.total_price}`);
  });

  process.exit(0);
}

investigate().catch(err => {
  console.error('Investigation error:', err);
  process.exit(1);
});
