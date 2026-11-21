import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  AlertTriangle,
  FileText,
  Clock,
  Layers,
  Building2,
  Users,
  User,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';

/**
 * In-Chat Operation Initiation Modal
 * Exclusively designed with Pure Dark Glass / Black Glass and White Typography.
 * Enforces strict enterprise hierarchy:
 * - Owner -> Admin, Manager
 * - Admin -> Manager
 * - Manager -> Staff, Receptionist (scoped to property)
 * - Staff / Receptionist -> Task performers only (cannot initiate)
 */
export default function InChatOperationModal({
  isOpen,
  onClose,
  currentUser,
  activeThread,
  onOperationCreated,
}) {
  const { addToast } = useToast();

  const [loadingEligibleUsers, setLoadingEligibleUsers] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [scope, setScope] = useState('PERSONAL'); // 'PERSONAL' (DM) | 'TEAM' (Property/Group Channel)
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState(currentUser?.propertyId || '');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('PROPERTY_OPERATIONS');
  const [priority, setPriority] = useState('NORMAL');
  const [subject, setSubject] = useState('');
  const [purpose, setPurpose] = useState('');
  const [operationalInstructions, setOperationalInstructions] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [responsibilityDefinition, setResponsibilityDefinition] = useState('');
  const [reportingRequirements, setReportingRequirements] = useState('');
  const [deadlineAt, setDeadlineAt] = useState('');

  // Fetch eligible users based on hierarchy
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function fetchFormDependencies() {
      setLoadingEligibleUsers(true);
      try {
        // Fetch users
        const usersRes = await api.get('/chat/contacts');
        const usersList = usersRes.data || (Array.isArray(usersRes) ? usersRes : []);

        // Filter users strictly according to hierarchy
        const userRole = (currentUser?.role || '').toUpperCase();
        let filtered = [];

        if (userRole === 'OWNER') {
          // Owner initiates for Admin and Manager
          filtered = usersList.filter((u) =>
            ['ADMIN', 'MANAGER', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'].includes((u.role || '').toUpperCase()) &&
            Number(u.id) !== Number(currentUser?.id)
          );
        } else if (['ADMIN', 'SUPER_ADMIN'].includes(userRole)) {
          // Admin initiates for Managers
          filtered = usersList.filter((u) =>
            ['MANAGER', 'OPERATIONS_MANAGER'].includes((u.role || '').toUpperCase()) &&
            Number(u.id) !== Number(currentUser?.id)
          );
        } else if (['MANAGER', 'OPERATIONS_MANAGER'].includes(userRole)) {
          // Manager initiates for Staff and Receptionist
          filtered = usersList.filter((u) =>
            ['STAFF', 'RECEPTIONIST'].includes((u.role || '').toUpperCase()) &&
            Number(u.id) !== Number(currentUser?.id)
          );
        }

        if (isMounted) {
          setEligibleUsers(filtered);
          // If active thread is a direct message with an eligible user, pre-select them!
          if (activeThread?.thread_type === 'DIRECT' && activeThread?.otherUserId) {
            const match = filtered.find((u) => Number(u.id) === Number(activeThread.otherUserId));
            if (match) {
              setSelectedUserId(match.id);
              setScope('PERSONAL');
            }
          } else if (filtered.length > 0 && !selectedUserId) {
            setSelectedUserId(filtered[0].id);
          }
        }

        // Fetch properties
        try {
          const propRes = await api.get('/properties');
          const propList = propRes.data || (Array.isArray(propRes) ? propRes : []);
          if (isMounted) {
            setProperties(Array.isArray(propList) ? propList : []);
            if (!selectedPropertyId && propList.length > 0) {
              setSelectedPropertyId(propList[0].id);
            }
          }
        } catch (_) {}
      } catch (err) {
        console.error('[IN_CHAT_OPS] Error loading dependencies:', err);
      } finally {
        if (isMounted) setLoadingEligibleUsers(false);
      }
    }

    fetchFormDependencies();
    return () => {
      isMounted = false;
    };
  }, [isOpen, currentUser, activeThread]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !subject.trim() || !purpose.trim() || !operationalInstructions.trim()) {
      addToast('Please provide Title, Subject, Purpose, and Operational Instructions.', 'warning');
      return;
    }

    if (scope === 'PERSONAL' && !selectedUserId) {
      addToast('Please select a target recipient user for this personal operation.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        subject: subject.trim(),
        category,
        priority,
        property_id: selectedPropertyId ? parseInt(selectedPropertyId, 10) : null,
        target_audience_type: scope === 'PERSONAL' ? 'SPECIFIC_USER' : 'PROPERTY_ALL',
        recipient_user_ids: scope === 'PERSONAL' && selectedUserId ? [parseInt(selectedUserId, 10)] : [],
        purpose: purpose.trim(),
        operational_instructions: operationalInstructions.trim(),
        expected_outcome: expectedOutcome.trim() || null,
        responsibility_definition: responsibilityDefinition.trim() || null,
        reporting_requirements: reportingRequirements.trim() || null,
        deadline_at: deadlineAt ? new Date(deadlineAt).toISOString() : null,
      };

      const res = await api.post('/workforce/operations', payload);
      const newOp = res.data || res;
      addToast(`Operation ${newOp.operation_code || ''} issued and dispatched to chat!`, 'success');
      onOperationCreated?.(newOp);
      onClose();
    } catch (err) {
      console.error('[IN_CHAT_OPS] Initiation failed:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to initiate operation.';
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1050,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'modalFadeIn 180ms ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          background: 'rgba(10, 10, 14, 0.94)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1.5px solid rgba(255, 255, 255, 0.18)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.95), 0 0 35px rgba(59, 130, 246, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: '#ffffff',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(255, 255, 255, 0.04)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.2)',
                border: '1px solid rgba(59, 130, 246, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa',
              }}
            >
              <FileText size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                Initiate Central Operation & Memo
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'rgba(255, 255, 255, 0.70)' }}>
                Official directive recorded, converted to an Operations Memo, and routed via chat.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* Routing Scope Selection */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '8px' }}>
              Routing Scope
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setScope('PERSONAL')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: scope === 'PERSONAL' ? 'rgba(59, 130, 246, 0.22)' : 'rgba(255, 255, 255, 0.04)',
                  border: scope === 'PERSONAL' ? '1.5px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <User size={18} style={{ color: scope === 'PERSONAL' ? '#60a5fa' : 'rgba(255, 255, 255, 0.6)' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Personal Operation</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.65)' }}>
                    Routes directly to target recipient's 1-on-1 private chat (DM).
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setScope('TEAM')}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: scope === 'TEAM' ? 'rgba(59, 130, 246, 0.22)' : 'rgba(255, 255, 255, 0.04)',
                  border: scope === 'TEAM' ? '1.5px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <Users size={18} style={{ color: scope === 'TEAM' ? '#60a5fa' : 'rgba(255, 255, 255, 0.6)' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Shared Channel Operation</div>
                  <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.65)' }}>
                    Routes to the designated shared property team channel.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Recipient Dropdown (When Personal) */}
          {scope === 'PERSONAL' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                Target Recipient <span style={{ color: '#f87171' }}>*</span> (Filtered by Hierarchy)
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              >
                <option value="" disabled style={{ background: '#0a0a0e', color: '#fff' }}>
                  {loadingEligibleUsers ? 'Loading authorized users...' : '-- Select Authorized Recipient --'}
                </option>
                {eligibleUsers.map((u) => (
                  <option key={u.id} value={u.id} style={{ background: '#0a0a0e', color: '#fff' }}>
                    {u.name} — {u.role} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Property Scope */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
              Property Operational Scope
            </label>
            <select
              value={selectedPropertyId}
              onChange={(e) => setSelectedPropertyId(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            >
              <option value="" style={{ background: '#0a0a0e', color: '#fff' }}>Corporate / Multi-Property Scope</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id} style={{ background: '#0a0a0e', color: '#fff' }}>
                  {p.name} {p.code ? `(${p.code})` : ''} - {p.city || 'Property'}
                </option>
              ))}
            </select>
          </div>

          {/* Title & Category Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                Operation Title <span style={{ color: '#f87171' }}>*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. VIP Penthouse Readiness & HVAC Overhaul"
                required
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              >
                <option value="PROPERTY_OPERATIONS" style={{ background: '#0a0a0e', color: '#fff' }}>Property Operations</option>
                <option value="DIRECTIVE" style={{ background: '#0a0a0e', color: '#fff' }}>Directive</option>
                <option value="COMPLIANCE_MANDATE" style={{ background: '#0a0a0e', color: '#fff' }}>Compliance Mandate</option>
                <option value="EMERGENCY_PROTOCOL" style={{ background: '#0a0a0e', color: '#fff' }}>Emergency Protocol</option>
                <option value="MAINTENANCE_ESCALATION" style={{ background: '#0a0a0e', color: '#fff' }}>Maintenance Escalation</option>
                <option value="GUEST_RELATIONS" style={{ background: '#0a0a0e', color: '#fff' }}>Guest Relations</option>
              </select>
            </div>
          </div>

          {/* Priority & Deadline Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                Priority Level
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              >
                <option value="NORMAL" style={{ background: '#0a0a0e', color: '#fff' }}>📋 NORMAL (Routine Standard Ops)</option>
                <option value="IMPORTANT" style={{ background: '#0a0a0e', color: '#fbbf24' }}>⚠️ IMPORTANT (Elevated Attention)</option>
                <option value="URGENT" style={{ background: '#0a0a0e', color: '#f87171' }}>⚡ URGENT (Immediate Action Required)</option>
                <option value="CRITICAL" style={{ background: '#0a0a0e', color: '#ef4444' }}>🚨 CRITICAL (Emergency / Mandatory)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                Execution Deadline
              </label>
              <input
                type="datetime-local"
                value={deadlineAt}
                onChange={(e) => setDeadlineAt(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Subject */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
              Memorandum Subject <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Immediate Deep-Clean & Mechanical Certification of Unit 402"
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Purpose & Rationale */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
              Executive Purpose & Context <span style={{ color: '#f87171' }}>*</span>
            </label>
            <textarea
              rows={3}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Explain the background and operational justification for this directive..."
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Operational Instructions */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
              Operational Instructions & Tasks <span style={{ color: '#f87171' }}>*</span>
            </label>
            <textarea
              rows={4}
              value={operationalInstructions}
              onChange={(e) => setOperationalInstructions(e.target.value)}
              placeholder="Detail sequential action items, technical steps, and mandatory checks..."
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Expected Outcome */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
              Expected Outcome & Key Deliverables
            </label>
            <textarea
              rows={2}
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
              placeholder="What defines 100% successful completion of this directive?"
              style={{
                width: '100%',
                padding: '9px 12px',
                background: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Accountability Matrix */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                Accountability Definition
              </label>
              <textarea
                rows={2}
                value={responsibilityDefinition}
                onChange={(e) => setResponsibilityDefinition(e.target.value)}
                placeholder="Specific individuals / teams held accountable for execution..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                Reporting & Verification Procedures
              </label>
              <textarea
                rows={2}
                value={reportingRequirements}
                onChange={(e) => setReportingRequirements(e.target.value)}
                placeholder="How and when progress and final sign-off must be reported..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  background: 'rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '9px 22px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                border: '1px solid #3b82f6',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
              }}
            >
              <Send size={15} />
              {submitting ? 'Generating & Dispatching Memo...' : 'Issue Directive & Send to Chat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
