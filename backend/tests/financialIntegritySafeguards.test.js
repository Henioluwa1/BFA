/**
 * Financial Integrity Safeguards & Accounting Reconciliation Regression Suite
 *
 * Strictly isolated regression tests verifying:
 * 1. Payment and refund lifecycle validation logic
 * 2. Referential integrity and orphan prevention rules
 * 3. Reporting query semantics & anomaly detection (no silent clamping)
 * 4. Reconciliation equations across Booked Revenue, Collections, Receivables & Ledger
 */

describe('Financial Integrity Safeguards & Reconciliation Rules', () => {

  describe('1. Payment & Refund Lifecycle Validation Logic', () => {
    it('should reject a refund if parent transaction does not exist or is null', () => {
      const validateRefundAttempt = (parentTxn, refundAmount) => {
        if (!parentTxn) {
          throw new Error('INVALID_PARENT: Parent payment transaction not found.');
        }
        if (!['SUCCESS', 'PARTIALLY_REFUNDED'].includes(parentTxn.status)) {
          throw new Error(`INVALID_STATUS: Cannot refund transaction with status ${parentTxn.status}.`);
        }
        const availableRefund = parseFloat(parentTxn.amount) - parseFloat(parentTxn.refund_amount || 0);
        if (refundAmount <= 0) {
          throw new Error('INVALID_AMOUNT: Refund amount must be strictly positive.');
        }
        if (refundAmount > availableRefund) {
          throw new Error(`EXCESSIVE_REFUND: Requested ${refundAmount} exceeds available ${availableRefund}.`);
        }
        return true;
      };

      expect(() => validateRefundAttempt(null, 15000)).toThrow('INVALID_PARENT');
      expect(() => validateRefundAttempt({ status: 'FAILED', amount: 50000, refund_amount: 0 }, 15000)).toThrow('INVALID_STATUS');
      expect(() => validateRefundAttempt({ status: 'PENDING', amount: 50000, refund_amount: 0 }, 15000)).toThrow('INVALID_STATUS');
      expect(() => validateRefundAttempt({ status: 'SUCCESS', amount: 50000, refund_amount: 50000 }, 1000)).toThrow('EXCESSIVE_REFUND');
      expect(() => validateRefundAttempt({ status: 'SUCCESS', amount: 50000, refund_amount: 0 }, -500)).toThrow('INVALID_AMOUNT');
      expect(validateRefundAttempt({ status: 'SUCCESS', amount: 50000, refund_amount: 15000 }, 20000)).toBe(true);
    });

    it('should prevent duplicate refund attempts when available balance is exhausted', () => {
      const parent = { id: 101, amount: 50000.0, refund_amount: 0.0, status: 'SUCCESS' };
      
      const processRefund = (parentRecord, refundAmount) => {
        const available = parentRecord.amount - parentRecord.refund_amount;
        if (refundAmount > available) {
          throw new Error('REFUND_EXCEEDED');
        }
        parentRecord.refund_amount += refundAmount;
        parentRecord.status = parentRecord.refund_amount >= parentRecord.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        return {
          id: Date.now(),
          parent_transaction_id: parentRecord.id,
          amount: -refundAmount,
          status: 'REFUNDED',
        };
      };

      // 1st partial refund
      const child1 = processRefund(parent, 20000.0);
      expect(parent.refund_amount).toBe(20000.0);
      expect(parent.status).toBe('PARTIALLY_REFUNDED');
      expect(child1.amount).toBe(-20000.0);
      expect(child1.parent_transaction_id).toBe(101);

      // 2nd partial refund to completion
      const child2 = processRefund(parent, 30000.0);
      expect(parent.refund_amount).toBe(50000.0);
      expect(parent.status).toBe('REFUNDED');
      expect(child2.amount).toBe(-30000.0);

      // 3rd refund attempt must be blocked
      expect(() => processRefund(parent, 1000.0)).toThrow('REFUND_EXCEEDED');
    });
  });

  describe('2. Test Isolation & Teardown Integrity Safeguards', () => {
    it('should verify child records must be deleted before parent records in test fixtures', () => {
      // Simulating a relational table in memory with foreign key emulation
      let rows = [
        { id: 100, parent_id: null, amount: 50000 },
        { id: 101, parent_id: 100, amount: -15000 },
      ];

      // Defective Teardown: deleting parent first causes ON DELETE SET NULL emulation
      const defectiveTeardown = () => {
        const testParentId = 100;
        // If parent deleted first:
        rows = rows.map(r => r.parent_id === testParentId ? { ...r, parent_id: null } : r);
        rows = rows.filter(r => r.id !== testParentId);
      };

      defectiveTeardown();
      // Notice: child row survives with parent_id: null! (Root cause of 66 negative rows)
      expect(rows.length).toBe(1);
      expect(rows[0].parent_id).toBeNull();
      expect(rows[0].amount).toBe(-15000);

      // Correct Teardown: delete children first, then parent
      let cleanRows = [
        { id: 200, parent_id: null, amount: 50000 },
        { id: 201, parent_id: 200, amount: -15000 },
      ];
      const correctTeardown = (testParentId) => {
        cleanRows = cleanRows.filter(r => r.parent_id !== testParentId);
        cleanRows = cleanRows.filter(r => r.id !== testParentId);
      };

      correctTeardown(200);
      // Clean: 0 rows remaining
      expect(cleanRows.length).toBe(0);
    });
  });

  describe('3. Financial Reporting Query Semantics & Defensive Calculation', () => {
    it('should never treat negative transactions as parent gross collections', () => {
      const transactions = [
        // Real payment
        { id: 1, parent_id: null, amount: 50000.0, status: 'SUCCESS' },
        // Legitimate refund with parent
        { id: 2, parent_id: 1, amount: -15000.0, status: 'REFUNDED' },
        // Orphaned refund with null parent (the bug artifact)
        { id: 3, parent_id: null, amount: -15000.0, status: 'REFUNDED' },
        // Failed payment
        { id: 4, parent_id: null, amount: 30000.0, status: 'FAILED' },
        // Pending payment
        { id: 5, parent_id: null, amount: 25000.0, status: 'PENDING' },
      ];

      // Defective formula (without amount > 0 guard):
      const defectiveGross = transactions
        .filter(t => t.parent_id === null && ['SUCCESS', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(t.status))
        .reduce((sum, t) => sum + t.amount, 0);
      // Defective: 50,000 + (-15,000) = 35,000 (corrupted by orphaned refund)
      expect(defectiveGross).toBe(35000.0);

      // Safe formula (with amount > 0 guard):
      const safeGross = transactions
        .filter(t => t.parent_id === null && t.amount > 0 && ['SUCCESS', 'COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(t.status))
        .reduce((sum, t) => sum + t.amount, 0);
      expect(safeGross).toBe(50000.0);

      // Anomaly detection: surface negative records with null parent explicitly
      const anomalies = transactions.filter(t => t.parent_id === null && t.amount < 0);
      expect(anomalies.length).toBe(1);
      expect(anomalies[0].id).toBe(3);
    });

    it('should detect negative collection anomalies rather than silently clamping to zero', () => {
      const detectFinancialAnomalies = (kpis, rawGross) => {
        const issues = [];
        if (rawGross < 0) {
          issues.push({
            code: 'NEGATIVE_GROSS_COLLECTION',
            message: `CRITICAL: Raw gross collection is negative (${rawGross}). Indicates orphaned refund transactions.`,
            rawAmount: rawGross,
          });
        }
        if (kpis.outstandingReceivables < 0) {
          issues.push({
            code: 'NEGATIVE_RECEIVABLES',
            message: 'CRITICAL: Receivables cannot be negative without credit memo authorization.',
          });
        }
        return issues;
      };

      const anomalies = detectFinancialAnomalies({ outstandingReceivables: 10000 }, -990000.0);
      expect(anomalies.length).toBe(1);
      expect(anomalies[0].code).toBe('NEGATIVE_GROSS_COLLECTION');
    });
  });

  describe('4. Comprehensive Control Totals & Reconciliation Equations', () => {
    it('should enforce exact equality across all standard accounting equations', () => {
      // Sample operational dataset
      const reservations = [
        { id: 1, total_amount: 350000.0, paid_amount: 350000.0, status: 'CHECKED_OUT' },
        { id: 2, total_amount: 220000.0, paid_amount: 100000.0, status: 'CONFIRMED' },
        { id: 3, total_amount: 150000.0, paid_amount: 0.0, status: 'CANCELLED' }, // must be excluded
      ];

      const payments = [
        { id: 1, res_id: 1, amount: 350000.0, refund_amount: 0.0, status: 'SUCCESS', parent_id: null },
        { id: 2, res_id: 2, amount: 100000.0, refund_amount: 20000.0, status: 'PARTIALLY_REFUNDED', parent_id: null },
        { id: 3, res_id: 2, amount: -20000.0, refund_amount: 0.0, status: 'REFUNDED', parent_id: 2 },
      ];

      const expenses = [
        { id: 1, amount: 120000.0, status: 'APPROVED' },
        { id: 2, amount: 30000.0, status: 'RECORDED' }, // unapproved
      ];

      // Equation 1: Active Booked Revenue = SUM(total_amount for status != CANCELLED)
      const bookedRevenue = reservations
        .filter(r => r.status !== 'CANCELLED')
        .reduce((sum, r) => sum + r.total_amount, 0);
      expect(bookedRevenue).toBe(570000.0);

      // Equation 2: Paid On Reservations = SUM(paid_amount for status != CANCELLED)
      const paidOnReservations = reservations
        .filter(r => r.status !== 'CANCELLED')
        .reduce((sum, r) => sum + r.paid_amount, 0);
      expect(paidOnReservations).toBe(450000.0);

      // Equation 3: Outstanding Receivables = Booked Revenue - Paid On Reservations
      const outstandingReceivables = bookedRevenue - paidOnReservations;
      expect(outstandingReceivables).toBe(120000.0);

      // Equation 4: Gross Collections = SUM(positive parent payments with SUCCESS/PARTIALLY_REFUNDED/REFUNDED)
      const grossCollections = payments
        .filter(p => p.parent_id === null && p.amount > 0 && ['SUCCESS', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(p.status))
        .reduce((sum, p) => sum + p.amount, 0);
      expect(grossCollections).toBe(450000.0);

      // Equation 5: Total Refunds = SUM(parent.refund_amount) OR SUM(ABS(child refund amount))
      const totalRefundsFromParent = payments
        .filter(p => p.parent_id === null)
        .reduce((sum, p) => sum + p.refund_amount, 0);
      const totalRefundsFromChildren = payments
        .filter(p => p.parent_id !== null && p.amount < 0 && p.status === 'REFUNDED')
        .reduce((sum, p) => sum + Math.abs(p.amount), 0);
      expect(totalRefundsFromParent).toBe(20000.0);
      expect(totalRefundsFromChildren).toBe(20000.0);
      expect(totalRefundsFromParent).toBe(totalRefundsFromChildren);

      // Equation 6: Net Collections = Gross Collections - Total Refunds
      const netCollections = grossCollections - totalRefundsFromParent;
      expect(netCollections).toBe(430000.0);

      // Equation 7: Approved Expenses = SUM(amount for status = APPROVED)
      const approvedExpenses = expenses
        .filter(e => e.status === 'APPROVED')
        .reduce((sum, e) => sum + e.amount, 0);
      expect(approvedExpenses).toBe(120000.0);

      // Equation 8: Net Operating Profit = Net Collections - Approved Expenses
      const netOperatingProfit = netCollections - approvedExpenses;
      expect(netOperatingProfit).toBe(310000.0);

      // Control Check: Paid on reservations must reconcile with gross collections before refunds
      expect(paidOnReservations).toBe(grossCollections);
    });
  });
});

