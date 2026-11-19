jest.mock('../src/db/pool', () => ({ query: jest.fn() }));

const pool = require('../src/db/pool');
const NotificationsService = require('../src/modules/notifications/notifications.service');

describe('Owner notification projection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockImplementation(async (sql) => sql.includes('COUNT(*)') ? [{ unread_count: 0 }] : []);
  });

  it('excludes capability approval notices from OWNER notification feeds and unread counts', async () => {
    await NotificationsService.getUserNotifications({ user: { id: 1, role: 'OWNER' } });

    expect(pool.query.mock.calls[0][0]).toContain("NOT (source_entity_type = 'capability' AND category = 'APPROVAL')");
    expect(pool.query.mock.calls[1][0]).toContain("NOT (source_entity_type = 'capability' AND category = 'APPROVAL')");
  });

  it('keeps capability approval notices available to SUPER_ADMIN', async () => {
    await NotificationsService.getUserNotifications({ user: { id: 2, role: 'SUPER_ADMIN' } });

    expect(pool.query.mock.calls[0][0]).not.toContain("source_entity_type = 'capability' AND category = 'APPROVAL'");
    expect(pool.query.mock.calls[1][0]).not.toContain("source_entity_type = 'capability' AND category = 'APPROVAL'");
  });
});
