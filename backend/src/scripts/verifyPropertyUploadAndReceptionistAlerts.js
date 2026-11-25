/**
 * Live Verification Script: Property Upload Redesign, Dynamic Amenities & Receptionist Alert Scoping
 *
 * Runs against live database via Express app and supertest in controlled development/verification mode.
 */

const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

async function runVerification() {
  console.log('\n========================================================================');
  console.log('   BFA UPGRADE VERIFICATION: PROPERTY UPLOAD & RECEPTIONIST ALERT SCOPING');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  let createdPropertyId = null;
  let createdApartmentId = null;

  try {
    // ----------------------------------------------------
    // STEP 1: AUTHENTICATION ACROSS ALL USER ROLES
    // ----------------------------------------------------
    console.log('[1/5] Authenticating user roles across hierarchy...');

    const testPwd = process.env.BFA_QA_PASSWORD || process.env.TEST_USER_PASSWORD || '';
    const [saRes, adminRes, mgrRes, ownerRes, recRes] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({ email: 'superadmin@bfa.com', password: testPwd }),
      request(app).post('/api/v1/auth/login').send({ email: 'admin@bfa.com', password: testPwd }),
      request(app).post('/api/v1/auth/login').send({ email: 'manager@bfa.com', password: testPwd }),
      request(app).post('/api/v1/auth/login').send({ email: 'owner@bfa.com', password: testPwd }),
      request(app).post('/api/v1/auth/login').send({ email: 'receptionist@bfa.com', password: testPwd }),
    ]);

    const saToken = saRes.body?.data?.token;
    const adminToken = adminRes.body?.data?.token;
    const mgrToken = mgrRes.body?.data?.token;
    const ownerToken = ownerRes.body?.data?.token;
    const recToken = recRes.body?.data?.token;

    assert(Boolean(saToken), 'Super Admin authenticated successfully');
    assert(Boolean(adminToken), 'Admin authenticated successfully');
    assert(Boolean(mgrToken), 'Manager authenticated successfully');
    assert(Boolean(ownerToken), 'Owner authenticated successfully');
    assert(Boolean(recToken), 'Receptionist authenticated successfully');

    // ----------------------------------------------------
    // STEP 2: RECEPTIONIST ALERT SCOPING & ROLE RESTRICTIONS
    // ----------------------------------------------------
    console.log('\n[2/5] Testing Receptionist Alert Scoping & Role Boundaries...');

    const recAlertRes = await request(app)
      .get('/api/v1/front-office/unclaimed-bookings')
      .set('Authorization', `Bearer ${recToken}`);
    assert(recAlertRes.status === 200, `RECEPTIONIST allowed to access unclaimed bookings (Status: ${recAlertRes.status})`);
    assert(Array.isArray(recAlertRes.body.data), 'RECEPTIONIST received unclaimed booking alerts array');

    const adminAlertRes = await request(app)
      .get('/api/v1/front-office/unclaimed-bookings')
      .set('Authorization', `Bearer ${adminToken}`);
    assert(adminAlertRes.status === 403, `ADMIN strictly forbidden from booking alerts (Status: ${adminAlertRes.status})`);

    const saAlertRes = await request(app)
      .get('/api/v1/front-office/unclaimed-bookings')
      .set('Authorization', `Bearer ${saToken}`);
    assert(saAlertRes.status === 403, `SUPER_ADMIN strictly forbidden from booking alerts (Status: ${saAlertRes.status})`);

    const ownerAlertRes = await request(app)
      .get('/api/v1/front-office/unclaimed-bookings')
      .set('Authorization', `Bearer ${ownerToken}`);
    assert(ownerAlertRes.status === 403, `OWNER strictly forbidden from booking alerts (Status: ${ownerAlertRes.status})`);

    const mgrAlertRes = await request(app)
      .get('/api/v1/front-office/unclaimed-bookings')
      .set('Authorization', `Bearer ${mgrToken}`);
    assert(mgrAlertRes.status === 403, `MANAGER strictly forbidden from booking alerts (Status: ${mgrAlertRes.status})`);

    const unauthAlertRes = await request(app)
      .get('/api/v1/front-office/unclaimed-bookings');
    assert(unauthAlertRes.status === 401, `Unauthenticated request returns 401 Unauthorized (Status: ${unauthAlertRes.status})`);

    // ----------------------------------------------------
    // STEP 3: PROPERTY CREATION & BUILDING AMENITIES (MAX 7)
    // ----------------------------------------------------
    console.log('\n[3/5] Testing Property Upload & Building Amenities (Max 7)...');

    const uniqueCode = `VERIF-${Date.now().toString().slice(-4)}`;
    const propRes = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'The Sapphire Executive Enclave',
        code: uniqueCode,
        category: 'RESIDENTIAL',
        location: 'Alagbaka GRA Phase 2',
        district: 'Akure South District',
        address: 'Plot 12, Diplomatic Zone Road',
        city: 'Akure',
        state: 'Ondo',
        country: 'Nigeria',
        environment_description: 'High-security diplomatic enclave surrounded by lush private grounds',
        description: 'Bespoke serviced residential tower designed for visiting diplomats and executives',
      });

    assert(propRes.status === 201, `Property created with status 201 (Status: ${propRes.status})`);
    createdPropertyId = propRes.body?.data?.id;
    assert(propRes.body?.data?.location === 'Alagbaka GRA Phase 2', 'Property location persisted correctly');
    assert(propRes.body?.data?.district === 'Akure South District', 'Property district persisted correctly');

    // Save 5 building amenities
    const buildingAmenities = [
      { name: '24/7 Redundant Power', description: 'Dual Cummins generators + solar hybrid sub-50ms ATS', photo_url: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957' },
      { name: 'High-Speed Fiber Wi-Fi', description: '500 Mbps symmetrical enterprise fiber backbone', photo_url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8' },
      { name: 'Heated Infinity Pool', description: 'Rooftop sky pool with panoramic horizon view', photo_url: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7' },
      { name: 'Wellness & Fitness Gym', description: 'Technogym cardio and free-weights setup', photo_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48' },
      { name: 'Underground Secured Parking', description: 'Guarded parking bays with CCTV and biometric control', photo_url: 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a' },
    ];

    const saveAmRes = await request(app)
      .post(`/api/v1/properties/${createdPropertyId}/amenities`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amenities: buildingAmenities });

    assert(saveAmRes.status === 200, `Building amenities saved (Status: ${saveAmRes.status})`);
    assert(saveAmRes.body?.data?.length === 5, 'Exact 5 building amenities returned');

    // Fetch building amenities
    const getAmRes = await request(app)
      .get(`/api/v1/properties/${createdPropertyId}/amenities`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert(getAmRes.status === 200, `Building amenities fetched (Status: ${getAmRes.status})`);
    assert(getAmRes.body?.data?.length === 5, 'Exact 5 building amenities retrieved');

    // Enforce 7-item limit
    const excessiveAmenities = [
      { name: 'Am 1', description: 'D1' },
      { name: 'Am 2', description: 'D2' },
      { name: 'Am 3', description: 'D3' },
      { name: 'Am 4', description: 'D4' },
      { name: 'Am 5', description: 'D5' },
      { name: 'Am 6', description: 'D6' },
      { name: 'Am 7', description: 'D7' },
      { name: 'Am 8 (Excessive)', description: 'D8' },
    ];

    const reject8Res = await request(app)
      .post(`/api/v1/properties/${createdPropertyId}/amenities`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amenities: excessiveAmenities });

    assert([400, 422].includes(reject8Res.status), `8 building amenities strictly rejected with client error (Status: ${reject8Res.status})`);
    assert(/maximum of 7 building amenities/i.test(JSON.stringify(reject8Res.body)), 'Error message explicitly states 7-item building limit');

    // ----------------------------------------------------
    // STEP 4: APARTMENT MANUAL ID & UNLIMITED DYNAMIC AMENITIES
    // ----------------------------------------------------
    console.log('\n[4/5] Testing Apartment Manual ID & Unlimited In-Suite Amenities...');

    const aptRes = await request(app)
      .post('/api/v1/apartments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: createdPropertyId,
        unit_number: '201',
        apartment_code: 'SAPPHIRE-201-PENT',
        unit_name: 'Sapphire Presidential Penthouse 201',
        unit_type: '3-Bedroom Penthouse',
        description: 'Expansive private terrace penthouse with double-height ceiling and Italian marble finishes',
        rate_per_night: 120000.00,
        capacity: 6,
        bedroom_count: 3,
        bathroom_count: 3,
      });

    assert(aptRes.status === 201, `Apartment created with status 201 (Status: ${aptRes.status})`);
    createdApartmentId = aptRes.body?.data?.id;
    assert(aptRes.body?.data?.apartment_code === 'SAPPHIRE-201-PENT', 'Manual Apartment ID persisted');
    assert(aptRes.body?.data?.description?.includes('Expansive private terrace'), 'Apartment description persisted');

    // Test duplicate Apartment ID constraint
    const duplicateAptRes = await request(app)
      .post('/api/v1/apartments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        property_id: createdPropertyId,
        unit_number: '202',
        apartment_code: 'SAPPHIRE-201-PENT', // Same ID in same property
        unit_name: 'Conflicting Suite',
        unit_type: '1-Bedroom',
        rate_per_night: 60000.00,
      });

    assert([400, 409].includes(duplicateAptRes.status), `Duplicate Apartment ID rejected with 400/409 (Status: ${duplicateAptRes.status})`);
    assert(/apartment id|already exists|duplicate/i.test(JSON.stringify(duplicateAptRes.body)), 'Duplicate rejection message is descriptive');

    // Save 9 apartment amenities (unlimited - no 7 limit)
    const suiteAmenities = [
      { name: '4K Ultra HD Smart TV', description: '75-inch Samsung OLED with full surround audio' },
      { name: 'Nespresso Bar & Frother', description: 'Artisan capsules, twin milk frother, and fine china' },
      { name: 'Freestanding Spa Soaking Tub', description: 'Thermostatic pressurized instant hot water' },
      { name: 'Acoustic Soundproofing Glass', description: 'Double-glazed panoramic windows' },
      { name: 'Executive Ergonomic Workstation', description: 'Leather executive chair with dual monitor arm and surge strip' },
      { name: 'Biometric Laptop Safe', description: 'Solid steel safe fitted in dressing room wardrobe' },
      { name: 'Chef Induction Cooktop & Oven', description: 'Full gourmet kitchen setup with cookware' },
      { name: 'Custom Wine Chiller', description: 'Dual-zone wine preservation cabinet' },
      { name: 'Private Open-Air Sky Terrace', description: 'Teak outdoor lounge chairs with sunset view' },
    ];

    const saveSuiteAmRes = await request(app)
      .post(`/api/v1/apartments/${createdApartmentId}/amenities`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amenities: suiteAmenities });

    assert(saveSuiteAmRes.status === 200, `Apartment amenities saved without 7-item cap (Status: ${saveSuiteAmRes.status})`);
    assert(saveSuiteAmRes.body?.data?.length === 9, 'All 9 dynamic apartment amenities saved successfully');

    // Fetch apartment amenities
    const getSuiteAmRes = await request(app)
      .get(`/api/v1/apartments/${createdApartmentId}/amenities`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert(getSuiteAmRes.status === 200, `Apartment amenities retrieved (Status: ${getSuiteAmRes.status})`);
    assert(getSuiteAmRes.body?.data?.length === 9, 'All 9 dynamic apartment amenities retrieved');

    // Authenticated apartment detail check
    const authAptRes = await request(app)
      .get(`/api/v1/apartments/${createdApartmentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert(authAptRes.status === 200, `Authenticated apartment detail retrieved (Status: ${authAptRes.status})`);
    assert(authAptRes.body?.data?.apartment_code === 'SAPPHIRE-201-PENT', 'Authenticated apartment returns manual apartment_code');
    assert(authAptRes.body?.data?.description?.includes('Expansive private terrace'), 'Authenticated apartment returns description');

    // ----------------------------------------------------
    // STEP 5: PUBLIC DISCOVERY & PROPERTY DETAILS
    // ----------------------------------------------------
    console.log('\n[5/5] Testing Client-Facing Public Discovery Endpoints...');

    // Publish the property so it becomes visible on the public directory
    await pool.query("UPDATE properties SET status = 'PUBLISHED' WHERE id = ?", [createdPropertyId]);

    const pubPropRes = await request(app)
      .get(`/api/v1/public/properties/${createdPropertyId}`);

    assert(pubPropRes.status === 200, `Public property detail fetched (Status: ${pubPropRes.status})`);
    const pubProperty = pubPropRes.body?.data?.property;
    assert(pubProperty?.location === 'Alagbaka GRA Phase 2', 'Public property returns location');
    assert(pubProperty?.district === 'Akure South District', 'Public property returns district');
    assert(Array.isArray(pubProperty?.building_amenities), 'Public property returns building_amenities array');
    assert(pubProperty?.building_amenities?.length === 5, 'Public property has 5 building amenities');

    const publishedUnits = pubPropRes.body?.data?.units || [];
    assert(publishedUnits.length > 0, 'Public property includes units list');
    const pubPent = publishedUnits.find((u) => u.id === createdApartmentId);
    assert(Boolean(pubPent), 'Created apartment found in public property response');
    assert(pubPent?.apartment_code === 'SAPPHIRE-201-PENT', 'Public apartment returns manual apartment_code');
    assert(Array.isArray(pubPent?.apartment_amenities), 'Public apartment includes apartment_amenities array');
    assert(pubPent?.apartment_amenities?.length === 9, 'Public apartment includes all 9 dynamic amenities');

  } catch (err) {
    console.error('\n[EXCEPTION ENCOUNTERED]:', err);
    failed++;
  } finally {
    console.log('\n[CLEANUP] Cleaning up verification artifacts...');
    if (createdApartmentId) {
      await pool.query('DELETE FROM apartment_amenities WHERE apartment_id = ?', [createdApartmentId]);
      await pool.query('DELETE FROM apartments WHERE id = ?', [createdApartmentId]);
      console.log(`  Removed test apartment #${createdApartmentId}`);
    }
    if (createdPropertyId) {
      await pool.query('DELETE FROM property_amenities WHERE property_id = ?', [createdPropertyId]);
      await pool.query('DELETE FROM property_submissions WHERE property_id = ?', [createdPropertyId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [createdPropertyId]);
      console.log(`  Removed test property #${createdPropertyId}`);
    }
    await pool.closePool();
  }

  console.log('\n========================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVerification();
