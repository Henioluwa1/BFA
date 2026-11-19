jest.mock('../src/db/pool', () => ({
  query: jest.fn(async () => []),
  withTransaction: jest.fn(),
}));
jest.mock('../src/modules/maintenance/maintenance.repository', () => ({
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  findAll: jest.fn(),
  getStats: jest.fn(),
}));
jest.mock('../src/modules/properties/properties.repository', () => ({ findById: jest.fn() }));
jest.mock('../src/modules/apartments/apartments.repository', () => ({ findById: jest.fn() }));
jest.mock('../src/core/audit/audit.service', () => ({ record: jest.fn(async () => undefined) }));
jest.mock('../src/modules/notifications/notifications.service', () => ({ dispatchNotification: jest.fn(async () => undefined) }));
jest.mock('../src/modules/employees/employeeActivities.service', () => ({ recordUserActivity: jest.fn(async () => undefined) }));
jest.mock('../src/modules/workforce/identityResolver.service', () => ({}));

const MaintenanceService = require('../src/modules/maintenance/maintenance.service');
const MaintenanceRepository = require('../src/modules/maintenance/maintenance.repository');
const PropertiesRepository = require('../src/modules/properties/properties.repository');
const AuditService = require('../src/core/audit/audit.service');
const pool = require('../src/db/pool');

