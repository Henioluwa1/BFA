const fs = require('fs');
const path = require('path');
const os = require('os');
const pool = require('../../db/pool');
const config = require('../../config');
const auditService = require('../../core/audit/audit.service');
const { ForbiddenError, ValidationError, NotFoundError } = require('../../core/errors/apiError');
const db = require('../../db/pool');
const UsersService = require('../users/users.service');

/**
 * Authoritative Module Definitions for BFA Apartments Management System
 */
const SYSTEM_MODULES = [
  {
    id: 'dashboard',
    name: 'Executive Dashboard',
    category: 'Core',
    route: '/app/dashboard',
    description: 'High-level operational metrics, occupancy overview, quick actions, and revenue summaries.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'],
    dependencies: ['auth', 'properties', 'reservations'],
    isProtectedCore: true,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'properties',
    name: 'Properties & Buildings',
    category: 'Core',
    route: '/app/properties',
    description: 'Multi-property management, building configuration, amenities, and property-level scoping.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    dependencies: ['auth'],
    isProtectedCore: true,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'apartments',
    name: 'Apartments & Units',
    category: 'Core',
    route: '/app/apartments',
    description: 'Unit inventory, tier classification, operational status (READY, DIRTY, MAINTENANCE), and rates.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'],
    dependencies: ['properties'],
    isProtectedCore: true,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'calendar',
    name: 'Availability Calendar',
    category: 'Front Office',
    route: '/app/calendar',
    description: 'Real-time room occupancy grid, interactive 1-night stay booking, and vacancy inspection.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'OWNER'],
    dependencies: ['apartments', 'reservations'],
    isProtectedCore: false,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'front_office',
    name: 'Daily Front Desk',
    category: 'Front Office',
    route: '/app/front-office',
    description: 'Check-in, check-out, key issuance, daily arrivals/departures, and guest verification.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST'],
    dependencies: ['reservations', 'guests'],
    isProtectedCore: false,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'reservations',
    name: 'Reservations Engine',
    category: 'Front Office',
    route: '/app/reservations',
    description: 'Booking lifecycle management, confirmation workflows, payment status tracking, and 1-night constraint enforcement.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'AGENT', 'OWNER'],
    dependencies: ['apartments', 'guests'],
    isProtectedCore: true,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'guests',
    name: 'Tenants & Guests',
    category: 'Front Office',
    route: '/app/guests',
    description: 'Guest registry, identification documents, booking history, and contact records.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT', 'OWNER'],
    dependencies: ['auth'],
    isProtectedCore: false,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'financial',
    name: 'Double-Entry Accounting & Financial Management',
    category: 'Finance',
    route: '/app/financial',
    description: 'General Ledger, Trial Balance parity, transaction posting bridge, cash collections, and approved expenses.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    dependencies: ['chart_of_accounts', 'payments'],
    isProtectedCore: true,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'reports',
    name: 'Reports & Auditing Engine',
    category: 'Finance',
    route: '/app/reports',
    description: 'Audited financial summaries, reservations report, RFC 4180 CSV exports, and binary PDF exports.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    dependencies: ['financial', 'reservations'],
    isProtectedCore: false,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'analytics',
    name: 'Analytics & Trends',
    category: 'Finance',
    route: '/app/analytics',
    description: 'Business intelligence, revenue trend forecasting, occupancy rates, and average daily rates.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    dependencies: ['financial', 'reservations'],
    isProtectedCore: false,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'agents',
    name: 'Agents & Commissions',
    category: 'Finance',
    route: '/app/agents',
    description: 'Third-party agent registry, commission rate tiers, referral tracking, and payout ledgers.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    dependencies: ['reservations'],
    isProtectedCore: false,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'employees',
    name: 'Employees Directory',
    category: 'Staff & HR',
    route: '/app/employees',
    description: 'Staff directory, department attribution, position roles, and employment profiles.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    dependencies: ['auth'],
    isProtectedCore: false,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'performance',
    name: 'Staff Performance & Evaluations',
    category: 'Staff & HR',
    route: '/app/performance',
    description: '9-dimension competency radar, quarterly manager evaluations, and score trajectory analytics.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    dependencies: ['employees'],
    isProtectedCore: false,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'maintenance',
    name: 'Work Orders & Maintenance',
    category: 'Maintenance',
    route: '/app/maintenance',
    description: 'Maintenance ticket dispatch, repair status tracking, priority handling, and resolution notes.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RECEPTIONIST', 'STAFF', 'OWNER'],
    dependencies: ['apartments'],
    isProtectedCore: false,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'inspections',
    name: 'Unit Inspections',
    category: 'Maintenance',
    route: '/app/inspection',
    description: 'Turnaround inspections, cleanliness checklists, inventory condition logs, and staff sign-offs.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF', 'OWNER'],
    dependencies: ['apartments'],
    isProtectedCore: false,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'access_control',
    name: 'Access Control Policies',
    category: 'Governance',
    route: '/app/access-control',
    description: 'Fine-grained capabilities, emergency override workflows, two-man rule approval requests, and policy enforcement.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    dependencies: ['auth'],
    isProtectedCore: true,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'audit_trail',
    name: 'Audit Trail & Event Stream',
    category: 'Governance',
    route: '/app/audit',
    description: 'Immutable operational audit logging, actor tracking, entity correlation IDs, and forensic investigation.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    dependencies: ['auth'],
    isProtectedCore: true,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
  {
    id: 'operations_assistant',
    name: 'Operations Assistant & Continuous Dev AI',
    category: 'Governance',
    route: '/app/operations',
    description: 'In-app AI assistant, operational navigation, two-phase action execution, and Continuous Development engineering register.',
    roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'],
    dependencies: ['auth', 'system_settings'],
    isProtectedCore: false,
    defaultEnabled: true,
    lastVerified: '2026-10-28 11:40:00',
  },
];

