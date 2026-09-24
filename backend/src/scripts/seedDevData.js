/**
 * ============================================================================
 * BFA APARTMENT MANAGEMENT SYSTEM — DEVELOPMENT & DEMO SEED DATA
 * ============================================================================
 * Safe, idempotent development dataset populating realistic interconnected records
 * across all operational and administrative domains for Phase 11B stabilization.
 *
 * Usage:
 *   node src/scripts/seedDevData.js
 * ============================================================================
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

async function seedDevData() {
  console.log('[DEVELOPMENT SEED]: Initializing BFA Development Dataset...');

  try {
    await pool.withTransaction(async (conn) => {
      // 1. BASELINE PROPERTIES
    console.log('[DEVELOPMENT SEED]: Verifying properties...');
    await conn.query(`
      INSERT INTO properties (id, name, code, address, city, status) VALUES
      (1, 'Grand Horizon Tower', 'GHT', '12 Bishop Aboyade Cole, Victoria Island', 'Lagos', 'ACTIVE'),
      (2, 'Azure Bay Residences', 'ABR', '8 Gerard Road, Ikoyi Waterfront', 'Lagos', 'ACTIVE'),
      (3, 'The Royal Palms Suites', 'RPS', '24 Admiralty Way, Lekki Phase 1', 'Lagos', 'ACTIVE')
      ON DUPLICATE KEY UPDATE name=VALUES(name), status=VALUES(status);
    `);

    // 2. APARTMENTS / UNITS
    console.log('[DEVELOPMENT SEED]: Verifying apartments/units...');
    await conn.query(`
      INSERT INTO apartments (id, property_id, unit_number, unit_name, unit_type, status, rate_per_night) VALUES
      (1, 1, '101', 'Penthouse Horizon 101', 'Executive Penthouse', 'AVAILABLE', 350000.00),
      (2, 1, '102', 'Deluxe Suite 102', '1-Bedroom Deluxe', 'OCCUPIED', 220000.00),
      (3, 1, '103', 'Studio Prime 103', 'Studio Premier', 'DIRTY', 160000.00),
      (4, 2, '201', 'Azure Waterfront Suite 201', '2-Bedroom Luxury', 'AVAILABLE', 280000.00),
      (5, 2, '202', 'Bayside Studio 202', 'Studio Standard', 'MAINTENANCE', 140000.00),
      (6, 3, '301', 'Royal Palm Premier 301', '1-Bedroom Deluxe', 'AVAILABLE', 200000.00),
      (7, 1, '104', 'Executive Two-Bedroom 104', '2-Bedroom Executive', 'CLEANED', 290000.00),
      (8, 2, '203', 'Ocean Breeze Suite 203', '3-Bedroom Royal', 'OCCUPIED', 450000.00)
      ON DUPLICATE KEY UPDATE unit_name=VALUES(unit_name), rate_per_night=VALUES(rate_per_night);
    `);

    // 3. SYSTEM USERS (Password: Bfa2026!Secure)
    console.log('[DEVELOPMENT SEED]: Verifying authoritative users...');
    const defaultPasswordHash = '$2b$10$GaII4sIWwHiOi1sCf149TOFCzwYPhwSNv7nAAUeSVs1FBC2A6.t3q';
    await conn.query(`
      INSERT INTO users (id, name, email, password_hash, role, property_id, status) VALUES
      (1, 'BFA Super Admin', 'superadmin@bfa.com', '${defaultPasswordHash}', 'SUPER_ADMIN', NULL, 'ACTIVE'),
      (2, 'Sarah Jenkins (Admin)', 'admin@bfa.com', '${defaultPasswordHash}', 'ADMIN', NULL, 'ACTIVE'),
      (3, 'Marcus Vance (Manager)', 'manager@bfa.com', '${defaultPasswordHash}', 'MANAGER', 1, 'ACTIVE'),
      (4, 'Elena Ramos (Reception)', 'receptionist@bfa.com', '${defaultPasswordHash}', 'RECEPTIONIST', 1, 'ACTIVE'),
      (5, 'David Kalu (Staff)', 'staff@bfa.com', '${defaultPasswordHash}', 'STAFF', 1, 'ACTIVE'),
      (6, 'Alexander Wright (Agent)', 'agent@bfa.com', '${defaultPasswordHash}', 'AGENT', NULL, 'ACTIVE'),
      (7, 'Chief Emeka BFA (Owner)', 'owner@bfa.com', '${defaultPasswordHash}', 'OWNER', NULL, 'ACTIVE'),
      (8, 'Tunde Bakare (Maintenance)', 'maintenance@bfa.com', '${defaultPasswordHash}', 'STAFF', 2, 'ACTIVE'),
      (9, 'Amara Nwosu (Housekeeping)', 'housekeeping@bfa.com', '${defaultPasswordHash}', 'STAFF', 1, 'ACTIVE')
      ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role), status=VALUES(status);
    `);

    // 4. GUESTS & TENANTS
    console.log('[DEVELOPMENT SEED]: Populating fictional guests...');
    await conn.query(`
      INSERT INTO guests (id, first_name, last_name, display_name, email, phone, city, nationality, status) VALUES
      (1, 'Emmanuel', 'Okon', 'Chief Emmanuel Okon', 'emmanuel.okon@oilgas.ng', '+234 803 555 0101', 'Port Harcourt', 'Nigerian', 'VIP'),
      (2, 'Sarah', 'Jenkins', 'Sarah Jenkins', 'sarah.jenkins@diplomatic.org', '+234 803 555 0102', 'Abuja', 'British', 'ACTIVE'),
      (3, 'Babatunde', 'Fashola', 'Engr. Babatunde Fashola', 'babatunde.f@logistics.ng', '+234 803 555 0103', 'Lagos', 'Nigerian', 'ACTIVE'),
      (4, 'Dr. Ngozi', 'Eze', 'Dr. Ngozi Eze', 'ngozi.eze@healthcorp.org', '+234 803 555 0104', 'Enugu', 'Nigerian', 'VIP'),
      (5, 'Marcus', 'Sterling', 'Marcus Sterling', 'm.sterling@globalfin.co.uk', '+44 7700 900123', 'London', 'British', 'ACTIVE'),
      (6, 'Amina', 'Danjuma', 'Hajiya Amina Danjuma', 'amina.danjuma@investments.ng', '+234 803 555 0106', 'Kano', 'Nigerian', 'VIP')
      ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), status=VALUES(status);
    `);

    // 5. RESERVATIONS
    console.log('[DEVELOPMENT SEED]: Populating multi-state reservations...');
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const futureDay1 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const futureDay2 = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
    const futureDay3 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const futureDay4 = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);
    const pastDay1 = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
    const pastDay2 = new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10);

    await conn.query(`
      INSERT INTO reservations (id, reservation_code, property_id, apartment_id, guest_id, tenant_name, check_in_date, check_out_date, status, payment_status, total_amount, paid_amount) VALUES
      (1, 'RES-2026-0001', 1, 1, 1, 'Chief Emmanuel Okon', '${pastDay1}', '${pastDay2}', 'CHECKED_OUT', 'PAID', 350000.00, 350000.00),
      (2, 'RES-2026-0002', 1, 2, 2, 'Sarah Jenkins', '${today}', '${tomorrow}', 'CHECKED_IN', 'PAID', 220000.00, 220000.00),
      (3, 'RES-2026-0003', 2, 4, 3, 'Engr. Babatunde Fashola', '${futureDay1}', '${futureDay2}', 'CONFIRMED', 'PARTIAL', 280000.00, 56000.00),
      (4, 'RES-2026-0004', 2, 5, 4, 'Dr. Ngozi Eze', '${futureDay3}', '${futureDay4}', 'PENDING', 'UNPAID', 140000.00, 0.00),
      (5, 'RES-2026-0005', 3, 6, 5, 'Marcus Sterling', '${yesterday}', '${today}', 'CANCELLED', 'REFUNDED', 200000.00, 0.00),
      (6, 'RES-2026-0006', 2, 8, 6, 'Hajiya Amina Danjuma', '${today}', '${tomorrow}', 'CHECKED_IN', 'PAID', 450000.00, 450000.00)
      ON DUPLICATE KEY UPDATE status=VALUES(status), total_amount=VALUES(total_amount), paid_amount=VALUES(paid_amount);
    `);

    // 6. MAINTENANCE REQUESTS
    console.log('[DEVELOPMENT SEED]: Populating maintenance work orders...');
    await conn.query(`
      INSERT INTO maintenance_requests (id, issue_code, property_id, apartment_id, issue_title, description, priority, status, assigned_to, cost) VALUES
      (1, 'MNT-2026-001', 1, 2, 'Air Conditioner Cooling Fault', 'Master bedroom unit blowing warm air during afternoon peak. Refrigerant check required.', 'HIGH', 'IN_PROGRESS', 'Tunde Bakare', 35000.00),
      (2, 'MNT-2026-002', 2, 5, 'En-suite Plumbing Drainage Leak', 'Slow drainage in guest shower and minor moisture seal leak under sink cabinet.', 'MEDIUM', 'OPEN', 'David Kalu', 18000.00),
      (3, 'MNT-2026-003', 1, 1, 'Smart Keycard Lock Battery Low', 'Electronic door lock warning beep on Penthouse 101. Battery set replaced and recalibrated.', 'LOW', 'RESOLVED', 'Tunde Bakare', 7500.00),
      (4, 'MNT-2026-004', 3, 6, 'Balcony Ambient Light Fixture', 'Decorative light bulb extinguished on terrace. Requires weather-proof LED replacement.', 'LOW', 'OPEN', 'David Kalu', 5000.00),
      (5, 'MNT-2026-005', 2, 4, 'Kitchen Extractor Hood Filter Cleaning', 'Quarterly routine grease filter replacement and motor duct inspection.', 'MEDIUM', 'RESOLVED', 'Amara Nwosu', 12000.00),
      (6, 'MNT-2026-006', 1, 3, 'Water Heater Thermostat Check', 'Studio 103 water heater tripping circuit breaker on startup.', 'CRITICAL', 'IN_PROGRESS', 'Tunde Bakare', 45000.00)
      ON DUPLICATE KEY UPDATE issue_title=VALUES(issue_title), status=VALUES(status), priority=VALUES(priority);
    `);

    // 7. INSPECTIONS
    console.log('[DEVELOPMENT SEED]: Populating apartment inspections...');
    const damageItemsSample = JSON.stringify([
      { item: 'Living Room Glass Coffee Table', description: 'Minor surface scratch near center edge', severity: 'MINOR', location: 'Living Area', estimated_cost: '15000' }
    ]);
    const missingItemsSample = JSON.stringify([
      { item: 'Balcony Cushion Cover', count: 1 }
    ]);

    await conn.query(`
      INSERT INTO inspections (id, inspection_code, reservation_id, guest_id, property_id, apartment_id, inspector_id, inspection_type, condition_rating, damage_items, missing_items, notes, status, scheduled_date, completed_at, created_by) VALUES
      (1, 'INSP-2026-001', 1, 1, 1, 1, 5, 'CHECKOUT', 'EXCELLENT', '[]', '[]', 'Penthouse checkout inspection. All appliances, audio-visual, and linens in pristine condition.', 'COMPLETED', '${yesterday}', CURRENT_TIMESTAMP, 3),
      (2, 'INSP-2026-002', 2, 2, 1, 2, 4, 'PRE_CHECKIN', 'GOOD', '[]', '[]', 'Pre-arrival readiness inspection for Diplomatic Mission guest. Complimentary refreshments stocked.', 'COMPLETED', '${yesterday}', CURRENT_TIMESTAMP, 3),
      (3, 'INSP-2026-003', NULL, NULL, 2, 5, 8, 'MAINTENANCE_REVIEW', 'FAIR', '${damageItemsSample}', '[]', 'Post-leak structural drywall inspection. Minor repainting required prior to next booking.', 'FOLLOW_UP', '${today}', NULL, 3),
      (4, 'INSP-2026-004', 3, 3, 2, 4, 5, 'ROUTINE', 'GOOD', '[]', '[]', 'Bi-weekly routine inventory and safety audit. Fire alarm and carbon monoxide detector verified.', 'COMPLETED', '${today}', CURRENT_TIMESTAMP, 3),
      (5, 'INSP-2026-005', 5, 5, 3, 6, 8, 'DAMAGE', 'DAMAGED', '${damageItemsSample}', '${missingItemsSample}', 'Damage review following event gathering. Cost assessment forwarded to property manager.', 'IN_PROGRESS', '${today}', NULL, 3)
      ON DUPLICATE KEY UPDATE condition_rating=VALUES(condition_rating), status=VALUES(status);
    `);

    // 8. EMPLOYEES & PROFILES
    console.log('[DEVELOPMENT SEED]: Populating employees across departments...');
    await conn.query(`
      INSERT INTO employees (id, user_id, employee_code, first_name, last_name, email, phone, department, job_title, property_id, employment_type, employment_status, hire_date) VALUES
      (1, 4, 'EMP-1001', 'Elena', 'Ramos', 'elena.ramos@bfa-apartments.com', '+234 803 700 0001', 'FRONT_OFFICE', 'Head Receptionist', 1, 'FULL_TIME', 'ACTIVE', '2025-01-15'),
      (2, 5, 'EMP-1002', 'David', 'Kalu', 'david.kalu@bfa-apartments.com', '+234 803 700 0002', 'HOUSEKEEPING', 'Senior Housekeeper', 1, 'FULL_TIME', 'ACTIVE', '2025-02-01'),
      (3, 8, 'EMP-1003', 'Tunde', 'Bakare', 'tunde.bakare@bfa-apartments.com', '+234 803 700 0003', 'MAINTENANCE', 'Chief Facilities Technician', 2, 'FULL_TIME', 'ACTIVE', '2025-02-15'),
      (4, 9, 'EMP-1004', 'Amara', 'Nwosu', 'amara.nwosu@bfa-apartments.com', '+234 803 700 0004', 'OPERATIONS', 'Turnaround Coordinator', 1, 'FULL_TIME', 'ACTIVE', '2025-03-01'),
      (5, 3, 'EMP-1005', 'Marcus', 'Vance', 'marcus.vance@bfa-apartments.com', '+234 803 700 0005', 'ADMINISTRATION', 'Senior Property Operations Manager', 1, 'FULL_TIME', 'ACTIVE', '2024-11-01'),
      (6, NULL, 'EMP-1006', 'Ibrahim', 'Musa', 'ibrahim.musa@bfa-apartments.com', '+234 803 700 0006', 'SECURITY', 'Head of Security & Access', 1, 'FULL_TIME', 'ACTIVE', '2025-01-10')
      ON DUPLICATE KEY UPDATE department=VALUES(department), job_title=VALUES(job_title), employment_status=VALUES(employment_status);
    `);

    // Employee Profiles
    await conn.query(`
      INSERT INTO employee_profiles (employee_id, address, city, state, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, bio_notes) VALUES
      (1, '14 Adeola Odeku St', 'Victoria Island', 'Lagos', 'Carlos Ramos', '+234 803 999 1111', 'Spouse', 'Experienced 5-star hospitality front desk manager.'),
      (2, '7 Lawanson Way', 'Surulere', 'Lagos', 'Chinyere Kalu', '+234 803 999 2222', 'Sister', 'Certified in professional housekeeping standards.'),
      (3, '22 Ikorodu Road', 'Yaba', 'Lagos', 'Fisayo Bakare', '+234 803 999 3333', 'Spouse', 'HVAC and electrical facilities engineering specialist.')
      ON DUPLICATE KEY UPDATE address=VALUES(address);
    `);

    // 9. EMPLOYEE ID CARDS
    console.log('[DEVELOPMENT SEED]: Generating staff digital ID badges...');
    const token1 = crypto.randomBytes(24).toString('hex');
    const token2 = crypto.randomBytes(24).toString('hex');
    const token3 = crypto.randomBytes(24).toString('hex');

    await conn.query(`
      INSERT INTO employee_id_cards (id, employee_id, property_id, card_number, verification_token, status, issued_at, expires_at, generated_by_id) VALUES
      (1, 1, 1, 'BFA-IDC-2026-0001-842', '${token1}', 'ACTIVE', '2026-01-01', '2027-01-01', 1),
      (2, 2, 1, 'BFA-IDC-2026-0002-419', '${token2}', 'ACTIVE', '2026-01-15', '2027-01-15', 1),
      (3, 3, 2, 'BFA-IDC-2026-0003-753', '${token3}', 'ACTIVE', '2026-02-01', '2027-02-01', 1)
      ON DUPLICATE KEY UPDATE status=VALUES(status);
    `);

    // 10. PUBLIC ANNOUNCEMENTS
    console.log('[DEVELOPMENT SEED]: Verifying public announcements...');
    await conn.query(`
      INSERT INTO public_announcements (id, title, message, priority, display_location, is_active, start_date, end_date, created_by_id) VALUES
      (1, '🌟 Welcome to BFA Apartments Luxury Portals', 'Experience premier short-let hospitality across Victoria Island, Ikoyi, and Lekki. High-speed fiber WiFi and 24/7 security guaranteed.', 'HIGH', 'PUBLIC_LANDING', 1, '${pastDay1}', '${futureDay4}', 1),
      (2, '⚡ Routine Substation Generator Maintenance', 'Scheduled generator routine inspection will occur on Saturday between 02:00 and 03:00. Uninterrupted inverter power remains active.', 'MEDIUM', 'PORTAL_ALL', 1, '${today}', '${futureDay4}', 1),
      (3, '🏊 Azure Bay Pool Deck Sunrise Yoga Sessions', 'Complimentary weekend yoga sessions for all registered guests every Saturday 07:30 AM at Azure Bay waterfront deck.', 'LOW', 'PUBLIC_LANDING', 1, '${today}', '${futureDay4}', 1),
      (4, '🛡️ Elevated Security Protocols in Effect', 'All visitors must present valid digital keycard verification or guest pass at main access gates.', 'HIGH', 'STAFF_PORTAL', 1, '${pastDay1}', '${futureDay4}', 1)
      ON DUPLICATE KEY UPDATE title=VALUES(title), is_active=VALUES(is_active);
    `);

    // 11. COMMUNICATIONS & MESSAGES
    console.log('[DEVELOPMENT SEED]: Populating communications and staff memos...');
    await conn.query(`
      INSERT INTO communications (id, title, content, type, status, priority, author_id, author_role, property_id, sent_at) VALUES
      (1, 'Executive Operations Directive: Easter Holiday Preparedness', 'All department heads are requested to ensure 100% inventory readiness, housekeeping turnarounds under 90 minutes, and concierge coverage for incoming diplomatic guests.', 'OPERATIONAL_NOTICE', 'SENT', 'HIGH', 1, 'SUPER_ADMIN', NULL, CURRENT_TIMESTAMP),
      (2, 'Housekeeping Standard Turnaround Checklists', 'Turnaround protocol v2.4 is now published. All rooms must have sanitary inspection seals and inventory checklists completed in the staff portal.', 'INTERNAL_MEMO', 'SENT', 'MEDIUM', 3, 'MANAGER', 1, CURRENT_TIMESTAMP),
      (3, 'Emergency Water Mains Pressure Notice (Ikoyi Sector)', 'Notice regarding municipal pressure fluctuation on Gerard Road. Azure Bay booster pumps automatically switched to primary reserve reservoir.', 'EMERGENCY_NOTICE', 'SENT', 'CRITICAL', 3, 'MANAGER', 2, CURRENT_TIMESTAMP),
      (4, 'Warm Festive Greetings & Welcome to our VIP Guests', 'The management and staff of BFA Apartments wish you a relaxing and productive stay in Lagos.', 'FESTIVE_WELCOME', 'SENT', 'LOW', 2, 'ADMIN', NULL, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE title=VALUES(title), status=VALUES(status);
    `);

    // Link recipients
    await conn.query(`
      INSERT INTO communication_recipients (communication_id, recipient_type, recipient_role) VALUES
      (1, 'ALL_STAFF', NULL),
      (2, 'ROLE', 'STAFF'),
      (3, 'PROPERTY_STAFF', NULL),
      (4, 'ALL', NULL)
      ON DUPLICATE KEY UPDATE recipient_type=VALUES(recipient_type);
    `);

    // 12. NOTIFICATIONS
      await conn.query(`
      INSERT INTO notifications (recipient_id, recipient_role, property_id, title, message, category, priority, is_read, link_url) VALUES
      (1, 'SUPER_ADMIN', 1, 'New Diplomatic Booking Confirmed', 'Reservation #2 confirmed for Sarah Jenkins at Grand Horizon Tower.', 'RESERVATIONS', 'HIGH', 0, '/app/reservations'),
      (1, 'SUPER_ADMIN', NULL, 'Critical Facilities Alert', 'Maintenance ticket #6 (Water Heater Thermostat) flagged as CRITICAL.', 'MAINTENANCE', 'HIGH', 0, '/app/maintenance'),
      (1, 'SUPER_ADMIN', NULL, 'New Public Announcement Broadcast', 'Announcement \"Welcome to BFA Apartments Luxury Portals\" is active.', 'ANNOUNCEMENT', 'LOW', 1, '/app/announcements'),
      (NULL, 'ADMIN', 1, 'Checkout Inspection Completed', 'Inspection #1 completed for Penthouse 101 with condition rating EXCELLENT.', 'INSPECTIONS', 'MEDIUM', 0, '/app/inspection'),
      (NULL, 'STAFF', 2, 'New Maintenance Task Assigned', 'Task MNT-2026-002 assigned for Unit 202 plumbing inspection.', 'MAINTENANCE', 'MEDIUM', 0, '/app/maintenance'),
      (NULL, 'MANAGER', NULL, 'Executive Directive Published', 'New staff memo: \"Easter Holiday Preparedness\" published by Super Admin.', 'COMMUNICATIONS', 'MEDIUM', 1, '/app/communications')
      ON DUPLICATE KEY UPDATE title=VALUES(title);
    `);
    });

    console.log('[DEVELOPMENT SEED]: ✓ Successfully populated comprehensive development seed dataset!');
    console.log('[DEVELOPMENT SEED]: Interconnected records ready across Users, Properties, Apartments, Guests, Reservations, Maintenance, Inspections, Employees, Badges, Announcements, Communications, and Notifications.');
  } catch (err) {
    console.error('[DEVELOPMENT SEED ERROR]: Failed to seed development data:', err);
    throw err;
  }
}

// Execute directly if run via CLI
if (require.main === module) {
  seedDevData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedDevData;
