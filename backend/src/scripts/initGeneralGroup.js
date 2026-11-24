const ChatRepository = require('../modules/chat/chat.repository');

async function init() {
  console.log('Ensuring permanent General Group exists...');
  const group = await ChatRepository.getOrCreateGeneralGroupThread();
  console.log('General Group Thread:', group);
  process.exit(0);
}

init().catch(err => {
  console.error('Error ensuring General Group:', err);
  process.exit(1);
});
