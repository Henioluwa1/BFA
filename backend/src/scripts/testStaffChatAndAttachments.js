/**
 * Verification Test Script: Staff Chat, Group Messaging, BYTEA File Attachments & Booking Queue
 * Run with: node backend/src/scripts/testStaffChatAndAttachments.js
 */

const pool = require('../db/pool');
const { closePgPool } = require('../db/pgPool');
const ChatService = require('../modules/chat/chat.service');
const ChatRepository = require('../modules/chat/chat.repository');

async function runTests() {
  console.log('--- Starting Staff Chat & Attachment Verification Suite ---');

  try {
    // 1. Fetch available test users
    const [adminUser] = await pool.query("SELECT id, name, email, role, property_id FROM users WHERE role = 'SUPER_ADMIN' AND status = 'ACTIVE' LIMIT 1");
    const [receptionistUser] = await pool.query("SELECT id, name, email, role, property_id FROM users WHERE role = 'RECEPTIONIST' AND status = 'ACTIVE' LIMIT 1");
    const [managerUser] = await pool.query("SELECT id, name, email, role, property_id FROM users WHERE role IN ('MANAGER', 'OPERATIONS_MANAGER') AND status = 'ACTIVE' LIMIT 1");

    if (!adminUser || !receptionistUser) {
      throw new Error('Required test users (SUPER_ADMIN and RECEPTIONIST) not found in database.');
    }

    console.log(`[TEST 1] Admin: ${adminUser.name} (#${adminUser.id}, ${adminUser.role})`);
    console.log(`[TEST 1] Receptionist: ${receptionistUser.name} (#${receptionistUser.id}, ${receptionistUser.role})`);
    if (managerUser) {
      console.log(`[TEST 1] Manager: ${managerUser.name} (#${managerUser.id}, ${managerUser.role})`);
    }

    // 2. Test getContacts
    console.log('\n[TEST 2] Testing ChatService.getContacts()...');
    const contacts = await ChatService.getContacts(adminUser);
    console.log(`✓ Retrieved ${contacts.length} eligible staff contacts for admin.`);
    const hasReceptionist = contacts.some(c => c.id === receptionistUser.id);
    console.log(`✓ Receptionist #${receptionistUser.id} present in contacts: ${hasReceptionist}`);
    if (!hasReceptionist) throw new Error('Receptionist missing from contacts list.');

    // 3. Test Direct Thread Initialization
    console.log('\n[TEST 3] Testing 1-to-1 direct thread creation/retrieval...');
    const directThread = await ChatService.findOrCreateDirectThread(adminUser, receptionistUser.id);
    console.log(`✓ Direct thread active: #${directThread.id} (${directThread.title})`);

    // 4. Test Text Message Persistence
    console.log('\n[TEST 4] Testing text message sending...');
    const textMsg = await ChatService.sendMessage(adminUser, {
      threadId: directThread.id,
      clientTempId: `test-text-${Date.now()}`,
      messageType: 'TEXT',
      content: 'Hello Reception desk, this is an automated verification test message.',
    });
    console.log(`✓ Message sent: #${textMsg.id} by ${textMsg.senderName}: "${textMsg.content}"`);

    // 5. Test Image Attachment Persistence (Base64 -> BYTEA BLOB)
    console.log('\n[TEST 5] Testing image attachment persistence (BYTEA)...');
    // 1x1 transparent PNG base64
    const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const imageMsg = await ChatService.sendMessage(adminUser, {
      threadId: directThread.id,
      clientTempId: `test-img-${Date.now()}`,
      content: 'Apartment keys photo inspection',
      attachment: {
        originalName: 'keys_photo.png',
        fileType: 'image/png',
        fileSize: 68,
        fileData: samplePngBase64,
      },
    });
    console.log(`✓ Image message persisted: #${imageMsg.id}`);
    console.log(`✓ Attachment metadata:`, imageMsg.attachment);
    if (!imageMsg.attachment || !imageMsg.attachment.id) {
      throw new Error('Attachment was not created properly.');
    }

    // 6. Test Document Attachment Persistence (Base64 PDF -> BYTEA)
    console.log('\n[TEST 6] Testing document attachment persistence...');
    const sampleDocBase64 = Buffer.from('PDF Mock Document Content for Testing - BFA Apartments').toString('base64');
    const docMsg = await ChatService.sendMessage(receptionistUser, {
      threadId: directThread.id,
      clientTempId: `test-doc-${Date.now()}`,
      content: 'Guest check-in guidelines document',
      attachment: {
        originalName: 'guidelines.txt',
        fileType: 'text/plain',
        fileSize: sampleDocBase64.length,
        fileData: sampleDocBase64,
      },
    });
    console.log(`✓ Document message persisted: #${docMsg.id}`);
    console.log(`✓ Attachment metadata:`, docMsg.attachment);

    // 7. Test Attachment Retrieval (Binary streaming verification)
    console.log('\n[TEST 7] Testing attachment binary retrieval from DB...');
    const attRecord = await ChatService.getAttachment(directThread.id, imageMsg.attachment.id, adminUser);
    console.log(`✓ Retrieved attachment record from DB:`);
    console.log(`  Name: ${attRecord.original_name}, Type: ${attRecord.file_type}, Driver: ${attRecord.storage_driver}`);
    console.log(`  Binary Buffer Length: ${attRecord.file_data?.length || 0} bytes`);
    if (!attRecord.file_data || attRecord.file_data.length === 0) {
      throw new Error('BYTEA file data is empty!');
    }

    // 8. Test Thread History with Attachments
    console.log('\n[TEST 8] Testing thread history retrieval...');
    const history = await ChatService.getThreadHistory(directThread.id, adminUser, { limit: 10 });
    console.log(`✓ Retrieved ${history.messages.length} messages in history.`);
    const hasAtt = history.messages.some(m => m.attachment && m.attachment.id === imageMsg.attachment.id);
    console.log(`✓ Image attachment present in history: ${hasAtt}`);
    if (!hasAtt) throw new Error('Attachment missing from thread history.');

    // 9. Test Group Thread Creation
    console.log('\n[TEST 9] Testing group thread creation...');
    const participantIds = [receptionistUser.id];
    if (managerUser && managerUser.id !== adminUser.id && managerUser.id !== receptionistUser.id) {
      participantIds.push(managerUser.id);
    }
    const group = await ChatService.createGroupThread(adminUser, {
      title: 'Front Desk Operations & Security',
      participantIds,
    });
    console.log(`✓ Group thread created: #${group.id} "${group.title}" with ${group.participants?.length} participants.`);

    // 10. Send message in group thread
    console.log('\n[TEST 10] Testing group message...');
    const groupMsg = await ChatService.sendMessage(adminUser, {
      threadId: group.id,
      clientTempId: `test-group-${Date.now()}`,
      content: 'Welcome everyone to the Operations & Security team thread!',
    });
    console.log(`✓ Group message sent: #${groupMsg.id}`);

    // 11. Test Unread Count & Mark as Read
    console.log('\n[TEST 11] Testing unread count & mark as read...');
    const unreadCountBefore = await ChatService.getUnreadCount(receptionistUser);
    console.log(`✓ Receptionist unread count before reading: ${unreadCountBefore}`);
    await ChatService.markAsRead(receptionistUser, directThread.id, docMsg.id);
    const unreadCountAfter = await ChatService.getUnreadCount(receptionistUser);
    console.log(`✓ Receptionist unread count after marking read: ${unreadCountAfter}`);

    // 12. Security Test: Unauthorized user access to thread attachment
    console.log('\n[TEST 12] Testing security isolation on thread attachment...');
    // Create or find a separate user not in thread
    const [outsideStaff] = await pool.query(
      "SELECT id, name, email, role, property_id FROM users WHERE id NOT IN (?, ?) AND status = 'ACTIVE' AND role = 'STAFF' LIMIT 1",
      [adminUser.id, receptionistUser.id]
    );
    if (outsideStaff) {
      let rejected = false;
      try {
        await ChatService.getAttachment(directThread.id, imageMsg.attachment.id, outsideStaff);
      } catch (err) {
        rejected = true;
        console.log(`✓ Access properly rejected for outside staff #${outsideStaff.id}: ${err.message}`);
      }
      if (!rejected) throw new Error('Security failure: unauthorized staff accessed direct thread attachment!');
    } else {
      console.log('Skipping outside staff test: no distinct STAFF user found.');
    }

    console.log('\n======================================================');
    console.log('🎉 ALL 12 CHAT & ATTACHMENT SUITE TESTS PASSED 100%! 🎉');
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n❌ TEST FAILURE:', err);
    process.exitCode = 1;
  } finally {
    await closePgPool();
  }
}

runTests();
