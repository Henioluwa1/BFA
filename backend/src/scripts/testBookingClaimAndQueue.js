/**
 * Test Suite: Receptionist Booking Claim & Concurrency Verification
 * Validates:
 * 1. Resolving the HTTP 500 error on booking claim (is_active boolean / type compatibility)
 * 2. Concurrency-safe atomic assignment (one wins, second gets 409 Conflict)
 * 3. Property scope enforcement & receptionist assignment audit trail
 */
const assert = require('assert');
const pool = require('../db/pool');
const ReservationsService = require('../modules/reservations/reservations.service');
const FrontOfficeService = require('../modules/frontOffice/frontOffice.service');

async function runTests() {
  console.log('[TEST]: Starting Receptionist Booking Claim & Queue Verification...');

  // Setup: Find or create a pending reservation for testing
  const resCode = `TEST-CLAIM-${Date.now()}`;
  const insertRes = await pool.query(
    `INSERT INTO reservations (
       reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone,
       check_in_date, check_out_date, nights, total_amount, paid_amount, status, created_at, updated_at
     ) VALUES (
       ?, 1, 1, 'Test Guest Concurrency', 'concurrency@test.com', '+2348000000099',
       '2027-01-10', '2027-01-11', 1, 85000.00, 0.00, 'PENDING_REVIEW', NOW(), NOW()
     )`,
    [resCode]
  );

  const reservationId = insertRes.insertId;
  console.log(`[TEST]: Created test reservation ID ${reservationId} (${resCode})`);

  try {
    // 1. Verify getUnclaimedBookings includes our new booking
    const receptionistUser = { id: 4, name: 'Elena Ramos', role: 'RECEPTIONIST', propertyId: 1 };
    const mockReq = { user: receptionistUser, id: 'req-test-1' };

    const unclaimed = await FrontOfficeService.getUnclaimedBookings({}, mockReq);
    const found = unclaimed.find((b) => b.id === reservationId);
    assert(found, 'Test reservation should be present in unclaimed bookings');
    console.log('[TEST PASS]: getUnclaimedBookings returns pending reservation.');

    // 2. Concurrency Test: Simulate two receptionists trying to claim the exact same reservation simultaneously
    const receptionistA = { user: { id: 4, name: 'Elena Ramos', role: 'RECEPTIONIST', propertyId: 1 }, id: 'req-rec-a' };
    const receptionistB = { user: { id: 1, name: 'Admin Backup', role: 'SUPER_ADMIN', propertyId: 1 }, id: 'req-rec-b' };

    console.log('[TEST]: Executing simultaneous claim race condition...');
    const results = await Promise.allSettled([
      ReservationsService.claimReservation(reservationId, receptionistA),
      ReservationsService.claimReservation(reservationId, receptionistB),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    console.log(`[TEST]: Concurrent claims outcome: ${fulfilled.length} succeeded, ${rejected.length} rejected.`);
    assert.strictEqual(fulfilled.length, 1, 'Exactly one receptionist claim must succeed.');
    assert.strictEqual(rejected.length, 1, 'The competing claim must be rejected.');
    assert(
      rejected[0].reason.message.includes('One client cannot be assigned to two front desk staffs') ||
      rejected[0].reason.message.includes('already been accepted'),
      `Rejection message must indicate concurrency conflict: ${rejected[0].reason.message}`
    );
    console.log(`[TEST PASS]: Concurrency conflict cleanly rejected with message: "${rejected[0].reason.message}"`);

    // 3. Verify database state
    const dbRows = await pool.query('SELECT * FROM reservations WHERE id = ?', [reservationId]);
    const updatedRes = dbRows[0];
    assert.strictEqual(updatedRes.status, 'CLAIMED', 'Reservation status must be CLAIMED');
    assert(updatedRes.assigned_staff_id, 'Assigned staff ID must be populated');
    console.log(`[TEST PASS]: Reservation is claimed and assigned to staff #${updatedRes.assigned_staff_id}`);

    // 4. Verify reservation_staff_assignments table has an active record with boolean is_active = TRUE
    const assignRows = await pool.query(
      'SELECT * FROM reservation_staff_assignments WHERE reservation_id = ? AND is_active = TRUE',
      [reservationId]
    );
    assert(assignRows.length >= 1, 'reservation_staff_assignments must have active assignment record');
    assert.strictEqual(assignRows[0].service_status, 'CLAIMED');
    console.log('[TEST PASS]: reservation_staff_assignments audit row recorded with is_active = TRUE.');

    // 5. Verify unclaimed bookings now excludes this claimed booking
    const unclaimedAfter = await FrontOfficeService.getUnclaimedBookings({}, mockReq);
    const foundAfter = unclaimedAfter.find((b) => b.id === reservationId);
    assert(!foundAfter, 'Claimed reservation must no longer appear in unclaimed queue');
    console.log('[TEST PASS]: Claimed reservation immediately removed from unclaimed queue.');

  } finally {
    // Cleanup test data
    await pool.query('DELETE FROM reservation_staff_assignments WHERE reservation_id = ?', [reservationId]);
    await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [reservationId]);
    await pool.query('DELETE FROM reservations WHERE id = ?', [reservationId]);
    console.log(`[TEST]: Cleaned up test reservation ID ${reservationId}.`);
  }

  console.log('✅ ALL BACKEND BOOKING CLAIM & CONCURRENCY TESTS PASSED SUCCESSFULLY!');
}

if (require.main === module) {
  runTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ TEST FAILED:', err);
      process.exit(1);
    });
}

module.exports = runTests;
