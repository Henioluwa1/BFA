const { z } = require('zod');
const fs = require('fs');
const path = require('path');

module.exports = {
  actionId: 'dev.get_register',
  description: 'Retrieve the authoritative BFA Continuous Development Register, tracking verified features, baseline version, and release gates.',
  category: 'GOVERNANCE',
  classification: 'READ',
  riskLevel: 'LOW',
  permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'],
  requiredCapability: null,
  requiresConfirmation: false,
  requiresDualApproval: false,

  inputSchema: z
    .object({
      filterStatus: z.enum(['ALL', 'VERIFIED', 'IN_PROGRESS', 'BLOCKED', 'PLANNED']).optional(),
    })
    .strict(),

  propertyScoping: {
    mode: 'GLOBAL_PERMITTED',
  },

  summaryBuilder: () => 'Inspect BFA Continuous Development Register',

  async execute({ params }) {
    const registerPath = path.join(__dirname, '..', '..', '..', '..', '..', 'docs', 'development', 'DEVELOPMENT_REGISTER.md');
    let registerMarkdown = '';
    if (fs.existsSync(registerPath)) {
      registerMarkdown = fs.readFileSync(registerPath, 'utf8');
    }

    const tasks = [...registerMarkdown.matchAll(/^\| \*\*([^*]+)\*\* \| ([^|]+) \| ([^|]+) \| ([^|]+) \| \*\*([^*]+)\*\* \|/gm)]
      .map(([, id, domain, title, roles, status]) => ({ id: id.trim(), domain: domain.trim(), title: title.trim(), roles: roles.trim(), status: status.trim() }))
      .filter((task) => params.filterStatus === 'ALL' || !params.filterStatus || task.status === params.filterStatus);
    const releaseGates = [...registerMarkdown.matchAll(/^\| \*\*(GATE-[^*]+)\*\* \| ([^|]+) \| ([^|]+) \| ([^|]+) \| \*\*([^*]+)\*\* \| ([^|]+) \|/gm)]
      .map(([, gate, description, milestone, owner, status, criteria]) => ({ gate: gate.trim(), description: description.trim(), milestone: milestone.trim(), owner: owner.trim(), status: status.trim(), criteria: criteria.trim() }));

    return {
      registerMarkdown,
      releaseGates,
      tasks,
      hasDocumentationOnDisk: Boolean(registerMarkdown),
    };
  },
};

