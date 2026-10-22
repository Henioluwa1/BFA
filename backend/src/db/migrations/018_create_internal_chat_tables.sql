-- Migration: 018_create_internal_chat_tables.sql
-- Description: Provision authoritative database schema for Phase 4 Internal Chat & Communication System (WP-4.1)
-- Tables: chat_threads, chat_thread_participants, chat_messages, chat_message_receipts, chat_retention_policies

-- 1. Chat Threads Table (Direct Conversations & Property Team Channels)
CREATE TABLE IF NOT EXISTS chat_threads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  thread_type ENUM('DIRECT', 'PROPERTY_CHANNEL', 'SYSTEM_BROADCAST') NOT NULL,
  property_id INT NULL COMMENT 'Scoping property. NULL for global admin direct threads',
  title VARCHAR(150) NULL COMMENT 'Channel name or direct chat label',
  created_by INT NOT NULL,
  direct_hash VARCHAR(64) NULL UNIQUE COMMENT 'Deterministic hash of min(u1,u2):max(u1,u2) for 1-to-1 deduplication',
  status ENUM('ACTIVE', 'ARCHIVED', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
  last_message_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_threads_prop_type (property_id, thread_type),
  INDEX idx_threads_last_msg (last_message_at DESC),
  INDEX idx_threads_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Chat Thread Participants Table (Membership & Monotonic Read Watermarks)
CREATE TABLE IF NOT EXISTS chat_thread_participants (
  id INT AUTO_INCREMENT PRIMARY KEY,
  thread_id INT NOT NULL,
  user_id INT NOT NULL,
  role ENUM('MEMBER', 'MODERATOR', 'ADMIN') NOT NULL DEFAULT 'MEMBER',
  last_read_message_id INT NULL COMMENT 'Authoritative high-water mark of read messages for instant unread calculation',
  last_read_at TIMESTAMP NULL,
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP NULL COMMENT 'Soft-removal timestamp for participant departure / access revocation',
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_thread_user (thread_id, user_id),
  INDEX idx_participant_user (user_id, left_at),
  INDEX idx_participant_watermark (thread_id, user_id, last_read_message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Chat Messages Table (Authoritative Message Sequence & Idempotency)
CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  thread_id INT NOT NULL,
  sender_id INT NOT NULL,
  client_temp_id VARCHAR(64) NULL COMMENT 'Client-generated UUID for submission idempotency and deduplication',
  message_type ENUM('TEXT', 'CONTEXT_LINK', 'SYSTEM_NOTICE') NOT NULL DEFAULT 'TEXT',
  content TEXT NOT NULL COMMENT 'Sanitized text content (max 2000 chars)',
  context_entity_type ENUM('PROPERTY', 'APARTMENT', 'RESERVATION', 'GUEST', 'MAINTENANCE', 'INSPECTION') NULL,
  context_entity_id INT NULL,
  is_edited BOOLEAN NOT NULL DEFAULT FALSE,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Soft-deletion flag for compliance / moderation',
  deleted_by INT NULL,
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE RESTRICT,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_thread_client_temp (thread_id, client_temp_id),
  INDEX idx_messages_thread_seq (thread_id, id DESC),
  INDEX idx_messages_sender (sender_id),
  INDEX idx_messages_context (context_entity_type, context_entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Chat Message Receipts Table (Auxiliary Per-Message Status for 1-to-1 DMs)
CREATE TABLE IF NOT EXISTS chat_message_receipts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('SENT', 'DELIVERED', 'READ') NOT NULL DEFAULT 'DELIVERED',
  delivered_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_msg_user_receipt (message_id, user_id),
  INDEX idx_receipts_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Chat Retention Policies Table (Governance & Indefinite Default Retention)
CREATE TABLE IF NOT EXISTS chat_retention_policies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NULL UNIQUE COMMENT 'NULL represents global default retention policy',
  retention_days INT NOT NULL DEFAULT 0 COMMENT '0 indicates infinite retention / no automatic purge',
  archival_mode ENUM('INDEFINITE_ACTIVE', 'SOFT_ARCHIVE', 'EXPORT_ONLY') NOT NULL DEFAULT 'INDEFINITE_ACTIVE',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Seed Baseline Default Global Retention Policy (Indefinite Retention)
INSERT IGNORE INTO chat_retention_policies (id, property_id, retention_days, archival_mode, is_active, updated_by)
VALUES (1, NULL, 0, 'INDEFINITE_ACTIVE', TRUE, 1);
