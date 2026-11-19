jest.mock('../src/modules/maintenance/maintenance.repository', () => ({
  findAll: jest.fn(async () => []),
  getStats: jest.fn(async () => ({ overview: {} })),
}));

const MaintenanceRepository = require('../src/modules/maintenance/maintenance.repository');
const MaintenanceService = require('../src/modules/maintenance/maintenance.service');

describe('Maintenance list and stats property scope', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['MANAGER', 'OPERATIONS_MANAGER', 'STAFF', 'RECEPTIONIST'])('%s is always scoped to its assigned property', async (role) => {
    const user = { id: 10, role, propertyId: 1 };
    await MaintenanceService.listMaintenance({ propertyId: 'all' }, user);
    await MaintenanceService.getStats({ propertyId: 'all' }, user);

    expect(MaintenanceRepository.findAll).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 1, user }));
    expect(MaintenanceRepository.getStats).toHaveBeenCalledWith({ propertyId: 1, user });
  });

  it.each(['MANAGER', 'OPERATIONS_MANAGER', 'STAFF', 'RECEPTIONIST'])('%s cannot request another property or bypass assignment', async (role) => {
    const user = { id: 11, role, propertyId: 1 };

    await expect(MaintenanceService.listMaintenance({ propertyId: 2 }, user)).rejects.toThrow('not have authorization for this property');
    await expect(MaintenanceService.getStats({ propertyId: 2 }, user)).rejects.toThrow('not have authorization for this property');
    await expect(MaintenanceService.listMaintenance({}, { ...user, propertyId: null })).rejects.toThrow('not assigned to any property');
    expect(MaintenanceRepository.findAll).not.toHaveBeenCalled();
    expect(MaintenanceRepository.getStats).not.toHaveBeenCalled();
  });

  it('rejects malformed property IDs before querying maintenance data', async () => {
    await expect(MaintenanceService.listMaintenance({ propertyId: '2oops' }, { role: 'ADMIN' })).rejects.toThrow('positive integer');
    expect(MaintenanceRepository.findAll).not.toHaveBeenCalled();
  });

  it.each([
    [{ status: 'PENDING' }, /Invalid status filter/],
    [{ category: 'UNKNOWN' }, /Invalid category filter/],
    [{ priority: 'URGENT' }, /Invalid priority filter/],
    [{ apartmentId: '3x' }, /Apartment ID/],
    [{ search: 14 }, /Search must be text/],
    [{ pageSize: 101 }, /pageSize/],
  ])('rejects malformed list query %# before querying maintenance data', async (params, error) => {
    await expect(MaintenanceService.listMaintenance(params, { role: 'ADMIN' })).rejects.toThrow(error);
    expect(MaintenanceRepository.findAll).not.toHaveBeenCalled();
  });

  it('treats the apartment ALL filter as no unit restriction', async () => {
    await MaintenanceService.listMaintenance({ apartmentId: 'ALL' }, { role: 'ADMIN' });
    expect(MaintenanceRepository.findAll).toHaveBeenCalledWith(expect.not.objectContaining({ apartmentId: 'ALL' }));
  });
});
