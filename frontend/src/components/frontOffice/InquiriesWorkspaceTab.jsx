import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Clock, Send, UserPlus, CheckCircle, AlertTriangle } from 'lucide-react';
import { contactService, userService } from '../../services/api';
import './InquiriesWorkspaceTab.css';

function formatCountdown(deadline) {
  if (!deadline) return '—';
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return 'OVERDUE';
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return hrs > 0 ? `${hrs}h ${rem}m left` : `${rem}m left`;
}

export default function InquiriesWorkspaceTab({ activePropertyId, user }) {
  const [inquiries, setInquiries] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignReason, setAssignReason] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contactService.listInquiries({
        propertyId: activePropertyId && activePropertyId !== 'all' ? activePropertyId : undefined,
      });
      setInquiries(res.data || []);
    } catch {
      setInquiries([]);
    } finally {
      setLoading(false);
    }
  }, [activePropertyId]);

  useEffect(() => {
    fetchInquiries();
    userService
      .getAll?.()
      .then((res) => setStaffList(res.data || []))
      .catch(() => setStaffList([]));
  }, [fetchInquiries]);

  const openDetail = async (inq) => {
    setSelected(inq);
    setStatusMsg('');
    try {
      const res = await contactService.getInquiryById(inq.id);
      setDetail(res.data);
    } catch (err) {
      setStatusMsg(err.message || 'Could not load inquiry details.');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selected) return;
    try {
      await contactService.addStaffMessage(selected.id, {
        messageBody: replyText,
        isInternal,
        isClientResponse: !isInternal,
      });
      setReplyText('');
      setStatusMsg(isInternal ? 'Internal note added.' : 'Response sent to client.');
      await openDetail(selected);
      await fetchInquiries();
    } catch (err) {
      setStatusMsg(err.message || 'Failed to send message.');
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!assignUserId || !selected) return;
    try {
      await contactService.assignInquiry(selected.id, {
        newAssigneeId: Number(assignUserId),
        reason: assignReason || 'Operational department assignment',
      });
      setAssignReason('');
      setStatusMsg('Inquiry assigned and dispatched to staff DM.');
      await openDetail(selected);
      await fetchInquiries();
    } catch (err) {
      setStatusMsg(err.message || 'Reassignment failed.');
    }
  };

  const handleClose = async () => {
    if (!selected) return;
    try {
      await contactService.closeInquiry(selected.id, { resolutionNote: 'Resolved via Front Office' });
      setStatusMsg('Inquiry closed.');
      await openDetail(selected);
      await fetchInquiries();
    } catch (err) {
      setStatusMsg(err.message || 'Close failed.');
    }
  };

  return (
    <div className="bfa-inq-workspace">
      <div className="bfa-inq-list-panel">
        <div className="bfa-inq-panel-head">
          <h3><MessageSquare size={16} /> Client Contact Desk Tickets</h3>
          <button type="button" className="bfa-inq-refresh" onClick={fetchInquiries}>Refresh</button>
        </div>

        {loading ? (
          <div className="bfa-inq-empty">Loading client inquiries...</div>
        ) : inquiries.length === 0 ? (
          <div className="bfa-inq-empty">No client inquiries in your scope.</div>
        ) : (
          <div className="bfa-inq-cards">
            {inquiries.map((inq) => {
              const countdown = formatCountdown(inq.response_sla_deadline_at);
              const isOverdue = countdown === 'OVERDUE' && !inq.first_response_at;
              return (
                <button
                  type="button"
                  key={inq.id}
                  className={`bfa-inq-card ${selected?.id === inq.id ? 'active' : ''}`}
                  onClick={() => openDetail(inq)}
                >
                  <div className="bfa-inq-card-top">
                    <span className="bfa-inq-ref">{inq.inquiry_reference}</span>
                    <span className={`bfa-inq-dept`}>{inq.inquiry_department}</span>
                  </div>
                  <div className="bfa-inq-client">{inq.client_name}</div>
                  <div className="bfa-inq-snippet">{String(inq.inquiry_message || '').slice(0, 80)}</div>
                  <div className="bfa-inq-card-foot">
                    <span className={`bfa-inq-status st-${(inq.status || '').toLowerCase()}`}>{inq.status}</span>
                    {!inq.first_response_at && (
                      <span className={`bfa-inq-sla ${isOverdue ? 'overdue' : ''}`}>
                        <Clock size={12} /> {countdown}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="bfa-inq-detail-panel">
        {!detail ? (
          <div className="bfa-inq-empty">Select a client inquiry to view conversation, SLA status, and assignment controls.</div>
        ) : (
          <>
            <div className="bfa-inq-detail-head">
              <div>
                <div className="bfa-inq-ref">{detail.inquiry.inquiry_reference} • {detail.inquiry.inquiry_department}</div>
                <h3>{detail.inquiry.client_name}</h3>
                <div className="bfa-inq-sub">
                  {detail.inquiry.client_email || 'No email'} • {detail.inquiry.client_phone || 'No phone'}
                  {detail.inquiry.booking_reference && ` • Booking #${detail.inquiry.booking_reference}`}
                </div>
              </div>
              {detail.inquiry.status !== 'CLOSED' && (
                <button type="button" className="bfa-inq-close-btn" onClick={handleClose}>
                  <CheckCircle size={14} /> Close Ticket
                </button>
              )}
            </div>

            {statusMsg && (
              <div className="bfa-inq-banner"><AlertTriangle size={14} /> {statusMsg}</div>
            )}

            <div className="bfa-inq-assign-bar">
              <form onSubmit={handleAssign} className="bfa-inq-assign-form">
                <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} required>
                  <option value="">Assign / Escalate to Staff...</option>
                  {staffList.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Reason / instruction"
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                />
                <button type="submit"><UserPlus size={14} /> Route to DM</button>
              </form>
            </div>

            <div className="bfa-inq-thread">
              <div className="bfa-inq-msg client">
                <div className="msg-meta">{detail.inquiry.client_name} (Original Inquiry)</div>
                <div className="msg-body">{detail.inquiry.inquiry_message}</div>
              </div>
              {(detail.messages || []).map((m) => (
                <div key={m.id} className={`bfa-inq-msg ${m.sender_type === 'CLIENT' ? 'client' : m.is_internal ? 'internal' : 'staff'}`}>
                  <div className="msg-meta">
                    {m.sender_display_name || m.sender_type} {m.is_internal ? '[INTERNAL NOTE]' : ''}
                  </div>
                  <div className="msg-body">{m.message_body}</div>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="bfa-inq-composer">
              <label className="bfa-inq-internal-toggle">
                <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                <span>Internal Staff Note (hidden from client, does not satisfy SLA)</span>
              </label>
              <div className="bfa-inq-compose-row">
                <textarea
                  rows={2}
                  placeholder={isInternal ? 'Write private internal note...' : 'Write response visible to client...'}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <button type="submit"><Send size={15} /> Send</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
