import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import {
  financialService,
  paymentService,
  expenseService,
  propertyService,
  apartmentService,
  reportService,
  accountingService,
} from '../../services/api';
import {
  LineChart,
  BarChart,
  GroupedBarChart,
  DoughnutChart,
  ChartEmptyState,
} from '../../components/ui/Charts';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatNaira } from '../../utils/currency';

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

  const [activeTab, setActiveTab] = useState('overview'); 
  // 'overview' | 'trial-balance' | 'general-ledger' | 'ledger' | 'payments' | 'expenses'

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Consolidated Filters
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
    monthlyTrends: [],
    receivablesBreakdown: [],
  });

  // Accounting Periods & Accounts
  const [accountingPeriods, setAccountingPeriods] = useState([]);
  const [accountsList, setAccountsList] = useState([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState('');

  // Trial Balance Data
  const [trialBalance, setTrialBalance] = useState({
    accounts: [],
    grandTotalDebit: 0,
    grandTotalCredit: 0,
    grandNetDebit: 0,
    grandNetCredit: 0,
    isBalanced: true,
    difference: 0,
  });
  const [trialBalanceLoading, setTrialBalanceLoading] = useState(false);
  const [accountTypeFilter, setAccountTypeFilter] = useState('ALL');

  // Double-Entry General Ledger Data
  const [glEntries, setGlEntries] = useState([]);
  const [glPagination, setGlPagination] = useState({ page: 1, limit: 50, total: 0 });
  const [glLoading, setGlLoading] = useState(false);
  const [glSelectedAccount, setGlSelectedAccount] = useState('');
  const [glSearch, setGlSearch] = useState('');

  // Subledger & Transaction Data
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
    if (qTab && ['overview', 'trial-balance', 'general-ledger', 'ledger', 'payments', 'expenses'].includes(qTab)) {
      setActiveTab(qTab);
    }

    const qSearch = searchParams.get('search');
    if (qSearch !== prevSearchParamRef.current) {
      prevSearchParamRef.current = qSearch;
      setSearchFilter(qSearch || '');
    }
  }, [searchParams]);

  // Load accounting periods and accounts once
  useEffect(() => {
    async function loadAccountingMetadata() {
      try {
        const [periodsRes, accsRes] = await Promise.all([
          accountingService.getPeriods().catch(() => ({ data: [] })),
          accountingService.getAccounts().catch(() => ({ data: [] })),
        ]);
        const periods = periodsRes.data?.data || periodsRes.data || [];
        setAccountingPeriods(Array.isArray(periods) ? periods : []);
        const accs = accsRes.data?.data || accsRes.data || [];
        setAccountsList(Array.isArray(accs) ? accs : []);
      } catch (err) {
        console.error('Failed to load accounting periods or chart of accounts', err);
      }
    }
    loadAccountingMetadata();
  }, []);

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

  // Fetch Trial Balance
  const fetchTrialBalance = async () => {
    setTrialBalanceLoading(true);
    try {
      const res = await accountingService.getTrialBalanceSummary({
        periodId: selectedPeriodId || undefined,
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      const data = res.data?.data || res.data || {};
      setTrialBalance({
        accounts: data.accounts || [],
        grandTotalDebit: parseFloat(data.grandTotalDebit || 0),
        grandTotalCredit: parseFloat(data.grandTotalCredit || 0),
        grandNetDebit: parseFloat(data.grandNetDebit || 0),
        grandNetCredit: parseFloat(data.grandNetCredit || 0),
        isBalanced: !!data.isBalanced,
        difference: parseFloat(data.difference || 0),
      });
    } catch (err) {
      addToast(`Error loading trial balance: ${err.message}`, 'error');
    } finally {
      setTrialBalanceLoading(false);
    }
  };

  // Fetch General Ledger
  const fetchGeneralLedger = async (page = 1) => {
    setGlLoading(true);
    try {
      const res = await accountingService.getLedger({
        accountId: glSelectedAccount || undefined,
        periodId: selectedPeriodId || undefined,
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit: 50,
      });
      const raw = res.data?.data || res.data?.items || res.data || [];
      const list = Array.isArray(raw) ? raw : (raw.data || []);
      setGlEntries(list);
      setGlPagination({
        page: Number(res.data?.page || page),
        limit: Number(res.data?.limit || 50),
        total: Number(res.data?.total || list.length),
      });
    } catch (err) {
      addToast(`Error loading General Ledger: ${err.message}`, 'error');
    } finally {
      setGlLoading(false);
    }
  };

  // Fetch Unified Subledger
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
      addToast(`Error loading subledger: ${err.message}`, 'error');
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
    } else if (activeTab === 'trial-balance') {
      fetchTrialBalance();
    } else if (activeTab === 'general-ledger') {
      fetchGeneralLedger(1);
    } else if (activeTab === 'ledger') {
      fetchLedger(1);
    } else if (activeTab === 'payments') {
      fetchPayments();
    } else if (activeTab === 'expenses') {
      fetchExpenses();
    }
  }, [propertyFilter, fromDate, toDate, activeTab, searchFilter, selectedPeriodId, glSelectedAccount]);

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

  // Create Expense Submit
  const handleCreateExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.property_id || !expenseForm.amount || !expenseForm.description) {
      addToast('Please complete all required fields.', 'warning');
      return;
    }

    setActionLoading(true);
    try {
      await expenseService.create({
        ...expenseForm,
        apartment_id: expenseForm.apartment_id || null,
        amount: parseFloat(expenseForm.amount),
      });
      addToast('Expense recorded successfully.', 'success');
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
  const handleApproveExpense = async (id) => {
    if (!window.confirm('Are you sure you want to approve this expense? This will post an official financial record.')) return;
    setActionLoading(true);
    try {
      await expenseService.approve(id);
      addToast('Expense approved successfully.', 'success');
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

  // Void Expense
  const handleVoidExpense = async (e) => {
    e.preventDefault();
    if (!voidForm.reason) {
      addToast('A reason is required to void an expense.', 'warning');
      return;
    }

    setActionLoading(true);
    try {
      await expenseService.void(selectedExpense.id, voidForm.reason);
      addToast(`Expense #${selectedExpense.expense_code} voided.`, 'success');
      setIsVoidModalOpen(false);
      setSelectedExpense(null);
      fetchExpenses();
      fetchOverview();
    } catch (err) {
      addToast(`Failed to void expense: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Refund Modal
  const handleOpenRefundModal = (payment) => {
    setSelectedPayment(payment);
    const maxRefund = parseFloat(payment.amount) - (parseFloat(payment.refund_amount) || 0);
    setRefundForm({
      refund_amount: maxRefund.toFixed(2),
      reason: '',
    });
    setIsRefundModalOpen(true);
  };

  // Process Refund
  const handleProcessRefund = async (e) => {
    e.preventDefault();
    const amount = parseFloat(refundForm.refund_amount);
    const maxRefund = parseFloat(selectedPayment.amount) - (parseFloat(selectedPayment.refund_amount) || 0);

    if (isNaN(amount) || amount <= 0 || amount > maxRefund) {
      addToast(`Invalid refund amount. Maximum refundable is ${formatNaira(maxRefund)}.`, 'warning');
      return;
    }

    if (!refundForm.reason.trim()) {
      addToast('A reason is mandatory for auditing reversals.', 'warning');
      return;
    }

    setActionLoading(true);
    try {
      await paymentService.refund(selectedPayment.id, {
        amount,
        reason: refundForm.reason.trim(),
      });
      addToast(`Refund of ${formatNaira(amount)} recorded successfully.`, 'success');
      setIsRefundModalOpen(false);
      setSelectedPayment(null);
      if (activeTab === 'payments') fetchPayments();
      if (activeTab === 'overview') fetchOverview();
    } catch (err) {
      addToast(`Refund processing failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Export Trial Balance CSV
  const handleExportTrialBalanceCSV = () => {
    if (!trialBalance.accounts || trialBalance.accounts.length === 0) {
      addToast('No trial balance records to export.', 'warning');
      return;
    }
    const headers = ['Account Code', 'Account Name', 'Account Type', 'Normal Balance', 'Total Debit (NGN)', 'Total Credit (NGN)', 'Net Debit (NGN)', 'Net Credit (NGN)', 'Status'];
    const rows = trialBalance.accounts.map((a) => [
      `"${a.account_code}"`,
      `"${a.account_name.replace(/"/g, '""')}"`,
      `"${a.account_type}"`,
      `"${a.normal_balance}"`,
      a.total_debit,
      a.total_credit,
      a.net_debit_balance,
      a.net_credit_balance,
      a.is_abnormal ? '"ABNORMAL"' : '"NORMAL"',
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `trial_balance_${selectedPeriodId || 'all'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export General Ledger CSV
  const handleExportGlCSV = () => {
    if (!glEntries || glEntries.length === 0) {
      addToast('No General Ledger records to export.', 'warning');
      return;
    }
    const headers = ['Posting Date', 'Journal #', 'Source Type', 'Account Code', 'Account Name', 'Description', 'Property', 'Debit (NGN)', 'Credit (NGN)', 'Net Balance Impact (NGN)'];
    const rows = glEntries.map((gl) => [
      `"${gl.posting_date ? gl.posting_date.slice(0, 10) : ''}"`,
      `"${gl.journal_number || ''}"`,
      `"${gl.source_type || ''}"`,
      `"${gl.account_code || ''}"`,
      `"${(gl.account_name || '').replace(/"/g, '""')}"`,
      `"${(gl.description || '').replace(/"/g, '""')}"`,
      `"${(gl.property_name || 'Consolidated').replace(/"/g, '""')}"`,
      gl.debit || '0.00',
      gl.credit || '0.00',
      gl.net_balance_impact || '0.00',
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `general_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered accounts for Trial Balance
  const filteredTbAccounts = useMemo(() => {
    if (accountTypeFilter === 'ALL') return trialBalance.accounts;
    return trialBalance.accounts.filter((a) => a.account_type === accountTypeFilter);
  }, [trialBalance.accounts, accountTypeFilter]);

  // Grouped trial balance data by account type for Doughnut Chart
  const tbTypeDistribution = useMemo(() => {
    const map = {};
    trialBalance.accounts.forEach((a) => {
      const type = a.account_type || 'OTHER';
      map[type] = (map[type] || 0) + parseFloat(a.total_debit || 0);
    });
    return Object.entries(map).map(([category, total_amount]) => ({
      category,
      total_amount,
    }));
  }, [trialBalance.accounts]);

  // GL activity summary by Source Type
  const glSourceActivity = useMemo(() => {
    const map = {};
    glEntries.forEach((e) => {
      const src = e.source_type || 'MANUAL';
      if (!map[src]) map[src] = { source: src, debits: 0, credits: 0 };
      map[src].debits += parseFloat(e.debit || 0);
      map[src].credits += parseFloat(e.credit || 0);
    });
    return Object.values(map);
  }, [glEntries]);

  // GL totals for current view
  const glTotals = useMemo(() => {
    let debits = 0;
    let credits = 0;
    glEntries.forEach((e) => {
      debits += parseFloat(e.debit || 0);
      credits += parseFloat(e.credit || 0);
    });
    return { debits, credits, count: glEntries.length };
  }, [glEntries]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'SUCCESS':
      case 'APPROVED':
      case 'POSTED':
      case 'COMPLETED':
        return <Badge status="success">{status}</Badge>;
      case 'PARTIALLY_REFUNDED':
      case 'RECORDED':
      case 'PENDING':
      case 'PENDING_APPROVAL':
        return <Badge status="pending">{status}</Badge>;
      case 'REFUNDED':
      case 'VOIDED':
        return <Badge status="danger">{status}</Badge>;
      case 'FAILED':
      case 'REJECTED':
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
            <span>Financial Management & Double-Entry Ledger</span>
            <Badge status="info">AUDITABLE & BALANCED</Badge>
          </h1>
          <p className="page-subtitle">
            Revenue tracking, double-entry General Ledger, Trial Balance parity, categorized expenses, and net profit derivation.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => reportService.downloadPDF('financial_report.pdf')}>
            Export Report (PDF)
          </Button>
          <Button variant="primary" onClick={handleOpenExpenseModal}>
            + Record Expense
          </Button>
        </div>
      </div>

      {/* Reconciliation Anomaly Alert Banner */}
      {overview.hasAnomaly && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', fontWeight: 700, fontSize: '0.95rem' }}>
              <span>⚠ Reconciliation Warning: Financial Inconsistencies Detected</span>
            </div>
            <Badge status="error">{overview.reconciliationStatus || 'ANOMALIES_DETECTED'}</Badge>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            The following data integrity anomalies were identified by the system reconciliation engine:
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--text-secondary)', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {overview.anomalies?.map((a, i) => (
              <li key={i}>
                <span style={{ fontWeight: 600, color: a.severity === 'CRITICAL' ? '#ef4444' : '#f59e0b' }}>[{a.code}]</span>: {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
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
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: (overview.kpis?.netProfit || 0) >= 0 ? '#10b981' : '#ef4444', marginTop: '0.25rem' }}>
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

      {/* Global Filter Bar */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '1rem', alignItems: 'center' }}>
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

          {(activeTab === 'trial-balance' || activeTab === 'general-ledger') && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Accounting Period</label>
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <option value="">All Accounting Periods</option>
                {accountingPeriods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.period_name} ({p.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setSelectedPeriodId('');
                setGlSelectedAccount('');
                setSearchFilter('');
              }}
            >
              Reset Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)', marginBottom: '1.5rem', gap: '0.5rem', overflowX: 'auto' }}>
        {[
          { id: 'overview', label: 'Financial Overview & Charts' },
          { id: 'trial-balance', label: 'Trial Balance' },
          { id: 'general-ledger', label: 'General Ledger' },
          { id: 'ledger', label: 'Subledger Transactions' },
          { id: 'payments', label: 'Payments & Collections' },
          { id: 'expenses', label: 'Operational Expenses' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.75rem 1.15rem',
              fontWeight: 600,
              fontSize: '0.88rem',
              whiteSpace: 'nowrap',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent-gold, #c25e2e)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--accent-gold, #c25e2e)' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease-in-out',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & CHARTS */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Charts Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
            <Card>
              <GroupedBarChart
                title="Revenue, Collections & Expense Monthly Trends"
                data={overview.monthlyTrends || []}
                xKey="period"
                bars={[
                  { key: 'bookedRevenue', label: 'Booked Revenue', color: '#3b82f6' },
                  { key: 'netCollections', label: 'Net Collections', color: '#10b981' },
                  { key: 'approvedExpenses', label: 'Approved Expenses', color: '#f59e0b' },
                ]}
                formatValue={formatNaira}
                emptyMessage="No monthly financial transaction activity recorded."
              />
            </Card>

            <Card>
              <DoughnutChart
                title="Operational Expense Distribution by Category"
                data={overview.categoryBreakdown || []}
                labelKey="category"
                valueKey="total_amount"
                formatValue={formatNaira}
                centerLabel="Total Approved"
                centerSub={formatNaira(overview.kpis?.approvedExpenses || 0)}
                emptyMessage="No approved operational expenses in active filter scope."
              />
            </Card>
          </div>

          {/* Charts Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
            <Card>
              <LineChart
                title="Net Operating Profit Trend"
                data={overview.monthlyTrends || []}
                xKey="period"
                series={[
                  { key: 'netProfit', label: 'Net Profit', color: '#10b981' },
                  { key: 'netCollections', label: 'Net Collections', color: '#3b82f6' },
                ]}
                formatValue={formatNaira}
                emptyMessage="No profit trend data available."
              />
            </Card>

            <Card>
              <BarChart
                title="Outstanding Receivables by Property"
                data={overview.receivablesBreakdown || []}
                xKey="property_name"
                yKey="outstanding_amount"
                color="#c25e2e"
                formatValue={formatNaira}
                emptyMessage="All properties are fully collected; no outstanding receivables."
              />
            </Card>
          </div>

          {/* Accounting Reconciliation Principles */}
          <Card title="Accounting Reconciliation Principles & Verification">
            <ul style={{ paddingLeft: '1.25rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.88rem' }}>
              <li>
                <strong>Revenue Verification:</strong> All revenue is derived from completed <code>payment_transactions</code>. Unpaid reservation amounts are held strictly as outstanding receivables.
              </li>
              <li>
                <strong>Immutable Double-Entry Postings:</strong> Every operational transaction (Night Audit stay posting, guest payment, approved expense payout) creates balanced journal lines in the General Ledger.
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

      {/* TAB 2: TRIAL BALANCE */}
      {activeTab === 'trial-balance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Parity Status Banner */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
              padding: '1.25rem',
              borderRadius: 'var(--radius-md, 8px)',
              background: trialBalance.isBalanced ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${trialBalance.isBalanced ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '1.25rem' }}>{trialBalance.isBalanced ? '⚖️' : '⚠️'}</span>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: trialBalance.isBalanced ? '#10b981' : '#ef4444' }}>
                  {trialBalance.isBalanced ? 'Trial Balance is Mathematically Balanced' : 'Trial Balance Out of Equilibrium'}
                </h3>
                <Badge status={trialBalance.isBalanced ? 'success' : 'danger'}>
                  {trialBalance.isBalanced ? 'BALANCED' : 'IMBALANCE DETECTED'}
                </Badge>
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Total debits equal total credits across all posting accounts. Difference: {formatNaira(trialBalance.difference)}.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Grand Total Debits</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {formatNaira(trialBalance.grandTotalDebit)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Grand Total Credits</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {formatNaira(trialBalance.grandTotalCredit)}
                </div>
              </div>
              <Button variant="secondary" size="small" onClick={handleExportTrialBalanceCSV}>
                📥 Export Trial Balance (CSV)
              </Button>
            </div>
          </div>

          {/* Account Type Distribution Chart */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
            <Card>
              <DoughnutChart
                title="Debit Distribution by Account Category"
                data={tbTypeDistribution}
                labelKey="category"
                valueKey="total_amount"
                formatValue={formatNaira}
                centerLabel="Total Debits"
                centerSub={formatNaira(trialBalance.grandTotalDebit)}
                emptyMessage="No trial balance account activity."
              />
            </Card>

            <Card title="Trial Balance Filter Controls">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>
                    Filter by Account Classification
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setAccountTypeFilter(t)}
                        style={{
                          padding: '0.4rem 0.75rem',
                          borderRadius: 'var(--radius-sm, 6px)',
                          border: accountTypeFilter === t ? '1px solid var(--accent-gold, #c25e2e)' : '1px solid var(--border-default)',
                          background: accountTypeFilter === t ? 'rgba(194, 94, 46, 0.1)' : 'var(--bg-surface)',
                          color: accountTypeFilter === t ? 'var(--accent-gold, #c25e2e)' : 'var(--text-primary)',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '0.85rem', borderRadius: 'var(--radius-md)' }}>
                  <div><strong>Total Active Accounts in Ledger:</strong> {trialBalance.accounts.length}</div>
                  <div style={{ marginTop: '0.25rem' }}><strong>Showing Filtered Accounts:</strong> {filteredTbAccounts.length}</div>
                  <div style={{ marginTop: '0.25rem' }}><strong>Net Debit Balance:</strong> {formatNaira(trialBalance.grandNetDebit)}</div>
                  <div style={{ marginTop: '0.25rem' }}><strong>Net Credit Balance:</strong> {formatNaira(trialBalance.grandNetCredit)}</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Trial Balance Table */}
          <Card title={`Trial Balance Accounts (${filteredTbAccounts.length})`}>
            {trialBalanceLoading ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                Querying chart of accounts & calculating debit/credit balances...
              </div>
            ) : filteredTbAccounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                No accounts match the selected filters.
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Account Code</th>
                    <th>Account Name</th>
                    <th>Classification</th>
                    <th>Normal Balance</th>
                    <th style={{ textAlign: 'right' }}>Total Debit</th>
                    <th style={{ textAlign: 'right' }}>Total Credit</th>
                    <th style={{ textAlign: 'right' }}>Net Debit</th>
                    <th style={{ textAlign: 'right' }}>Net Credit</th>
                    <th>Balance Health</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTbAccounts.map((acc) => (
                    <tr key={acc.account_id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-gold)' }}>
                        {acc.account_code}
                      </td>
                      <td style={{ fontWeight: 600 }}>{acc.account_name}</td>
                      <td>
                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                          {acc.account_type}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {acc.normal_balance}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatNaira(acc.total_debit)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatNaira(acc.total_credit)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#10b981' }}>
                        {parseFloat(acc.net_debit_balance) > 0 ? formatNaira(acc.net_debit_balance) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#3b82f6' }}>
                        {parseFloat(acc.net_credit_balance) > 0 ? formatNaira(acc.net_credit_balance) : '—'}
                      </td>
                      <td>
                        {acc.is_abnormal ? (
                          <Badge status="danger">ABNORMAL</Badge>
                        ) : (
                          <Badge status="success">NORMAL</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: DOUBLE-ENTRY GENERAL LEDGER */}
      {activeTab === 'general-ledger' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header & Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>Official Double-Entry General Ledger</span>
                <Badge status="neutral">SYSTEM POSTING RECORDS</Badge>
              </h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Immutable posting lines with corresponding debits, credits, and accounting period links.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button variant="secondary" size="small" onClick={handleExportGlCSV}>
                📥 Export Ledger (CSV)
              </Button>
            </div>
          </div>

          {/* GL Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <Card>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Filtered GL Records</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, marginTop: '0.25rem' }}>{glPagination.total || glTotals.count}</div>
            </Card>
            <Card>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Filtered Debits</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
                {formatNaira(glTotals.debits)}
              </div>
            </Card>
            <Card>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total Filtered Credits</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#3b82f6', marginTop: '0.25rem' }}>
                {formatNaira(glTotals.credits)}
              </div>
            </Card>
          </div>

          {/* GL Activity by Source Type Chart */}
          {glSourceActivity.length > 0 && (
            <Card>
              <GroupedBarChart
                title="General Ledger Debit vs Credit Activity by Source Transaction Type"
                data={glSourceActivity}
                xKey="source"
                bars={[
                  { key: 'debits', label: 'Debits (NGN)', color: '#10b981' },
                  { key: 'credits', label: 'Credits (NGN)', color: '#3b82f6' },
                ]}
                formatValue={formatNaira}
                emptyMessage="No ledger activity recorded."
              />
            </Card>
          )}

          {/* GL Filters */}
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'center' }}>
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Filter by Account</label>
                <select
                  value={glSelectedAccount}
                  onChange={(e) => setGlSelectedAccount(e.target.value)}
                  style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                >
                  <option value="">All Accounts</option>
                  {accountsList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.account_code} — {a.account_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Search Journal / Description</label>
                <input
                  type="text"
                  placeholder="Journal # or description..."
                  value={glSearch}
                  onChange={(e) => setGlSearch(e.target.value)}
                  style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
                <Button
                  variant="outline"
                  size="small"
                  onClick={() => {
                    setGlSelectedAccount('');
                    setGlSearch('');
                    fetchGeneralLedger(1);
                  }}
                >
                  Reset GL Filters
                </Button>
              </div>
            </div>
          </Card>

          {/* GL Table */}
          <Card title={`General Ledger Entries (${glPagination.total || glEntries.length})`}>
            {glLoading ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                Loading General Ledger lines...
              </div>
            ) : glEntries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
                No double-entry postings found for active selection.
              </div>
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <th>Posting Date</th>
                      <th>Journal #</th>
                      <th>Source</th>
                      <th>Account</th>
                      <th>Property</th>
                      <th>Description</th>
                      <th style={{ textAlign: 'right' }}>Debit</th>
                      <th style={{ textAlign: 'right' }}>Credit</th>
                      <th style={{ textAlign: 'right' }}>Net Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {glEntries.map((row) => (
                      <tr key={row.id}>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {row.posting_date ? row.posting_date.slice(0, 10) : '—'}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-gold)' }}>
                          {row.journal_number}
                        </td>
                        <td>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                            {row.source_type || 'MANUAL'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{row.account_code}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.account_name}</div>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {row.property_name || 'Consolidated'}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-primary)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {row.description || '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: parseFloat(row.debit) > 0 ? '#10b981' : 'inherit' }}>
                          {parseFloat(row.debit) > 0 ? formatNaira(row.debit) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: parseFloat(row.credit) > 0 ? '#3b82f6' : 'inherit' }}>
                          {parseFloat(row.credit) > 0 ? formatNaira(row.credit) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: parseFloat(row.net_balance_impact) >= 0 ? '#10b981' : '#ef4444' }}>
                          {formatNaira(row.net_balance_impact)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>

                {/* Pagination Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Page {glPagination.page} of {Math.ceil((glPagination.total || 1) / glPagination.limit)} ({glPagination.total} total postings)
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button
                      variant="outline"
                      size="small"
                      disabled={glPagination.page <= 1 || glLoading}
                      onClick={() => fetchGeneralLedger(glPagination.page - 1)}
                    >
                      ← Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="small"
                      disabled={glPagination.page * glPagination.limit >= glPagination.total || glLoading}
                      onClick={() => fetchGeneralLedger(glPagination.page + 1)}
                    >
                      Next →
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {/* TAB 4: UNIFIED SUBLEDGER */}
      {activeTab === 'ledger' && (
        <Card title="Unified Financial Subledger">
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

      {/* TAB 5: PAYMENTS LEDGER */}
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
                            color: p.guest_id ? 'var(--brand-accent)' : 'inherit',
                            cursor: p.guest_id ? 'pointer' : 'default',
                          }}
                          onClick={() => p.guest_id && navigate(`/app/guests?search=${encodeURIComponent(p.guest_name || '')}`)}
                          title={p.guest_id ? "View guest CRM profile" : undefined}
                        >
                          {p.guest_name || 'Guest'} {p.guest_id ? '↗' : ''}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{p.payment_method}</td>
                      <td style={{ fontWeight: 600 }}>{formatNaira(p.amount)}</td>
                      <td style={{ color: parseFloat(p.refund_amount) > 0 ? '#ef4444' : 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {parseFloat(p.refund_amount) > 0 ? formatNaira(p.refund_amount) : '—'}
                      </td>
                      <td>{getStatusBadge(p.status)}</td>
                      <td style={{ textAlign: 'right' }}>
                        {isRefundable && hasPermission('REFUNDS') && (
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

      {/* TAB 6: OPERATIONAL EXPENSES */}
      {activeTab === 'expenses' && (
        <Card title={`Operational Expenses (${expenses.length})`}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading expenses...</div>
          ) : expenses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              No operational expenses recorded for current selection.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Property</th>
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
                      #{exp.expense_code}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                        {exp.category}
                      </span>
                    </td>
                    <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {exp.description}
                    </td>
                    <td>{exp.property_name || 'N/A'}</td>
                    <td>{exp.vendor_payee || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{formatNaira(exp.amount)}</td>
                    <td>{getStatusBadge(exp.status)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {exp.status === 'RECORDED' && hasPermission('EXPENSE_APPROVAL') && (
                          <Button
                            variant="primary"
                            size="small"
                            onClick={() => handleApproveExpense(exp.id)}
                            disabled={actionLoading}
                          >
                            Approve
                          </Button>
                        )}
                        {exp.status !== 'VOIDED' && hasPermission('EXPENSE_APPROVAL') && (
                          <Button
                            variant="outline"
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
                onChange={(e) => setExpenseForm({ ...expenseForm, property_id: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                <option value="">Select Property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Category *</label>
              <select
                required
                value={expenseForm.category}
                onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Amount (₦) *</label>
              <input
                type="number"
                required
                min="0.01"
                step="0.01"
                placeholder="e.g. 25000.00"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Expense Date *</label>
              <input
                type="date"
                required
                value={expenseForm.expense_date}
                onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Description *</label>
            <input
              type="text"
              required
              placeholder="e.g. Generator diesel replenishment 100L"
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
                placeholder="e.g. TotalEnergies Services"
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
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Apartment Unit (Optional)</label>
            <select
              value={expenseForm.apartment_id}
              onChange={(e) => setExpenseForm({ ...expenseForm, apartment_id: e.target.value })}
              style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
            >
              <option value="">Building-wide / Common Area</option>
              {apartments.map((apt) => (
                <option key={apt.id} value={apt.id}>
                  {apt.name} ({apt.apartment_number})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Internal Audit Notes</label>
            <textarea
              rows={2}
              placeholder="Invoice reference, approval code, or receipt details..."
              value={expenseForm.notes}
              onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
              style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', resize: 'vertical' }}
            />
          </div>
        </form>
      </Modal>

      {/* PROCESS REFUND MODAL */}
      {selectedPayment && (
        <Modal
          isOpen={isRefundModalOpen}
          onClose={() => setIsRefundModalOpen(false)}
          title={`Process Payment Reversal: ${selectedPayment.reference}`}
          maxWidth="500px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <Button variant="secondary" onClick={() => setIsRefundModalOpen(false)} disabled={actionLoading}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleProcessRefund} disabled={actionLoading}>
                {actionLoading ? 'Processing...' : 'Confirm Reversal'}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleProcessRefund} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)', fontSize: '0.85rem' }}>
              <div>Original Amount: <strong>{formatNaira(selectedPayment.amount)}</strong></div>
              <div>Already Refunded: <strong>{formatNaira(selectedPayment.refund_amount || 0)}</strong></div>
              <div style={{ color: 'var(--brand-accent)', fontWeight: 600, marginTop: '0.25rem' }}>
                Maximum Refundable: {formatNaira(parseFloat(selectedPayment.amount) - (parseFloat(selectedPayment.refund_amount) || 0))}
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
