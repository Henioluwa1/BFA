import React, { useState, useEffect, useMemo } from 'react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Table from '../components/ui/Table';
import Modal, { ConfirmationModal } from '../components/ui/Modal';
import { agentService, commissionService, propertyService, reservationService, reportService } from '../services/api';
import { useProperty } from '../context/PropertyContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatNaira } from '../utils/currency';

export default function AgentsPage() {
  const { properties, activePropertyId, isAllProperties, activeProperty } = useProperty();
  const { user, isSuperAdmin, hasPermission } = useAuth();
  const { addToast } = useToast();

  // Tabs: 'directory' | 'commissions'
  const [activeTab, setActiveTab] = useState('directory');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Data states
  const [agents, setAgents] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [summary, setSummary] = useState({
    totalCommissionGenerated: 0,
    paidCommission: 0,
    pendingCommission: 0,
    activeAgentsCount: 0,
    totalCommissionsCount: 0,
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || 'all');
  const [agentStatusFilter, setAgentStatusFilter] = useState('ALL');
  const [commissionStatusFilter, setCommissionStatusFilter] = useState('ALL');

  // Modals state
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isCalculateModalOpen, setIsCalculateModalOpen] = useState(false);
  const [isPayoutModalOpen, setIsPayoutModalOpen] = useState(false);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [isStatusConfirmOpen, setIsStatusConfirmOpen] = useState(false);

  // Selected records
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedAgentPerformance, setSelectedAgentPerformance] = useState(null);
  const [selectedAgentClients, setSelectedAgentClients] = useState([]);
  const [selectedCommission, setSelectedCommission] = useState(null);
  const [statusToToggle, setStatusToToggle] = useState(null);

  // Form states
  const initialAgentForm = {
    name: '',
    agency_name: '',
    email: '',
    phone: '',
    property_id: '',
    commission_type: 'PERCENTAGE',
    commission_rate: 10,
    bank_name: '',
    account_number: '',
    account_name: '',
    status: 'ACTIVE',
    notes: '',
  };
  const [agentForm, setAgentForm] = useState(initialAgentForm);

  const [calculateForm, setCalculateForm] = useState({
    reservationId: '',
    agentId: '',
    notes: '',
  });

  const [payoutForm, setPayoutForm] = useState({
    payment_reference: '',
    payment_method: 'BANK_TRANSFER',
    notes: '',
  });

  const [voidForm, setVoidForm] = useState({
    reason: '',
  });

  // Keep propertyFilter in sync with PropertyContext
  useEffect(() => {
    setPropertyFilter(activePropertyId || 'all');
  }, [activePropertyId]);

  // Load data
  const fetchData = async () => {
    setLoading(true);
    try {
      const propParam = propertyFilter !== 'all' ? propertyFilter : undefined;

      // 1. Fetch Agents
      const agentsRes = await agentService.getAll({
        propertyId: propParam,
        status: agentStatusFilter !== 'ALL' ? agentStatusFilter : undefined,
        search: searchQuery || undefined,
      });
      setAgents(agentsRes.data?.data || agentsRes.data || []);

      // 2. Fetch Commissions Summary
      const summaryRes = await commissionService.getSummary({
        propertyId: propParam,
      });
      if (summaryRes.data?.data || summaryRes.data) {
        setSummary(summaryRes.data?.data || summaryRes.data);
      }

      // 3. Fetch Commissions List
      const commRes = await commissionService.getAll({
        propertyId: propParam,
        status: commissionStatusFilter !== 'ALL' ? commissionStatusFilter : undefined,
      });
      setCommissions(commRes.data?.data || commRes.data || []);
    } catch (err) {
      addToast(`Failed to load agents data: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [propertyFilter, agentStatusFilter, commissionStatusFilter, activeTab]);

  // Handle Create / Update Agent
  const handleOpenAddAgent = () => {
    setIsEditMode(false);
    setAgentForm({
      ...initialAgentForm,
      property_id: propertyFilter !== 'all' ? propertyFilter : '',
    });
    setIsAgentModalOpen(true);
  };

  const handleOpenEditAgent = (agent) => {
    setIsEditMode(true);
    setSelectedAgent(agent);
    setAgentForm({
      name: agent.name || '',
      agency_name: agent.agency_name || '',
      email: agent.email || '',
      phone: agent.phone || '',
      property_id: agent.property_id || '',
      commission_type: agent.commission_type || 'PERCENTAGE',
      commission_rate: agent.commission_rate ?? 10,
      bank_name: agent.bank_name || '',
      account_number: agent.account_number || '',
      account_name: agent.account_name || '',
      status: agent.status || 'ACTIVE',
      notes: agent.notes || '',
    });
    setIsAgentModalOpen(true);
  };

  const handleSaveAgent = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const payload = {
        ...agentForm,
        commission_rate: parseFloat(agentForm.commission_rate) || 0,
        property_id: agentForm.property_id ? parseInt(agentForm.property_id, 10) : null,
      };

      if (isEditMode && selectedAgent) {
        await agentService.update(selectedAgent.id, payload);
        addToast(`Agent '${agentForm.name}' updated successfully.`, 'success');
      } else {
        await agentService.create(payload);
        addToast(`Agent '${agentForm.name}' created successfully.`, 'success');
      }

      setIsAgentModalOpen(false);
      fetchData();
    } catch (err) {
      addToast(`Agent save failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Details Modal & fetch performance/clients
  const handleOpenDetails = async (agent) => {
    setSelectedAgent(agent);
    setIsDetailsModalOpen(true);
    setSelectedAgentPerformance(null);
    setSelectedAgentClients([]);

    try {
      const [perfRes, clientsRes] = await Promise.all([
        agentService.getPerformance(agent.id),
        agentService.getClients(agent.id),
      ]);
      setSelectedAgentPerformance(perfRes.data?.data || perfRes.data || null);
      setSelectedAgentClients(clientsRes.data?.data || clientsRes.data || []);
    } catch (err) {
      console.warn('Could not load full agent details:', err.message);
    }
  };

  // Toggle Status
  const handlePromptStatusToggle = (agent) => {
    const nextStatus = agent.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setSelectedAgent(agent);
    setStatusToToggle(nextStatus);
    setIsStatusConfirmOpen(true);
  };

  const handleConfirmStatusToggle = async () => {
    if (!selectedAgent || !statusToToggle) return;
    setActionLoading(true);
    try {
      await agentService.updateStatus(selectedAgent.id, statusToToggle);
      addToast(`Agent '${selectedAgent.name}' marked as ${statusToToggle}.`, 'success');
      setIsStatusConfirmOpen(false);
      fetchData();
    } catch (err) {
      addToast(`Status update failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate Commission
  const handleCalculateCommission = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await commissionService.calculate({
        reservationId: parseInt(calculateForm.reservationId, 10),
        agentId: parseInt(calculateForm.agentId, 10),
        notes: calculateForm.notes,
      });
      addToast('Commission calculation processed successfully.', 'success');
      setIsCalculateModalOpen(false);
      setCalculateForm({ reservationId: '', agentId: '', notes: '' });
      fetchData();
    } catch (err) {
      addToast(`Calculation failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Approve Commission
  const handleApproveCommission = async (commission) => {
    setActionLoading(true);
    try {
      await commissionService.approve(commission.id);
      addToast(`Commission #${commission.commission_code} approved for payout.`, 'success');
      fetchData();
    } catch (err) {
      addToast(`Approval failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Payout Modal
  const handleOpenPayout = (commission) => {
    setSelectedCommission(commission);
    setPayoutForm({
      payment_reference: `PAY-${Date.now().toString().slice(-6)}`,
      payment_method: 'BANK_TRANSFER',
      notes: '',
    });
    setIsPayoutModalOpen(true);
  };

  // Submit Payout
  const handleRecordPayout = async (e) => {
    e.preventDefault();
    if (!selectedCommission) return;
    setActionLoading(true);
    try {
      await commissionService.payout(selectedCommission.id, payoutForm);
      addToast(`Payout recorded for commission #${selectedCommission.commission_code}.`, 'success');
      setIsPayoutModalOpen(false);
      fetchData();
    } catch (err) {
      addToast(`Payout recording failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Void Modal
  const handleOpenVoid = (commission) => {
    setSelectedCommission(commission);
    setVoidForm({ reason: '' });
    setIsVoidModalOpen(true);
  };

  // Submit Void
  const handleVoidCommission = async (e) => {
    e.preventDefault();
    if (!selectedCommission) return;
    setActionLoading(true);
    try {
      await commissionService.void(selectedCommission.id, voidForm);
      addToast(`Commission #${selectedCommission.commission_code} voided.`, 'success');
      setIsVoidModalOpen(false);
      fetchData();
    } catch (err) {
      addToast(`Void failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (activeTab === 'directory') {
      reportService.downloadCSV('agents', `bfa-agents-${Date.now()}.csv`, {
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
      });
      addToast('Agents directory CSV downloaded.', 'success');
    } else {
      reportService.downloadCSV('commissions', `bfa-commissions-${Date.now()}.csv`, {
        propertyId: propertyFilter !== 'all' ? propertyFilter : undefined,
      });
      addToast('Commissions ledger CSV downloaded.', 'success');
    }
  };

  // Status Badge Helper
  const getAgentStatusBadge = (status) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge status="success">ACTIVE</Badge>;
      case 'SUSPENDED':
        return <Badge status="danger">SUSPENDED</Badge>;
      case 'INACTIVE':
        return <Badge status="secondary">INACTIVE</Badge>;
      default:
        return <Badge status="neutral">{status}</Badge>;
    }
  };

  const getCommissionStatusBadge = (status) => {
    switch (status) {
      case 'PAID':
        return <Badge status="success">PAID</Badge>;
      case 'APPROVED':
        return <Badge status="info">APPROVED</Badge>;
      case 'CALCULATED':
      case 'PENDING':
        return <Badge status="pending">PENDING</Badge>;
      case 'VOIDED':
      case 'CANCELLED':
        return <Badge status="danger">{status}</Badge>;
      default:
        return <Badge status="neutral">{status}</Badge>;
    }
  };

  // Filtered agents by search query
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents;
    const q = searchQuery.toLowerCase();
    return agents.filter(
      (a) =>
        a.name?.toLowerCase().includes(q) ||
        a.agency_name?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q) ||
        a.phone?.toLowerCase().includes(q)
    );
  }, [agents, searchQuery]);

  return (
    <div>
      {/* Header */}
      <div
        className="page-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>Agent & Partner Management</span>
            <Badge status="info">PHASE 9 OPERATIONAL</Badge>
          </h1>
          <p className="page-subtitle">
            Partner directory, client booking attribution, commission schedule calculations, and payout settlements.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={handleExportCSV}>
            📥 Export CSV
          </Button>
          <Button variant="outline" onClick={() => setIsCalculateModalOpen(true)}>
            ⚡ Calculate Commission
          </Button>
          <Button variant="primary" onClick={handleOpenAddAgent}>
            + Add New Agent
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Active Partners
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {summary.activeAgentsCount || agents.filter((a) => a.status === 'ACTIVE').length}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Verified booking agents
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Commissions Generated
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--brand-accent, #ca8a04)', marginTop: '0.25rem' }}>
            {formatNaira(summary.totalCommissionGenerated || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Across all property bookings
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Paid Out
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
            {formatNaira(summary.paidCommission || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Settled bank transfers
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
            Pending Settlements
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.25rem' }}>
            {formatNaira(summary.pendingCommission || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            Calculated & approved payouts
          </div>
        </Card>
      </div>

      {/* Tabs & Filter Bar */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          {/* Main Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              variant={activeTab === 'directory' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('directory')}
            >
              👥 Agents Directory ({filteredAgents.length})
            </Button>
            <Button
              variant={activeTab === 'commissions' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTab('commissions')}
            >
              💳 Commissions Ledger ({commissions.length})
            </Button>
          </div>

          {/* Scoped Controls */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {activeTab === 'directory' && (
              <input
                type="text"
                placeholder="Search name, agency, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  minWidth: '200px',
                }}
              />
            )}

            {/* Property Filter */}
            <select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            {activeTab === 'directory' ? (
              <select
                value={agentStatusFilter}
                onChange={(e) => setAgentStatusFilter(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            ) : (
              <select
                value={commissionStatusFilter}
                onChange={(e) => setCommissionStatusFilter(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="CALCULATED">Pending Approval</option>
                <option value="APPROVED">Approved (Awaiting Payout)</option>
                <option value="PAID">Paid</option>
                <option value="VOIDED">Voided</option>
              </select>
            )}
          </div>
        </div>
      </Card>

      {/* TAB 1: AGENTS DIRECTORY */}
      {activeTab === 'directory' && (
        <Card title="Authorized Agent Partners">
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading agent directory records...
            </div>
          ) : filteredAgents.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No agent partners found matching the current criteria.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Agent & Agency</th>
                  <th>Contact Info</th>
                  <th>Assigned Scope</th>
                  <th>Commission Schedule</th>
                  <th>Banking Settlement</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{agent.name}</div>
                      {agent.agency_name && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--accent-gold, #ca8a04)' }}>
                          🏢 {agent.agency_name}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>{agent.email}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{agent.phone}</div>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.5rem',
                          background: 'var(--bg-surface)',
                          borderRadius: '4px',
                          border: '1px solid var(--border-default)',
                        }}
                      >
                        {agent.property_name || 'All Properties'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {agent.commission_type === 'PERCENTAGE'
                          ? `${agent.commission_rate}% of Booking`
                          : formatNaira(agent.commission_rate)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Default Schedule
                      </div>
                    </td>
                    <td>
                      {agent.bank_name && agent.account_number ? (
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>{agent.bank_name}</div>
                          <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                            {agent.account_number}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Not configured</span>
                      )}
                    </td>
                    <td>{getAgentStatusBadge(agent.status)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <Button variant="secondary" size="small" onClick={() => handleOpenDetails(agent)}>
                          Details
                        </Button>
                        <Button variant="outline" size="small" onClick={() => handleOpenEditAgent(agent)}>
                          Edit
                        </Button>
                        <Button
                          variant={agent.status === 'ACTIVE' ? 'danger' : 'primary'}
                          size="small"
                          onClick={() => handlePromptStatusToggle(agent)}
                        >
                          {agent.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}

      {/* TAB 2: COMMISSIONS LEDGER */}
      {activeTab === 'commissions' && (
        <Card title="Authoritative Commissions Ledger">
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading commissions transactions...
            </div>
          ) : commissions.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No commission records found matching the active filter.
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Agent & Agency</th>
                  <th>Reservation</th>
                  <th>Booking Value</th>
                  <th>Rate Applied</th>
                  <th>Commission Payout</th>
                  <th>Status</th>
                  <th>Settlement Ref</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((comm) => (
                  <tr key={comm.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--brand-accent)' }}>
                      {comm.commission_code}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{comm.agent_name}</div>
                      {comm.agency_name && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{comm.agency_name}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{comm.reservation_code}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {comm.property_name || 'Property'} • {comm.guest_name || 'Guest'}
                      </div>
                    </td>
                    <td>{formatNaira(comm.booking_amount)}</td>
                    <td>
                      {comm.commission_type === 'PERCENTAGE'
                        ? `${comm.commission_rate}%`
                        : formatNaira(comm.commission_rate)}
                    </td>
                    <td style={{ fontWeight: 700, color: '#10b981' }}>
                      {formatNaira(comm.commission_amount)}
                    </td>
                    <td>{getCommissionStatusBadge(comm.status)}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {comm.status === 'PAID' ? (
                        <div>
                          <div style={{ fontWeight: 500 }}>{comm.payment_reference || 'Settled'}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {comm.paid_at ? new Date(comm.paid_at).toLocaleDateString() : ''}
                          </div>
                        </div>
                      ) : comm.status === 'VOIDED' ? (
                        <div style={{ color: '#ef4444', fontSize: '0.75rem' }}>
                          Reason: {comm.void_reason || 'N/A'}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        {(comm.status === 'CALCULATED' || comm.status === 'PENDING') && (
                          <>
                            <Button
                              variant="primary"
                              size="small"
                              onClick={() => handleApproveCommission(comm)}
                              disabled={actionLoading}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="small"
                              onClick={() => handleOpenVoid(comm)}
                              disabled={actionLoading}
                            >
                              Void
                            </Button>
                          </>
                        )}
                        {comm.status === 'APPROVED' && (
                          <>
                            <Button
                              variant="primary"
                              size="small"
                              onClick={() => handleOpenPayout(comm)}
                              disabled={actionLoading}
                            >
                              Disburse Payout
                            </Button>
                            <Button
                              variant="danger"
                              size="small"
                              onClick={() => handleOpenVoid(comm)}
                              disabled={actionLoading}
                            >
                              Void
                            </Button>
                          </>
                        )}
                        {comm.status === 'PAID' && (
                          <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                            ✓ Disbursed
                          </span>
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

      {/* MODAL: ADD / EDIT AGENT */}
      <Modal
        isOpen={isAgentModalOpen}
        onClose={() => setIsAgentModalOpen(false)}
        title={isEditMode ? `Edit Agent: ${selectedAgent?.name}` : 'Register New Agent Partner'}
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={() => setIsAgentModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveAgent} disabled={actionLoading}>
              {actionLoading ? 'Saving...' : isEditMode ? 'Update Agent' : 'Create Agent'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveAgent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Full Name *
              </label>
              <input
                type="text"
                required
                value={agentForm.name}
                onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                placeholder="e.g. Samuel Adekunle"
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Agency / Company Name
              </label>
              <input
                type="text"
                value={agentForm.agency_name}
                onChange={(e) => setAgentForm({ ...agentForm, agency_name: e.target.value })}
                placeholder="e.g. Prime Realty Group"
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Email Address *
              </label>
              <input
                type="email"
                required
                value={agentForm.email}
                onChange={(e) => setAgentForm({ ...agentForm, email: e.target.value })}
                placeholder="agent@example.com"
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Phone Number *
              </label>
              <input
                type="tel"
                required
                value={agentForm.phone}
                onChange={(e) => setAgentForm({ ...agentForm, phone: e.target.value })}
                placeholder="+234 800 000 0000"
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Assigned Property
              </label>
              <select
                value={agentForm.property_id}
                onChange={(e) => setAgentForm({ ...agentForm, property_id: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">All Properties (Global)</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Commission Type
              </label>
              <select
                value={agentForm.commission_type}
                onChange={(e) => setAgentForm({ ...agentForm, commission_type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (₦)</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {agentForm.commission_type === 'PERCENTAGE' ? 'Rate (%)' : 'Fixed Amount (₦)'} *
              </label>
              <input
                type="number"
                step="any"
                min="0"
                max={agentForm.commission_type === 'PERCENTAGE' ? '100' : undefined}
                required
                value={agentForm.commission_rate}
                onChange={(e) => setAgentForm({ ...agentForm, commission_rate: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {/* Banking Details Header */}
          <div
            style={{
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-card)',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '0.82rem',
              color: 'var(--accent-gold, #ca8a04)',
              marginTop: '0.5rem',
            }}
          >
            🏦 Banking & Payout Settlement Information
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Bank Name
              </label>
              <input
                type="text"
                value={agentForm.bank_name}
                onChange={(e) => setAgentForm({ ...agentForm, bank_name: e.target.value })}
                placeholder="e.g. Zenith Bank"
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Account Number
              </label>
              <input
                type="text"
                value={agentForm.account_number}
                onChange={(e) => setAgentForm({ ...agentForm, account_number: e.target.value })}
                placeholder="e.g. 1012345678"
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Account Name
              </label>
              <input
                type="text"
                value={agentForm.account_name}
                onChange={(e) => setAgentForm({ ...agentForm, account_name: e.target.value })}
                placeholder="e.g. Adekunle Samuel O."
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Operational Notes
            </label>
            <textarea
              rows="2"
              value={agentForm.notes}
              onChange={(e) => setAgentForm({ ...agentForm, notes: e.target.value })}
              placeholder="Contract notes, partner tier, agreement reference..."
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </form>
      </Modal>

      {/* MODAL: AGENT DETAILS & PERFORMANCE */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title={selectedAgent ? `Partner Profile: ${selectedAgent.name}` : 'Agent Details'}
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setIsDetailsModalOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        {selectedAgent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Overview cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>TOTAL BOOKINGS</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {selectedAgentPerformance?.totalBookings ?? 0}
                </div>
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>VOLUME BROUGHT</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {formatNaira(selectedAgentPerformance?.totalVolumeBrought || 0)}
                </div>
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>COMMISSION EARNED</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>
                  {formatNaira(selectedAgentPerformance?.totalCommissionGenerated || 0)}
                </div>
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>PENDING PAYOUT</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>
                  {formatNaira(selectedAgentPerformance?.pendingCommission || 0)}
                </div>
              </div>
            </div>

            {/* Profile & Banking Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div style={{ padding: '1rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  Contact & Schedule
                </h4>
                <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div><strong>Email:</strong> {selectedAgent.email}</div>
                  <div><strong>Phone:</strong> {selectedAgent.phone}</div>
                  <div><strong>Agency:</strong> {selectedAgent.agency_name || 'Independent'}</div>
                  <div><strong>Assigned Scope:</strong> {selectedAgent.property_name || 'All Properties'}</div>
                  <div>
                    <strong>Default Rate:</strong>{' '}
                    {selectedAgent.commission_type === 'PERCENTAGE'
                      ? `${selectedAgent.commission_rate}%`
                      : formatNaira(selectedAgent.commission_rate)}
                  </div>
                </div>
              </div>

              <div style={{ padding: '1rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  Settlement Bank Account
                </h4>
                <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div><strong>Bank:</strong> {selectedAgent.bank_name || 'Not specified'}</div>
                  <div><strong>Account Number:</strong> {selectedAgent.account_number || 'Not specified'}</div>
                  <div><strong>Account Name:</strong> {selectedAgent.account_name || 'Not specified'}</div>
                  <div><strong>Status:</strong> {getAgentStatusBadge(selectedAgent.status)}</div>
                </div>
              </div>
            </div>

            {/* Referred Clients & Bookings List */}
            <div>
              <h4 style={{ fontSize: '0.88rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                Referred Bookings & Clients ({selectedAgentClients.length})
              </h4>
              {selectedAgentClients.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No reservations registered under this agent yet.
                </div>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th>Reservation Code</th>
                      <th>Guest Name</th>
                      <th>Stay Dates</th>
                      <th>Total Value</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAgentClients.map((client) => (
                      <tr key={client.id || client.reservation_id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {client.reservation_code}
                        </td>
                        <td>{client.tenant_name || client.guest_name}</td>
                        <td style={{ fontSize: '0.8rem' }}>
                          {client.check_in_date} → {client.check_out_date}
                        </td>
                        <td style={{ fontWeight: 600 }}>{formatNaira(client.total_amount)}</td>
                        <td><Badge status={client.status}>{client.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: CALCULATE COMMISSION */}
      <Modal
        isOpen={isCalculateModalOpen}
        onClose={() => setIsCalculateModalOpen(false)}
        title="Calculate Agent Commission"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={() => setIsCalculateModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCalculateCommission} disabled={actionLoading}>
              {actionLoading ? 'Calculating...' : 'Calculate Commission'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCalculateCommission} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            Applies the agent's property-scoped commission rate against the reservation booking value.
          </p>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Reservation ID *
            </label>
            <input
              type="number"
              required
              value={calculateForm.reservationId}
              onChange={(e) => setCalculateForm({ ...calculateForm, reservationId: e.target.value })}
              placeholder="e.g. 1"
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Agent Partner *
            </label>
            <select
              required
              value={calculateForm.agentId}
              onChange={(e) => setCalculateForm({ ...calculateForm, agentId: e.target.value })}
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">Select Agent...</option>
              {agents
                .filter((a) => a.status === 'ACTIVE')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.agency_name || 'Independent'}) — {a.commission_rate}
                    {a.commission_type === 'PERCENTAGE' ? '%' : ' NGN'}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Calculation Notes
            </label>
            <textarea
              rows="2"
              value={calculateForm.notes}
              onChange={(e) => setCalculateForm({ ...calculateForm, notes: e.target.value })}
              placeholder="Optional notes or override reason..."
              style={{
                width: '100%',
                padding: '0.55rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-surface)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        </form>
      </Modal>

      {/* MODAL: RECORD PAYOUT SETTLEMENT */}
      <Modal
        isOpen={isPayoutModalOpen}
        onClose={() => setIsPayoutModalOpen(false)}
        title={selectedCommission ? `Disburse Payout: ${selectedCommission.commission_code}` : 'Record Commission Payout'}
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={() => setIsPayoutModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleRecordPayout} disabled={actionLoading}>
              {actionLoading ? 'Recording Payout...' : 'Confirm Payout Disbursement'}
            </Button>
          </div>
        }
      >
        {selectedCommission && (
          <form onSubmit={handleRecordPayout} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Payee Agent:</span>
                <strong style={{ fontSize: '0.85rem' }}>{selectedCommission.agent_name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Commission Amount:</span>
                <strong style={{ fontSize: '1.1rem', color: '#10b981' }}>
                  {formatNaira(selectedCommission.commission_amount)}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Reservation:</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                  {selectedCommission.reservation_code}
                </span>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Settlement Payment Method *
              </label>
              <select
                required
                value={payoutForm.payment_method}
                onChange={(e) => setPayoutForm({ ...payoutForm, payment_method: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CASH">Cash</option>
                <option value="ONLINE">Online Portal</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Bank Transaction Reference / Cheque No. *
              </label>
              <input
                type="text"
                required
                value={payoutForm.payment_reference}
                onChange={(e) => setPayoutForm({ ...payoutForm, payment_reference: e.target.value })}
                placeholder="e.g. NIP-TXN-984729184"
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Settlement Notes
              </label>
              <textarea
                rows="2"
                value={payoutForm.notes}
                onChange={(e) => setPayoutForm({ ...payoutForm, notes: e.target.value })}
                placeholder="Bank receipt details, approver note, etc."
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL: VOID COMMISSION */}
      <Modal
        isOpen={isVoidModalOpen}
        onClose={() => setIsVoidModalOpen(false)}
        title={selectedCommission ? `Void Commission: ${selectedCommission.commission_code}` : 'Void Commission'}
        size="sm"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <Button variant="secondary" onClick={() => setIsVoidModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleVoidCommission} disabled={actionLoading}>
              {actionLoading ? 'Voiding...' : 'Confirm Void'}
            </Button>
          </div>
        }
      >
        {selectedCommission && (
          <form onSubmit={handleVoidCommission} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.88rem', color: '#ef4444', margin: 0 }}>
              ⚠️ Voiding this commission of <strong>{formatNaira(selectedCommission.commission_amount)}</strong> will
              permanently cancel this payout authorization.
            </p>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Reason for Voiding *
              </label>
              <textarea
                required
                rows="3"
                value={voidForm.reason}
                onChange={(e) => setVoidForm({ ...voidForm, reason: e.target.value })}
                placeholder="Specify audit rationale (e.g. Booking refunded, incorrect agent attribution)..."
                style={{
                  width: '100%',
                  padding: '0.55rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </form>
        )}
      </Modal>

      {/* CONFIRMATION MODAL: TOGGLE STATUS */}
      <ConfirmationModal
        isOpen={isStatusConfirmOpen}
        onClose={() => setIsStatusConfirmOpen(false)}
        onConfirm={handleConfirmStatusToggle}
        title={`Change Status to ${statusToToggle}?`}
        message={`Are you sure you want to change agent '${selectedAgent?.name}' to ${statusToToggle}? ${
          statusToToggle === 'SUSPENDED'
            ? 'Suspended agents cannot be linked to new reservations.'
            : 'Active agents can receive bookings and commission disbursements.'
        }`}
        confirmText={`Set as ${statusToToggle}`}
        confirmVariant={statusToToggle === 'SUSPENDED' ? 'danger' : 'primary'}
        loading={actionLoading}
      />
    </div>
  );
}