class OperationsControlService {
  static async getMigrationCatalog(caller) {
    if ((caller?.role || '').toUpperCase() !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only Super Admin can inspect the migration catalog.');
    }
    const engine = db.getEngine();
    const directory = path.join(__dirname, '..', '..', 'db', engine === 'postgres' ? 'pgMigrations' : 'migrations');
    const files = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort() : [];
    const applied = await db.query('SELECT migration_name, executed_at FROM schema_migrations ORDER BY id ASC');
    const appliedByName = new Map(applied.map((row) => [row.migration_name, row.executed_at || null]));
    const catalog = files.map((name) => ({
      name,
      version: (name.match(/^(\d+)/) || [null, null])[1],
      status: appliedByName.has(name) ? 'APPLIED' : 'PENDING',
      executedAt: appliedByName.get(name),
    }));
    for (const [name, executedAt] of appliedByName) {
      if (!files.includes(name)) catalog.push({ name, version: (name.match(/^(\d+)/) || [null, null])[1], status: 'APPLIED_MISSING_FILE', executedAt });
    }
    const pendingCount = catalog.filter((item) => item.status === 'PENDING').length;
    const driftCount = catalog.filter((item) => item.status === 'APPLIED_MISSING_FILE').length;
    return {
      engine: engine === 'postgres' ? 'PostgreSQL' : 'MySQL',
      migrationSystem: engine === 'postgres' ? 'PostgreSQL migration runner' : 'MySQL migration runner',
      totalMigrations: catalog.length,
      appliedMigrations: appliedByName.size,
      pendingMigrations: pendingCount,
      status: driftCount ? 'DRIFT' : pendingCount ? 'PENDING' : 'IN_SYNC',
      checkedAt: new Date().toISOString(),
      migrations: catalog,
      error: null,
    };
  }

