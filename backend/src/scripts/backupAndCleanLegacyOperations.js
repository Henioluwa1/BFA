/**
 * Safe Backup & Clean-Slate Script for Legacy Operations / Dummy Tasks / Orphaned Chat Cards
 * BFA Apartments Management System
 *
 * Usage:
 *   Dry-run (backup + verification only, no deletion):
 *     node src/scripts/backupAndCleanLegacyOperations.js
 *   Execute cleanup after verifying backup:
 *     CONFIRM_CLEANUP=YES node src/scripts/backupAndCleanLegacyOperations.js --execute
 *
 * Security & Integrity Guarantees:
 * - Zero hardcoded credentials; uses runtime environment configuration only.
 * - Atomically writes a unique timestamped JSON backup (wx flag, never overwrites prior backups).
 * - Re-reads and validates parsed backup contents & exact counts before performing any DELETE.
 * - Preserves audit_logs, reservations, payments, accounting, users, employees, properties, and ordinary chat messages.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db/pool');
const config = require('../config');
const logger = require('../utils/logger');

const ELIGIBLE_CHAT_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'OPERATIONS_MANAGER',
  'OWNER',
  'RECEPTIONIST',
  'STAFF',
];

function serializeValue(v) {
  if (Buffer.isBuffer(v)) {
    return { __base64: v.toString('base64'), bytes: v.length };
  }
  if (v instanceof Date) {
    return v.toISOString();
  }
  if (Array.isArray(v)) {
    return v.map(serializeValue);
  }
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = serializeValue(val);
    }
    return out;
  }
  return v;
}

async function run({ execute = false } = {}) {
  const backupDir = path.resolve(__dirname, '../db/backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetDb = config.pg?.enabled ? config.pg.database : config.db.name;
  const targetHost = config.pg?.enabled ? config.pg.host : config.db.host;
  const backupFilename = `pre_ticket_cleanup_backup_${targetDb}_${stamp}.json`;
  const backupPath = path.join(backupDir, backupFilename);

  logger.info(`[BACKUP-CLEANUP] Extracting pre-cleanup snapshot from ${targetHost}/${targetDb}...`);

  // 1. Extract complete recoverable snapshot of affected operational/ticketing tables
  const centralOperations = await pool.query('SELECT * FROM central_operations ORDER BY id');
  const operationsMemos = await pool.query('SELECT * FROM operations_memos ORDER BY id');
  const recipients = await pool.query('SELECT * FROM central_operation_recipients ORDER BY id');
  const events = await pool.query('SELECT * FROM central_operation_events ORDER BY id');
  const tasks = await pool.query('SELECT * FROM operational_tasks ORDER BY id');
  const blockers = await pool.query('SELECT * FROM task_blockers ORDER BY id');

  const opChatMessages = await pool.query(
    `SELECT * FROM chat_messages
     WHERE context_entity_type IN ('OPERATION', 'MEMO', 'TASK', 'CENTRAL_OPERATION')
     ORDER BY id`
  );
  const opMessageIds = opChatMessages.map((m) => m.id);
  const opChatAcks = opMessageIds.length > 0
    ? await pool.query(
        `SELECT * FROM chat_message_acknowledgements
         WHERE message_id IN (${opMessageIds.map(() => '?').join(', ')})
         ORDER BY id`,
        opMessageIds
      )
    : [];

  const opsOnlyThreads = await pool.query(
    "SELECT * FROM chat_threads WHERE title LIKE '[OPS] %' ORDER BY id"
  );

  const generalGroupIneligible = await pool.query(
    `SELECT p.*, u.role AS user_role, u.name AS user_name
     FROM chat_thread_participants p
     JOIN chat_threads t ON t.id = p.thread_id
     JOIN users u ON u.id = p.user_id
     WHERE t.title = 'General Group'
       AND u.role NOT IN (${ELIGIBLE_CHAT_ROLES.map(() => '?').join(', ')})
     ORDER BY p.id`,
    ELIGIBLE_CHAT_ROLES
  );

  const memoDocuments = await pool.query(
    `SELECT * FROM operational_documents_storage
     WHERE entity_type IN ('OPERATIONS_MEMO', 'OPERATION_MEMO', 'CENTRAL_OPERATION', 'OPERATIONAL_TASK')
     ORDER BY id`
  );

  const opNotifications = await pool.query(
    `SELECT * FROM notifications
     WHERE source_entity_type IN ('CENTRAL_OPERATION', 'OPERATION', 'OPERATIONS_MEMO', 'OPERATIONAL_TASK')
     ORDER BY id`
  );

  const staffReportsLinked = await pool.query(
    'SELECT id, report_code, task_id FROM staff_operational_reports WHERE task_id IS NOT NULL ORDER BY id'
  );
  const queriesLinked = await pool.query(
    'SELECT id, query_code, linked_task_id FROM disciplinary_queries WHERE linked_task_id IS NOT NULL ORDER BY id'
  );

  const payload = {
    metadata: {
      created_at: new Date().toISOString(),
      target_database: targetDb,
      engine: config.pg?.enabled ? 'postgres' : 'mysql',
      purpose: 'Recoverable pre-cleanup backup before Operations-to-Ticketing clean slate',
    },
    expectedCounts: {
      central_operations: centralOperations.length,
      operations_memos: operationsMemos.length,
      central_operation_recipients: recipients.length,
      central_operation_events: events.length,
      operational_tasks: tasks.length,
      task_blockers: blockers.length,
      operation_chat_messages: opChatMessages.length,
      operation_chat_acknowledgements: opChatAcks.length,
      ops_only_threads: opsOnlyThreads.length,
      general_group_ineligible_participants: generalGroupIneligible.length,
      operational_documents_storage: memoDocuments.length,
      notifications: opNotifications.length,
    },
    tables: {
      central_operations: serializeValue(centralOperations),
      operations_memos: serializeValue(operationsMemos),
      central_operation_recipients: serializeValue(recipients),
      central_operation_events: serializeValue(events),
      operational_tasks: serializeValue(tasks),
      task_blockers: serializeValue(blockers),
      operation_chat_messages: serializeValue(opChatMessages),
      operation_chat_acknowledgements: serializeValue(opChatAcks),
      ops_only_threads: serializeValue(opsOnlyThreads),
      general_group_ineligible_participants: serializeValue(generalGroupIneligible),
      operational_documents_storage: serializeValue(memoDocuments),
      notifications: serializeValue(opNotifications),
      linked_references: {
        staff_operational_reports: serializeValue(staffReportsLinked),
        disciplinary_queries: serializeValue(queriesLinked),
      },
    },
  };

  // Write atomically without overwriting any prior backups
  fs.writeFileSync(backupPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', flag: 'wx' });

  // 2. Verify backup file immediately on disk
  const stats = fs.statSync(backupPath);
  if (!stats.isFile() || stats.size < 100) {
    throw new Error(`Backup verification failed: file '${backupPath}' missing or suspiciously small (${stats.size} bytes).`);
  }

  const rawReadBack = fs.readFileSync(backupPath, 'utf8');
  const parsed = JSON.parse(rawReadBack);
  const sha256 = crypto.createHash('sha256').update(rawReadBack).digest('hex');

  for (const [key, expectedLen] of Object.entries(payload.expectedCounts)) {
    const actualArr = parsed?.tables?.[key];
    if (!Array.isArray(actualArr) || actualArr.length !== expectedLen) {
      throw new Error(`Backup verification mismatch for '${key}': expected ${expectedLen}, got ${actualArr?.length}`);
    }
  }

  logger.info(`[BACKUP-CLEANUP] Backup verified cleanly: ${backupFilename} (${stats.size} bytes, sha256=${sha256.slice(0, 16)}...)`);

  if (!execute) {
    return {
      mode: 'DRY_RUN',
      backupFilename,
      backupPath,
      backupBytes: stats.size,
      backupSha256: sha256,
      counts: payload.expectedCounts,
      deleted: null,
    };
  }

  if (process.env.CONFIRM_CLEANUP !== 'YES') {
    throw new Error('Refusing destructive cleanup without CONFIRM_CLEANUP=YES environment confirmation.');
  }

  // 3. Execute transactional referentially safe cleanup
  const deletedCounts = await pool.withTransaction(async (conn) => {
    const exec = async (sql, params = []) => {
      const [res] = await conn.query(sql, params);
      return res?.affectedRows ?? res?.rowCount ?? 0;
    };

    // Break circular FK central_operations.latest_memo_id / chat_message_id first
    await exec('UPDATE central_operations SET latest_memo_id = NULL, chat_message_id = NULL');

    // Remove blockers & legacy operational tasks (sets staff_operational_reports.task_id & disciplinary_queries.linked_task_id to NULL via ON DELETE SET NULL)
    const deletedBlockers = await exec('DELETE FROM task_blockers');
    const deletedTasks = await exec('DELETE FROM operational_tasks');

    // Remove operations sub-ledgers then operations
    const deletedEvents = await exec('DELETE FROM central_operation_events');
    const deletedRecipients = await exec('DELETE FROM central_operation_recipients');
    const deletedMemos = await exec('DELETE FROM operations_memos');
    const deletedOperations = await exec('DELETE FROM central_operations');

    // Remove stored memo PDFs/docs only
    const deletedDocs = await exec(
      "DELETE FROM operational_documents_storage WHERE entity_type IN ('OPERATIONS_MEMO', 'OPERATION_MEMO', 'CENTRAL_OPERATION', 'OPERATIONAL_TASK')"
    );

    // Remove notifications specifically referencing legacy operations/tasks
    const deletedNotifs = await exec(
      "DELETE FROM notifications WHERE source_entity_type IN ('CENTRAL_OPERATION', 'OPERATION', 'OPERATIONS_MEMO', 'OPERATIONAL_TASK')"
    );

    // Remove orphaned & legacy operation/memo/task chat cards (preserving all ordinary chat text/media)
    const deletedOpChatMsgs = await exec(
      "DELETE FROM chat_messages WHERE context_entity_type IN ('OPERATION', 'MEMO', 'TASK', 'CENTRAL_OPERATION')"
    );

    // Remove empty [OPS] temporary threads created strictly for removed operations
    const deletedOpsThreads = await exec(
      `DELETE FROM chat_threads
       WHERE title LIKE '[OPS] %'
         AND NOT EXISTS (SELECT 1 FROM chat_messages cm WHERE cm.thread_id = chat_threads.id)`
    );

    // Refresh chat_threads.last_message_at cleanly after message removal
    await exec(
      `UPDATE chat_threads
       SET last_message_at = COALESCE(
         (SELECT MAX(cm.created_at) FROM chat_messages cm WHERE cm.thread_id = chat_threads.id AND cm.is_deleted = FALSE),
         chat_threads.created_at
       )`
    );

    // Remove ineligible roles (e.g., AGENT) from General Group
    const removedGeneralNonStaff = await exec(
      `DELETE FROM chat_thread_participants
       WHERE thread_id IN (SELECT id FROM chat_threads WHERE title = 'General Group')
         AND user_id IN (
           SELECT id FROM users WHERE role NOT IN (${ELIGIBLE_CHAT_ROLES.map(() => '?').join(', ')})
         )`,
      ELIGIBLE_CHAT_ROLES
    );

    // Record immutable audit event
    await exec(
      `INSERT INTO audit_logs (actor_email, actor_role, action, entity_type, entity_id, new_values)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'system-maintenance@bfa.internal',
        'SUPER_ADMIN',
        'LEGACY_OPERATIONS_CLEAN_SLATE_CLEANUP',
        'central_operations',
        backupFilename,
        JSON.stringify({
          backupFilename,
          backupSha256: sha256,
          backupBytes: stats.size,
          deletedCounts: {
            blockers: deletedBlockers,
            tasks: deletedTasks,
            events: deletedEvents,
            recipients: deletedRecipients,
            memos: deletedMemos,
            operations: deletedOperations,
            documents: deletedDocs,
            notifications: deletedNotifs,
            operationChatMessages: deletedOpChatMsgs,
            opsOnlyThreads: deletedOpsThreads,
            removedGeneralGroupIneligible: removedGeneralNonStaff,
          },
        }),
      ]
    );

    return {
      blockers: deletedBlockers,
      tasks: deletedTasks,
      events: deletedEvents,
      recipients: deletedRecipients,
      memos: deletedMemos,
      operations: deletedOperations,
      documents: deletedDocs,
      notifications: deletedNotifs,
      operationChatMessages: deletedOpChatMsgs,
      opsOnlyThreads: deletedOpsThreads,
      removedGeneralGroupIneligible: removedGeneralNonStaff,
    };
  });

  logger.info('[BACKUP-CLEANUP] Referential cleanup complete:', deletedCounts);

  return {
    mode: 'EXECUTED',
    backupFilename,
    backupPath,
    backupBytes: stats.size,
    backupSha256: sha256,
    backedUpCounts: payload.expectedCounts,
    deleted: deletedCounts,
  };
}

if (require.main === module) {
  const execute = process.argv.includes('--execute');
  run({ execute })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[BACKUP-CLEANUP ERROR]:', err.message);
      process.exit(1);
    });
}

module.exports = { run };
