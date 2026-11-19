-- ==============================================================================
-- BFA Apartments Management System
-- Migration: 014_production_indexing_and_performance.sql
-- Description: Production composite indexes for performance optimization and fast aggregations
-- ==============================================================================

-- 1. Audit Trail: Optimize role filtering and deterministic sorted pagination
CREATE INDEX IF NOT EXISTS idx_audit_actor_role ON audit_logs (actor_role);
CREATE INDEX IF NOT EXISTS idx_audit_created_id ON audit_logs (created_at DESC, id DESC);

-- 2. Notifications: Optimize unread status lookup and recipient retrieval
CREATE INDEX IF NOT EXISTS idx_notif_recipient_is_read ON notifications (recipient_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_role_is_read ON notifications (recipient_role, is_read, created_at);

-- 3. Financial Ledger & Payments: Optimize reporting aggregations and transaction lookups
CREATE INDEX IF NOT EXISTS idx_pay_created_at ON payment_transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_pay_res_status ON payment_transactions (reservation_id, status);

-- 4. Expenses: Optimize property-scoped date filtering for financial statements
CREATE INDEX IF NOT EXISTS idx_exp_prop_date ON expenses (property_id, expense_date);

-- 5. Reservations: Optimize calendar queries and multi-property operational availability
CREATE INDEX IF NOT EXISTS idx_res_prop_dates ON reservations (property_id, check_in_date, check_out_date);