describe('Maintenance create and edit service workflows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MaintenanceRepository.findById.mockResolvedValue({ id: 44, property_id: 1, status: 'OPEN', issue_code: 'MNT-TEST-44' });
    MaintenanceRepository.update.mockResolvedValue(true);
    MaintenanceRepository.create.mockResolvedValue(44);
    PropertiesRepository.findById.mockResolvedValue({ id: 1, code: 'TEST' });
  });

  test('creates a normalized common-area work order and reads it back', async () => {
    const result = await MaintenanceService.createMaintenance({
      property_id: '1', issue_title: '  Broken lobby light  ', category: 'electrical', priority: 'high', estimated_cost: '1200.50',
    }, { id: 9, role: 'ADMIN' });

    expect(MaintenanceRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      property_id: 1,
      apartment_id: null,
      issue_title: 'Broken lobby light',
      category: 'ELECTRICAL',
      priority: 'HIGH',
      estimated_cost: 1200.5,
      status: 'OPEN',
    }));
    expect(MaintenanceRepository.findById).toHaveBeenCalledWith(44);
    expect(AuditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'MAINTENANCE_CREATED' }));
    expect(result.id).toBe(44);
  });

  test.each([
    [{ property_id: '1oops', issue_title: 'Leak' }, /Property ID/],
    [{ property_id: 1, issue_title: 'Leak', estimated_cost: -1 }, /non-negative/],
    [{ property_id: 1, issue_title: 'Leak', apartment_id: '2oops' }, /Apartment ID/],
    [{ property_id: 1, issue_title: 'Leak', blocking_unit: 'yes' }, /Blocking-unit flag/],
  ])('rejects invalid create payload %# before writing', async (payload, error) => {
    await expect(MaintenanceService.createMaintenance(payload, { role: 'ADMIN' })).rejects.toThrow(error);
    expect(MaintenanceRepository.create).not.toHaveBeenCalled();
  });

  test('updates editable fields, normalizes values, and makes critical priority blocking', async () => {
    MaintenanceRepository.findById
      .mockResolvedValueOnce({ id: 44, property_id: 1, status: 'OPEN', priority: 'LOW' })
      .mockResolvedValueOnce({ id: 44, property_id: 1, status: 'OPEN', priority: 'CRITICAL', blocking_unit: true });

    const result = await MaintenanceService.updateMaintenance(44, {
      issue_title: '  Compressor failure  ', category: 'hvac', priority: 'critical', estimated_cost: '25000',
    }, { id: 3, role: 'MANAGER', propertyId: 1 });

    expect(MaintenanceRepository.update).toHaveBeenCalledWith(44, expect.objectContaining({
      issue_title: 'Compressor failure', category: 'HVAC', priority: 'CRITICAL', estimated_cost: 25000, blocking_unit: true,
    }));
    expect(AuditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'MAINTENANCE_UPDATED' }));
    expect(result.priority).toBe('CRITICAL');
  });

  test.each([
    [{ priority: 'URGENT' }, /Invalid priority/],
    [{ category: 'OTHER' }, /Invalid category/],
    [{ estimated_cost: 'NaN' }, /non-negative/],
    [{ status: 'RESOLVED' }, /Unsupported maintenance update/],
    [{}, /at least one field/],
  ])('rejects invalid edit payload %# without changing the record', async (payload, error) => {
    await expect(MaintenanceService.updateMaintenance(44, payload, { id: 1, role: 'ADMIN' })).rejects.toThrow(error);
    expect(MaintenanceRepository.update).not.toHaveBeenCalled();
  });

  test('blocks non-management edits and prevents property-scope manipulation', async () => {
    await expect(MaintenanceService.updateMaintenance(44, { priority: 'HIGH' }, { id: 8, role: 'STAFF', propertyId: 1 }))
      .rejects.toThrow(/not authorized to edit/);

    await expect(MaintenanceService.updateMaintenance(44, { priority: 'HIGH' }, { id: 8, role: 'MANAGER', propertyId: 2 }))
      .rejects.toThrow(/not have authorization/);
    expect(MaintenanceRepository.update).not.toHaveBeenCalled();
  });

  test('does not record success if the repository update fails', async () => {
    MaintenanceRepository.update.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(MaintenanceService.updateMaintenance(44, { priority: 'HIGH' }, { id: 1, role: 'ADMIN' }))
      .rejects.toThrow('database unavailable');
    expect(AuditService.record).not.toHaveBeenCalled();
  });

  test('starts an OPEN ticket and records the status transition', async () => {
    MaintenanceRepository.findById
      .mockResolvedValueOnce({ id: 44, property_id: 1, status: 'OPEN' })
      .mockResolvedValueOnce({ id: 44, property_id: 1, status: 'IN_PROGRESS' });
    await MaintenanceService.startWork(44, { id: 6, role: 'STAFF', propertyId: 1 });
    expect(MaintenanceRepository.update).toHaveBeenCalledWith(44, expect.objectContaining({ status: 'IN_PROGRESS' }));
    expect(AuditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'MAINTENANCE_STARTED' }));
  });

  test('rejects invalid status transitions without writing', async () => {
    MaintenanceRepository.findById.mockResolvedValue({ id: 44, property_id: 1, status: 'IN_PROGRESS' });
    await expect(MaintenanceService.startWork(44, { id: 6, role: 'STAFF', propertyId: 1 })).rejects.toThrow(/Only OPEN requests/);
    await expect(MaintenanceService.resolveIssue(44, { actual_cost: -3, resolution_notes: 'done' }, { id: 6, role: 'STAFF', propertyId: 1 }))
      .rejects.toThrow(/non-negative/);
    expect(MaintenanceRepository.update).not.toHaveBeenCalled();
  });

  test('rejects cross-property technician lookup before querying data', async () => {
    await expect(MaintenanceService.getEligibleTechnicians('2oops', { role: 'MANAGER', propertyId: 1 })).rejects.toThrow(/positive integer/);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects cross-property assignment before locking technician records', async () => {
    const conn = { query: jest.fn().mockResolvedValueOnce([[{ id: 44, property_id: 2, status: 'OPEN' }]]) };
    pool.withTransaction.mockImplementationOnce((operation) => operation(conn));
    await expect(MaintenanceService.assignStaff(44, { assigned_to_id: 9 }, { id: 3, role: 'MANAGER', propertyId: 1 }))
      .rejects.toThrow(/not have authorization/);
    expect(conn.query).toHaveBeenCalledTimes(1);
  });
});
