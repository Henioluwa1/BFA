const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

describe('Central Notifications & Public Announcements Tests', () => {
  let adminToken = '';
  let testNotifId = null;
  let testAnnouncementId = null;

  beforeAll(async () => {
    const aRes = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@bfa.com',
      password: 'Bfa2026!Secure',
    });
    adminToken = aRes.body.data.token;
  });

  afterAll(async () => {
    if (testNotifId) {
      await pool.query('DELETE FROM notifications WHERE id = ?', [testNotifId]);
    }
    if (testAnnouncementId) {
      await pool.query('DELETE FROM public_announcements WHERE id = ?', [testAnnouncementId]);
    }
    await pool.closePool();
  });

  test('1. Send notification via NotificationsService creates record', async () => {
    const NotificationsService = require('../src/modules/notifications/notifications.service');
    const notif = await NotificationsService.sendNotification({
      userId: 2, // admin user
      category: 'SECURITY',
      priority: 'HIGH',
      title: 'Security Alert: Test Notification',
      message: 'This is a test notification for the automated test suite.',
    });

    expect(notif).toBeDefined();
    expect(notif.title).toContain('Security Alert');
    testNotifId = notif.id;
  });

  test('2. Get user notifications and unread count', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const countRes = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(countRes.status).toBe(200);
    expect(countRes.body.data.unreadCount).toBeGreaterThanOrEqual(1);
  });

  test('3. Mark notification as read decrements unread count', async () => {
    const res = await request(app)
      .put(`/api/v1/notifications/${testNotifId}/read`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isRead).toBe(true);
  });

  test('4. Create public announcement banner', async () => {
    const res = await request(app)
      .post('/api/v1/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Holiday Special Promotion',
        message: 'Enjoy complimentary breakfast on all 1-night bookings this weekend!',
        bannerType: 'PROMOTION',
        displayLocation: 'ALL',
        priority: 10,
        startDate: '2026-01-01',
        endDate: '2030-12-31',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toContain('Holiday Special');
    testAnnouncementId = res.body.data.id;
  });

  test('5. Public endpoint retrieves active landing announcements', async () => {
    const res = await request(app)
      .get('/api/v1/public/announcements?location=PUBLIC_LANDING');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((a) => a.id === testAnnouncementId)).toBe(true);
  });
});
