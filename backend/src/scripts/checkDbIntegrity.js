const pool = require('../db/pool');

async function run() {
  const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'chat_threads' ORDER BY ordinal_position;");
  console.log('chat_threads columns:', cols.map(c => `${c.column_name} (${c.data_type})`).join(', '));
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
