const ApiResponse = require('../../utils/apiResponse');
const pool = require('../../db/pool');
const config = require('../../config');

/**
 * System Information and Settings Controller
 */
class SystemController {
  static async getInfo(req, res, next) {
    try {
      // Query system settings from database
      const settingsRows = await pool.query('SELECT category, setting_key, setting_value, description FROM system_settings;');
      
      const settingsMap = {};
      settingsRows.forEach((row) => {
        if (!settingsMap[row.category]) {
          settingsMap[row.category] = {};
        }
        settingsMap[row.category][row.setting_key] = row.setting_value;
      });

      return ApiResponse.success(res, {
        message: 'System info retrieved successfully',
        data: {
          name: config.app.name,
          version: '1.0.0',
          environment: config.app.env,
          currentServerTime: new Date().toISOString(),
          settings: settingsMap,
          modules: [
            { id: 'dashboard', name: 'Dashboard', path: '/', phase: 1, ready: true },
            { id: 'calendar', name: 'Calendar', path: '/calendar', phase: 5, ready: true },
            { id: 'reservations', name: 'All Reservations', path: '/reservations', phase: 4, ready: true },
            { id: 'apartments', name: 'Apartments', path: '/apartments', phase: 3, ready: true },
            { id: 'financial', name: 'Financial', path: '/financial', phase: 8, ready: true },
            { id: 'analytics', name: 'Analytics', path: '/analytics', phase: 10, ready: true },
            { id: 'agents', name: 'Agents', path: '/agents', phase: 9, ready: true },
            { id: 'maintenance', name: 'Maintenance', path: '/maintenance', phase: 7, ready: true },
            { id: 'inspection', name: 'Inspection', path: '/inspection', phase: 6, ready: true },
            { id: 'team', name: 'Team', path: '/team', phase: 2, ready: true },
            { id: 'settings', name: 'Settings', path: '/settings', phase: 11, ready: false },
          ],
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = SystemController;
