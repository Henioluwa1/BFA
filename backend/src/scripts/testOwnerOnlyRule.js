const CentralOperationsService = require('../modules/workforce/centralOperations.service');

async function testRules() {
  const manager = { id: 3, role: 'MANAGER', name: 'Marcus Vance' };
  const admin = { id: 2, role: 'ADMIN', name: 'Sarah Jenkins' };
  const owner = { id: 7, role: 'OWNER', name: 'Chief Emeka BFA' };

  console.log('1. Testing Manager creating group operation (should be REJECTED)...');
  try {
    await CentralOperationsService.assertRoutingMatrix(manager, 'PROPERTY_ALL', 1, []);
    console.error('FAIL: Manager was allowed to create group operation!');
    process.exit(1);
  } catch (err) {
    console.log('SUCCESS: Manager blocked with message:', err.message);
  }

  console.log('\n2. Testing Admin creating group operation (should be REJECTED)...');
  try {
    await CentralOperationsService.assertRoutingMatrix(admin, 'PROPERTY_ALL', 1, []);
    console.error('FAIL: Admin was allowed to create group operation!');
    process.exit(1);
  } catch (err) {
    console.log('SUCCESS: Admin blocked with message:', err.message);
  }

  console.log('\n3. Testing Admin creating multi-recipient operation (should be REJECTED)...');
  try {
    await CentralOperationsService.assertRoutingMatrix(admin, 'SPECIFIC_USER', 1, [3, 4]);
    console.error('FAIL: Admin was allowed multi-recipients!');
    process.exit(1);
  } catch (err) {
    console.log('SUCCESS: Admin multi-recipients blocked with message:', err.message);
  }

  console.log('\n4. Testing Owner creating group operation targeting Admin and Manager (should SUCCEED)...');
  try {
    await CentralOperationsService.assertRoutingMatrix(owner, 'ROLE_GROUP', null, [2, 3]);
    console.log('SUCCESS: Owner permitted to create group operation for Admin and Manager!');
  } catch (err) {
    console.error('FAIL: Owner was blocked:', err.message);
    process.exit(1);
  }

  console.log('\nAll governance routing matrix tests passed perfectly!');
  process.exit(0);
}

testRules().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
