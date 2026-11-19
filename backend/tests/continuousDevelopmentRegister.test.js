const registerAction = require('../src/modules/automation/actions/dev.get_register');

describe('Continuous Development register action', () => {
  it('reads tasks and release gates from the current development register document', async () => {
    const result = await registerAction.execute({ params: { filterStatus: 'ALL' } });
    expect(result.hasDocumentationOnDisk).toBe(true);
    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result.tasks[0]).toHaveProperty('status');
    expect(result.releaseGates.length).toBeGreaterThan(0);
  });
});
