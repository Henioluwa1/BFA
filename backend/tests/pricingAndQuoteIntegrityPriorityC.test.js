const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const PricingService = require('../src/modules/pricing/pricing.service');

describe('Priority C: Booking, Pricing & Authoritative Quote Integrity Tests', () => {
  let createdReservationIds = [];

  beforeAll(async () => {
    const cleanSql = 'SELECT id FROM reservations WHERE tenant_email LIKE "%@example.com"';
    const oldRows = await pool.query(cleanSql);
    const oldIds = (oldRows || []).map((r) => r.id);
    if (oldIds.length > 0) {
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id IN (?)', [oldIds]);
      await pool.query('DELETE FROM reservation_status_history WHERE reservation_id IN (?)', [oldIds]);
      await pool.query('DELETE FROM reservations WHERE id IN (?)', [oldIds]);
    }
  });

  afterAll(async () => {
    for (const id of createdReservationIds) {
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [id]);
      await pool.query('DELETE FROM reservation_status_history WHERE reservation_id = ?', [id]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [id]);
    }
  });

  test('1. POST /api/v1/public/quote: Successfully generates authoritative quote and signed HMAC token', async () => {
    const res = await request(app)
      .post('/api/v1/public/quote')
      .send({
        apartmentId: 1,
        checkInDate: '2026-12-01',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toHaveProperty('quoteToken');
    expect(data).toHaveProperty('breakdown');
    expect(data.breakdown).toHaveProperty('baseRate');
    expect(data.breakdown.nights).toBe(1);
    expect(data.breakdown).toHaveProperty('totalAmount');
    expect(data).toHaveProperty('expiresInSeconds', 900);
    expect(typeof data.quoteToken).toBe('string');
  });

  test('2. 1-Night Stay Constraint: Multi-night quote request (> 1 night) is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/public/quote')
      .send({
        apartmentId: 1,
        checkInDate: '2026-12-01',
        checkOutDate: '2026-12-03', // 2 nights
      });

    expect([400, 422]).toContain(res.status);
    expect(res.body.success).toBe(false);
    const errMsg = res.body.error?.message || res.body.message || '';
    expect(errMsg).toContain('1-night maximum stay');
  });

  test('3. Cryptographic quoteToken verification & anti-tamper security', () => {
    expect(typeof PricingService.verifyQuoteToken).toBe('function');

    // Tampered token test
    const fakeToken = Buffer.from(JSON.stringify({
      payload: {
        apartmentId: 1,
        propertyId: 1,
        checkInDate: '2026-12-01',
        checkOutDate: '2026-12-02',
        totalAmount: 1.00, // Attempted price manipulation
        expiresAt: Date.now() + 900000,
      },
      signature: 'deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef',
    })).toString('base64url');

    expect(() => PricingService.verifyQuoteToken(fakeToken)).toThrow(/signature is invalid/);
  });

  test('4. Expired quoteToken is rejected', () => {
    const expiredPayload = {
      apartmentId: 1,
      propertyId: 1,
      checkInDate: '2026-12-01',
      checkOutDate: '2026-12-02',
      totalAmount: 50000.00,
      expiresAt: Date.now() - 1000, // expired 1s ago
    };
    const crypto = require('crypto');
    const config = require('../src/config');
    const rawString = `${expiredPayload.apartmentId}|${expiredPayload.propertyId}|${expiredPayload.checkInDate}|${expiredPayload.checkOutDate}|${expiredPayload.totalAmount.toFixed(2)}|${expiredPayload.expiresAt}`;
    const signature = crypto.createHmac('sha256', config.security.jwtSecret).update(rawString).digest('hex');
    const token = Buffer.from(JSON.stringify({ payload: expiredPayload, signature })).toString('base64url');

    expect(() => PricingService.verifyQuoteToken(token)).toThrow(/expired/);
  });

  test('5. Public Booking with Authoritative Quote: Prevents price tampering', async () => {
    // Step 1: Obtain legitimate quote
    const quoteRes = await request(app)
      .post('/api/v1/public/quote')
      .send({
        apartmentId: 1,
        checkInDate: '2026-12-05',
      });
    expect(quoteRes.status).toBe(200);
    const { quoteToken, breakdown } = quoteRes.body.data;

    // Step 2: Submit booking with quoteToken, attempting to maliciously pass total_amount = 5.00
    const bookRes = await request(app)
      .post('/api/v1/public/booking')
      .send({
        apartmentId: 1,
        checkInDate: '2026-12-05',
        guestName: 'Integrity Tester',
        guestEmail: 'integrity.tester@example.com',
        guestPhone: '+2348011223344',
        paymentOption: 'PAY_ONLINE',
        paymentMethod: 'CARD',
        quoteToken,
        total_amount: 5.00, // Malicious override attempt
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body.success).toBe(true);
    const booking = bookRes.body.data;
    createdReservationIds.push(booking.id);

    // Assert that the total amount stored matches the authoritative quote, NOT the spoofed 5.00
    expect(parseFloat(booking.totalAmount)).toBe(parseFloat(breakdown.totalAmount));
    expect(parseFloat(booking.totalAmount)).not.toBe(5.00);

    // Verify notes contain immutable price_snapshot
    const resRows = await pool.query('SELECT notes FROM reservations WHERE id = ?', [booking.id]);
    expect(resRows[0].notes).toContain('price_snapshot');
  });

  test('6. Unverified Bank Transfer Hold: Keeps status PENDING without premature ledger balance', async () => {
    // Step 1: Obtain legitimate quote
    const quoteRes = await request(app)
      .post('/api/v1/public/quote')
      .send({
        apartmentId: 2,
        checkInDate: '2026-12-06',
      });
    expect(quoteRes.status).toBe(200);
    const { quoteToken, breakdown } = quoteRes.body.data;

    // Step 2: Submit booking with BANK_TRANSFER
    const bookRes = await request(app)
      .post('/api/v1/public/booking')
      .send({
        apartmentId: 2,
        checkInDate: '2026-12-06',
        guestName: 'Bank Transfer Guest',
        guestEmail: 'bank.guest@example.com',
        guestPhone: '+2348099887766',
        paymentOption: 'PAY_ONLINE',
        paymentMethod: 'BANK_TRANSFER',
        quoteToken,
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body.success).toBe(true);
    const booking = bookRes.body.data;
    createdReservationIds.push(booking.id);

    // Assert paid amount is 0.00 and outstanding balance equals full total amount
    expect(booking.paidAmount).toBe(0.00);
    expect(parseFloat(booking.outstandingBalance)).toBe(parseFloat(breakdown.totalAmount));

    // Assert payment transaction is PENDING with BANK_TRANSFER_HOLD provider
    const txRows = await pool.query('SELECT * FROM payment_transactions WHERE reservation_id = ?', [booking.id]);
    expect(txRows.length).toBe(1);
    expect(txRows[0].status).toBe('PENDING');
    expect(txRows[0].provider).toBe('BANK_TRANSFER_HOLD');

    // Assert reservation record in DB is PAYMENT_PENDING with paid_amount 0
    const dbRes = await pool.query('SELECT payment_status, paid_amount FROM reservations WHERE id = ?', [booking.id]);
    expect(dbRes[0].payment_status).toBe('PAYMENT_PENDING');
    expect(parseFloat(dbRes[0].paid_amount)).toBe(0.00);
  });
});
