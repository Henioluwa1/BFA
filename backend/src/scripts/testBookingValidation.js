const ReservationsService = require('../modules/reservations/reservations.service');

async function testBookingValidation() {
  console.log('1. Testing booking submission with missing guest name...');
  try {
    await ReservationsService.createReservation({
      tenant_name: '',
      tenant_email: 'john@example.com',
      tenant_phone: '+2348012345678',
      apartment_id: 1,
      property_id: 1,
      check_in_date: '2026-12-01',
      check_out_date: '2026-12-02',
    });
    console.error('FAIL: Submission without name was accepted!');
    process.exit(1);
  } catch (err) {
    console.log('SUCCESS: Rejected properly:', err.message);
  }

  console.log('\n2. Testing booking submission with single-word name...');
  try {
    await ReservationsService.createReservation({
      tenant_name: 'Cher',
      tenant_email: 'cher@example.com',
      tenant_phone: '+2348012345678',
      apartment_id: 1,
      property_id: 1,
      check_in_date: '2026-12-01',
      check_out_date: '2026-12-02',
    });
    console.error('FAIL: Submission with single-word name was accepted!');
    process.exit(1);
  } catch (err) {
    console.log('SUCCESS: Rejected properly:', err.message);
  }

  console.log('\n3. Testing booking submission with invalid email...');
  try {
    await ReservationsService.createReservation({
      tenant_name: 'John Doe',
      tenant_email: 'invalid-email',
      tenant_phone: '+2348012345678',
      apartment_id: 1,
      property_id: 1,
      check_in_date: '2026-12-01',
      check_out_date: '2026-12-02',
    });
    console.error('FAIL: Submission with invalid email was accepted!');
    process.exit(1);
  } catch (err) {
    console.log('SUCCESS: Rejected properly:', err.message);
  }

  console.log('\nAll booking validation tests passed!');
  process.exit(0);
}

testBookingValidation().catch(err => {
  console.error('Error in test:', err);
  process.exit(1);
});