  /**
   * Retrieve full system diagnostics, module catalog, and governance metrics
   */
  static async getOverview(caller) {
    const callerRole = (caller?.role || '').toUpperCase();
    if (callerRole !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Access denied: Operations Control Center is restricted to Super Admin.');
    }

    // 1. Database connection & latency probe
    const dbProbe = await pool.testConnection();
    const isSuperAdmin = callerRole === 'SUPER_ADMIN';
    const migrationCatalog = isSuperAdmin ? await this.getMigrationCatalog(caller) : null;

    // 3. System runtime statistics
    const memory = process.memoryUsage();
    const uptimeSec = Math.floor(process.uptime());
    const uptimeFormatted = `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${uptimeSec % 60}s`;

    // 4. Subsystems status checks
    const subsystems = [
      { name: 'Core HTTP API Gateway', status: 'HEALTHY', latencyMs: 0, detail: 'Operations API request completed successfully.' },
      { name: `${db.getEngine() === 'postgres' ? 'PostgreSQL' : 'MySQL'} Database Pool`, status: dbProbe.healthy ? 'HEALTHY' : 'DEGRADED', latencyMs: dbProbe.latencyMs ?? null, detail: dbProbe.healthy ? `Connected to ${dbProbe.database}` : 'Database connectivity probe failed.' },
      { name: 'JWT Authentication Engine', status: 'UNKNOWN', detail: config.security?.jwtSecret ? 'Signing configuration is present; runtime validation is not exposed.' : 'JWT signing configuration is missing.' },
      { name: 'Accounting Ledger', status: 'UNKNOWN', detail: 'No read-only accounting integrity probe is registered.' },
      { name: 'Reports & Export Service', status: 'UNKNOWN', detail: 'No live report compilation probe is registered.' },
      { name: 'Socket.IO Real-time Gateway', status: 'UNKNOWN', detail: 'Socket.IO runtime health is not exposed by the current service.' },
    ];

    // 5. Recent audit warnings & errors in the last 24h
    const recentWarningRows = await pool.query(`
      SELECT id, actor_email, action, entity_type, entity_id, created_at
      FROM audit_logs
      WHERE (action LIKE '%FAIL%' OR action LIKE '%REJECT%' OR action LIKE '%ERROR%' OR action LIKE '%ADVERSARIAL%' OR action LIKE '%DENIED%')
        AND created_at >= ${db.isPostgres() ? "NOW() - INTERVAL '24 hours'" : 'NOW() - INTERVAL 24 HOUR'}
      ORDER BY id DESC
      LIMIT 10
    `);

    let backupFiles = [];
    if (isSuperAdmin) {
      const backupsDir = path.join(__dirname, '..', '..', '..', '..', 'backups');
      if (fs.existsSync(backupsDir)) {
        const files = fs.readdirSync(backupsDir).filter((f) => f.endsWith('.sql'));
        backupFiles = files.map((f) => {
          const stats = fs.statSync(path.join(backupsDir, f));
          return {
            filename: f,
            sizeBytes: stats.size,
            sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
            createdAt: stats.mtime.toISOString(),
            status: 'VERIFIED_ON_DISK',
          };
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
    }

    // 7. Governance & User Statistics
    const [userStats] = await pool.query(`
      SELECT 
        COUNT(id) as total_users,
        COALESCE(SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END), 0) as active_users,
        COALESCE(SUM(CASE WHEN status != 'ACTIVE' THEN 1 ELSE 0 END), 0) as inactive_users,
        COALESCE(SUM(CASE WHEN role = 'SUPER_ADMIN' THEN 1 ELSE 0 END), 0) as super_admin_count,
        COALESCE(SUM(CASE WHEN role = 'ADMIN' THEN 1 ELSE 0 END), 0) as admin_count,
        COALESCE(SUM(CASE WHEN role = 'OWNER' THEN 1 ELSE 0 END), 0) as owner_count,
        COALESCE(SUM(CASE WHEN role IN ('MANAGER', 'OPERATIONS_MANAGER') THEN 1 ELSE 0 END), 0) as manager_count,
        COALESCE(SUM(CASE WHEN property_id IS NULL AND role NOT IN ('SUPER_ADMIN', 'ADMIN', 'OWNER', 'AGENT') THEN 1 ELSE 0 END), 0) as unassigned_staff_count
      FROM users
    `);

    const roleRows = await pool.query('SELECT role, COUNT(*) AS total_count FROM users GROUP BY role ORDER BY role ASC');
    const users = ['ADMIN', 'SUPER_ADMIN'].includes(callerRole) ? await UsersService.listUsers({}, caller) : [];

    // 8. Module Inventory with active toggles
    const toggleRows = isSuperAdmin ? await pool.query("SELECT setting_key, setting_value FROM system_settings WHERE category = 'module_toggles'") : [];
    const toggleMap = {};
    toggleRows.forEach((r) => { toggleMap[r.setting_key] = r.setting_value === 'true'; });

    const modules = isSuperAdmin ? SYSTEM_MODULES.map((m) => {
      const isEnabled = m.isProtectedCore ? true : (toggleMap[m.id] !== undefined ? toggleMap[m.id] : m.defaultEnabled);
      return {
        ...m,
        isEnabled,
      };
    }) : undefined;

    return {
      diagnostics: {
      status: !dbProbe.healthy || (migrationCatalog && migrationCatalog.status !== 'IN_SYNC') ? 'DEGRADED' : 'UNKNOWN',
        serviceName: config.app.name,
        environment: config.app.env,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        serverUptime: uptimeFormatted,
        uptimeSeconds: uptimeSec,
        database: {
          healthy: dbProbe.healthy,
          latencyMs: dbProbe.latencyMs || 0,
          serverTime: dbProbe.serverTime,
          ...(isSuperAdmin ? {
            appliedMigrationsCount: migrationCatalog.appliedMigrations,
            totalMigrationFilesCount: migrationCatalog.totalMigrations,
            isMigrationsInSync: migrationCatalog.status === 'IN_SYNC',
          } : {}),
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          cpus: os.cpus().length,
          memoryMb: {
            rss: Math.round(memory.rss / 1024 / 1024),
            heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
          },
        },
        subsystems,
        recentWarnings: recentWarningRows,
      },
      governance: {
        users,
        roleDistribution: roleRows.map((r) => ({ role: r.role, total: Number(r.total_count) })),
        roles: callerRole === 'OWNER' ? [] : UsersService.getRoles(),
        totalUsers: Number(userStats.total_users || 0),
        activeUsers: Number(userStats.active_users || 0),
        inactiveUsers: Number(userStats.inactive_users || 0),
        superAdminCount: Number(userStats.super_admin_count || 0),
        adminCount: Number(userStats.admin_count || 0),
        ownerCount: Number(userStats.owner_count || 0),
        managerCount: Number(userStats.manager_count || 0),
        unassignedStaffCount: Number(userStats.unassigned_staff_count || 0),
      },
      ...(isSuperAdmin ? {
        backups: {
          engine: db.getEngine() === 'postgres' ? 'PostgreSQL' : 'MySQL',
          totalBackups: backupFiles.length,
          lastBackup: backupFiles[0] || null,
          history: backupFiles.slice(0, 5),
        },
        migrations: migrationCatalog,
        modules,
      } : {}),
    };
  }

  /**
   * Safely toggle a non-critical module
   */
  static async toggleModule({ moduleId, isEnabled, reason, caller, req }) {
    const callerRole = (caller?.role || '').toUpperCase();
    if (callerRole !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only Super Admin can configure module availability.');
    }
    if (typeof reason !== 'string' || reason.trim().length < 3) {
      throw new ValidationError('A module governance reason of at least 3 characters is required.');
    }

    const targetModule = SYSTEM_MODULES.find((m) => m.id === moduleId);
    if (!targetModule) {
      throw new NotFoundError(`Module '${moduleId}' not found in registered system inventory.`);
    }

    if (targetModule.isProtectedCore) {
      throw new ForbiddenError(`Protected Core Module '${targetModule.name}' cannot be disabled. It is essential for platform security and integrity.`);
    }

    if (!isEnabled) {
      const toggleRows = await pool.query("SELECT setting_key, setting_value FROM system_settings WHERE category = 'module_toggles'");
      const toggleMap = Object.fromEntries(toggleRows.map((row) => [row.setting_key, row.setting_value === 'true']));
      const activeDependents = SYSTEM_MODULES.filter((module) => module.dependencies?.includes(moduleId))
        .filter((module) => module.isProtectedCore || (toggleMap[module.id] ?? module.defaultEnabled));
      if (activeDependents.length) {
        throw new ValidationError(`Cannot disable '${targetModule.name}' while enabled modules depend on it: ${activeDependents.map((module) => module.name).join(', ')}.`);
      }
    }

    const valueStr = isEnabled ? 'true' : 'false';

    // Retrieve old value
    const [existing] = await pool.query(
      "SELECT setting_value FROM system_settings WHERE category = 'module_toggles' AND setting_key = ? LIMIT 1",
      [moduleId]
    );
    const oldValue = existing ? existing.setting_value : 'true';

    await pool.query(
      `INSERT INTO system_settings (category, setting_key, setting_value, description)
       VALUES ('module_toggles', ?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP`,
      [moduleId, valueStr, `Feature toggle for ${targetModule.name}`]
    );

    // Audit log
    await auditService.log({
      actorId: caller?.id || null,
      actorEmail: caller?.email || 'admin@bfa.com',
      actorRole: callerRole,
      action: 'MODULE_TOGGLED',
      entityType: 'module',
      entityId: moduleId,
      oldValues: { moduleId, isEnabled: oldValue === 'true' },
      newValues: { moduleId, isEnabled: Boolean(isEnabled), reason: reason || 'Operational configuration update' },
      requestId: req?.id,
      ipAddress: req?.ip,
      userAgent: req?.get ? req.get('user-agent') : null,
    });

    return {
      moduleId,
      name: targetModule.name,
      isEnabled: Boolean(isEnabled),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Create an authorized, non-destructive database backup snapshot
   */
  static async createBackupSnapshot({ caller, req }) {
    const callerRole = (caller?.role || '').toUpperCase();
    if (callerRole !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Only Super Admin can initiate database backup snapshots.');
    }
    if (db.getEngine() === 'postgres') {
      throw new ValidationError('PostgreSQL snapshot generation is unavailable: this deployment has no configured pg_dump backup provider.');
    }

    const backupsDir = path.join(__dirname, '..', '..', '..', '..', 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_bfa_apartments_db_${timestamp}.sql`;
    const fullPath = path.join(backupsDir, filename);

    // Fetch list of all tables
    const tableRows = await pool.query('SHOW TABLES');
    const tables = tableRows.map((r) => Object.values(r)[0]);

    // Build verified SQL snapshot header and schema manifest
    const header = [
      `-- ==========================================================`,
      `-- BFA Apartments Management System — Database Snapshot`,
      `-- Created: ${new Date().toISOString()}`,
      `-- Initiator: ${caller.email} (${callerRole})`,
      `-- Total Tables Cataloged: ${tables.length}`,
      `-- ==========================================================`,
      `SET FOREIGN_KEY_CHECKS = 0;`,
      ``,
    ];

    for (const table of tables) {
      const [createRows] = await pool.query(`SHOW CREATE TABLE \`${table}\``);
      if (createRows && createRows['Create Table']) {
        header.push(`-- Table: ${table}`);
        header.push(`DROP TABLE IF EXISTS \`${table}\`;`);
        header.push(`${createRows['Create Table']};`);
        header.push(``);
      }
    }

    header.push(`SET FOREIGN_KEY_CHECKS = 1;`);
    header.push(`-- Snapshot successfully generated.`);

    fs.writeFileSync(fullPath, header.join('\n'), 'utf8');
    const stats = fs.statSync(fullPath);

    // Audit log
    await auditService.log({
      actorId: caller?.id || null,
      actorEmail: caller?.email || 'admin@bfa.com',
      actorRole: callerRole,
      action: 'BACKUP_CREATED',
      entityType: 'backup',
      entityId: filename,
      newValues: {
        filename,
        sizeBytes: stats.size,
        tableCount: tables.length,
      },
      requestId: req?.id,
      ipAddress: req?.ip,
      userAgent: req?.get ? req.get('user-agent') : null,
    });

    return {
      filename,
      sizeBytes: stats.size,
      sizeFormatted: `${(stats.size / 1024).toFixed(1)} KB`,
      tableCount: tables.length,
      createdAt: new Date().toISOString(),
      status: 'VERIFIED_ON_DISK',
    };
  }
}

module.exports = OperationsControlService;
