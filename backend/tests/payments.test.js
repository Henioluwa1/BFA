const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Payment Control & Transaction Engine Tests', () => {
  let adminToken = '';
  let testReservationId = null;

  beforeAll(async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = loginRes.body.data.token;

    // Create a dedicated test reservation for payment tests
    const res = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status, payment_method)
       VALUES ('BFA-TEST-PAY-001', 1, 2, 'Payment Tester', 'tester.pay@example.com', '+234 801 234 5678', '2028-06-01', '2028-06-02', 1, 150000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING', 'CARD')`
    );
    testReservationId = res.insertId;
  });

  afterAll(async () => {
    if (testReservationId) {
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [testReservationId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [testReservationId]);
    }
    // Ensure PAY_AT_PROPERTY is enabled
    await pool.query(
      "UPDATE capabilities SET is_enabled = 1, restriction_level = 'NONE', restricted_by_role = NULL WHERE name = 'PAY_AT_PROPERTY'"
    );
    await pool.closePool();
  });

  test('1. Get payment gateways returns supported channels', async () => {
    const res = await request(app)
      .get('/api/v1/payments/gateways')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((g) => g.method === 'CARD')).toBe(true);
    expect(res.body.data.some((g) => g.method === 'BANK_TRANSFER')).toBe(true);
  });

  test('2. Process online payment (CARD) updates reservation payment_status to PAYMENT_SUCCESS', async () => {
    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reservationId: testReservationId,
        paymentMethod: 'CARD',
        amount: 150000.00,
        currency: 'NGN',
        provider: 'PAYSTACK_MOCK',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(['SUCCESS', 'PAYMENT_SUCCESS']).toContain(res.body.data.status);
    expect(res.body.data.transactionReference).toBeDefined();

    // Verify reservation in DB
    const [updated] = await pool.query('SELECT payment_status, paid_amount FROM reservations WHERE id = ?', [testReservationId]);
    expect(updated.payment_status).toBe('PAYMENT_SUCCESS');
    expect(parseFloat(updated.paid_amount)).toBe(150000.00);
  });

  test('3. Duplicate payment on already fully-paid reservation is rejected with 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reservationId: testReservationId,
        paymentMethod: 'CARD',
        amount: 150000.00,
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('already been fully paid');
  });

  test('4. PAY_AT_PROPERTY capability restriction rejects pay at property selection', async () => {
    // Disable PAY_AT_PROPERTY capability and clear any active overrides
    await pool.query('UPDATE access_overrides SET is_active = 0');
    await pool.query(
      "UPDATE capabilities SET is_enabled = 0, restriction_level = 'OWNER_RESTRICTED', restricted_by_role = 'OWNER', restriction_reason = 'Cashless policy' WHERE name = 'PAY_AT_PROPERTY'"
    );

    const testCode = `BFA-TPAY-${Date.now().toString(36).toUpperCase()}`;
    const r = await pool.query(
      `INSERT INTO reservations 
       (reservation_code, property_id, apartment_id, tenant_name, tenant_email, tenant_phone, check_in_date, check_out_date, nights, total_amount, paid_amount, status, payment_status)
       VALUES (?, 1, 2, 'Cashless Tester', 'cashless@example.com', '+234 801 234 9999', '2028-07-01', '2028-07-02', 1, 80000.00, 0.00, 'CONFIRMED', 'PAYMENT_PENDING')`,
      [testCode]
    );
    const newResId = r.insertId;

    const res = await request(app)
      .post('/api/v1/payments/process')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reservationId: newResId,
        paymentMethod: 'PAY_AT_PROPERTY',
        amount: 80000.00,
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Pay at Property is currently disabled');

    // Clean up
    await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [newResId]);
    await pool.query('DELETE FROM reservations WHERE id = ?', [newResId]);
  });
});
