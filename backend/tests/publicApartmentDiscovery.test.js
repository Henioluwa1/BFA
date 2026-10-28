/**
 * Public Apartment Discovery & Room-Type Showcase Test Suite
 * 
 * Verifies the visitor discovery journey:
 * Landing Page → Explore Apartments → Select Building → Explore Room Types → View Room Photos and Amenities → Check Availability → Existing Booking Flow
 * 
 * Target Database: bfa_apartments_test_db
 * Strict Guard: bfa_apartments_db must NEVER be targeted.
 */

process.env.NODE_ENV = 'test';

jest.setTimeout(30000);

const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');
const { assertTestDatabase } = require('../src/db/databaseGuard');

describe('Public Apartment Discovery & Room-Type Showcase Suite', () => {
  const createdReservationIds = [];

  beforeAll(async () => {
    assertTestDatabase(process.env.DB_NAME || 'bfa_apartments_test_db', 'Public Discovery Tests');
  });

  afterAll(async () => {
    // Teardown any reservations created during test
    for (const resId of createdReservationIds) {
      await pool.query('DELETE FROM payment_transactions WHERE reservation_id = ?', [resId]);
      await pool.query('DELETE FROM reservations WHERE id = ?', [resId]);
    }
  });

  test('1. GET /api/v1/public/properties returns active buildings with rich metadata and unit stats', async () => {
    const res = await request(app).get('/api/v1/public/properties');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const firstProp = res.body.data[0];
    expect(firstProp).toHaveProperty('id');
    expect(firstProp).toHaveProperty('name');
    expect(firstProp).toHaveProperty('code');
    expect(firstProp).toHaveProperty('address');
    expect(firstProp).toHaveProperty('city');
    expect(firstProp).toHaveProperty('state');
    expect(firstProp).toHaveProperty('total_units');
    expect(firstProp).toHaveProperty('available_units');
    expect(firstProp).toHaveProperty('starting_rate');
    expect(Array.isArray(firstProp.amenities)).toBe(true);
  });

  test('2. GET /api/v1/public/properties/:id returns building detail, room types and individual units', async () => {
    const res = await request(app).get('/api/v1/public/properties/1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('property');
    expect(res.body.data).toHaveProperty('roomTypes');
    expect(res.body.data).toHaveProperty('units');

    const { property, roomTypes, units } = res.body.data;
    expect(property.id).toBe(1);
    expect(property.status).toBe('ACTIVE');
    expect(Array.isArray(property.amenities)).toBe(true);

    expect(Array.isArray(roomTypes)).toBe(true);
    expect(roomTypes.length).toBeGreaterThan(0);

    // Verify room type structure
    const firstType = roomTypes[0];
    expect(firstType).toHaveProperty('unitType');
    expect(firstType).toHaveProperty('startingRate');
    expect(firstType).toHaveProperty('capacity');
    expect(firstType).toHaveProperty('bedroomCount');
    expect(firstType).toHaveProperty('bathroomCount');
    expect(firstType).toHaveProperty('totalUnits');
    expect(firstType).toHaveProperty('availableUnits');
    expect(Array.isArray(firstType.amenities)).toBe(true);
    expect(Array.isArray(firstType.units)).toBe(true);

    // Verify units list
    expect(Array.isArray(units)).toBe(true);
    expect(units.length).toBe(res.body.data.totalUnits);
  });

  test('3. GET /api/v1/public/properties/:id/room-types returns aggregated room types list', async () => {
    const res = await request(app).get('/api/v1/public/properties/1/room-types');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    for (const rt of res.body.data) {
      expect(typeof rt.unitType).toBe('string');
      expect(typeof rt.startingRate).toBe('number');
      expect(rt.totalUnits).toBeGreaterThanOrEqual(1);
    }
  });

  test('4. GET /api/v1/public/properties/99999 returns 404 NOT_FOUND gracefully', async () => {
    const res = await request(app).get('/api/v1/public/properties/99999');
    expect(res.status).toBe(404);
  });

  test('5. GET /api/v1/public/apartments filters by property and returns capacity/floor/amenities', async () => {
    const res = await request(app).get('/api/v1/public/apartments?propertyId=1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    for (const apt of res.body.data) {
      expect(apt.property_id).toBe(1);
      expect(apt.status).toBe('AVAILABLE');
      expect(apt).toHaveProperty('unit_type');
      expect(apt).toHaveProperty('capacity');
      expect(apt).toHaveProperty('rate_per_night');
    }
  });

  test('6. Complete Public Booking Journey: select unit -> check availability -> create booking', async () => {
    // A. Fetch available units for property 1
    const aptsRes = await request(app).get('/api/v1/public/apartments?propertyId=1');
    expect(aptsRes.body.data.length).toBeGreaterThan(0);
    const chosenApt = aptsRes.body.data[0];

    // B. Check availability for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 25);
    const checkInDate = tomorrow.toISOString().split('T')[0];

    const availRes = await request(app)
      .post('/api/v1/public/check-availability')
      .send({ apartmentId: chosenApt.id, checkInDate });

    expect(availRes.status).toBe(200);
    expect(availRes.body.success).toBe(true);
    expect(availRes.body.data.isAvailable).toBe(true);

    // C. Execute public booking
    const bookingRes = await request(app)
      .post('/api/v1/public/booking')
      .send({
        apartmentId: chosenApt.id,
        guestName: 'Discovery Flow Test Guest',
        guestEmail: 'discovery.guest@example.com',
        guestPhone: '+234 800 555 0199',
        checkInDate,
        paymentOption: 'PAY_AT_PROPERTY',
      });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.success).toBe(true);
    expect(bookingRes.body.data).toHaveProperty('reservationCode');
    expect(bookingRes.body.data).toHaveProperty('authCode');
    expect(bookingRes.body.data.status).toBe('CONFIRMED');

    createdReservationIds.push(bookingRes.body.data.id);
  });
});

