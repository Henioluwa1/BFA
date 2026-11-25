import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  User,
  Calendar,
  FileText,
  UploadCloud,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Eye,
  PlusCircle,
} from 'lucide-react';
import { frontOfficeService } from '../../services/api';
import { formatNaira } from '../../utils/currency';
import './BookingDetailsModal.css';

export default function BookingDetailsModal({
  isOpen,
  onClose,
  booking,
  onCheckInCompleted,
}) {
  const [readiness, setReadiness] = useState(null);
  const [docTypes, setDocTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [recordingPay, setRecordingPay] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // Check-In Session Form
  const [sessionForm, setSessionForm] = useState({
    documentTypeCode: 'NATIONAL_ID',
    documentIdNumber: '',
    documentIssuingCountry: 'Nigeria',
    documentExpiryDate: '',
    actualOccupantCount: 1,
    occupantNamesText: '',
    vehicleRegistration: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    clientAcknowledged: false,
    checkinNotes: '',
    specialRequirements: '',
  });

  // Payment Ref Form
  const [payForm, setPayForm] = useState({
    amount: '',
    paymentRail: 'BANK_TRANSFER',
    transactionReference: '',
    payerName: '',
    payerBankName: '',
    notes: '',
  });

  const loadAll = useCallback(async () => {
    if (!isOpen || !booking?.id) return;
    setLoading(true);
    setFeedbackMsg(null);
    try {
      const [readyRes, typesRes] = await Promise.all([
        frontOfficeService.getReadiness(booking.id),
        frontOfficeService.getDocumentTypes(),
      ]);
      const data = readyRes.data;
      setReadiness(data);
      setDocTypes(typesRes.data || []);

      if (data?.session) {
        const s = data.session;
        let occText = '';
        try {
          const parsed = typeof s.occupant_names === 'string' ? JSON.parse(s.occupant_names) : s.occupant_names;
          if (Array.isArray(parsed)) occText = parsed.join(', ');
        } catch {
          occText = '';
        }
        setSessionForm({
          documentTypeCode: s.document_type_code || 'NATIONAL_ID',
          documentIdNumber: s.document_id_number || '',
          documentIssuingCountry: s.document_issuing_country || 'Nigeria',
          documentExpiryDate: s.document_expiry_date ? String(s.document_expiry_date).split('T')[0] : '',
          actualOccupantCount: s.actual_occupant_count || data.reservation?.guests_count || 1,
          occupantNamesText: occText,
          vehicleRegistration: s.vehicle_registration || '',
          emergencyContactName: s.emergency_contact_name || data.reservation?.emergency_contact_name || '',
          emergencyContactPhone: s.emergency_contact_phone || data.reservation?.emergency_contact_phone || '',
          clientAcknowledged: Boolean(s.client_acknowledged),
          checkinNotes: s.checkin_notes || '',
          specialRequirements: s.special_requirements || '',
        });
      } else if (data?.reservation) {
        setSessionForm((prev) => ({
          ...prev,
          actualOccupantCount: data.reservation.guests_count || 1,
          emergencyContactName: data.reservation.emergency_contact_name || '',
          emergencyContactPhone: data.reservation.emergency_contact_phone || '',
        }));
      }
      if (data?.reservation) {
        setPayForm((prev) => ({
          ...prev,
          amount: prev.amount || String(data.reservation.outstanding_balance || data.reservation.total_amount || ''),
          payerName: prev.payerName || data.reservation.tenant_name || '',
        }));
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to load booking details.' });
    } finally {
      setLoading(false);
    }
  }, [isOpen, booking?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSaveSession = async (e) => {
    e.preventDefault();
    setSavingSession(true);
    setFeedbackMsg(null);
    try {
      const occupantNames = sessionForm.occupantNamesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await frontOfficeService.upsertCheckinSession(booking.id, {
        ...sessionForm,
        occupantNames,
      });
      setFeedbackMsg({ type: 'success', text: 'Check-in identity & occupancy details saved.' });
      await loadAll();
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Unable to save check-in details.' });
    } finally {
      setSavingSession(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setFeedbackMsg({ type: 'error', text: 'Document exceeds 10 MB limit.' });
      return;
    }
    setUploadingDoc(true);
    setFeedbackMsg(null);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          await frontOfficeService.uploadDocument(booking.id, {
            documentTypeCode: sessionForm.documentTypeCode || 'NATIONAL_ID',
            fileBase64: ev.target.result,
            originalFilename: file.name,
            mimeType: file.type,
          });
          setFeedbackMsg({ type: 'success', text: `Document "${file.name}" uploaded to private storage.` });
          await loadAll();
        } catch (err) {
          setFeedbackMsg({ type: 'error', text: err.message || 'Document upload failed.' });
        } finally {
          setUploadingDoc(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setUploadingDoc(false);
      setFeedbackMsg({ type: 'error', text: err.message || 'Upload error.' });
    }
  };

  const handleRecordPaymentRef = async (e) => {
    e.preventDefault();
    setRecordingPay(true);
    setFeedbackMsg(null);
    try {
      const res = await frontOfficeService.recordPaymentRef(booking.id, payForm);
      if (res.data?.isDuplicate) {
        setFeedbackMsg({ type: 'error', text: res.data.message || 'Duplicate transaction reference detected.' });
      } else {
        setFeedbackMsg({
          type: 'success',
          text: 'Transaction reference recorded as Pending Verification (awaiting finance/authorized confirmation).',
        });
        setPayForm((p) => ({ ...p, transactionReference: '', notes: '' }));
        await loadAll();
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to record payment reference.' });
    } finally {
      setRecordingPay(false);
    }
  };

  const handleCompleteCheckIn = async () => {
    setCheckingIn(true);
    setFeedbackMsg(null);
    try {
      await frontOfficeService.checkIn(booking.id);
      setFeedbackMsg({ type: 'success', text: 'Guest checked in successfully!' });
      if (onCheckInCompleted) onCheckInCompleted();
      onClose();
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Check-in blocked by readiness checks.' });
    } finally {
      setCheckingIn(false);
    }
  };

  if (!isOpen || !booking) return null;

  const r = readiness?.reservation || booking;
  const docs = readiness?.documents || [];
  const paymentRefs = readiness?.paymentRefs || [];
  const gates = readiness?.gates || [];
  const readyForCheckIn = Boolean(readiness?.readyForCheckIn);

  return (
    <div
      className="bfa-bdm-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bfa-bdm-shell">
        <div className="bfa-bdm-header">
          <div>
            <span className="bfa-bdm-eyebrow">Full Booking & Check-In Dossier</span>
            <h2 className="bfa-bdm-title">
              {r.tenant_name} — #{r.reservation_code}
            </h2>
          </div>
          <button type="button" className="bfa-bdm-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="bfa-bdm-body">
          {feedbackMsg && (
            <div className={`bfa-bdm-alert ${feedbackMsg.type}`} role="alert">
              {feedbackMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>{feedbackMsg.text}</span>
            </div>
          )}

          {loading ? (
            <div className="bfa-bdm-loading">Loading dossier, documents, and readiness gates...</div>
          ) : (
            <div className="bfa-bdm-grid">
              {/* A. Booking Information */}
              <section className="bfa-bdm-card">
                <h3 className="bfa-bdm-card-title"><Calendar size={15} /> A. Booking Information</h3>
                <div className="bfa-bdm-kv-grid">
                  <div><span>Booking #</span><strong>{r.reservation_code}</strong></div>
                  <div><span>Booked On</span><strong>{r.created_at ? new Date(r.created_at).toLocaleString('en-GB', { timeZone: 'Africa/Lagos' }) + ' WAT' : '—'}</strong></div>
                  <div><span>Property</span><strong>{r.property_name || '—'}</strong></div>
                  <div><span>Apartment</span><strong>{r.unit_name} (#{r.unit_number})</strong></div>
                  <div><span>Check-In</span><strong>{r.check_in_date} (14:00 WAT)</strong></div>
                  <div><span>Check-Out</span><strong>{r.check_out_date} (12:00 WAT)</strong></div>
                  <div><span>Nights / Guests</span><strong>{r.nights || 1} Night • {r.guests_count || 1} Guest(s)</strong></div>
                  <div><span>Status</span><strong>{r.status}</strong></div>
                  <div><span>Assigned Staff</span><strong>{r.assigned_staff_name || 'Unassigned'}</strong></div>
                  <div><span>Source</span><strong>{r.source || 'ONLINE'}</strong></div>
                </div>
                {r.special_requests && (
                  <div className="bfa-bdm-note">Special Requests: {r.special_requests}</div>
                )}
              </section>

              {/* B. Client Information */}
              <section className="bfa-bdm-card">
                <h3 className="bfa-bdm-card-title"><User size={15} /> B. Client Information</h3>
                <div className="bfa-bdm-kv-grid">
                  <div><span>Full Legal Name</span><strong>{r.tenant_name}</strong></div>
                  <div><span>Phone</span><strong>{r.tenant_phone || 'Not provided'}</strong></div>
                  <div><span>Email</span><strong>{r.tenant_email || 'Not provided'}</strong></div>
                  <div><span>Emergency Contact</span><strong>{r.emergency_contact_name || 'Pending check-in collection'}</strong></div>
                </div>
              </section>

              {/* C. Additional Check-In Information */}
              <section className="bfa-bdm-card bdm-span-2">
                <h3 className="bfa-bdm-card-title"><FileText size={15} /> C. Additional Check-In Information</h3>
                <form onSubmit={handleSaveSession} className="bfa-bdm-form">
                  <div className="bfa-bdm-form-grid">
                    <label>
                      <span>ID Document Type *</span>
                      <select
                        value={sessionForm.documentTypeCode}
                        onChange={(e) => setSessionForm({ ...sessionForm, documentTypeCode: e.target.value })}
                      >
                        {docTypes.length > 0 ? docTypes.map((dt) => (
                          <option key={dt.type_code} value={dt.type_code}>{dt.display_name}</option>
                        )) : (
                          <>
                            <option value="NATIONAL_ID">National Identification Card</option>
                            <option value="INTERNATIONAL_PASSPORT">International Passport</option>
                            <option value="DRIVERS_LICENSE">Driver's Licence</option>
                            <option value="GOVERNMENT_ID">Other Government-Issued ID</option>
                          </>
                        )}
                      </select>
                    </label>
                    <label>
                      <span>ID Document Number *</span>
                      <input
                        type="text"
                        value={sessionForm.documentIdNumber}
                        onChange={(e) => setSessionForm({ ...sessionForm, documentIdNumber: e.target.value })}
                        placeholder="e.g. A12345678"
                        required
                      />
                    </label>
                    <label>
                      <span>Issuing Country</span>
                      <input
                        type="text"
                        value={sessionForm.documentIssuingCountry}
                        onChange={(e) => setSessionForm({ ...sessionForm, documentIssuingCountry: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Expiry Date (if applicable)</span>
                      <input
                        type="date"
                        value={sessionForm.documentExpiryDate}
                        onChange={(e) => setSessionForm({ ...sessionForm, documentExpiryDate: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Occupants Arriving</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={sessionForm.actualOccupantCount}
                        onChange={(e) => setSessionForm({ ...sessionForm, actualOccupantCount: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Additional Occupant Names</span>
                      <input
                        type="text"
                        value={sessionForm.occupantNamesText}
                        onChange={(e) => setSessionForm({ ...sessionForm, occupantNamesText: e.target.value })}
                        placeholder="Comma-separated names"
                      />
                    </label>
                    <label>
                      <span>Vehicle Registration</span>
                      <input
                        type="text"
                        value={sessionForm.vehicleRegistration}
                        onChange={(e) => setSessionForm({ ...sessionForm, vehicleRegistration: e.target.value })}
                        placeholder="Optional plate number"
                      />
                    </label>
                    <label>
                      <span>Emergency Contact Name</span>
                      <input
                        type="text"
                        value={sessionForm.emergencyContactName}
                        onChange={(e) => setSessionForm({ ...sessionForm, emergencyContactName: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>Emergency Contact Phone</span>
                      <input
                        type="tel"
                        value={sessionForm.emergencyContactPhone}
                        onChange={(e) => setSessionForm({ ...sessionForm, emergencyContactPhone: e.target.value })}
                      />
                    </label>
                  </div>

                  <label className="bfa-bdm-checkbox">
                    <input
                      type="checkbox"
                      checked={sessionForm.clientAcknowledged}
                      onChange={(e) => setSessionForm({ ...sessionForm, clientAcknowledged: e.target.checked })}
                    />
                    <span>Client confirmed identity & signed BFA Check-In Terms acknowledgment</span>
                  </label>

                  <div className="bfa-bdm-form-actions">
                    <button type="submit" className="bfa-bdm-btn-primary" disabled={savingSession}>
                      {savingSession ? 'Saving...' : 'Save Check-In Details'}
                    </button>
                  </div>
                </form>
              </section>

              {/* D. Document Upload Interface */}
              <section className="bfa-bdm-card">
                <h3 className="bfa-bdm-card-title"><UploadCloud size={15} /> D. Private Document Upload</h3>
                <label className="bfa-bdm-upload-zone">
                  <UploadCloud size={22} />
                  <span>{uploadingDoc ? 'Uploading to Private Storage...' : `Upload ${sessionForm.documentTypeCode} (PDF, JPG, PNG ≤ 10MB)`}</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileUpload} disabled={uploadingDoc} />
                </label>

                <div className="bfa-bdm-doc-list">
                  {docs.length === 0 ? (
                    <div className="bfa-bdm-empty">No identification documents uploaded yet.</div>
                  ) : docs.map((d) => (
                    <div key={d.id} className="bfa-bdm-doc-row">
                      <div>
                        <strong>{d.original_filename}</strong>
                        <span>{d.document_type_code} • {d.upload_status} • By {d.uploaded_by_name || 'Staff'}</span>
                      </div>
                      <a
                        href={frontOfficeService.getDocumentFileUrl(d.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bfa-bdm-doc-preview"
                      >
                        <Eye size={14} /> Preview
                      </a>
                    </div>
                  ))}
                </div>
              </section>

              {/* E. Payment Verification & Transaction Reference */}
              <section className="bfa-bdm-card">
                <h3 className="bfa-bdm-card-title"><CreditCard size={15} /> E. Payment Verification & Reference</h3>
                <div className="bfa-bdm-kv-grid">
                  <div><span>Expected Total</span><strong>{formatNaira(r.total_amount)}</strong></div>
                  <div><span>Recorded Paid</span><strong>{formatNaira(r.paid_amount || 0)}</strong></div>
                  <div><span>Outstanding</span><strong>{formatNaira(r.outstanding_balance || 0)}</strong></div>
                  <div><span>Status</span><strong>{r.payment_status || 'UNPAID'}</strong></div>
                </div>

                {r.payment_proof_path && (
                  <div className="bfa-bdm-proof-link">
                    <a
                      href={frontOfficeService.getPaymentProofUrl(r.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Eye size={14} /> View Online Transfer Proof (Does not auto-verify)
                    </a>
                  </div>
                )}

                <form onSubmit={handleRecordPaymentRef} className="bfa-bdm-pay-form">
                  <div className="bfa-bdm-pay-title"><PlusCircle size={14} /> Record Check-In Payment Reference</div>
                  <div className="bfa-bdm-form-grid">
                    <input
                      type="text"
                      placeholder="Unique Transaction Reference *"
                      value={payForm.transactionReference}
                      onChange={(e) => setPayForm({ ...payForm, transactionReference: e.target.value })}
                      required
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Amount (NGN) *"
                      value={payForm.amount}
                      onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                      required
                    />
                    <select
                      value={payForm.paymentRail}
                      onChange={(e) => setPayForm({ ...payForm, paymentRail: e.target.value })}
                    >
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="POS">POS Terminal</option>
                      <option value="USSD">USSD</option>
                      <option value="CASH">Cash (Concierge)</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Payer Name"
                      value={payForm.payerName}
                      onChange={(e) => setPayForm({ ...payForm, payerName: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="bfa-bdm-btn-secondary" disabled={recordingPay}>
                    {recordingPay ? 'Recording...' : 'Record Reference (Pending Verification)'}
                  </button>
                </form>

                {paymentRefs.length > 0 && (
                  <div className="bfa-bdm-doc-list" style={{ marginTop: '0.6rem' }}>
                    {paymentRefs.map((pr) => (
                      <div key={pr.id} className="bfa-bdm-doc-row">
                        <div>
                          <strong>Ref: {pr.transaction_reference}</strong>
                          <span>{pr.payment_rail} • {formatNaira(pr.amount)} • {pr.verification_status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* F. Check-In Readiness Checklist & Completion */}
              <section className="bfa-bdm-card bdm-span-2">
                <h3 className="bfa-bdm-card-title"><ShieldCheck size={15} /> F. Check-In Readiness Checklist</h3>
                <div className="bfa-bdm-gates">
                  {gates.map((g) => (
                    <div key={g.key} className={`bfa-bdm-gate ${g.passed ? 'passed' : 'blocked'}`}>
                      <span>{g.passed ? '✓' : '✕'}</span>
                      <div>
                        <strong>{g.label}</strong>
                        <small>{g.detail}</small>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bfa-bdm-complete-bar">
                  <button
                    type="button"
                    className="bfa-bdm-complete-btn"
                    disabled={!readyForCheckIn || checkingIn}
                    onClick={handleCompleteCheckIn}
                  >
                    {checkingIn ? 'Completing Check-In...' : readyForCheckIn ? 'Complete Check-In' : 'Resolve Outstanding Requirements Above'}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
