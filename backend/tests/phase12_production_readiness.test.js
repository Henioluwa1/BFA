/**
 * Phase 12: Production Readiness, Security Hardening & Observability Tests
 */
const request = require('supertest');
const app = require('../src/app');
const logger = require('../src/core/logging/logger');
const { validateEnvironment } = require('../src/config/envValidator');
const pool = require('../src/db/pool');

describe('Phase 12: Production Readiness, Security Hardening & Observability', () => {
  afterAll(async () => {
    await pool.closePool();
  });

  describe('1. Health Probes & Observability', () => {
    it('should return 200 with process live status on /api/v1/health/live', async () => {
      const res = await request(app).get('/api/v1/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('live');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.timestamp).toBeDefined();
    });

    it('should return 200 with database and pdfStorage checks on /api/v1/health/ready', async () => {
      const res = await request(app).get('/api/v1/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.database).toBe('ok');
      expect(res.body.checks.pdfStorage).toBe('ok');
    });
  });

  describe('2. Security Headers & Content Security Policy', () => {
    it('should return strict Helmet security headers on responses', async () => {
      const res = await request(app).get('/api/v1/health/live');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("default-src 'self'");
      expect(res.headers['content-security-policy']).toContain("object-src 'none'");
    });
  });

  describe('3. Sensitive Data Scrubbing', () => {
    it('should redact sensitive keys from log metadata', () => {
      const sensitivePayload = {
        userId: 42,
        email: 'admin@bfagroup.com',
        password: 'PlainTextPassword123!',
        password_hash: '$2a$12$e0MYz4wH9...',
        token: 'eyJhbGciOiJIUzI1NiIsIn...',
        jwt_secret: 'super_secret_key_here',
        card_number: '4111222233334444',
        cvv: '123',
        pin: '9999',
        db_password: 'root_db_password',
        nested: {
          refreshToken: 'refresh_tok_998',
          regularField: 'safe_value',
        },
      };

      const sanitized = logger.sanitizeMeta(sensitivePayload);

      expect(sanitized.userId).toBe(42);
      expect(sanitized.email).toBe('admin@bfagroup.com');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.password_hash).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.jwt_secret).toBe('[REDACTED]');
      expect(sanitized.card_number).toBe('[REDACTED]');
      expect(sanitized.cvv).toBe('[REDACTED]');
      expect(sanitized.pin).toBe('[REDACTED]');
      expect(sanitized.db_password).toBe('[REDACTED]');
      expect(sanitized.nested.refreshToken).toBe('[REDACTED]');
      expect(sanitized.nested.regularField).toBe('safe_value');
    });
  });

  describe('4. Startup Environment Validation', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should validate development environment successfully', () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'any_dev_secret_key';
      process.env.DB_HOST = '127.0.0.1';
      process.env.DB_USER = 'root';
      process.env.DB_NAME = 'bfa_apartments_db';

      const result = validateEnvironment();
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should fail validation in production if JWT_SECRET is insecure default or short', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'bfa_super_secret_default_key';
      process.env.DB_HOST = 'mariadb';
      process.env.DB_USER = 'bfa_user';
      process.env.DB_NAME = 'bfa_apartments_db';
      process.env.DB_PASSWORD = 'strong_password_123';
      process.env.CORS_ORIGIN = 'https://app.bfagroup.com';

      const result = validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('JWT_SECRET'))).toBe(true);
    });

    it('should fail validation in production if CORS_ORIGIN is wildcard or missing', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'random_high_entropy_sha256_production_secret_key_32chars';
      process.env.DB_HOST = 'mariadb';
      process.env.DB_USER = 'bfa_user';
      process.env.DB_NAME = 'bfa_apartments_db';
      process.env.DB_PASSWORD = 'strong_password_123';
      process.env.CORS_ORIGIN = '*';

      const result = validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('CORS_ORIGIN'))).toBe(true);
    });

    it('should pass validation in production when all parameters are properly configured', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'random_high_entropy_sha256_production_secret_key_32chars';
      process.env.DB_HOST = 'mariadb';
      process.env.DB_USER = 'bfa_user';
      process.env.DB_NAME = 'bfa_apartments_db';
      process.env.DB_PASSWORD = 'strong_password_123';
      process.env.CORS_ORIGIN = 'https://app.bfagroup.com';

      const result = validateEnvironment();
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('5. Database Indexes from Migration 014', () => {
    it('should have applied production composite indexes on audit_logs and notifications', async () => {
      const auditIndexes = await pool.query('SHOW INDEX FROM audit_logs');
      const notifIndexes = await pool.query('SHOW INDEX FROM notifications');

      const auditKeyNames = auditIndexes.map((i) => i.Key_name);
      const notifKeyNames = notifIndexes.map((i) => i.Key_name);

      expect(auditKeyNames).toContain('idx_audit_actor_role');
      expect(auditKeyNames).toContain('idx_audit_created_id');
      expect(notifKeyNames).toContain('idx_notif_recipient_is_read');
    });
  });
});
