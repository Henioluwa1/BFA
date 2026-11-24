import React, { useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatMessageComposer({
  messageText = '',
  onTextChange,
  onSendMessage,
  pendingAttachment = null,
  onRemoveAttachment,
  onSelectFile,
  sending = false,
  typingUsers = [],
}) {
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-expand textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollH = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(140, Math.max(42, scrollH))}px`;
    }
  }, [messageText]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSendMessage(e);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onSelectFile(file);
    }
    e.target.value = '';
  };

  return (
    <div className="chat-composer-wrapper" style={{ flexShrink: 0, position: 'relative' }}>
      {/* Typing Indicator Bar */}
      {typingUsers.length > 0 && (
        <div className="chat-typing-indicator" style={{ padding: '4px 1.5rem', background: 'rgba(10, 10, 14, 0.9)' }}>
          <div className="chat-typing-dots">
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
            <span className="chat-typing-dot" />
          </div>
          <span>
            {typingUsers.map((u) => u.userName).join(', ')}{' '}
            {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </span>
        </div>
      )}

      {/* Attachment Preview Banner */}
      {pendingAttachment && (
        <div className="chat-composer-attachment-preview">
          <div className="chat-composer-att-badge">
            <span>
              {pendingAttachment.fileType?.startsWith('image/') ? (
                <ImageIcon size={16} style={{ color: '#38bdf8' }} />
              ) : (
                <FileText size={16} style={{ color: '#fbbf24' }} />
              )}
            </span>
            <strong style={{ maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {pendingAttachment.originalName}
            </strong>
            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              ({formatFileSize(pendingAttachment.fileSize)})
            </span>
          </div>
          <button
            type="button"
            className="chat-btn-remove-att"
            onClick={onRemoveAttachment}
          >
            <X size={13} />
            <span>Remove</span>
          </button>
        </div>
      )}

      {/* Form Input Area */}
      <form className="chat-composer" onSubmit={onSendMessage}>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={handleFileChange}
        />

        <button
          type="button"
          className="chat-composer-btn-attach"
          onClick={() => fileInputRef.current?.click()}
          title="Attach photo or document (Max 15MB)"
        >
          <Paperclip size={18} />
        </button>

        <textarea
          ref={textareaRef}
          className="chat-composer-textarea"
          rows="1"
          placeholder="Type a message or operational update... (Enter to send, Shift+Enter for new line)"
          value={messageText}
          onChange={onTextChange}
          onKeyDown={handleKeyDown}
        />

        <button
          type="submit"
          className="chat-composer-btn-send"
          disabled={sending || (!messageText.trim() && !pendingAttachment)}
          title="Send message"
        >
          <span>Send</span>
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
