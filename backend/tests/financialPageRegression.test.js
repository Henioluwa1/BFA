const pool = require('../src/db/pool');
const AccountingRepository = require('../src/modules/accounting/accounting.repository');
const AccountingService = require('../src/modules/accounting/accounting.service');
const FinancialService = require('../src/modules/financial/financial.service');
const ExpensesRepository = require('../src/modules/expenses/expenses.repository');
const PaymentsService = require('../src/modules/payments/payments.service');
const PostingBridgeService = require('../src/modules/accounting/postingBridge.service');

describe('Financial page regressions', () => {
  afterEach(() => jest.restoreAllMocks());

  test('general ledger supports scoped search and returns bounded pagination metadata', async () => {
    const query = jest.spyOn(pool, 'query')
      .mockResolvedValueOnce([{ total: 135 }])
      .mockResolvedValueOnce([{ id: 71 }]);

    const result = await AccountingRepository.findAllGeneralLedgerEntries({
      accountId: 4,
      propertyId: 12,
      search: 'accommodation',
      page: 2,
      limit: 500,
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('LOWER(COALESCE(j.journal_number');
    expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining(['%accommodation%']));
    expect(query.mock.calls[1][1].slice(-2)).toEqual([100, 100]);
    expect(result).toEqual({ data: [{ id: 71 }], total: 135, page: 2, limit: 100 });
  });

  test('accounting read paths bind Operations Manager to the assigned property', async () => {
    const findLedger = jest.spyOn(AccountingRepository, 'findAllGeneralLedgerEntries').mockResolvedValue({ data: [] });
    const user = { id: 9, role: 'OPERATIONS_MANAGER', propertyId: 12 };

    await AccountingService.listLedgerEntries({ propertyId: 99, page: 1 }, user);

    expect(findLedger).toHaveBeenCalledWith({ propertyId: 12, page: 1 });
    expect(() => AccountingService.scopeReadQuery({}, { role: 'OPERATIONS_MANAGER', propertyId: null })).toThrow(
      'not assigned to any property'
    );
  });

  test('financial overview rejects an unassigned Operations Manager', () => {
    expect(() => FinancialService.validatePropertyScope({ role: 'OPERATIONS_MANAGER', propertyId: null }, null)).toThrow(
      'not assigned to any property'
    );
  });

  test('financial reconciliation compares each reservation to net successful ledger payments', async () => {
    const query = jest.spyOn(pool, 'query').mockResolvedValue([]);
    query.mockImplementation(async (sql) => {
      if (sql.includes('AS gross_collected')) return [{ gross_collected: 150, total_refunded: 50, pending_amount: 0 }];
      if (sql.includes('AS total_booked_revenue')) return [{ total_reservations: 2, total_booked_revenue: 500, total_paid_amount: 300 }];
      if (sql.includes('AS ledger_net_paid')) return [
        { id: 11, reservation_code: 'RES-11', reservation_paid: 100, ledger_net_paid: 100 },
        { id: 12, reservation_code: 'RES-12', reservation_paid: 200, ledger_net_paid: 150 },
      ];
      return [];
    });

    const result = await FinancialService.getOverview({ propertyId: 7, fromDate: '2026-01-01', toDate: '2026-12-31' });
    const mismatch = result.anomalies.find((entry) => entry.code === 'RESERVATION_PAYMENT_MISMATCH');
    const reconciliationQuery = query.mock.calls[2];

    expect(reconciliationQuery[0]).toContain('pt.amount - COALESCE(pt.refund_amount, 0)');
    expect(reconciliationQuery[0]).toContain("pt.status IN ('SUCCESS', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED')");
    expect(reconciliationQuery[0]).toContain('r.check_in_date >= ?');
    expect(reconciliationQuery[1]).toEqual([7, '2026-01-01', '2026-12-31']);
    expect(mismatch).toMatchObject({ count: 1, variance: 50, records: [{ reservationCode: 'RES-12', variance: 50 }] });
  });

  test('expense posting preserves the PostgreSQL DATE calendar day', () => {
    expect(PostingBridgeService.formatExpenseDate(new Date(2026, 8, 1))).toBe('2026-09-01');
    expect(PostingBridgeService.formatExpenseDate('2026-09-01T00:00:00.000Z')).toBe('2026-09-01');
    expect(PostingBridgeService.formatExpenseDate(null, '2026-09-15T12:00:00.000Z')).toBe('2026-09-15');
  });

  test('expense and payment list queries fail closed and bind assigned manager scope', async () => {
    const query = jest.spyOn(pool, 'query').mockResolvedValue([]);

    await ExpensesRepository.findAll({ propertyId: 99, user: { role: 'OPERATIONS_MANAGER', propertyId: 12 } });
    expect(query.mock.calls[0][0]).toContain('e.property_id = ?');
    expect(query.mock.calls[0][1]).toContain(12);
    expect(query.mock.calls[0][1]).not.toContain(99);

    await PaymentsService.getPayments({ propertyId: 99, user: { role: 'OPERATIONS_MANAGER', propertyId: null } });
    expect(query.mock.calls[1][0]).toContain('AND 1 = 0');
    expect(query.mock.calls[1][1]).not.toContain(99);
  });
});
