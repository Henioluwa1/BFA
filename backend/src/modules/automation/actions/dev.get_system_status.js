const { z } = require('zod');
const OperationsControlService = require('../../system/operationsControl.service');

module.exports = {
  actionId: 'dev.get_system_status',
  description: 'Retrieve verified real-time BFA system diagnostic metrics, database migration status, and subsystem health.',
  category: 'GOVERNANCE',
  classification: 'READ',
  riskLevel: 'LOW',
  permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'],
  requiredCapability: null,
  requiresConfirmation: false,
  requiresDualApproval: false,

  inputSchema: z.object({}).strict(),

  propertyScoping: {
    mode: 'GLOBAL_PERMITTED',
  },

  summaryBuilder: () => 'Inspect BFA Real-Time System Diagnostic Status',

  async execute({ user }) {
    const overview = await OperationsControlService.getOverview(user);

    return {
      status: overview.diagnostics.status,
      uptime: overview.diagnostics.serverUptime,
      database: {
        latencyMs: overview.diagnostics.database.latencyMs,
        appliedMigrations: overview.diagnostics.database.appliedMigrationsCount,
        inSync: overview.diagnostics.database.isMigrationsInSync,
      },
      runtime: {
        nodeVersion: overview.diagnostics.system.nodeVersion,
        memoryUsedMb: overview.diagnostics.system.memoryMb.heapUsed,
        platform: overview.diagnostics.system.platform,
      },
      subsystemsCount: overview.diagnostics.subsystems.length,
      totalUsers: overview.governance.totalUsers,
      totalModules: overview.modules.length,
      backupsCount: overview.backups.totalBackups,
      recentWarningsCount: overview.diagnostics.recentWarnings.length,
    };
  },
};

