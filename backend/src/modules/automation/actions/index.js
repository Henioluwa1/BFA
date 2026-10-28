const registry = require('../actionRegistry');

// Import candidate actions
const getTodayArrivals = require('./operations.get_today_arrivals');
const getTodayDepartures = require('./operations.get_today_departures');
const checkAvailability = require('./apartments.check_availability');
const listAvailable = require('./apartments.list_available');
const getReservationDetails = require('./reservations.get_details');
const summarizeOutstandingPayments = require('./financial.summarize_outstanding_payments');
const createReservation = require('./reservations.create');
const navigationNavigate = require('./navigation.navigate');

// Continuous Development & Governance actions
const devGetRegister = require('./dev.get_register');
const devGetSystemStatus = require('./dev.get_system_status');
const devPlanTask = require('./dev.plan_task');

// Action List
const initialActions = [
  getTodayArrivals,
  getTodayDepartures,
  checkAvailability,
  listAvailable,
  getReservationDetails,
  summarizeOutstandingPayments,
  createReservation,
  navigationNavigate,
  devGetRegister,
  devGetSystemStatus,
  devPlanTask,
];

// Register all actions into the registry
for (const action of initialActions) {
  if (!registry.has(action.actionId)) {
    registry.register(action);
  }
}

module.exports = {
  registry,
  initialActions,
};
