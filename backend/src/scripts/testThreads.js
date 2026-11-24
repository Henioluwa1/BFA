const ChatRepository = require('../modules/chat/chat.repository');

async function testThreads() {
  console.log('Testing getUserThreads for David Kalu (STAFF)...');
  const staffThreads = await ChatRepository.getUserThreads(5, 'STAFF', 1);
  console.log(`Staff threads count: ${staffThreads.length}`);
  const hasGeneralStaff = staffThreads.find(t => t.title === 'General Group');
  console.log('Staff has General Group:', Boolean(hasGeneralStaff), hasGeneralStaff ? `Thread #${hasGeneralStaff.id}` : '');

  console.log('\nTesting getUserThreads for Marcus Vance (MANAGER)...');
  const mgrThreads = await ChatRepository.getUserThreads(3, 'MANAGER', 1);
  console.log(`Manager threads count: ${mgrThreads.length}`);
  const hasGeneralMgr = mgrThreads.find(t => t.title === 'General Group');
  console.log('Manager has General Group:', Boolean(hasGeneralMgr), hasGeneralMgr ? `Thread #${hasGeneralMgr.id}` : '');

  process.exit(0);
}

testThreads().catch(err => {
  console.error(err);
  process.exit(1);
});
