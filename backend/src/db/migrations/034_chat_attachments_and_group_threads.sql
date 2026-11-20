-- Migration: 034_chat_attachments_and_group_threads.sql
-- Description: Group chat threads, chat attachments with LONGBLOB persistence, and attachment metadata.

-- 1. Ensure chat_threads allows GROUP
ALTER TABLE chat_threads MODIFY COLUMN thread_type VARCHAR(50) NOT NULL;

-- 2. Ensure chat_messages allows IMAGE, DOCUMENT, FILE
ALTER TABLE chat_messages MODIFY COLUMN message_type VARCHAR(50) NOT NULL DEFAULT 'TEXT';

-- 3. Create chat_attachments table with LONGBLOB binary storage
CREATE TABLE IF NOT EXISTS chat_attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id INT NOT NULL,
  thread_id INT NOT NULL,
  uploaded_by INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size BIGINT NOT NULL,
  storage_driver VARCHAR(50) NOT NULL DEFAULT 'DB_BLOB',
  storage_path VARCHAR(500) NULL,
  file_data LONGBLOB NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_attachments_msg (message_id),
  INDEX idx_chat_attachments_thread (thread_id),
  INDEX idx_chat_attachments_uploader (uploaded_by),
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
