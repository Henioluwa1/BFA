const PropertiesService = require('../src/modules/properties/properties.service');
const PropertiesRepository = require('../src/modules/properties/properties.repository');
const ApartmentsService = require('../src/modules/apartments/apartments.service');
const ApartmentsRepository = require('../src/modules/apartments/apartments.repository');
const AuditService = require('../src/core/audit/audit.service');
const pool = require('../src/db/pool');

jest.mock('../src/db/pool');
jest.mock('../src/core/audit/audit.service');

describe('Property & Apartment Safe Archive / Delete CRUD & RBAC', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AuditService.record = jest.fn().mockResolvedValue(true);
  });

  describe('PropertiesService.archiveOrDeleteProperty', () => {
    const mockProperty = {
      id: 1,
      name: 'Grand Horizon Tower',
      code: 'GHT',
      status: 'ACTIVE',
      is_archived: false,
    };

    test('rejects MANAGER role from archiving or deleting properties (RBAC)', async () => {
      await expect(
        PropertiesService.archiveOrDeleteProperty(1, { id: 5, role: 'MANAGER', propertyId: 1 })
      ).rejects.toThrow(/Only Admins and Owners/i);
    });

    test('rejects archiving when active or upcoming reservations exist', async () => {
      jest.spyOn(PropertiesRepository, 'findById').mockResolvedValue(mockProperty);
      jest.spyOn(PropertiesRepository, 'getActiveReservationsCount').mockResolvedValue(2);

      await expect(
        PropertiesService.archiveOrDeleteProperty(1, { id: 1, role: 'ADMIN' })
      ).rejects.toThrow(/2 active or upcoming reservation/i);
    });

    test('archives instead of deleting when dependent apartments or historical reservations exist even with mode=delete', async () => {
      jest.spyOn(PropertiesRepository, 'findById').mockResolvedValue(mockProperty);
      jest.spyOn(PropertiesRepository, 'getActiveReservationsCount').mockResolvedValue(0);
      jest.spyOn(PropertiesRepository, 'update').mockResolvedValue(true);

      pool.query
        .mockResolvedValueOnce([{ cnt: 3 }]) // apartments
        .mockResolvedValueOnce([{ cnt: 5 }]) // reservations
        .mockResolvedValueOnce([{ cnt: 1 }]); // submissions

      const res = await PropertiesService.archiveOrDeleteProperty(
        1,
        { id: 1, role: 'ADMIN', email: 'admin@bfa.com' },
        null,
        { mode: 'delete' }
      );

      expect(res.action).toBe('ARCHIVED');
      expect(PropertiesRepository.update).toHaveBeenCalledWith(1, expect.objectContaining({
        status: 'ARCHIVED',
        is_archived: true,
      }));
      expect(AuditService.record).toHaveBeenCalledWith(expect.objectContaining({
        action: 'PROPERTY_ARCHIVED',
        entityId: '1',
      }));
    });

    test('physically deletes ONLY when mode=delete and zero dependent records exist', async () => {
      jest.spyOn(PropertiesRepository, 'findById').mockResolvedValue(mockProperty);
      jest.spyOn(PropertiesRepository, 'getActiveReservationsCount').mockResolvedValue(0);

      pool.query
        .mockResolvedValueOnce([{ cnt: 0 }]) // apartments
        .mockResolvedValueOnce([{ cnt: 0 }]) // reservations
        .mockResolvedValueOnce([{ cnt: 0 }]) // submissions
        .mockResolvedValue({});

      const res = await PropertiesService.archiveOrDeleteProperty(
        1,
        { id: 1, role: 'SUPER_ADMIN', email: 'super@bfa.com' },
        null,
        { mode: 'delete' }
      );

      expect(res.action).toBe('DELETED');
      expect(pool.query).toHaveBeenCalledWith('DELETE FROM properties WHERE id = ?', [1]);
      expect(AuditService.record).toHaveBeenCalledWith(expect.objectContaining({
        action: 'PROPERTY_DELETED',
      }));
    });
  });

  describe('ApartmentsService.archiveApartment', () => {
    const mockUnit = {
      id: 10,
      property_id: 1,
      unit_number: '101',
      unit_name: 'Horizon Executive Suite',
      status: 'AVAILABLE',
      is_active: true,
    };

    test('rejects STAFF/MANAGER roles from archiving or deleting apartments (RBAC)', async () => {
      await expect(
        ApartmentsService.archiveApartment(10, { id: 8, role: 'MANAGER', propertyId: 1 })
      ).rejects.toThrow(/Only Admins and Owners/i);
    });

    test('rejects archiving when active or upcoming reservations exist on apartment', async () => {
      jest.spyOn(ApartmentsRepository, 'findById').mockResolvedValue(mockUnit);
      pool.query.mockResolvedValueOnce([{ cnt: 1 }]);

      await expect(
        ApartmentsService.archiveApartment(10, { id: 1, role: 'ADMIN' })
      ).rejects.toThrow(/1 active or upcoming reservation/i);
    });

    test('archives apartment and preserves history when historical reservations exist', async () => {
      jest.spyOn(ApartmentsRepository, 'findById').mockResolvedValue(mockUnit);
      pool.query
        .mockResolvedValueOnce([{ cnt: 0 }]) // active reservations
        .mockResolvedValueOnce([{ cnt: 4 }]) // historical reservations
        .mockResolvedValueOnce({}); // update

      const res = await ApartmentsService.archiveApartment(
        10,
        { id: 1, role: 'ADMIN', email: 'admin@bfa.com' },
        null,
        { mode: 'delete' }
      );

      expect(res.action).toBe('ARCHIVED');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE apartments SET is_active = FALSE, status = 'OUT_OF_SERVICE'"),
        [1, 10]
      );
      expect(AuditService.record).toHaveBeenCalledWith(expect.objectContaining({
        action: 'APARTMENT_ARCHIVED',
        entityId: '10',
      }));
    });

    test('physically deletes apartment ONLY when mode=delete and zero reservations exist', async () => {
      jest.spyOn(ApartmentsRepository, 'findById').mockResolvedValue(mockUnit);
      pool.query
        .mockResolvedValueOnce([{ cnt: 0 }]) // active reservations
        .mockResolvedValueOnce([{ cnt: 0 }]) // historical reservations
        .mockResolvedValue({});

      const res = await ApartmentsService.archiveApartment(
        10,
        { id: 1, role: 'OWNER', email: 'owner@bfa.com' },
        null,
        { mode: 'delete' }
      );

      expect(res.action).toBe('DELETED');
      expect(pool.query).toHaveBeenCalledWith('DELETE FROM apartments WHERE id = ?', [10]);
      expect(AuditService.record).toHaveBeenCalledWith(expect.objectContaining({
        action: 'APARTMENT_DELETED',
        entityId: '10',
      }));
    });
  });
});
