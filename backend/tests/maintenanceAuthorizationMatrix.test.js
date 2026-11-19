const maintenanceRoutes = require('../src/modules/maintenance/maintenance.routes');
const { requireRoles } = require('../src/core/middleware/authContext');

const routeRoles = (group) => {
  const roles = [...maintenanceRoutes.accessPolicy[group]];
  if (roles.includes('MANAGER')) roles.push('OPERATIONS_MANAGER');
  return roles;
};

const runGuard = (allowedRoles, role) => {
  let nextCalled = false;
  let statusCode = 200;
  const res = {
    status(code) { statusCode = code; return this; },
    json() { return this; },
  };
  requireRoles(...allowedRoles)({ user: role ? { role } : null }, res, () => { nextCalled = true; });
  return { nextCalled, statusCode };
};

describe('Maintenance API role authorization matrix', () => {
  const roles = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT'];

  test.each(roles)('%s read access follows the maintenance policy', (role) => {
    const expected = role !== 'AGENT';
    expect(runGuard(routeRoles('operational'), role).nextCalled).toBe(expected);
  });

  test.each(['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATIONS_MANAGER'])('%s can use management workflows', (role) => {
    for (const group of ['management']) {
      expect(runGuard(routeRoles(group), role).nextCalled).toBe(true);
    }
  });

  test.each(['STAFF', 'RECEPTIONIST', 'AGENT'])('%s cannot create, assign, cancel, or edit work orders', (role) => {
    expect(runGuard(routeRoles('management'), role).statusCode).toBe(403);
  });

  test.each(['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER', 'OPERATIONS_MANAGER', 'STAFF'])('%s can use worker status workflows', (role) => {
    expect(runGuard(routeRoles('worker'), role).nextCalled).toBe(true);
  });

  test.each(['RECEPTIONIST', 'AGENT'])('%s cannot start or resolve work', (role) => {
    expect(runGuard(routeRoles('worker'), role).statusCode).toBe(403);
  });

  test.each(['SUPER_ADMIN', 'ADMIN'])('%s can delete work orders', (role) => {
    expect(runGuard(routeRoles('delete'), role).nextCalled).toBe(true);
  });

  test.each(['OWNER', 'MANAGER', 'OPERATIONS_MANAGER', 'RECEPTIONIST', 'STAFF', 'AGENT'])('%s cannot delete work orders', (role) => {
    expect(runGuard(routeRoles('delete'), role).statusCode).toBe(403);
  });

  test('rejects unauthenticated requests before route handlers', () => {
    expect(runGuard(routeRoles('operational'), null)).toEqual({ nextCalled: false, statusCode: 401 });
  });
});
