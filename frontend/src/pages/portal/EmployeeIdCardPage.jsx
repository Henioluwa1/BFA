import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { useToast } from '../../context/ToastContext';
import { employeeService } from '../../services/api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal, { ConfirmationModal } from '../../components/ui/Modal';
import {
  CreditCard,
  QrCode,
  Download,
  RefreshCw,
  Slash,
  Search,
  CheckCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Building,
  UserCheck,
  Calendar,
  XCircle,
  ExternalLink,
  User,
  Award,
  Filter
} from '../../components/ui/Icons';

export default function EmployeeIdCardPage() {
  const { id: routeEmpId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentProperty } = useProperty();
  const { addToast } = useToast();

  const [employees, setEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState(routeEmpId ? parseInt(routeEmpId, 10) : null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [cardData, setCardData] = useState(null);
  const [cardHistory, setCardHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [badgeSide, setBadgeSide] = useState('BOTH'); // 'BOTH' | 'FRONT' | 'BACK'

  // Modals
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [isReissueModalOpen, setIsReissueModalOpen] = useState(false);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);

  // Form states
  const [validityMonths, setValidityMonths] = useState(12);
  const [reissueReason, setReissueReason] = useState('Badge upgrade / renewal');
  const [revokeReason, setRevokeReason] = useState('');

  // Security Verification Tool
  const [verifyTokenInput, setVerifyTokenInput] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  // Check RBAC permissions
  const canGenerate =
    ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'].includes((user?.role || '').toUpperCase()) ||
    user?.capabilities?.includes('EMPLOYEE_ID_CARD_GENERATE');
  const canRevoke =
    ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'].includes((user?.role || '').toUpperCase()) ||
    user?.capabilities?.includes('EMPLOYEE_ID_CARD_REVOKE');

  // Load staff directory
  const loadEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (currentProperty?.id) {
        params.property_id = currentProperty.id;
      }
      const res = await employeeService.getAll(params);
      const list = res.data?.employees || res.data?.data || res.data || [];
      setEmployees(list);

      // Select initial employee if none selected
      if (list.length > 0) {
        if (routeEmpId) {
          const match = list.find((e) => e.id === parseInt(routeEmpId, 10));
          if (match) setSelectedEmpId(match.id);
          else setSelectedEmpId(list[0].id);
        } else if (!selectedEmpId) {
          setSelectedEmpId(list[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load employee directory:', err);
      addToast('Unable to load employee directory. Please check network connectivity.', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentProperty, routeEmpId]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  // Load selected employee details, active card, and card history
  const loadCardDetails = useCallback(async (empId) => {
    if (!empId) return;
    setCardLoading(true);
    try {
      const [empRes, cardRes, historyRes] = await Promise.all([
        employeeService.getById(empId).catch(() => null),
        employeeService.getEmployeeIdCard(empId).catch(() => null),
        employeeService.getIdCards({ employeeId: empId, limit: 50 }).catch(() => null),
      ]);

      if (empRes?.data?.data || empRes?.data) {
        setSelectedEmployee(empRes.data.data || empRes.data);
      }

      // Active or current card
      const c = cardRes?.data?.current_card || cardRes?.data?.card || cardRes?.data || null;
      setCardData(c);

      // Historical cards
      const history = historyRes?.data?.cards || historyRes?.data?.data || historyRes?.data || [];
      setCardHistory(Array.isArray(history) ? history : []);
    } catch (err) {
      console.error('Failed to fetch card details for employee:', err);
    } finally {
      setCardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedEmpId) {
      loadCardDetails(selectedEmpId);
    }
  }, [selectedEmpId, loadCardDetails]);

  // Handle Generate ID Card
  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!selectedEmpId) return;
    setActionLoading(true);
    try {
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + parseInt(validityMonths, 10));
      const expiresAt = expiry.toISOString().slice(0, 10);

      await employeeService.generateIdCard(selectedEmpId, { expires_at: expiresAt });
      addToast('Official staff ID badge generated successfully.', 'success');
      setIsGenerateModalOpen(false);
      await loadCardDetails(selectedEmpId);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to generate ID card.';
      addToast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reissue ID Card
  const handleReissue = async (e) => {
    e.preventDefault();
    if (!selectedEmpId) return;
    setActionLoading(true);
    try {
      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + parseInt(validityMonths, 10));
      const expiresAt = expiry.toISOString().slice(0, 10);

      await employeeService.reissueIdCard(selectedEmpId, {
        expires_at: expiresAt,
        reason: reissueReason,
      });
      addToast('Staff ID badge reissued successfully. Previous badge has been retired.', 'success');
      setIsReissueModalOpen(false);
      await loadCardDetails(selectedEmpId);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to reissue ID card.';
      addToast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Revoke ID Card
  const handleRevoke = async () => {
    if (!selectedEmpId || !cardData?.id) return;
    if (!revokeReason.trim()) {
      addToast('Revocation reason is mandatory for compliance auditing.', 'warning');
      return;
    }
    setActionLoading(true);
    try {
      await employeeService.revokeIdCard(selectedEmpId, cardData.id, {
        revocation_reason: revokeReason.trim(),
      });
      addToast('ID Card revoked immediately. Security verification will flag this badge as invalid.', 'success');
      setIsRevokeModalOpen(false);
      setRevokeReason('');
      await loadCardDetails(selectedEmpId);
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to revoke ID card.';
      addToast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle PDF Download
  const handleDownloadPdf = async () => {
    if (!selectedEmpId) return;
    setActionLoading(true);
    try {
      const res = await employeeService.downloadIdCardPdf(selectedEmpId);
      const blob = res instanceof Blob ? res : new Blob([res.data || res], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `BFA_STAFF_BADGE_${selectedEmployee?.staff_code || selectedEmpId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('ID Card PDF badge downloaded successfully.', 'success');
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Failed to generate printable PDF badge.';
      addToast(msg, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Public QR Token Verification Test
  const handleTestVerify = async (e) => {
    e.preventDefault();
    if (!verifyTokenInput.trim()) return;
    setVerifyLoading(true);
    setVerifyResult(null);
    setVerifyError(null);
    try {
      const res = await employeeService.verifyIdCardToken(verifyTokenInput.trim());
      setVerifyResult(res.data?.data || res.data);
    } catch (err) {
      setVerifyError(err.response?.data?.error?.message || 'Token verification query failed.');
    } finally {
      setVerifyLoading(false);
    }
  };

  // Filter staff list
  const filteredEmployees = employees.filter((emp) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (emp.full_name || `${emp.first_name} ${emp.last_name}`).toLowerCase().includes(q) ||
      (emp.staff_code || emp.employee_code || '').toLowerCase().includes(q) ||
      (emp.department || '').toLowerCase().includes(q) ||
      (emp.job_title || '').toLowerCase().includes(q);

    return matchesSearch;
  });

  const cardStatus = cardData?.status || 'UNISSUED';
  const isCardActive = cardStatus === 'ACTIVE';

  // Public QR verification URL for this badge
  const qrVerificationUrl = cardData?.verification_token
    ? `${window.location.origin}/api/v1/employees/verify-id-card/${cardData.verification_token}`
    : 'https://bfa-apartments.com/verify-credentials';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <CreditCard size={26} color="var(--brand-accent)" />
            Employee ID Card & Badge Studio
          </h1>
          <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Generate, inspect, and manage official staff identification credentials with instant QR verification.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button
            variant="secondary"
            onClick={() => {
              setIsVerifyModalOpen(true);
              setVerifyTokenInput(cardData?.verification_token || '');
              setVerifyResult(null);
              setVerifyError(null);
            }}
            icon={<QrCode size={16} />}
          >
            Security QR Verifier
          </Button>

          <Button
            variant="outline"
            onClick={() => selectedEmpId && loadCardDetails(selectedEmpId)}
            icon={<RefreshCw size={15} />}
            disabled={cardLoading}
          >
            Refresh Badge
          </Button>
        </div>
      </div>

      {/* 2. Main Studio Grid */}
      <div className="badge-studio-grid">
        {/* Left Column: Staff Switcher & Comprehensive Profile Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Employee Quick Selector Card */}
          <Card title="Staff Directory Selection">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={15}
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                />
                <input
                  type="text"
                  placeholder="Filter by staff name, code, or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '2.1rem', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label className="form-label">Active Staff Member</label>
                <select
                  value={selectedEmpId || ''}
                  onChange={(e) => setSelectedEmpId(parseInt(e.target.value, 10))}
                  className="form-select"
                  disabled={loading}
                >
                  {filteredEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name || `${emp.first_name} ${emp.last_name}`} ({emp.staff_code || emp.employee_code}) - {emp.job_title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {/* Group 1: Identity & Profile */}
          <div className="info-group-card">
            <div className="info-group-title">
              <User size={15} /> Staff Identity
            </div>
            <div className="info-row">
              <span className="info-label">Full Name</span>
              <span className="info-value">{selectedEmployee?.full_name || `${selectedEmployee?.first_name || ''} ${selectedEmployee?.last_name || ''}`}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Staff Code</span>
              <span className="info-value" style={{ fontFamily: 'monospace', color: 'var(--brand-accent)' }}>
                {selectedEmployee?.staff_code || selectedEmployee?.employee_code || '—'}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Email Address</span>
              <span className="info-value" style={{ fontSize: '0.8rem' }}>{selectedEmployee?.email || '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Contact Phone</span>
              <span className="info-value">{selectedEmployee?.phone || '—'}</span>
            </div>
          </div>

          {/* Group 2: Employment Profile */}
          <div className="info-group-card">
            <div className="info-group-title">
              <Building size={15} /> Employment Scope
            </div>
            <div className="info-row">
              <span className="info-label">Position / Role</span>
              <span className="info-value">{selectedEmployee?.job_title || 'Staff'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Department</span>
              <span className="info-value">{selectedEmployee?.department?.replace('_', ' ') || 'Operations'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Assigned Property</span>
              <span className="info-value">{selectedEmployee?.property_name || 'All Properties (Global)'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Employment Status</span>
              <span className="info-value">
                <Badge status={selectedEmployee?.employment_status || 'ACTIVE'}>
                  {selectedEmployee?.employment_status || 'ACTIVE'}
                </Badge>
              </span>
            </div>
          </div>

          {/* Group 3: Badge Status & Metadata */}
          <div className="info-group-card">
            <div className="info-group-title">
              <Award size={15} /> Credential Records
            </div>
            <div className="info-row">
              <span className="info-label">Badge Status</span>
              <span className="info-value">
                <Badge status={cardStatus.toLowerCase()}>
                  {cardStatus}
                </Badge>
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Card Serial #</span>
              <span className="info-value" style={{ fontFamily: 'monospace' }}>
                {cardData?.card_number || 'Unissued'}
              </span>
            </div>
            <div className="info-row">
              <span className="info-label">Date Issued</span>
              <span className="info-value">{cardData?.issued_at ? cardData.issued_at.slice(0, 10) : '—'}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Expiration Date</span>
              <span className="info-value" style={{ color: cardData?.expires_at ? '#047857' : 'inherit' }}>
                {cardData?.expires_at ? cardData.expires_at.slice(0, 10) : '—'}
              </span>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <Card title="Badge Studio Operations">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {isCardActive ? (
                <>
                  <Button
                    variant="primary"
                    onClick={handleDownloadPdf}
                    icon={<Download size={16} />}
                    loading={actionLoading}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Download Printable PDF Badge
                  </Button>

                  {canGenerate && (
                    <Button
                      variant="secondary"
                      onClick={() => setIsReissueModalOpen(true)}
                      icon={<RefreshCw size={15} />}
                      disabled={actionLoading}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      Reissue New Card
                    </Button>
                  )}

                  {canRevoke && (
                    <Button
                      variant="danger"
                      onClick={() => setIsRevokeModalOpen(true)}
                      icon={<Slash size={15} />}
                      disabled={actionLoading}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      Revoke Active Card
                    </Button>
                  )}
                </>
              ) : (
                canGenerate && (
                  <Button
                    variant="primary"
                    onClick={() => setIsGenerateModalOpen(true)}
                    icon={<CreditCard size={16} />}
                    loading={actionLoading}
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Generate Official ID Card
                  </Button>
                )
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Physical Staff Card Preview Stage */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="badge-stage">
            {/* View Mode Switcher */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '680px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Live Credential Studio Preview
                </span>
                <Badge status={cardStatus.toLowerCase()}>
                  {isCardActive ? '● ACTIVE CREDENTIAL' : cardStatus === 'REVOKED' ? '● REVOKED' : cardStatus === 'EXPIRED' ? '● EXPIRED' : '○ NOT ISSUED'}
                </Badge>
              </div>

              <div style={{ display: 'inline-flex', background: '#e2e8f0', borderRadius: '8px', padding: '3px' }}>
                <button
                  type="button"
                  onClick={() => setBadgeSide('BOTH')}
                  className={`btn-sm ${badgeSide === 'BOTH' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ borderRadius: '6px', border: 'none', padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                >
                  Front & Back
                </button>
                <button
                  type="button"
                  onClick={() => setBadgeSide('FRONT')}
                  className={`btn-sm ${badgeSide === 'FRONT' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ borderRadius: '6px', border: 'none', padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                >
                  Front
                </button>
                <button
                  type="button"
                  onClick={() => setBadgeSide('BACK')}
                  className={`btn-sm ${badgeSide === 'BACK' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ borderRadius: '6px', border: 'none', padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                >
                  Back
                </button>
              </div>
            </div>

            {/* Badge Deck Presentation */}
            <div className="badge-card-deck">
              {/* === FRONT FACE === */}
              {(badgeSide === 'BOTH' || badgeSide === 'FRONT') && (
                <div className="badge-card badge-face-front">
                  {/* Lanyard Slot Cutout */}
                  <div className="badge-lanyard-slot" title="Lanyard Strap Clip Point" />

                  {/* Header Bar */}
                  <div className="badge-front-header">
                    <h2 className="badge-front-title">BFA APARTMENTS</h2>
                    <div className="badge-front-sub">Official Staff Identification</div>
                  </div>
                  <div className="badge-gold-trim" />

                  {/* Employee Photograph */}
                  <div className="badge-photo-wrapper">
                    <div className="badge-photo-frame">
                      {selectedEmployee?.photo_url ? (
                        <img
                          src={`/api/v1/employees/${selectedEmployee.id}/photo`}
                          alt={selectedEmployee.full_name}
                          className="badge-photo-img"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="badge-photo-placeholder">
                          {selectedEmployee?.first_name?.[0] || 'B'}
                          {selectedEmployee?.last_name?.[0] || 'A'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Staff Credentials */}
                  <div className="badge-front-details">
                    <div className="badge-staff-name">
                      {selectedEmployee?.full_name || `${selectedEmployee?.first_name || 'Staff'} ${selectedEmployee?.last_name || 'Member'}`}
                    </div>
                    <div className="badge-staff-role">{selectedEmployee?.job_title || 'Operations Specialist'}</div>
                    <div className="badge-dept-tag">
                      {selectedEmployee?.department?.replace('_', ' ') || 'Operations'}
                    </div>
                  </div>

                  {/* Holographic micro-security banner */}
                  <div className="badge-front-meta">
                    <div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>
                        Staff Code
                      </span>
                      <strong style={{ fontFamily: 'monospace', color: '#1e3a8a' }}>
                        {selectedEmployee?.staff_code || selectedEmployee?.employee_code || 'BFA-EMP-000'}
                      </strong>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>
                        Property Scope
                      </span>
                      <strong style={{ color: '#0f172a' }}>
                        {selectedEmployee?.property_name ? selectedEmployee.property_name.slice(0, 16) : 'BFA Global'}
                      </strong>
                    </div>
                  </div>

                  {/* Footer Seal */}
                  <div className="badge-front-footer">
                    AUTHORIZED PERSONNEL ONLY • BFA HOSPITALITY GROUP
                  </div>
                </div>
              )}

              {/* === BACK FACE === */}
              {(badgeSide === 'BOTH' || badgeSide === 'BACK') && (
                <div className="badge-card badge-face-back">
                  {/* Lanyard Slot Cutout */}
                  <div className="badge-lanyard-slot" title="Lanyard Strap Clip Point" />

                  {/* Back Header */}
                  <div style={{ padding: '8px 14px', background: '#0f172a', color: '#ffffff', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em' }}>SECURITY & VERIFICATION</div>
                  </div>
                  <div className="badge-gold-trim" />

                  {/* Back Content */}
                  <div className="badge-back-content">
                    {/* QR Code Container */}
                    <div className="badge-qr-container">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(qrVerificationUrl)}`}
                        alt="Security QR Verification Token"
                        style={{ width: '124px', height: '124px', objectFit: 'contain' }}
                        onError={(e) => {
                          // Fallback to inline SVG QR pattern
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>

                    <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#1e3a8a', fontWeight: 700 }}>
                      SERIAL: {cardData?.card_number || 'BFA-IDC-SAMPLE-000'}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', marginTop: '8px', fontSize: '0.68rem', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>ISSUED:</span>
                        <strong>{cardData?.issued_at ? cardData.issued_at.slice(0, 10) : '—'}</strong>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ color: '#64748b', display: 'block' }}>EXPIRES:</span>
                        <strong style={{ color: '#047857' }}>{cardData?.expires_at ? cardData.expires_at.slice(0, 10) : '—'}</strong>
                      </div>
                    </div>

                    {/* Disclaimer Text */}
                    <p className="badge-back-disclaimer">
                      This badge is the non-transferable property of BFA Apartments. It must be surrendered upon termination of employment or request of property security. Found badges must be returned to Property Management.
                    </p>

                    {/* Signature Line */}
                    <div className="badge-back-sig-line">
                      AUTHORIZED EXECUTIVE SIGNATURE
                    </div>
                  </div>

                  {/* Footer Seal */}
                  <div style={{ background: '#0f172a', color: '#94a3b8', fontSize: '0.65rem', padding: '5px', textAlign: 'center', fontWeight: 700 }}>
                    WWW.BFA-APARTMENTS.COM • +234 1 800-BFA-STAY
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Card History & Audit Ledger */}
          <Card title="ID Card Issuance History & Lifecycle Ledger">
            {cardHistory.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <CreditCard size={32} style={{ opacity: 0.35, margin: '0 auto 0.5rem auto' }} />
                <p style={{ margin: 0, fontSize: '0.88rem' }}>No historical ID badge records recorded for this staff member.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Card Serial Number</th>
                      <th>Status</th>
                      <th>Issued Date</th>
                      <th>Expiration</th>
                      <th>Revocation / Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardHistory.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {c.card_number}
                        </td>
                        <td>
                          <Badge status={c.status.toLowerCase()}>{c.status}</Badge>
                        </td>
                        <td>{c.issued_at ? c.issued_at.slice(0, 10) : '—'}</td>
                        <td>{c.expires_at ? c.expires_at.slice(0, 10) : '—'}</td>
                        <td style={{ fontSize: '0.8rem', color: c.revocation_reason ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                          {c.revocation_reason || 'Official issue'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* MODAL 1: GENERATE ID CARD */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title={`Generate Staff ID Card: ${selectedEmployee?.full_name}`}
        subtitle="Provision official badge with cryptographic signature and QR verification"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
            <Button variant="secondary" onClick={() => setIsGenerateModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleGenerate} loading={actionLoading} icon={<CreditCard size={15} />}>
              Confirm & Generate Badge
            </Button>
          </div>
        }
      >
        <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="modal-section" style={{ paddingTop: 0 }}>
            <div className="modal-section-title">Badge Lifecycle Configuration</div>
            <p className="modal-section-desc">
              Generating this card issues an authoritative card serial, associates it with {selectedEmployee?.full_name}, and activates its QR authentication token.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Badge Validity Duration</label>
            <select
              value={validityMonths}
              onChange={(e) => setValidityMonths(e.target.value)}
              className="form-select"
            >
              <option value={6}>6 Months (Probationary / Intern)</option>
              <option value={12}>1 Year (Standard Staff Issuance)</option>
              <option value={24}>2 Years (Senior Management Credential)</option>
              <option value={36}>3 Years (Long-term Executive Tenure)</option>
            </select>
          </div>

          <div style={{ padding: '0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', fontSize: '0.84rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>Staff Verification Confirmation:</div>
            <div style={{ color: 'var(--text-secondary)' }}>Employee ID: <strong>{selectedEmployee?.staff_code || selectedEmployee?.employee_code}</strong></div>
            <div style={{ color: 'var(--text-secondary)' }}>Department: <strong>{selectedEmployee?.department?.replace('_', ' ')}</strong></div>
            <div style={{ color: 'var(--text-secondary)' }}>Property: <strong>{selectedEmployee?.property_name || 'All Properties (Global)'}</strong></div>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: REISSUE ID CARD */}
      <Modal
        isOpen={isReissueModalOpen}
        onClose={() => setIsReissueModalOpen(false)}
        title={`Reissue Staff ID Card: ${selectedEmployee?.full_name}`}
        subtitle="Retire current badge and generate a fresh replacement"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%' }}>
            <Button variant="secondary" onClick={() => setIsReissueModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleReissue} loading={actionLoading} icon={<RefreshCw size={15} />}>
              Confirm Reissuance
            </Button>
          </div>
        }
      >
        <form onSubmit={handleReissue} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ padding: '0.85rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 'var(--radius-md)', color: '#1e40af', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <RefreshCw size={18} style={{ flexShrink: 0 }} />
            <span>
              Reissuing this credential will automatically transition current card <strong>{cardData?.card_number}</strong> to <strong>REISSUED</strong>, immediately retiring it while retaining full audit lineage.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Reason for Reissuance *</label>
            <input
              type="text"
              required
              value={reissueReason}
              onChange={(e) => setReissueReason(e.target.value)}
              placeholder="e.g. Lost physical badge, role promotion, annual renewal..."
              className="form-control"
            />
          </div>

          <div className="form-group">
            <label className="form-label">New Badge Validity Period</label>
            <select
              value={validityMonths}
              onChange={(e) => setValidityMonths(e.target.value)}
              className="form-select"
            >
              <option value={6}>6 Months</option>
              <option value={12}>1 Year (Standard)</option>
              <option value={24}>2 Years</option>
              <option value={36}>3 Years</option>
            </select>
          </div>
        </form>
      </Modal>

      {/* MODAL 3: REVOKE ID CARD CONFIRMATION */}
      <ConfirmationModal
        isOpen={isRevokeModalOpen}
        onClose={() => setIsRevokeModalOpen(false)}
        onConfirm={handleRevoke}
        title="Revoke Official Staff ID Card"
        subtitle={`Invalidate serial #${cardData?.card_number}`}
        message="Are you sure you want to revoke this staff badge? The cryptographic QR verification token will immediately report this card as REVOKED across all security access checkpoints."
        confirmText="Confirm & Revoke Card"
        confirmVariant="danger"
        loading={actionLoading}
        details={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label className="form-label">
                Mandatory Revocation Reason <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                rows={2}
                required
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="State the audit justification (e.g. Employee resignation, disciplinary action, lost card)..."
                className="form-textarea"
                style={{ width: '100%' }}
              />
            </div>
          </div>
        }
      />

      {/* MODAL 4: SECURITY QR TOKEN VERIFICATION TEST TOOL */}
      <Modal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        title="Public Security QR Token Verification Hub"
        subtitle="Audit public-facing verification response to confirm zero PII leakage"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <Button variant="secondary" onClick={() => setIsVerifyModalOpen(false)}>
              Close Hub
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Paste a 48-character verification token or scan an official badge to inspect the backend verification output. In compliance with security standards, sensitive PII (home address, personal phone, emergency contacts, or salary) is completely omitted.
          </p>

          <form onSubmit={handleTestVerify} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              required
              placeholder="Paste 48-character cryptographic token..."
              value={verifyTokenInput}
              onChange={(e) => setVerifyTokenInput(e.target.value)}
              className="form-control"
              style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}
            />
            <Button type="submit" variant="primary" loading={verifyLoading} icon={<ShieldCheck size={16} />}>
              Verify
            </Button>
          </form>

          {verifyError && (
            <div style={{ padding: '0.85rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 'var(--radius-md)', color: '#9f1239', fontSize: '0.84rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{verifyError}</span>
            </div>
          )}

          {verifyResult && (
            <div
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${verifyResult.badge_valid ? '#a7f3d0' : '#fecdd3'}`,
                background: verifyResult.badge_valid ? '#ecfdf5' : '#fff1f2',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {verifyResult.badge_valid ? (
                  <CheckCircle size={20} color="#059669" />
                ) : (
                  <XCircle size={20} color="#dc2626" />
                )}
                <span style={{ fontWeight: 800, fontSize: '0.95rem', color: verifyResult.badge_valid ? '#065f46' : '#9f1239' }}>
                  {verifyResult.message || (verifyResult.badge_valid ? 'Valid Official Staff Credential' : 'Invalid Badge')}
                </span>
              </div>

              {verifyResult.badge && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', fontSize: '0.82rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Staff Name</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{verifyResult.badge.employee_name}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Staff Code</span>
                    <strong style={{ fontFamily: 'monospace', color: 'var(--brand-accent)' }}>{verifyResult.badge.staff_code}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Job Title</span>
                    <span style={{ fontWeight: 600 }}>{verifyResult.badge.job_title}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Department</span>
                    <span style={{ fontWeight: 600 }}>{verifyResult.badge.department}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Property Scope</span>
                    <span>{verifyResult.badge.property_name || 'BFA Global'}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Badge Status</span>
                    <Badge status={verifyResult.badge.card_status.toLowerCase()}>{verifyResult.badge.card_status}</Badge>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
