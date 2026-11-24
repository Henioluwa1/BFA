const CentralOperationsService = require('../modules/workforce/centralOperations.service');
const fs = require('fs');
const path = require('path');

async function testAllTemplates() {
  const adminUser = { id: 1, role: 'SUPER_ADMIN', name: 'Super Admin' };

  console.log('Testing Template Generation...');

  // Mock data for 4 templates
  const baseOp = {
    id: 100,
    operation_code: 'OPS-202611-TEST',
    title: 'Routine Fire Safety & HVAC Readiness Directives',
    category: 'SAFETY_COMPLIANCE',
    priority: 'URGENT',
    status: 'IN_PROGRESS',
    subject: 'Annual Electrical & Fire Safety Inspection',
    purpose: 'Ensure complete compliance with municipal fire safety standards and HVAC filter readiness ahead of the holiday season.',
    operational_instructions: '1. Inspect all electrical panels in Tower A and B.\n2. Verify smoke detectors in all 40 apartment suites.\n3. Replace air filters in Units 101-110.\n4. Log all findings in the central maintenance portal.',
    expected_outcome: 'Zero unresolved safety hazards, updated compliance certificate, and 100% operational HVAC units.',
    responsibility_definition: 'Operations Manager oversees execution; Facility Engineers conduct physical tests; Receptionist verifies tenant notification.',
    reporting_requirements: 'Daily progress log submitted by 17:00 WAT; Final sign-off report with photographs within 48 hours.',
    deadline_at: new Date(Date.now() + 86400000 * 3),
    responsible_name: 'Marcus Vance',
    responsible_role: 'Operations Manager',
  };

  const templates = [
    { type: 'SHORT_DIRECTIVE', filename: 'memo_template_A_short.pdf' },
    { type: 'MULTI_SECTION_LONG', filename: 'memo_template_B_long.pdf' },
    { type: 'MULTI_RECIPIENT_TEAM', filename: 'memo_template_C_team.pdf' },
    { type: 'REVISION_AMENDMENT', filename: 'memo_template_D_revision.pdf' },
  ];

  for (const t of templates) {
    console.log(`\nGenerating Template: ${t.type}...`);
    const memo = {
      memo_reference: `MEMO-202611-${t.type.slice(0, 4)}`,
      version_number: t.type === 'REVISION_AMENDMENT' ? 2 : 1,
      amendment_reason: t.type === 'REVISION_AMENDMENT' ? 'Emergency update to include Tower C secondary fire exit inspection per state fire service audit notice.' : null,
      issuer_designation: 'Operations Directorate',
      recipient_summary: t.type === 'MULTI_RECIPIENT_TEAM' ? 'Facility Management & Front Desk Team' : 'Marcus Vance (Operations Manager)',
      property_scope_summary: 'Grand Horizon Tower',
      deadline_text: 'Friday, 28 November 2026',
      effective_date_text: 'Tuesday, 24 November 2026',
      subject: baseOp.subject,
      purpose: baseOp.purpose,
      operational_instructions: baseOp.operational_instructions,
      expected_outcome: baseOp.expected_outcome,
      responsibility_definition: baseOp.responsibility_definition,
      reporting_requirements: baseOp.reporting_requirements,
    };

    const recipients = t.type === 'MULTI_RECIPIENT_TEAM'
      ? [
          { id: 2, name: 'Sarah Jenkins', role: 'ADMIN', acknowledged_at: new Date() },
          { id: 3, name: 'Marcus Vance', role: 'OPERATIONS_MANAGER', acknowledged_at: new Date() },
          { id: 4, name: 'Elena Ramos', role: 'RECEPTIONIST', acknowledged_at: null },
          { id: 5, name: 'David Kalu', role: 'STAFF', acknowledged_at: null },
        ]
      : [{ id: 3, name: 'Marcus Vance', role: 'OPERATIONS_MANAGER', acknowledged_at: new Date() }];

    const buffer = await CentralOperationsService.generateOperationsMemoPdfBuffer({
      operation: baseOp,
      memo,
      initiator: { name: 'Chief Emeka BFA', role: 'OWNER', email: 'owner@bfa.ng' },
      recipients,
      property: { name: 'Grand Horizon Tower', code: 'GHT', city: 'Victoria Island, Lagos' },
      templateType: t.type,
    });

    const outPath = path.resolve(__dirname, t.filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved ${t.filename} (${buffer.length} bytes, starts with: ${buffer.slice(0, 8).toString()})`);
  }

  console.log('\nAll 4 templates generated successfully!');
  process.exit(0);
}

testAllTemplates().catch(err => {
  console.error('Error generating templates:', err);
  process.exit(1);
});
