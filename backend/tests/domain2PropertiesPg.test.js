/**
 * Domain 2: Properties & Apartments Integration Tests
 * TASK AIVEN-05: Live Aiven PostgreSQL
 */

const { setEngineOverride, clearEngineOverride, withTransaction, query, closePool } = require('../src/db/pool');
const PropertiesService = require('../src/modules/properties/properties.service');
const ApartmentsService = require('../src/modules/apartments/apartments.service');
const ApartmentsRepository = require('../src/modules/apartments/apartments.repository');

describe('Domain 2: Properties & Apartments on PostgreSQL (TASK AIVEN-05)', () => {
  beforeAll(() => {
    setEngineOverride('postgres');
  });

  afterAll(async () => {
    clearEngineOverride();
    await closePool();
  });

  test('1. PropertiesService.listProperties returns seeded properties with unit statistics', async () => {
    const properties = await PropertiesService.listProperties();
    expect(Array.isArray(properties)).toBe(true);
    expect(properties.length).toBe(3);

    const ght = properties.find((p) => p.code === 'GHT');
    expect(ght).toBeDefined();
    expect(parseInt(ght.total_units, 10)).toBe(3);

    const abr = properties.find((p) => p.code === 'ABR');
    expect(abr).toBeDefined();
    expect(parseInt(abr.total_units, 10)).toBe(2);

    const rps = properties.find((p) => p.code === 'RPS');
    expect(rps).toBeDefined();
    expect(parseInt(rps.total_units, 10)).toBe(1);
  });

  test('2. PropertiesService.getPropertyById returns single property with stats', async () => {
    const prop = await PropertiesService.getPropertyById(1);
    expect(prop).toBeDefined();
    expect(prop.id).toBe(1);
    expect(prop.code).toBe('GHT');
    expect(prop.name).toBe('Grand Horizon Tower');
  });

  test('3. Property-level scoping enforces isolation for property-assigned staff', async () => {
    const staffUserProp1 = { id: 5, role: 'STAFF', propertyId: 1 };

    // Staff allowed for own property
    await expect(PropertiesService.getPropertyById(1, staffUserProp1)).resolves.toBeDefined();

    // Staff forbidden for other property
    await expect(PropertiesService.getPropertyById(2, staffUserProp1)).rejects.toThrow(
      'You are only authorized to access Property #1.'
    );
  });

  test('4. ApartmentsService.listApartments returns seeded units with property joins', async () => {
    const apartments = await ApartmentsService.listApartments();
    expect(Array.isArray(apartments)).toBe(true);
    expect(apartments.length).toBe(6);

    const unit101 = apartments.find((a) => a.unit_number === '101');
    expect(unit101).toBeDefined();
    expect(unit101.property_code).toBe('GHT');
    expect(unit101.status).toBe('AVAILABLE');
  });

  test('5. ApartmentsRepository.checkAvailability correctly reports availability for unbooked date', async () => {
    const check = await ApartmentsRepository.checkAvailability(1, '2026-12-01');
    expect(check.isAvailable).toBe(true);
    expect(check.unitId).toBe(1);
    expect(check.propertyName).toBe('Grand Horizon Tower');
  });

  test('6. Isolated Transactional Property & Apartment Creation with Rollback', async () => {
    const testCode = `TST${Date.now().toString().slice(-4)}`;

    try {
      await withTransaction(async (conn) => {
        // 1. Insert property inside transaction
        const [propRes] = await conn.query(
          `INSERT INTO properties (name, code, address, city, state, country, status)
           VALUES (?, ?, '123 Test St', 'Lagos', 'Lagos', 'Nigeria', 'ACTIVE')`,
          ['Test Tower', testCode]
        );
        const propId = propRes.insertId;
        expect(propId).toBeDefined();
        expect(propId).toBeGreaterThan(0);

        // 2. Insert apartment for that property inside transaction
        const [aptRes] = await conn.query(
          `INSERT INTO apartments (property_id, unit_number, unit_name, rate_per_night, status, is_active)
           VALUES (?, '999', 'Penthouse Test', 500.00, 'AVAILABLE', TRUE)`,
          [propId]
        );
        const aptId = aptRes.insertId;
        expect(aptId).toBeDefined();
        expect(aptId).toBeGreaterThan(0);

        // 3. Verify join query inside transaction
        const [joined] = await conn.query(
          `SELECT a.unit_number, p.code 
           FROM apartments a 
           JOIN properties p ON p.id = a.property_id 
           WHERE a.id = ?`,
          [aptId]
        );
        expect(joined.length).toBe(1);
        expect(joined[0].unit_number).toBe('999');
        expect(joined[0].code).toBe(testCode);

        // 4. Rollback
        throw new Error('ROLLBACK_PROP_TXN');
      });
    } catch (err) {
      if (!err.message.includes('ROLLBACK_PROP_TXN')) throw err;
    }

    // Verify property does not exist after rollback
    const check = await query('SELECT * FROM properties WHERE code = ?', [testCode]);
    expect(check.length).toBe(0);
  });
});
