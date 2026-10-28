import React, { useState } from 'react';
import Icons8Icon from './Icons8Icon';
import './FloatingChatWidget.css';

export default function FloatingChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [senderName, setSenderName] = useState('');
  const [senderContact, setSenderContact] = useState('');
  const [department, setDepartment] = useState('RESERVATIONS');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState(null);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!senderName.trim() || !senderContact.trim() || !message.trim()) {
      alert('Please provide your name, contact information, and message.');
      return;
    }
    setSending(true);

    // Simulate contact desk transmission
    setTimeout(() => {
      const ticketId = `BFA-CNT-${Math.floor(100000 + Math.random() * 900000)}`;
      setSubmittedTicket({
        id: ticketId,
        name: senderName,
        department,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });
      setSending(false);
      setMessage('');
    }, 900);
  };

  const handleReset = () => {
    setSubmittedTicket(null);
  };

  return (
    <div className="bfa-floating-chat-root" aria-label="BFA Contact & Resident Desk">
      {/* Expanded Chat Drawer / Flyout */}
      {isOpen && (
        <div className="bfa-chat-window animate-scale-up" role="dialog" aria-modal="true">
          {/* Header */}
          <div className="bfa-chat-header">
            <div className="bfa-chat-header-title">
              <div className="bfa-chat-avatar">
                <span>✦</span>
              </div>
              <div>
                <h4 className="bfa-chat-heading">BFA Contact Desk</h4>
                <div className="bfa-chat-status">
                  <span className="bfa-status-dot pulse" />
                  <span>Online • Immediate response</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="bfa-chat-close-btn"
              onClick={() => setIsOpen(false)}
              aria-label="Close contact chat"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="bfa-chat-body">
            {submittedTicket ? (
              <div className="bfa-chat-success-state">
                <div className="bfa-success-icon-badge">✓</div>
                <h5 className="bfa-success-title">Message Received!</h5>
                <p className="bfa-success-text">
                  Thank you, <strong>{submittedTicket.name}</strong>. Your direct transmission has been assigned reference:
                </p>
                <div className="bfa-ticket-pill">
                  <span>REF: {submittedTicket.id}</span>
                </div>
                <p className="bfa-success-note">
                  Our front-desk team on duty will contact you via {senderContact} shortly.
                </p>

                <div className="bfa-chat-actions-row">
                  <a
                    href={`https://wa.me/2348000000000?text=Hello%20BFA%20Contact%20Desk%2C%20referencing%20ticket%20${submittedTicket.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bfa-wa-quick-btn"
                  >
                    💬 WhatsApp Instant Chat
                  </a>
                  <button type="button" className="bfa-chat-new-msg-btn" onClick={handleReset}>
                    Send Another Message
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bfa-chat-welcome-banner">
                  <span className="bfa-welcome-tag">Instant Direct Message</span>
                  <p className="bfa-welcome-sub">
                    Send our reservations & property team an authentic message directly from the page.
                  </p>
                </div>

                <form onSubmit={handleSendMessage} className="bfa-chat-form">
                  <div className="bfa-form-group-compact">
                    <label>Your Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Adebayo Adeleke"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="bfa-form-group-compact">
                    <label>Email or WhatsApp Number</label>
                    <input
                      type="text"
                      placeholder="e.g. adebayo@example.com / +234..."
                      value={senderContact}
                      onChange={(e) => setSenderContact(e.target.value)}
                      required
                    />
                  </div>

                  <div className="bfa-form-group-compact">
                    <label>Inquiry Department</label>
                    <select value={department} onChange={(e) => setDepartment(e.target.value)}>
                      <option value="RESERVATIONS">Suite Reservations & Availability</option>
                      <option value="VIEWING">Schedule Residence Walkthrough</option>
                      <option value="LONG_LEASE">Corporate & Long-term Lease</option>
                      <option value="VIP_SERVICES">VIP Chauffeur & Custom Services</option>
                      <option value="GENERAL">General Guest Questions</option>
                    </select>
                  </div>

                  <div className="bfa-form-group-compact">
                    <label>Your Message</label>
                    <textarea
                      rows={3}
                      placeholder="How can our contact desk assist your stay today?"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="bfa-chat-submit-btn" disabled={sending}>
                    {sending ? (
                      <span className="bfa-chat-spinner-wrap">
                        <span className="bfa-chat-spinner" />
                        Transmitting...
                      </span>
                    ) : (
                      'Send Direct Message →'
                    )}
                  </button>
                </form>

                {/* Quick Channels Footer */}
                <div className="bfa-chat-footer-channels">
                  <span className="bfa-channels-label">Or reach out instantly via:</span>
                  <div className="bfa-channels-grid">
                    <a
                      href="https://wa.me/2348000000000?text=Hello%20BFA%20Apartments%2C%20I%20have%20an%20inquiry"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bfa-channel-pill wa"
                      title="Direct WhatsApp"
                    >
                      <span>💬 WhatsApp</span>
                    </a>
                    <a href="tel:+23412345678" className="bfa-channel-pill phone" title="Call Front Desk">
                      <span>📞 Direct Call</span>
                    </a>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Static Floating Button Trigger (Always visible at bottom right) */}
      <button
        type="button"
        className={`bfa-floating-chat-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={isOpen ? 'Minimize Contact Desk' : 'Open Contact Desk & Direct Message'}
        aria-label="Direct Contact Desk Message"
      >
        <span className="bfa-trigger-icon">
          {isOpen ? (
            <Icons8Icon name="close" variant="white" size={14} alt="Close" />
          ) : (
            <Icons8Icon name="chat" variant="white" size={18} alt="Contact" />
          )}
        </span>
        <span className="bfa-trigger-label">Contact Desk</span>
        <span className="bfa-trigger-dot" aria-hidden="true" />
      </button>
    </div>
  );
}

