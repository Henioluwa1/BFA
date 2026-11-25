import React, { useState } from 'react';
import { KeyRound, Send, Star, CheckCircle2, AlertCircle, Paperclip } from 'lucide-react';
import { contactService } from '../../services/api';
import './ClientInquiryPortal.css';

export default function ClientInquiryPortal({ initialReference = '' }) {
  const [inquiryReference, setInquiryReference] = useState(initialReference);
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [sessionToken, setSessionToken] = useState('');
  const [inquiry, setInquiry] = useState(null);
  const [messages, setMessages] = useState([]);

  const [followUpText, setFollowUpText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [attData, setAttData] = useState(null);

  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState('');
  const [markedResolved, setMarkedResolved] = useState(true);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const handleLookup = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await contactService.lookupByAccessCode({ inquiryReference, accessCode });
      setSessionToken(res.data.token);
      setInquiry(res.data.inquiry);
      setMessages(res.data.messages || []);
    } catch (err) {
      setError(err.message || 'Invalid inquiry reference or access code.');
    } finally {
      setLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!sessionToken) return;
    try {
      const res = await contactService.getClientInquiryDetail(sessionToken);
      setInquiry(res.data.inquiry);
      setMessages(res.data.messages || []);
    } catch {
      // session expired
    }
  };

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Attachment exceeds 10 MB limit.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttData({
        attachmentBase64: ev.target.result,
        attachmentFilename: file.name,
        attachmentMime: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSendFollowUp = async (e) => {
    e.preventDefault();
    if (!followUpText.trim() || !sessionToken) return;
    setSendingMsg(true);
    setError('');
    try {
      await contactService.addClientMessage(sessionToken, {
        messageBody: followUpText,
        ...(attData || {}),
      });
      setFollowUpText('');
      setAttData(null);
      await refreshDetail();
    } catch (err) {
      setError(err.message || 'Unable to send follow-up.');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleFeedback = async (e) => {
    e.preventDefault();
    if (!sessionToken) return;
    try {
      await contactService.submitClientFeedback(sessionToken, {
        rating,
        feedbackText,
        markedResolved,
      });
      setFeedbackSent(true);
      await refreshDetail();
    } catch (err) {
      setError(err.message || 'Unable to submit feedback.');
    }
  };

  return (
    <section className="bfa-client-portal-section" id="inquiry-tracker">
      <div className="bfa-client-portal-card">
        <div className="bfa-client-portal-head">
          <span className="bfa-panel-tag">Client Response Desk</span>
          <h2>Track Your Inquiry & Follow Up</h2>
          <p>Enter your Inquiry Reference and private Access Code to read staff responses, send follow-ups, or leave feedback.</p>
        </div>

        {error && (
          <div className="bfa-cp-alert error" role="alert">
            <AlertCircle size={16} /> <span>{error}</span>
          </div>
        )}

        {!inquiry ? (
          <form onSubmit={handleLookup} className="bfa-cp-lookup-form">
            <div className="bfa-cp-input-wrap">
              <label>Inquiry Reference</label>
              <input
                type="text"
                placeholder="e.g. BFA-INQ-202611-0001"
                value={inquiryReference}
                onChange={(e) => setInquiryReference(e.target.value)}
                required
              />
            </div>
            <div className="bfa-cp-input-wrap">
              <label>Private Access Code</label>
              <input
                type="text"
                placeholder="12-character access code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="bfa-cp-btn" disabled={loading}>
              <KeyRound size={15} /> {loading ? 'Verifying...' : 'Open Inquiry Thread'}
            </button>
          </form>
        ) : (
          <div className="bfa-cp-thread-wrap">
            <div className="bfa-cp-summary">
              <div>
                <strong>{inquiry.inquiryReference}</strong>
                <span>{inquiry.inquiryDepartment} • Status: <b>{inquiry.status}</b></span>
              </div>
              <button
                type="button"
                className="bfa-cp-logout"
                onClick={() => {
                  setInquiry(null);
                  setSessionToken('');
                  setMessages([]);
                }}
              >
                Close Session
              </button>
            </div>

            <div className="bfa-cp-messages">
              <div className="bfa-cp-msg client">
                <small>{inquiry.clientName} (Original Inquiry)</small>
                <p>{inquiry.inquiryMessage}</p>
              </div>
              {messages.map((m) => (
                <div key={m.id} className={`bfa-cp-msg ${m.sender_type === 'CLIENT' ? 'client' : 'staff'}`}>
                  <small>{m.sender_type === 'CLIENT' ? inquiry.clientName : 'BFA Concierge Team'}</small>
                  <p>{m.message_body}</p>
                  {m.attachment_filename && <span className="bfa-cp-att">📎 {m.attachment_filename}</span>}
                </div>
              ))}
            </div>

            <form onSubmit={handleSendFollowUp} className="bfa-cp-composer">
              <textarea
                rows={2}
                placeholder="Write a follow-up question or update..."
                value={followUpText}
                onChange={(e) => setFollowUpText(e.target.value)}
                required
              />
              <div className="bfa-cp-compose-actions">
                <label className="bfa-cp-file-btn">
                  <Paperclip size={14} /> {attData ? attData.attachmentFilename : 'Attach File'}
                  <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.mp4,.webm" onChange={handleFilePick} />
                </label>
                <button type="submit" className="bfa-cp-btn" disabled={sendingMsg}>
                  <Send size={14} /> {sendingMsg ? 'Sending...' : 'Send Follow-Up'}
                </button>
              </div>
            </form>

            {!feedbackSent && !inquiry.clientFeedbackRating ? (
              <form onSubmit={handleFeedback} className="bfa-cp-feedback">
                <h4><Star size={14} /> Rate Our Service</h4>
                <div className="bfa-cp-feedback-row">
                  <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                    <option value={5}>5 — Excellent</option>
                    <option value={4}>4 — Good</option>
                    <option value={3}>3 — Satisfactory</option>
                    <option value={2}>2 — Needs Improvement</option>
                    <option value={1}>1 — Poor</option>
                  </select>
                  <label className="bfa-cp-resolved">
                    <input type="checkbox" checked={markedResolved} onChange={(e) => setMarkedResolved(e.target.checked)} />
                    <span>Issue resolved</span>
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="Optional feedback comment..."
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                />
                <button type="submit" className="bfa-cp-btn-outline">Submit Feedback</button>
              </form>
            ) : (
              <div className="bfa-cp-alert success">
                <CheckCircle2 size={15} /> Thank you for your feedback ({inquiry.clientFeedbackRating || rating}/5).
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
