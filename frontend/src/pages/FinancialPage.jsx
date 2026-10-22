import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import Modal from '../components/ui/Modal';
import {
  financialService,
  paymentService,
  expenseService,
  propertyService,
  apartmentService,
  reportService,
} from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatNaira } from '../utils/currency';

const EXPENSE_CATEGORIES = [
  'MAINTENANCE',
  'UTILITIES',
  'STAFF',
  'SUPPLIES',
  'CLEANING',
  'PROPERTY',
  'ADMINISTRATION',
  'MARKETING',
  'OTHER',
];

const PAYMENT_METHODS = [
  'BANK_TRANSFER',
  'CARD',
  'CASH',
  'POS',
  'ONLINE',
  'CHEQUE',
];

export default function FinancialPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { properties, activePropertyId, isAllProperties, activeProperty } = useProperty();
  const { user, hasPermission } = useAuth();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'ledger' | 'payments' | 'expenses'
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchFilter, setSearchFilter] = useState(() => searchParams.get('search') || '');
  const prevSearchParamRef = useRef(searchParams.get('search'));

  // Overview Data
  const [overview, setOverview] = useState({
    kpis: {
      grossCollected: 0,
      totalRefunded: 0,
      netRevenue: 0,
      bookedRevenue: 0,
      outstandingReceivables: 0,
      pendingPayments: 0,
      approvedExpenses: 0,
      pendingExpenses: 0,
      voidedExpenses: 0,
      netProfit: 0,
      profitMargin: 0,
    },
    categoryBreakdown: [],
  });

  // Ledger & Transaction Data
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerPagination, setLedgerPagination] = useState({ page: 1, totalPages: 1, totalRecords: 0 });
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);

  // Modals
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [selectedExpense, setSelectedExpense] = useState(null);

  // Form States
  const [expenseForm, setExpenseForm] = useState({
    property_id: '',
    apartment_id: '',
    category: 'MAINTENANCE',
    description: '',
    amount: '',
    vendor_payee: '',
    payment_method: 'BANK_TRANSFER',
    expense_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [refundForm, setRefundForm] = useState({
    refund_amount: '',
    reason: '',
  });

  const [voidForm, setVoidForm] = useState({
    reason: '',
  });

  const [apartments, setApartments] = useState([]);

  // Sync with PropertyContext
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Synchronize URL search params for deep-linking
  useEffect(() => {
    const qPropId = searchParams.get('propertyId');
    if (qPropId) setPropertyFilter(qPropId);

    const qTab = searchParams.get('tab');
    if (qTab && ['overview', 'ledger', 'payments', 'expenses'].includes(qTab)) {
      setActiveTab(qTab);
    }

    const qSearch = searchParams.get('search');
    if (qSearch !== prevSearchParamRef.current) {
      prevSearchParamRef.current = qSearch;
      setSearchFilter(qSearch || '');
    }
  }, [searchParams]);

  // Load apartments for dropdown
  useEffect(() => {
    async function loadApartments() {
      try {
        const res = await apartmentService.getAll({
          propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        });
        setApartments(res.data || []);
      } catch (err) {
        console.error('Failed to load apartments', err);
      }
    }
    loadApartments();
  }, [propertyFilter]);

  // Fetch Financial Overview
  const fetchOverview = async () => {
    setLoading(true);
    try {
      const res = await financialService.getOverview({
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      if (res.data) {
        setOverview(res.data);
      }
    } catch (err) {
      addToast(`Error loading financial metrics: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Unified Ledger
  const fetchLedger = async (page = 1) => {
    setLoading(true);
    try {
      const res = await financialService.getLedger({
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        pageSize: 25,
      });
      setLedgerEntries(res.data?.items || []);
      if (res.data?.pagination) {
        setLedgerPagination(res.data.pagination);
      }
    } catch (err) {
      addToast(`Error loading ledger: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Payments
  const fetchPayments = async () => {
    setLoading(true);
    try {
      const res = await paymentService.getTransactions({
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        search: searchFilter || undefined,
      });
      setPayments(res.data || []);
    } catch (err) {
      addToast(`Error loading payments: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Expenses
  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await expenseService.getAll({
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setExpenses(res.data || []);
    } catch (err) {
      addToast(`Error loading expenses: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Refetch when filters or tab change
  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverview();
    } else if (activeTab === 'ledger') {
      fetchLedger(1);
    } else if (activeTab === 'payments') {
      fetchPayments();
    } else if (activeTab === 'expenses') {
      fetchExpenses();
    }
  }, [propertyFilter, fromDate, toDate, activeTab, searchFilter]);

  // Open Record Expense Modal
  const handleOpenExpenseModal = () => {
    const defaultPropId = propertyFilter !== 'all' ? propertyFilter : properties[0]?.id || '';
    setExpenseForm({
      property_id: defaultPropId,
      apartment_id: '',
      category: 'MAINTENANCE',
      description: '',
      amount: '',
      vendor_payee: '',
      payment_method: 'BANK_TRANSFER',
      expense_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setIsExpenseModalOpen(true);
  };

  // Submit Expense Form
  const handleCreateExpense = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await expenseService.create(expenseForm);
      addToast('Expense recorded successfully in draft state (RECORDED).', 'success');
      setIsExpenseModalOpen(false);
      if (activeTab === 'expenses') fetchExpenses();
      if (activeTab === 'overview') fetchOverview();
    } catch (err) {
      addToast(`Failed to record expense: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Approve Expense
  const handleApproveExpense = async (expense) => {
    if (!window.confirm(`Approve expense #${expense.expense_code} for ${formatNaira(expense.amount)}?`)) return;
    setActionLoading(true);
    try {
      await expenseService.approve(expense.id);
      addToast(`Expense #${expense.expense_code} approved and applied to ledger.`, 'success');
      fetchExpenses();
      fetchOverview();
    } catch (err) {
      addToast(`Approval failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Void Modal
  const handleOpenVoidModal = (expense) => {
    setSelectedExpense(expense);
    setVoidForm({ reason: '' });
    setIsVoidModalOpen(true);
  };

  // Submit Void Expense
  const handleVoidExpense = async (e) => {
    e.preventDefault();
    if (!selectedExpense) return;
    setActionLoading(true);
    try {
      await expenseService.void(selectedExpense.id, voidForm);
      addToast(`Expense #${selectedExpense.expense_code} voided successfully.`, 'info');
      setIsVoidModalOpen(false);
      fetchExpenses();
      fetchOverview();
    } catch (err) {
      addToast(`Void failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Refund Modal
  const handleOpenRefundModal = (payment) => {
    const refundableAmount = (parseFloat(payment.amount) - (parseFloat(payment.refund_amount) || 0)).toFixed(2);
    setSelectedPayment(payment);
    setRefundForm({
      refund_amount: refundableAmount,
      reason: '',
    });
    setIsRefundModalOpen(true);
  };

  // Submit Refund
  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPayment) return;
    setActionLoading(true);
    try {
      await paymentService.refund(selectedPayment.id, refundForm);
      addToast(`Refund of ${formatNaira(refundForm.refund_amount)} processed successfully.`, 'success');
      setIsRefundModalOpen(false);
      if (activeTab === 'payments') fetchPayments();
      if (activeTab === 'overview') fetchOverview();
    } catch (err) {
      addToast(`Refund failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status) => {
    switch (status) {
      case 'SUCCESS':
      case 'APPROVED':
      case 'COMPLETED':
        return <Badge status="success">{status}</Badge>;
      case 'PARTIALLY_REFUNDED':
      case 'RECORDED':
      case 'PENDING':
        return <Badge status="pending">{status}</Badge>;
      case 'REFUNDED':
      case 'VOIDED':
        return <Badge status="danger">{status}</Badge>;
      case 'FAILED':
        return <Badge status="secondary">{status}</Badge>;
      default:
        return <Badge status="neutral">{status}</Badge>;
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>Financial Management & Ledger</span>
            <Badge status="info">PHASE 8 VERIFIED</Badge>
          </h1>
          <p className="page-subtitle">
            Revenue tracking, immutable reversal ledger, categorized operational expenses, and net profit derivation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" onClick={() => reportService.downloadPDF('financial_report.pdf')}>
            Export Report (PDF)
          </Button>
          <Button variant="primary" onClick={handleOpenExpenseModal}>
            + Record Expense
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Gross Collected</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {formatNaira(overview.kpis?.grossCollected || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Authoritative payments ledger</div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Refunds</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
            {formatNaira(overview.kpis?.totalRefunded || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Reversed payments & cancellations</div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Net Revenue</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
            {formatNaira(overview.kpis?.netRevenue || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Gross minus processed refunds</div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Approved Expenses</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.25rem' }}>
            {formatNaira(overview.kpis?.approvedExpenses || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {overview.kpis?.pendingExpenses > 0 ? `+ ${formatNaira(overview.kpis.pendingExpenses)} pending` : 'All expenses reconciled'}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Net Operating Profit</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: (overview.kpis?.netProfit || 0) >= 0 ? 'var(--accent-gold)' : '#ef4444', marginTop: '0.25rem' }}>
            {formatNaira(overview.kpis?.netProfit || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Profit Margin: {overview.kpis?.profitMargin || 0}%
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Receivables / Outstanding</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {formatNaira(overview.kpis?.outstandingReceivables || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Uncollected booking balances</div>
        </Card>
      </div>

      {/* Filter Bar */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Property Scope</label>
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="all">All Properties (Consolidated)</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                setFromDate('');
                setToDate('');
              }}
            >
              Reset Dates
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', marginBottom: '1.5rem', gap: '0.5rem' }}>
        {[
          { id: 'overview', label: 'Financial Overview' },
          { id: 'ledger', label: 'Unified Ledger' },
          { id: 'payments', label: 'Payments & Collections' },
          { id: 'expenses', label: 'Operational Expenses' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.75rem 1.25rem',
              fontWeight: 600,
              fontSize: '0.9rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent-gold)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--accent-gold)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
          <Card title="Expense Distribution by Category">
            {overview.categoryBreakdown?.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No approved expenses recorded for this period.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {overview.categoryBreakdown.map((item) => {
                  const percent = overview.kpis?.approvedExpenses > 0
                    ? Math.round((parseFloat(item.total_amount) / overview.kpis.approvedExpenses) * 100)
                    : 0;
                  return (
                    <div key={item.category}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                        <span style={{ fontWeight: 600 }}>{item.category}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {formatNaira(item.total_amount)} ({percent}%)
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--bg-surface)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: 'var(--accent-gold)',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Accounting Reconciliation Principles">
            <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.88rem' }}>
              <li>
                <strong>Revenue Verification:</strong> All revenue is derived from completed <code>payment_transactions</code>. Unpaid reservation amounts are held strictly as outstanding receivables.
              </li>
              <li>
                <strong>Immutable Refunds:</strong> Reversals are recorded as linked negative ledger transactions without physical row deletion, safeguarding total auditability.
              </li>
              <li>
                <strong>Segregation of Duties:</strong> Expense approvals and transaction refunds require designated capabilities (<code>EXPENSE_APPROVAL</code> and <code>REFUNDS</code>).
              </li>
              <li>
                <strong>Net Profit Computation:</strong> <code>Net Profit = (Gross Collected − Total Refunds) − Approved Operational Expenses</code>.
              </li>
            </ul>
          </Card>
        </div>
      )}

      {/* TAB 2: UNIFIED LEDGER */}
      {activeTab === 'ledger' && (
        <Card title="Unified Financial Ledger">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading ledger entries...</div>
          ) : ledgerEntries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              No financial entries found in ledger for current selection.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference / Code</th>
                  <th>Property</th>
                  <th>Description / Counterparty</th>
                  <th>Gross Amount</th>
                  <th>Net Impact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ledgerEntries.map((row) => (
                  <tr key={row.ledger_id}>
                    <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {row.entry_date ? new Date(row.entry_date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.45rem',
                          borderRadius: '4px',
                          background: row.entry_type === 'REVENUE' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: row.entry_type === 'REVENUE' ? '#10b981' : '#ef4444',
                        }}
                      >
                        {row.entry_type}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {row.transaction_code}
                    </td>
                    <td
                      style={{ cursor: 'pointer', color: 'var(--brand-accent)', fontWeight: 600 }}
                      onClick={() => navigate(`/app/properties?search=${encodeURIComponent(row.property_name || '')}`)}
                      title="View building in Properties"
                    >
                      {row.property_name} ↗
                    </td>
                    <td>
                      {row.counterparty ? (
                        <div
                          style={{ fontWeight: 600, color: 'var(--brand-accent)', cursor: 'pointer' }}
                          onClick={() => navigate(`/app/guests?search=${encodeURIComponent(row.counterparty)}`)}
                          title="View guest/counterparty profile"
                        >
                          {row.counterparty} ↗
                        </div>
                      ) : (
                        <div style={{ fontWeight: 600 }}>N/A</div>
                      )}
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.description}
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatNaira(row.amount)}</td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: parseFloat(row.net_amount) >= 0 ? '#10b981' : '#ef4444',
                      }}
                    >
                      {parseFloat(row.net_amount) >= 0 ? '+' : ''}
                      {formatNaira(row.net_amount)}
                    </td>
                    <td>{getStatusBadge(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* TAB 3: PAYMENTS LEDGER */}
      {activeTab === 'payments' && (
        <Card title={`Payment Transactions (${payments.length})`}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search reference, booking code, guest name/email..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              style={{
                flex: '1',
                minWidth: '240px',
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.875rem',
              }}
            />
            {searchFilter && (
              <Button
                variant="outline"
                size="small"
                onClick={() => setSearchFilter('')}
              >
                Clear Search
              </Button>
            )}
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading payments...</div>
          ) : payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              No payment transactions found.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transaction Ref</th>
                  <th>Booking Ref</th>
                  <th>Guest</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Refunded</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const isRefundable =
                    (p.status === 'SUCCESS' || p.status === 'COMPLETED' || p.status === 'PARTIALLY_REFUNDED') &&
                    parseFloat(p.amount) > (parseFloat(p.refund_amount) || 0);

                  return (
                    <tr key={p.id}>
                      <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {p.payment_date ? new Date(p.payment_date).toLocaleDateString() : 'N/A'}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-gold)' }}>
                        {p.reference}
                      </td>
                      <td
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          color: p.booking_reference ? 'var(--brand-accent)' : 'inherit',
                          cursor: p.booking_reference ? 'pointer' : 'default',
                          fontWeight: 600,
                        }}
                        onClick={() => p.booking_reference && navigate(`/app/reservations?search=${encodeURIComponent(p.booking_reference)}`)}
                        title={p.booking_reference ? "View booking in Reservations Engine" : undefined}
                      >
                        {p.booking_reference ? `${p.booking_reference} ↗` : '—'}
                      </td>
                      <td>
                        <div
                          style={{
                            fontWeight: 600,
                            color: p.guest_name ? 'var(--brand-accent)' : 'inherit',
                            cursor: p.guest_name ? 'pointer' : 'default',
                          }}
                          onClick={() => p.guest_name && navigate(`/app/guests?search=${encodeURIComponent(p.guest_name)}`)}
                          title={p.guest_name ? "View Guest Profile & Stay History" : undefined}
                        >
                          {p.guest_name || 'N/A'} {p.guest_name ? '↗' : ''}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{p.guest_email}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', background: 'var(--bg-surface)', borderRadius: '4px', border: '1px solid var(--border-default)' }}>
                          {p.payment_method}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatNaira(p.amount)}</td>
                      <td style={{ color: p.refund_amount > 0 ? '#ef4444' : 'inherit' }}>
                        {p.refund_amount > 0 ? formatNaira(p.refund_amount) : '—'}
                      </td>
                      <td>{getStatusBadge(p.status)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {isRefundable && (
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => handleOpenRefundModal(p)}
                          >
                            Refund / Reverse
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* TAB 4: OPERATIONAL EXPENSES */}
      {activeTab === 'expenses' && (
        <Card title={`Operational Expenses (${expenses.length})`}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading expenses...</div>
          ) : expenses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              No expense records found.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Expense Code</th>
                  <th>Property</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Vendor / Payee</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id}>
                    <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-gold)' }}>
                      {exp.expense_code}
                    </td>
                    <td>{exp.property_name}</td>
                    <td>
                      <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', background: 'var(--bg-surface)', borderRadius: '4px', border: '1px solid var(--border-default)' }}>
                        {exp.category}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{exp.description}</div>
                      {exp.unit_number && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Unit {exp.unit_number}</div>
                      )}
                    </td>
                    <td>{exp.vendor_payee || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{formatNaira(exp.amount)}</td>
                    <td>{getStatusBadge(exp.status)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        {exp.status === 'RECORDED' && (
                          <>
                            <Button
                              variant="primary"
                              size="small"
                              onClick={() => handleApproveExpense(exp)}
                              disabled={actionLoading}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="small"
                              onClick={() => handleOpenVoidModal(exp)}
                              disabled={actionLoading}
                            >
                              Void
                            </Button>
                          </>
                        )}
                        {exp.status === 'APPROVED' && (
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => handleOpenVoidModal(exp)}
                            disabled={actionLoading}
                          >
                            Void
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* RECORD EXPENSE MODAL */}
      <Modal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        title="Record Operational Expense"
        maxWidth="600px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={() => setIsExpenseModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateExpense} disabled={actionLoading}>
              {actionLoading ? 'Recording...' : 'Record Expense'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateExpense} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Property *</label>
              <select
                required
                value={expenseForm.property_id}
                onChange={(e) => setExpenseForm({ ...expenseForm, property_id: e.target.value, apartment_id: '' })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <option value="">Select Property...</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Unit (Optional)</label>
              <select
                value={expenseForm.apartment_id}
                onChange={(e) => setExpenseForm({ ...expenseForm, apartment_id: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <option value="">Entire Property / Common</option>
                {apartments
                  .filter((a) => !expenseForm.property_id || String(a.property_id) === String(expenseForm.property_id))
                  .map((a) => (
                    <option key={a.id} value={a.id}>Unit {a.unit_number} — {a.unit_name}</option>
                  ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Category *</label>
              <select
                required
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Amount (₦) *</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Description *</label>
            <input
              type="text"
              required
              placeholder="e.g. Generator Diesel Refuel - 500 Liters"
              value={expenseForm.description}
              onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
              style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Vendor / Payee</label>
              <input
                type="text"
                placeholder="e.g. TotalEnergies Nigeria"
                value={expenseForm.vendor_payee}
                onChange={(e) => setExpenseForm({ ...expenseForm, vendor_payee: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Payment Method</label>
              <select
                value={expenseForm.payment_method}
                onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Expense Date</label>
            <input
              type="date"
              required
              value={expenseForm.expense_date}
              onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
              style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            />
          </div>
        </form>
      </Modal>

      {/* REFUND MODAL */}
      {selectedPayment && (
        <Modal
          isOpen={isRefundModalOpen}
          onClose={() => setIsRefundModalOpen(false)}
          title={`Process Payment Refund: Ref #${selectedPayment.reference}`}
          maxWidth="550px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="secondary" onClick={() => setIsRefundModalOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleRefundSubmit} disabled={actionLoading}>
                {actionLoading ? 'Processing...' : 'Authorize Reversal'}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleRefundSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Guest:</span>
                <strong>{selectedPayment.guest_name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Original Payment:</span>
                <strong>{formatNaira(selectedPayment.amount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Remaining Refundable:</span>
                <strong style={{ color: '#10b981' }}>
                  {formatNaira(parseFloat(selectedPayment.amount) - (parseFloat(selectedPayment.refund_amount) || 0))}
                </strong>
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(239, 68, 68, 0.08)', padding: '0.65rem', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              ⚠ Reversals create an immutable negative transaction record in the ledger and decrement the reservation's paid balance. Physical records are never deleted.
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Refund Amount (₦) *</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                max={parseFloat(selectedPayment.amount) - (parseFloat(selectedPayment.refund_amount) || 0)}
                value={refundForm.refund_amount}
                onChange={(e) => setRefundForm({ ...refundForm, refund_amount: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Reason for Reversal / Refund *</label>
              <textarea
                rows={3}
                required
                placeholder="Reason for payment reversal (guest cancellation, overpayment, banking error)..."
                value={refundForm.reason}
                onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical' }}
              />
            </div>
          </form>
        </Modal>
      )}

      {/* VOID EXPENSE MODAL */}
      {selectedExpense && (
        <Modal
          isOpen={isVoidModalOpen}
          onClose={() => setIsVoidModalOpen(false)}
          title={`Void Expense: #${selectedExpense.expense_code}`}
          maxWidth="500px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="secondary" onClick={() => setIsVoidModalOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleVoidExpense} disabled={actionLoading}>
                {actionLoading ? 'Voiding...' : 'Confirm Void'}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleVoidExpense} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: '0.85rem' }}>
              <div><strong>{selectedExpense.description}</strong></div>
              <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Amount: <strong>{formatNaira(selectedExpense.amount)}</strong> | Category: {selectedExpense.category}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Reason for Voiding *</label>
              <textarea
                rows={3}
                required
                placeholder="Detail reason for voiding this expense (duplicate entry, incorrect amount, cancelled invoice)..."
                value={voidForm.reason}
                onChange={(e) => setVoidForm({ reason: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical' }}
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
