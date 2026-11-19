/**
 * Domain 3: Reservations Integration Tests
 * TASK AIVEN-05: Live Aiven PostgreSQL
 */

const { setEngineOverride, clearEngineOverride, withTransaction, query, closePool } = require('../src/db/pool');
const ReservationsRepository = require('../src/modules/reservations/reservations.repository');
const ReservationsService = require('../src/modules/reservations/reservations.service');

describe('Domain 3: Reservations on PostgreSQL (TASK AIVEN-05)', () => {
  beforeAll(() => {
    setEngineOverride('postgres');
  });

  afterAll(async () => {
    clearEngineOverride();
    await closePool();
  });

  test('1. ReservationsRepository.findAll returns seeded reservations with joins and calculated balance', async () => {
    const reservations = await ReservationsRepository.findAll();
    expect(Array.isArray(reservations)).toBe(true);
    expect(reservations.length).toBeGreaterThanOrEqual(2);

    const first = reservations[0];
    expect(first.reservation_code).toBeDefined();
    expect(first.property_name).toBeDefined();
    expect(first.unit_number).toBeDefined();
    expect(first.outstanding_balance).toBeDefined();
  });

  test('2. ReservationsRepository.findById retrieves single reservation with joins', async () => {
    const res = await ReservationsRepository.findById(1);
    expect(res).toBeDefined();
    expect(res.id).toBe(1);
    expect(res.property_code).toBeDefined();
    expect(res.unit_number).toBeDefined();
  });

  test('3. One-Night stay rule validation verifies exact 1-night boundaries', () => {
    // Valid 1-night stay
    const valid = ReservationsService.validateOneNightStay('2026-12-01', '2026-12-02');
    expect(valid.checkInDate).toBe('2026-12-01');
    expect(valid.checkOutDate).toBe('2026-12-02');

    // Reject > 1 night (unless multi-night support is authorized)
    expect(() => {
      ReservationsService.validateOneNightStay('2026-12-01', '2026-12-05');
    }).toThrow('strictly limited to a maximum of 1 night');
  });

  test('4. Concurrency row-locking availability check (FOR UPDATE) executes inside transaction', async () => {
    await withTransaction(async (conn) => {
      const isAvailable = await ReservationsRepository.checkAvailabilityWithLock(conn, 1, '2026-12-25');
      expect(typeof isAvailable).toBe('boolean');
    });
  });

  test('5. Isolated Transactional Reservation Creation & Conflict Detection with Rollback', async () => {
    const resCode = `RES-TEST-${Date.now().toString().slice(-6)}`;
    const checkIn = '2026-12-15';
    const checkOut = '2026-12-16';

    try {
      await withTransaction(async (conn) => {
        // 1. Lock apartment unit row
        const [aptRows] = await conn.query('SELECT * FROM apartments WHERE id = 1 FOR UPDATE');
        expect(aptRows.length).toBe(1);

        // 2. Insert reservation inside transaction
        const [insertRes] = await conn.query(
          `INSERT INTO reservations 
           (reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone,
            check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
           VALUES (?, 1, 1, 'Test Tenant', 'tenant@test.invalid', '08012345678', ?, ?, 1, 150000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING')`,
          [resCode, checkIn, checkOut]
        );

        const newResId = insertRes.insertId;
        expect(newResId).toBeDefined();
        expect(newResId).toBeGreaterThan(0);

        // 3. Verify availability check NOW reports unavailable inside this transaction
        const isAvailInside = await ReservationsRepository.checkAvailabilityWithLock(conn, 1, checkIn);
        expect(isAvailInside).toBe(false);

        // 4. Rollback
        throw new Error('ROLLBACK_RES_TXN');
      });
    } catch (err) {
      if (!err.message.includes('ROLLBACK_RES_TXN')) throw err;
    }

    // Verify reservation was not committed outside transaction
    const check = await query('SELECT * FROM reservations WHERE reservation_code = ?', [resCode]);
    expect(check.length).toBe(0);

    // Verify unit is available outside transaction
    const isAvailAfter = await ReservationsRepository.checkAvailability(1, checkIn);
    expect(isAvailAfter).toBe(true);
  });
});
