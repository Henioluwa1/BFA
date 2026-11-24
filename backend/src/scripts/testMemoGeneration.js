const CentralOperationsService = require('../modules/workforce/centralOperations.service');
const fs = require('fs');
const path = require('path');

async function testMemo() {
  const adminUser = { id: 1, role: 'SUPER_ADMIN', name: 'Super Admin' };
  console.log('Testing getMemoPdfBuffer for Operation #2...');
  
  const result = await CentralOperationsService.getMemoPdfBuffer(adminUser, null, 2);
  console.log('Result file name:', result.fileName);
  console.log('Result buffer length:', result.buffer.length);
  console.log('Result buffer header:', result.buffer.slice(0, 10).toString('utf-8'));

  const outputPath = path.resolve(__dirname, 'test_output_memo_2.pdf');
  fs.writeFileSync(outputPath, result.buffer);
  console.log('Saved test PDF to:', outputPath);

  process.exit(0);
}

testMemo().catch(err => {
  console.error('Memo generation error:', err);
  process.exit(1);
});
