const { z } = require('zod');

module.exports = {
  actionId: 'dev.plan_task',
  description: 'Generate a structured 10-step Continuous Development implementation plan for a proposed BFA feature or remediation.',
  category: 'GOVERNANCE',
  classification: 'READ',
  riskLevel: 'LOW',
  permittedRoles: ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'],
  requiredCapability: null,
  requiresConfirmation: false,
  requiresDualApproval: false,

  inputSchema: z
    .object({
      taskTitle: z.string().min(3, 'Task title must be at least 3 characters'),
      taskDescription: z.string().optional(),
      category: z.enum(['ACCOUNTING', 'OPERATIONS', 'SECURITY', 'REPORTS', 'INFRASTRUCTURE', 'GOVERNANCE']).optional().default('OPERATIONS'),
      priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional().default('MEDIUM'),
    })
    .strict(),

  propertyScoping: {
    mode: 'GLOBAL_PERMITTED',
  },

  summaryBuilder: ({ params }) => `Generate 10-step implementation plan for: ${params.taskTitle}`,

  async execute({ params }) {
    const { taskTitle, taskDescription, category, priority } = params;

    const steps = [
      {
        step: 1,
        phase: 'Baseline Discovery & Inspection',
        description: `Inspect database tables, active queries, and existing modules relevant to "${taskTitle}". Establish ground truth from MariaDB schema and real controller/service files.`,
      },
      {
        step: 2,
        phase: 'Safety & Isolation Constraints',
        description: 'Verify Git working tree and index. Ensure pre-existing staged files and independent workstreams (e.g. landing page) are strictly isolated and protected from accidental mutation.',
      },
      {
        step: 3,
        phase: 'Domain Logic & Service Architecture',
        description: `Implement domain service methods for ${category} with strict input validation, transaction boundaries, and foreign key integrity. No mock data or decorative stubs.`,
      },
      {
        step: 4,
        phase: 'RBAC & Authorization Matrix',
        description: 'Bind API endpoints to strict role policies (SUPER_ADMIN, ADMIN, OWNER, MANAGER) using standard auth and permission middlewares.',
      },
      {
        step: 5,
        phase: 'Immutable Audit Logging',
        description: 'Integrate AuditService to record mutations with actor ID, IP address, user agent, action code, and before/after metadata snapshots.',
      },
      {
        step: 6,
        phase: 'Frontend View & Reactive Binding',
        description: 'Develop responsive React components and connect them to real REST endpoints with error handling, loading states, and live re-fetching.',
      },
      {
        step: 7,
        phase: 'Responsive Layout & Mobile Parity',
        description: 'Audit component layout across desktop (1280x800) and mobile (390x844). Ensure 0 horizontal scrolling and clean flex/grid wrapping.',
      },
      {
        step: 8,
        phase: 'Automated Regression Testing',
        description: 'Author automated integration tests in Jest covering happy paths, boundary conditions, unauthorized access attempts, and transaction rollbacks.',
      },
      {
        step: 9,
        phase: 'Visual QA Inspection',
        description: 'Execute Playwright-driven visual audits to capture high-resolution desktop and mobile viewport screenshots, verifying typography and chart rendering.',
      },
      {
        step: 10,
        phase: 'Register & Gate Sign-Off',
        description: 'Record implementation evidence, test suite outputs, and security verification in the project Development Register for production gate review.',
      },
    ];

    return {
      task: {
        title: taskTitle,
        description: taskDescription || 'No additional description provided.',
        category,
        priority,
      },
      framework: 'BFA 10-Step Continuous Development Cycle',
      steps,
      estimatedPhases: 10,
      complianceNote: 'Mandates zero fake data, full RBAC protection, automated test coverage, and documentation in DEVELOPMENT_REGISTER.md.',
    };
  },
};

