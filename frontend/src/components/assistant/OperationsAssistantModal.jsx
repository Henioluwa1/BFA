import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { automationService } from '../../services/api';
import Modal from '../ui/Modal';
import ConfirmationCard from './ConfirmationCard';
import AssistantResponseRenderer from './AssistantResponseRenderer';

/**
 * BFA Intelligent Operations Assistant Modal
 *
 * Phase 12C improvements:
 * 1. "Close" dismisses the modal; "Clear Chat" clears conversation (distinct actions).
 * 2. Typed interactive response components (apartment grids, tables, summaries).
 * 3. Conversation history sent to backend for AI context.
 * 4. Apartment selection auto-fills a booking request.
 */
export default function OperationsAssistantModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activePropertyId, properties } = useProperty();

  const makeWelcomeMessage = () => ({
    id: 'welcome-1',
    sender: 'assistant',
    text: `Hello ${user?.name || 'Operator'}! I am the **BFA Operations Assistant**.\n\nYou can ask me to inspect arrivals, departures, check apartment availability, view reservation details, summarize outstanding payments, or prepare a 1-night booking. All actions strictly adhere to your assigned role permissions (${user?.role}) and property boundaries.`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    responseComponents: [],
  });

  const [messages, setMessages] = useState([makeWelcomeMessage()]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [authorizedActions, setAuthorizedActions] = useState([]);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch actions authorized for the current user identity
  useEffect(() => {
    let isMounted = true;
    async function loadActions() {
      try {
        const res = await automationService.getActions();
        if (isMounted && res.data) {
          setAuthorizedActions(res.data);
        }
      } catch (err) {
        console.warn('Failed to load authorized action catalog:', err.message);
      }
    }

    if (isOpen) {
      loadActions();
      setTimeout(() => inputRef.current?.focus(), 80);
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Derive active property display name
  const currentPropertyObj = properties?.find((p) => String(p.id) === String(activePropertyId));
  const activePropertyLabel = currentPropertyObj ? currentPropertyObj.name : 'All Properties';

  // Available prompt pills based on actual authorized actions and roles
  const getSuggestedPills = () => {
    const pills = [];
    const hasAction = (id) => authorizedActions.some((a) => a.actionId === id);

    // Natural-language navigation shortcuts
    pills.push({ label: "📅 Availability Calendar", prompt: "Take me to the availability calendar" });
    pills.push({ label: "🏢 Properties", prompt: "Open properties" });
    pills.push({ label: "🔧 Maintenance", prompt: "Take me to maintenance" });
    if (['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'OWNER'].includes(user?.role)) {
      pills.push({ label: "💰 Financial Overview", prompt: "Open the financial overview" });
    }
    if (['SUPER_ADMIN', 'ADMIN'].includes(user?.role)) {
      pills.push({ label: "🛡️ Audit Trail", prompt: "Open the audit trail" });
    }

    if (hasAction('operations.get_today_arrivals')) {
      pills.push({ label: "📅 Today's Arrivals", prompt: "Show today's arrivals" });
    }
    if (hasAction('operations.get_today_departures')) {
      pills.push({ label: "🚪 Today's Departures", prompt: "Who is checking out today?" });
    }
    if (hasAction('apartments.list_available')) {
      pills.push({ label: "🏠 Available Apartments", prompt: "Show me available apartments for tomorrow" });
    }
    if (hasAction('apartments.check_availability')) {
      pills.push({ label: "🔍 Check Unit Availability", prompt: "Is apartment 1 available tomorrow?" });
    }
    if (hasAction('reservations.get_details')) {
      pills.push({ label: "📋 Reservation Details", prompt: "Show details for reservation 1" });
    }
    if (hasAction('financial.summarize_outstanding_payments')) {
      pills.push({ label: "💰 Outstanding Payments", prompt: "Summarize outstanding payments" });
    }
    if (hasAction('reservations.create')) {
      pills.push({
        label: "📝 Create 1-Night Booking",
        prompt: "Create reservation for Jane Doe in apartment 1 on tomorrow with email jane@example.com and phone 08012345678",
      });
    }

    // Continuous Development & System Governance shortcuts (Leadership/Admins)
    if (['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'].includes(user?.role)) {
      pills.push({ label: "📋 Development Register", prompt: "Show development register" });
      pills.push({ label: "🔍 System Diagnostics", prompt: "Inspect system diagnostics" });
      pills.push({ label: "📝 Plan Improvement", prompt: "Plan task for Guest Loyalty Points" });
      pills.push({ label: "⚙️ Operations Center", prompt: "Take me to operations control center" });
    }

    return pills;
  };

  /**
   * Build sanitized conversation history for AI context.
   * Strips confirmation tokens, limits size.
   */
  const buildConversationHistory = useCallback((msgs) => {
    return msgs
      .filter((m) => m.sender === 'user' || (m.sender === 'assistant' && m.text))
      .slice(-20) // max 10 turns
      .map((m) => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        text: (m.text || '').substring(0, 400),
      }));
  }, []);

  const handleSendMessage = async (textToSend) => {
    const msgText = (textToSend || input).trim();
    if (!msgText || isLoading) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: msgText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const currentMsgs = [...messages, userMsg];
      const res = await automationService.chat({
        message: msgText,
        propertyId: activePropertyId && activePropertyId !== 'all' ? parseInt(activePropertyId, 10) : undefined,
        conversationHistory: buildConversationHistory(currentMsgs),
      });

      const reply = res.data;
      const assistantMsg = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: reply.message || 'Operation completed.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        replyType: reply.replyType,
        confirmation: reply.confirmation || null,
        result: reply.result || null,
        actionId: reply.actionId || null,
        responseComponents: reply.responseComponents || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Client-side navigation trigger for verified navigation responses
      const navComp = reply.responseComponents?.find((c) => c.type === 'navigation');
      if (navComp && navComp.path) {
        try {
          navigate(navComp.path);
        } catch (navErr) {
          console.error('Client navigation failed:', navErr);
        }
      }
    } catch (err) {
      const errorMsg = {
        id: `asst-err-${Date.now()}`,
        sender: 'assistant',
        text: `⚠️ **Request Error:** ${err.message || 'Unable to communicate with the automation gateway.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
        responseComponents: [],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleConfirmAction = async (confirmationToken, messageId) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, isExecuting: true } : m))
    );

    try {
      const res = await automationService.confirm({ confirmationToken });
      const execResult = res.data?.result || {};

      const successSummary =
        `🎉 **Action Executed Successfully!**\n\n` +
        `• **Reservation Code:** ${execResult.reservationCode || '#' + execResult.reservationId}\n` +
        `• **Guest:** ${execResult.guestName || 'Guest'}\n` +
        `• **Nights:** ${execResult.nights || 1} Night (Rule compliant)\n` +
        `• **Total:** ₦${execResult.totalAmount?.toLocaleString() || 'N/A'}\n` +
        `• **Status:** ${execResult.status || 'CONFIRMED'}`;

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                isExecuting: false,
                confirmation: null,
                text: successSummary,
                replyType: 'SUCCESS',
                responseComponents: [
                  {
                    type: 'success',
                    content: successSummary,
                  },
                ],
              }
            : m
        )
      );
    } catch (err) {
      const errText = `❌ **Confirmation Failed:** ${err.message || 'Execution failed or token has expired/been replayed.'}`;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                isExecuting: false,
                confirmation: null,
                text: errText,
                isError: true,
                responseComponents: [{ type: 'error', content: errText }],
              }
            : m
        )
      );
    }
  };

  const handleCancelAction = async (confirmationToken, messageId) => {
    try {
      await automationService.cancel({
        confirmationToken,
        reason: 'Cancelled by operator in Assistant',
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                confirmation: null,
                text: `Proposal for **${m.actionId || 'Action'}** was cancelled. No changes were made.`,
                responseComponents: [
                  { type: 'text', content: `Proposal for **${m.actionId || 'Action'}** was cancelled. No changes were made.`, variant: 'info' },
                ],
              }
            : m
        )
      );
    } catch (err) {
      console.warn('Failed to cancel confirmation token:', err.message);
    }
  };

  /**
   * PHASE 2 FIX: Clear Chat — distinct from Close.
   * Only clears conversation history. Does not dismiss the modal.
   * Requires confirmation before discarding if conversation history exists.
   * Does not execute or cancel any pending action.
   */
  const handleClearChatClick = () => {
    const hasHistory = messages.some((m) => m.sender === 'user');
    if (!hasHistory) {
      handleClearChat();
      return;
    }
    setIsConfirmingClear(true);
  };

  const handleConfirmClear = () => {
    handleClearChat();
    setIsConfirmingClear(false);
  };

  const handleCancelClear = () => {
    setIsConfirmingClear(false);
  };

  const handleClearChat = () => {
    setMessages([
      {
        ...makeWelcomeMessage(),
        id: `welcome-${Date.now()}`,
        text: 'Conversation cleared. How can I assist you with BFA operations today?',
      },
    ]);
    setInput('');
  };

  /**
   * Handle apartment selection from the grid.
   * Auto-fills the input with a booking request for the selected unit.
   */
  const handleSelectApartment = (apartment, checkInDate) => {
    if (!apartment || !checkInDate) return;
    const unitRef = apartment.unitNumber || `#${apartment.apartmentId}`;
    const prompt = `Book apartment ${unitRef} for [guest name] on ${checkInDate} with email [email] and phone [phone number]`;
    setInput(prompt);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  /**
   * Handle View Details for an apartment — fetches via the check_availability action.
   */
  const handleViewApartmentDetails = (apartment) => {
    if (!apartment) return;
    const unitRef = apartment.unitNumber || `#${apartment.apartmentId}`;
    handleSendMessage(`Is apartment ${unitRef} available on ${apartment.checkInDate || 'tomorrow'}?`);
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      ariaLabel="BFA Intelligent Operations Assistant"
      bodyClassName="assistant-modal-body"
    >
      {/* PHASE 2: Assistant Header — Close (dismisses modal) + Clear Chat (clears conversation) */}
      <div className="assistant-header-bar">
        <div className="assistant-meta-tags">
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
            Operations Assistant
          </span>
          <span className="badge badge-sm" style={{ background: 'var(--brand-dim)', color: 'var(--brand-accent)' }}>
            {user?.role || 'USER'}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>•</span>
          <span>🏢 {activePropertyLabel}</span>
          {['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER'].includes(user?.role) && (
            <>
              <span style={{ color: 'var(--text-muted)' }}>•</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '1px 6px', borderRadius: '4px' }}>
                🚀 Continuous Dev Ready
              </span>
            </>
          )}
        </div>

        <div className="assistant-header-controls">
          {/* PHASE 2 FIX: "Clear Chat" clears conversation with confirmation; does NOT close the modal */}
          {isConfirmingClear ? (
            <div className="assistant-clear-confirm-group" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Clear?</span>
              <button
                type="button"
                id="assistant-confirm-clear-btn"
                onClick={handleConfirmClear}
                className="assistant-header-action-btn"
                style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)' }}
                aria-label="Confirm clear conversation"
              >
                Yes
              </button>
              <button
                type="button"
                id="assistant-cancel-clear-btn"
                onClick={handleCancelClear}
                className="assistant-header-action-btn"
                aria-label="Cancel clear conversation"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              id="assistant-clear-chat-btn"
              onClick={handleClearChatClick}
              className="assistant-header-action-btn"
              title="Clear conversation history"
              aria-label="Clear conversation history"
            >
              Clear Chat
            </button>
          )}
          {/* PHASE 2 FIX: "Close" dismisses the modal; does NOT clear conversation */}
          <button
            type="button"
            id="assistant-close-btn"
            onClick={onClose}
            className="assistant-header-action-btn assistant-close-btn"
            title="Close assistant (Esc)"
            aria-label="Close Operations Assistant"
          >
            Close
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="assistant-messages-container" tabIndex={0} aria-label="Conversation History">
        {/* Welcome Card & Action Discovery Pills */}
        <div className="assistant-welcome-card">
          <h3>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand-accent)" strokeWidth="2.5" aria-hidden="true">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Authorized Operations Hub
          </h3>
          <p>
            Choose a suggested operational action or type your request below. Actions requiring state mutation will generate an explicit confirmation proposal.
          </p>

          <div className="prompt-pills-label">Quick Suggestions</div>
          <div className="prompt-pills-grid">
            {getSuggestedPills().map((pill, idx) => (
              <button
                key={idx}
                type="button"
                className="prompt-pill-btn"
                onClick={() => handleSendMessage(pill.prompt)}
                disabled={isLoading}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Message Thread */}
        {messages.map((msg) => (
          <div key={msg.id} className={`message-row ${msg.sender}`}>
            {msg.sender === 'assistant' && (
              <div className="message-avatar assistant-avatar" aria-hidden="true">
                AI
              </div>
            )}
            <div className="message-bubble">
              {/* Plain text — only when no typed components or as header text */}
              {msg.text && (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
              )}

              {/* PHASE 3: Typed interactive response components */}
              {msg.responseComponents && msg.responseComponents.length > 0 && (
                <AssistantResponseRenderer
                  components={msg.responseComponents}
                  messageId={msg.id}
                  isExecuting={msg.isExecuting}
                  onConfirmAction={handleConfirmAction}
                  onCancelAction={handleCancelAction}
                  onSelectApartment={handleSelectApartment}
                  onViewApartmentDetails={handleViewApartmentDetails}
                  onNavigate={(path) => navigate(path)}
                />
              )}

              {/* Legacy confirmation card (when no typed components) */}
              {msg.confirmation && (!msg.responseComponents || msg.responseComponents.length === 0) && (
                <ConfirmationCard
                  confirmation={msg.confirmation}
                  isExecuting={msg.isExecuting}
                  onConfirm={(token) => handleConfirmAction(token, msg.id)}
                  onCancel={(token) => handleCancelAction(token, msg.id)}
                />
              )}

              <div className="message-timestamp">{msg.timestamp}</div>
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="message-row assistant">
            <div className="message-avatar assistant-avatar" aria-hidden="true">
              AI
            </div>
            <div className="message-bubble" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
              <span className="spinner-border spinner-border-sm" style={{ width: '12px', height: '12px', border: '2px solid var(--brand-accent)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
              <span>Analyzing request &amp; evaluating authorized policies...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="assistant-input-wrapper">
        <form
          className="assistant-input-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
        >
          <input
            ref={inputRef}
            id="assistant-message-input"
            type="text"
            className="assistant-text-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type an operational request (e.g. 'Show available apartments for tomorrow')..."
            disabled={isLoading}
            aria-label="Assistant message input"
            autoComplete="off"
          />
          <button
            type="submit"
            id="assistant-send-btn"
            className="assistant-send-btn"
            disabled={!input.trim() || isLoading}
            title="Send request"
            aria-label="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>

        <div className="assistant-footer-hint">
          <span>Tip: Press <kbd style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', padding: '1px 5px', borderRadius: '3px' }}>Enter</kbd> to send • <kbd style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', padding: '1px 5px', borderRadius: '3px' }}>Esc</kbd> to close</span>
          <span style={{ color: 'var(--brand-accent)' }}>🔒 Server-Side Authorized</span>
        </div>
      </div>
    </Modal>
  );
}
