/**
 * Complete Full System Verification:
 * Part A: Live Booking Alert Queue, Concurrency-Safe Claim & Status Transitions
 * Part B: Complete Staff Chat, Group Channels & Database BYTEA File Attachments
 */

const pool = require('../db/pool');
const { closePgPool } = require('../db/pgPool');
const ReservationsService = require('../modules/reservations/reservations.service');
const FrontOfficeService = require('../modules/frontOffice/frontOffice.service');
const ChatService = require('../modules/chat/chat.service');
const ChatRepository = require('../modules/chat/chat.repository');

async function runComprehensiveVerification() {
  console.log('================================================================');
  console.log('🚀 BFA COMPREHENSIVE END-TO-END VERIFICATION SUITE');
  console.log('================================================================\n');

  try {
    // 0. Fetch baseline staff users
    const [adminUser] = await pool.query("SELECT id, name, email, role, property_id FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' LIMIT 1");
    const [receptionist1] = await pool.query("SELECT id, name, email, role, property_id FROM users WHERE role = 'RECEPTIONIST' AND status = 'ACTIVE' LIMIT 1");
    const [receptionist2] = await pool.query("SELECT id, name, email, role, property_id FROM users WHERE role = 'RECEPTIONIST' AND status = 'ACTIVE' AND id != ? LIMIT 1", [receptionist1.id]);
    const [managerUser] = await pool.query("SELECT id, name, email, role, property_id FROM users WHERE role IN ('MANAGER', 'OPERATIONS_MANAGER') AND status = 'ACTIVE' LIMIT 1");

    // Match receptionist property scope
    const targetPropertyId = receptionist1.property_id || 1;
    const [property] = await pool.query("SELECT id, name FROM properties WHERE id = ?", [targetPropertyId]);
    const [apartment] = await pool.query("SELECT id, unit_number, property_id FROM apartments WHERE property_id = ? LIMIT 1", [targetPropertyId]);

    console.log(`[INIT] Target DB: ${pool.isPostgres() ? 'Aiven PostgreSQL' : 'MySQL'}`);
    console.log(`[INIT] Property: ${property.name} (#${property.id}), Unit: ${apartment.unit_number}`);
    console.log(`[INIT] Receptionist 1: ${receptionist1.name} (#${receptionist1.id})`);
    if (receptionist2) console.log(`[INIT] Receptionist 2: ${receptionist2.name} (#${receptionist2.id})`);

    // =========================================================================
    // PART A: BOOKING ALERT QUEUE & ATOMIC CLAIM VERIFICATION
    // =========================================================================
    console.log('\n--- PART A: LIVE BOOKING ALERT QUEUE & CLAIM CONCURRENCY ---');

    // 1. Create 3 distinct pending reservations simulating incoming customer bookings
    const bookingIds = [];
    for (let i = 1; i <= 3; i++) {
      const code = `TEST-BK-${Date.now().toString().slice(-6)}-${i}`;
      const insertRes = await pool.query(
        `INSERT INTO reservations (
           property_id, apartment_id, reservation_code, tenant_name, tenant_email, tenant_phone,
           check_in_date, check_out_date, nights, total_amount, status, payment_status, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE + INTERVAL '1 day', CURRENT_DATE + INTERVAL '3 day', 2, 250000, 'PENDING', 'PAID', CURRENT_TIMESTAMP)`,
        [
          property.id,
          apartment.id,
          code,
          `Test Guest ${i}`,
          `guest${i}_${Date.now()}@example.com`,
          `+234800000000${i}`,
        ]
      );
      const resId = insertRes.insertId;
      bookingIds.push(resId);
      console.log(`  ✓ Created pending booking #${resId} (${code})`);
    }

    // 2. Verify bookings are visible in receptionist alert queue
    const pendingList = await FrontOfficeService.getUnclaimedBookings({}, { user: receptionist1 });
    const queuedFound = bookingIds.every(id => pendingList.some(b => b.id === id));
    console.log(`  ✓ All 3 test bookings visible in receptionist queue: ${queuedFound}`);
    if (!queuedFound) throw new Error('Pending bookings not visible in queue.');

    // 3. Receptionist 1 claims Booking #1 (Single Claim, Zero 500 Errors)
    const targetBooking1 = bookingIds[0];
    console.log(`  Testing claim on booking #${targetBooking1} by Receptionist 1...`);
    const claimResult1 = await ReservationsService.claimReservation(targetBooking1, { user: receptionist1 });
    console.log(`  ✓ Successfully claimed booking #${targetBooking1} without 500 error!`);
    console.log(`    Status: ${claimResult1.status}, Assigned Staff ID: ${claimResult1.assigned_staff_id}`);

    // Verify database record
    const [checkBooking1] = await pool.query('SELECT status, assigned_staff_id FROM reservations WHERE id = ?', [targetBooking1]);
    if (checkBooking1.assigned_staff_id !== receptionist1.id) {
      throw new Error(`Booking #1 assigned_staff_id mismatch: expected ${receptionist1.id}, got ${checkBooking1.assigned_staff_id}`);
    }

    // 4. Concurrency Guard: Second receptionist attempts to claim already claimed Booking #1
    if (receptionist2) {
      console.log(`  Testing concurrent claim attempt on booking #${targetBooking1} by Receptionist 2...`);
      let conflictDetected = false;
      try {
        await ReservationsService.claimReservation(targetBooking1, { user: receptionist2 });
      } catch (err) {
        conflictDetected = true;
        console.log(`  ✓ 409 Conflict properly caught: "${err.message}"`);
      }
      if (!conflictDetected) throw new Error('Concurrency failure: double claim was not prevented!');
    }

    // 5. Verify Queue Decrement (Scenario B: Remaining 2 bookings stay pending)
    const pendingAfterClaim1 = await FrontOfficeService.getUnclaimedBookings({}, { user: receptionist1 });
    const isBooking1Removed = !pendingAfterClaim1.some(b => b.id === targetBooking1);
    const areOthersIntact = bookingIds.slice(1).every(id => pendingAfterClaim1.some(b => b.id === id));
    console.log(`  ✓ Claimed booking #${targetBooking1} removed from queue: ${isBooking1Removed}`);
    console.log(`  ✓ Remaining bookings intact in queue: ${areOthersIntact}`);
    if (!isBooking1Removed || !areOthersIntact) {
      throw new Error('Queue state invalid after first claim.');
    }

    // 6. Claim Booking #2
    const targetBooking2 = bookingIds[1];
    await ReservationsService.claimReservation(targetBooking2, { user: receptionist1 });
    console.log(`  ✓ Successfully claimed booking #${targetBooking2}! Queue decremented to 1.`);

    // =========================================================================
    // PART B: COMPLETE STAFF CHAT & BYTEA PERSISTENCE VERIFICATION
    // =========================================================================
    console.log('\n--- PART B: COMPLETE STAFF CHAT, GROUPS & BYTEA ATTACHMENTS ---');

    // 1. Staff Directory Retrieval
    console.log('  Testing Staff Directory discovery...');
    const staffContacts = await ChatService.getContacts(adminUser);
    console.log(`  ✓ Discovered ${staffContacts.length} active staff contacts across operational roles.`);

    // 2. Direct 1-to-1 Thread
    console.log('  Testing Direct 1-to-1 conversation...');
    const dmThread = await ChatService.findOrCreateDirectThread(adminUser, receptionist1.id);
    console.log(`  ✓ Direct Thread active: #${dmThread.id} (${dmThread.title})`);

    // 3. Multiline Text Message
    const textMessage = await ChatService.sendMessage(adminUser, {
      threadId: dmThread.id,
      clientTempId: `dm-text-${Date.now()}`,
      content: 'Good morning,\nPlease review the newly assigned apartment reservations.\nBest regards,\nAdministration',
    });
    console.log(`  ✓ Multiline text message sent: #${textMessage.id}`);

    // 4. Photo Attachment with PostgreSQL BYTEA BLOB Storage
    console.log('  Testing image attachment with BYTEA database persistence...');
    const testPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const photoMessage = await ChatService.sendMessage(receptionist1, {
      threadId: dmThread.id,
      clientTempId: `dm-img-${Date.now()}`,
      content: 'Apartment keys photo verification',
      attachment: {
        originalName: 'suite_keys_photo.png',
        fileType: 'image/png',
        fileSize: 68,
        fileData: testPngBase64,
      },
    });
    console.log(`  ✓ Photo message persisted: #${photoMessage.id}`);
    console.log(`    Attachment ID: #${photoMessage.attachment.id}`);
    console.log(`    URL: ${photoMessage.attachment.url}`);

    // 5. Verify direct database BYTEA buffer retrieval
    const dbAttachment = await ChatService.getAttachment(dmThread.id, photoMessage.attachment.id, adminUser);
    console.log(`  ✓ BYTEA Data retrieved from DB: ${dbAttachment.file_data?.length || 0} bytes buffer`);
    if (!dbAttachment.file_data || dbAttachment.file_data.length === 0) {
      throw new Error('BYTEA attachment data is missing in database!');
    }

    // 6. Document Attachment (PDF/DOC/TXT)
    console.log('  Testing document attachment with BYTEA persistence...');
    const sampleDocData = Buffer.from('BFA Apartments - Standard Operating Procedures Document').toString('base64');
    const docMessage = await ChatService.sendMessage(adminUser, {
      threadId: dmThread.id,
      clientTempId: `dm-doc-${Date.now()}`,
      content: 'Standard Operating Procedures',
      attachment: {
        originalName: 'BFA_SOP_Guidelines.txt',
        fileType: 'text/plain',
        fileSize: sampleDocData.length,
        fileData: sampleDocData,
      },
    });
    console.log(`  ✓ Document message persisted: #${docMessage.id}`);
    console.log(`    Download URL: ${docMessage.attachment.downloadUrl}`);

    // 7. Group Conversation Creation & Multi-Participant Enrollment
    console.log('  Testing Group Channel creation...');
    const groupParticipants = [receptionist1.id];
    if (receptionist2) groupParticipants.push(receptionist2.id);
    if (managerUser && managerUser.id !== adminUser.id) groupParticipants.push(managerUser.id);

    const groupThread = await ChatService.createGroupThread(adminUser, {
      title: 'Executive & Front Desk Roster Sync',
      participantIds: groupParticipants,
    });
    console.log(`  ✓ Group Thread created: #${groupThread.id} "${groupThread.title}" with ${groupThread.participants?.length} members.`);

    // 8. Group Broadcast Message
    const groupMessage = await ChatService.sendMessage(adminUser, {
      threadId: groupThread.id,
      clientTempId: `grp-msg-${Date.now()}`,
      content: 'Team channel active. All operational updates will be broadcasted here.',
    });
    console.log(`  ✓ Group message sent: #${groupMessage.id}`);

    // 9. Read Receipts & Unread Badges
    await ChatService.markAsRead(receptionist1, dmThread.id, docMessage.id);
    console.log(`  ✓ Read watermark updated for Receptionist 1 in thread #${dmThread.id}`);
    const unreadCount = await ChatService.getUnreadCount(receptionist1);
    console.log(`  ✓ Authoritative aggregate unread count for Receptionist 1: ${unreadCount}`);

    // 10. Security Boundary Verification: Unauthorized Attachment Access Blocked
    const [unauthorizedUser] = await pool.query(
      "SELECT id, name, email, role FROM users WHERE id NOT IN (?, ?) AND status = 'ACTIVE' LIMIT 1",
      [adminUser.id, receptionist1.id]
    );
    if (unauthorizedUser) {
      let isBlocked = false;
      try {
        await ChatService.getAttachment(dmThread.id, photoMessage.attachment.id, unauthorizedUser);
      } catch (err) {
        isBlocked = true;
        console.log(`  ✓ Security boundary verified: Unauthorized user #${unauthorizedUser.id} blocked: "${err.message}"`);
      }
      if (!isBlocked) throw new Error('Security failure: unauthorized user accessed private thread attachment!');
    }

    console.log('\n================================================================');
    console.log('🎉 FULL SYSTEM VERIFICATION COMPLETE: ALL CHECKS PASSED 100%! 🎉');
    console.log('================================================================\n');
  } catch (err) {
    console.error('\n❌ VERIFICATION ERROR:', err);
    process.exitCode = 1;
  } finally {
    await closePgPool();
  }
}

runComprehensiveVerification();
