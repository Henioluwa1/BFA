/**
 * chatMessageParser.js
 * Robust parser for internal BFA Staff Chat & Operations messages.
 * Extracts structured entities and categorizes messages into distinct visual types:
 * - OFFICIAL_OPERATION
 * - RESPONSIBILITY_ACCEPTED
 * - RESPONSIBILITY_DELEGATED
 * - PROGRESS_UPDATE
 * - COMPLETION_SUBMITTED
 * - OPERATION_COMPLETED
 * - OPERATION_REVISION
 * - OPERATIONAL_BLOCKER
 * - CLARIFICATION_INQUIRY
 * - CLARIFICATION_RESPONSE
 * - MEMO_AMENDMENT
 * - CANCELLATION_NOTICE
 * - TASK_UPDATE
 * - SYSTEM_NOTICE
 * - NORMAL
 */

/**
 * Parse thread title to extract structured metadata for operation threads vs normal threads.
 */
export function parseConversationTitle(thread) {
  if (!thread) {
    return {
      isOperation: false,
      cleanTitle: 'Conversation',
      operationCode: null,
      subtitle: '',
      displayTitle: 'Conversation',
    };
  }

  const rawTitle = thread.title || 'Untitled Conversation';
  const threadType = thread.thread_type || thread.threadType;

  // Check if title has [OPS] prefix or OPS-YYYYMM-XXXX reference
  const opsMatch = rawTitle.match(/\[OPS\]\s*(OPS-\d{6}-\d{4})[:\s-]+(.*)/i) ||
                   rawTitle.match(/(OPS-\d{6}-\d{4})[:\s-]+(.*)/i) ||
                   rawTitle.match(/(.*?)\s*[([](OPS-\d{6}-\d{4})[)\]]/i);

  if (opsMatch) {
    let operationCode = '';
    let cleanTitle = '';

    if (opsMatch[1].startsWith('OPS-')) {
      operationCode = opsMatch[1];
      cleanTitle = opsMatch[2] ? opsMatch[2].trim() : 'Operational Directive';
    } else {
      cleanTitle = opsMatch[1] ? opsMatch[1].trim() : 'Operational Directive';
      operationCode = opsMatch[2];
    }

    // Clean any residual prefixes
    cleanTitle = cleanTitle.replace(/^TEST-SCENARIO-[A-Z]:\s*/i, '').trim();

    return {
      isOperation: true,
      cleanTitle: cleanTitle || 'Operational Directive',
      operationCode,
      subtitle: `${operationCode} · Operational Channel`,
      displayTitle: cleanTitle,
    };
  }

  // Check if thread title simply matches an operation
  if (rawTitle.startsWith('[OPS]') || threadType === 'OPERATION') {
    const clean = rawTitle.replace(/^\[OPS\]\s*/i, '').trim();
    return {
      isOperation: true,
      cleanTitle: clean,
      operationCode: null,
      subtitle: 'Operational Channel',
      displayTitle: clean,
    };
  }

  if (threadType === 'PROPERTY_CHANNEL') {
    return {
      isOperation: false,
      cleanTitle: rawTitle,
      operationCode: null,
      subtitle: 'Property Team Channel',
      displayTitle: rawTitle,
    };
  }

  if (threadType === 'DIRECT') {
    return {
      isOperation: false,
      cleanTitle: rawTitle,
      operationCode: null,
      subtitle: 'Direct Message',
      displayTitle: rawTitle,
    };
  }

  return {
    isOperation: false,
    cleanTitle: rawTitle,
    operationCode: null,
    subtitle: 'Team Group',
    displayTitle: rawTitle,
  };
}

/**
 * Parse an individual chat message to determine its visual layout and extract structured attributes.
 */
export function parseChatMessage(msg) {
  if (!msg) {
    return { type: 'NORMAL', data: {} };
  }

  const content = msg.content || '';
  const messageType = msg.message_type || msg.messageType || 'TEXT';
  const contextEntityType = msg.context_entity_type || msg.contextEntityType;
  const contextEntityId = msg.context_entity_id || msg.contextEntityId;

  // 1. System Notice
  if (messageType === 'SYSTEM_NOTICE') {
    return {
      type: 'SYSTEM_NOTICE',
      data: {
        content,
      },
    };
  }

  // 2. Official Operation Memo / Directive Card
  if (
    content.includes('[OFFICIAL OPERATIONS MEMO') ||
    content.includes('Official Directive:') ||
    ((contextEntityType === 'OPERATION' || contextEntityType === 'MEMO') && (content.includes('Ref: OPS-') || content.includes('Title:')))
  ) {
    const memoRef = content.match(/MEMO-[^\s\n\]]+/)?.[0] || '';
    const refMatch = content.match(/Ref:\s*(OPS-[^\s\n]+)/i);
    const titleMatch = content.match(/Title:\s*([^\n]+)/i);
    const categoryMatch = content.match(/Category:\s*([^\n]+)/i);
    const prioMatch = content.match(/Priority:\s*([^\n]+)/i);
    const scopeMatch = content.match(/Property Scope:\s*([^\n]+)/i);
    const deadlineMatch = content.match(/Deadline:\s*([^\n]+)/i);
    const ownerMatch = content.match(/Current Owner:\s*([^\n]+)/i);
    const nextMatch = content.match(/Next Action:\s*([^\n]+)/i);
    const subjectMatch = content.match(/Subject:\s*([^\n]+)/i);
    const instructionsMatch = content.match(/Instructions:\s*([\s\S]*?)(?=\n\n⚠️|\n\nRef:|$)/i);

    return {
      type: 'OFFICIAL_OPERATION',
      data: {
        operationId: contextEntityId || refMatch?.[1],
        operationCode: refMatch?.[1] || (contextEntityId ? `OPS-${contextEntityId}` : ''),
        memoRef,
        title: titleMatch?.[1]?.replace(/^TEST-SCENARIO-[A-Z]:\s*/i, '')?.trim() || 'Central Operational Directive',
        category: categoryMatch?.[1]?.trim() || 'OPERATIONS',
        priority: prioMatch?.[1]?.trim() || msg.priority || 'NORMAL',
        propertyScope: scopeMatch?.[1]?.trim() || 'All Properties',
        deadline: deadlineMatch?.[1]?.trim() || '',
        currentOwner: ownerMatch?.[1]?.trim() || 'Awaiting Ownership',
        nextAction: nextMatch?.[1]?.trim() || 'Review directive mandates and acknowledge receipt.',
        subject: subjectMatch?.[1]?.trim() || '',
        instructions: instructionsMatch?.[1]?.trim() || '',
      },
    };
  }

  // 3. Task Ownership / Responsibility Accepted
  if (content.includes('[TASK OWNERSHIP ACCEPTED]') || content.includes('[RESPONSIBILITY ACCEPTED]')) {
    // E.g.: "👤 [TASK OWNERSHIP ACCEPTED] Sarah Jenkins (Admin) (ADMIN) has accepted primary responsibility for Operation OPS-202611-0014.\n👉 Next Action: Responsibility accepted. Review directives and begin operational execution."
    const actorMatch = content.match(/accepted primary responsibility for Operation\s+(OPS-[^\s\.\n]+)/i) ||
                       content.match(/accepted primary responsibility/i);
    const opMatch = content.match(/(OPS-\d{6}-\d{4})/i);
    const nextActionMatch = content.match(/Next Action:\s*([^\n]+)/i);

    // Extract actor name from start: "👤 [TASK OWNERSHIP ACCEPTED] Sarah Jenkins (Admin) (ADMIN) has accepted..."
    const actorNameMatch = content.match(/\[(?:TASK OWNERSHIP ACCEPTED|RESPONSIBILITY ACCEPTED)\]\s*(.*?)\s+has accepted/i);

    return {
      type: 'RESPONSIBILITY_ACCEPTED',
      data: {
        actor: actorNameMatch?.[1]?.replace(/\s*\([A-Z_]+\)$/, '') || msg.senderName || msg.sender?.name || 'Staff Member',
        actorRole: msg.senderRole || msg.sender?.role || 'Staff',
        operationCode: opMatch?.[1] || (contextEntityId ? `OPS-${contextEntityId}` : ''),
        status: 'Accepted',
        nextAction: nextActionMatch?.[1]?.trim() || 'Review directives and begin operational execution.',
      },
    };
  }

  // 4. Responsibility Delegated
  if (content.includes('[RESPONSIBILITY DELEGATED]')) {
    // E.g.: "📌 [RESPONSIBILITY DELEGATED] Operation OPS-202611-0014 has been assigned to Marcus Vance (Manager) (OPERATIONS MANAGER) by Sarah Jenkins (Admin).\nInstructions: Marcus, please lead the onsite engineering team.\n👉 Next Action: Assigned to Marcus Vance (Manager). Review directives and begin operational execution."
    const opMatch = content.match(/Operation\s+(OPS-[^\s\n]+)/i);
    const assignedMatch = content.match(/has been assigned to\s+(.*?)\s+by\s+(.*?)(?:\.|\n|$)/i);
    const instrMatch = content.match(/Instructions:\s*([^\n]+)/i);
    const nextActionMatch = content.match(/Next Action:\s*([^\n]+)/i);

    return {
      type: 'RESPONSIBILITY_DELEGATED',
      data: {
        operationCode: opMatch?.[1] || (contextEntityId ? `OPS-${contextEntityId}` : ''),
        assignedTo: assignedMatch?.[1]?.trim() || 'Designated Staff',
        delegatedBy: assignedMatch?.[2]?.trim() || msg.senderName || msg.sender?.name || 'Supervisor',
        instructions: instrMatch?.[1]?.trim() || '',
        nextAction: nextActionMatch?.[1]?.trim() || 'Review directives and begin operational execution.',
      },
    };
  }

  // 5. Operational Blocker
  if (content.includes('[OPERATIONAL BLOCKER')) {
    const opMatch = content.match(/OPERATIONAL BLOCKER\s*-\s*(OPS-[^\s\]]+)/i);
    const catMatch = content.match(/Category:\s*([^\n]+)/i);
    const reportedMatch = content.match(/Reported By:\s*([^\n]+)/i);
    const detailsMatch = content.match(/Details:\s*([\s\S]*?)(?=\n\nImmediate|$)/i);

    return {
      type: 'OPERATIONAL_BLOCKER',
      data: {
        operationCode: opMatch?.[1] || (contextEntityId ? `OPS-${contextEntityId}` : ''),
        category: catMatch?.[1]?.trim() || 'CRITICAL',
        reportedBy: reportedMatch?.[1]?.trim() || msg.senderName || 'Staff Member',
        details: detailsMatch?.[1]?.trim() || content,
        nextAction: 'Immediate managerial intervention requested.',
      },
    };
  }

  // 6. Progress Update
  if (content.includes('[PROGRESS UPDATE')) {
    const opMatch = content.match(/PROGRESS UPDATE\s*-\s*(OPS-[^\s\]]+)/i);
    const statusMatch = content.match(/Status:\s*([^\n]+)/i);
    const loggedMatch = content.match(/Logged By:\s*([^\n]+)/i);
    const notesMatch = content.match(/Notes:\s*([\s\S]*?)$/i);

    return {
      type: 'PROGRESS_UPDATE',
      data: {
        operationCode: opMatch?.[1] || (contextEntityId ? `OPS-${contextEntityId}` : ''),
        status: statusMatch?.[1]?.trim() || 'IN_PROGRESS',
        loggedBy: loggedMatch?.[1]?.trim() || msg.senderName || 'Staff Member',
        notes: notesMatch?.[1]?.trim() || '',
      },
    };
  }

  // 7. Completion Submitted
  if (content.includes('[COMPLETION SUBMITTED')) {
    const opMatch = content.match(/COMPLETION SUBMITTED\s*-\s*(OPS-[^\s\]]+)/i);
    const submittedMatch = content.match(/Submitted By:\s*([^\n]+)/i);
    const notesMatch = content.match(/Notes:\s*([\s\S]*?)(?=\n\nAwaiting|$)/i);

    return {
      type: 'COMPLETION_SUBMITTED',
      data: {
        operationCode: opMatch?.[1] || (contextEntityId ? `OPS-${contextEntityId}` : ''),
        submittedBy: submittedMatch?.[1]?.trim() || msg.senderName || 'Staff Member',
        notes: notesMatch?.[1]?.trim() || '',
        nextAction: 'Awaiting managerial sign-off and closure review.',
      },
    };
  }

  // 8. Operation Officially Completed / Approved
  if (content.includes('[OPERATION OFFICIALLY COMPLETED]')) {
    const opMatch = content.match(/Ref:\s*(OPS-[^\s\n]+)/i);
    const reviewedMatch = content.match(/Reviewed By:\s*([^\n]+)/i);
    const reviewNotesMatch = content.match(/Review Notes:\s*([\s\S]*?)$/i);

    return {
      type: 'OPERATION_COMPLETED',
      data: {
        operationCode: opMatch?.[1] || (contextEntityId ? `OPS-${contextEntityId}` : ''),
        reviewedBy: reviewedMatch?.[1]?.trim() || msg.senderName || 'Authorized Manager',
        reviewNotes: reviewNotesMatch?.[1]?.trim() || 'Sign-off complete. Operation closed.',
      },
    };
  }

  // 9. Operation Returned for Revision
  if (content.includes('[OPERATION RETURNED FOR REVISION]')) {
    const opMatch = content.match(/Ref:\s*(OPS-[^\s\n]+)/i);
    const reviewedMatch = content.match(/Reviewed By:\s*([^\n]+)/i);
    const reviewNotesMatch = content.match(/Review Notes:\s*([\s\S]*?)$/i);

    return {
      type: 'OPERATION_REVISION',
      data: {
        operationCode: opMatch?.[1] || (contextEntityId ? `OPS-${contextEntityId}` : ''),
        reviewedBy: reviewedMatch?.[1]?.trim() || msg.senderName || 'Authorized Manager',
        reviewNotes: reviewNotesMatch?.[1]?.trim() || 'Revisions required prior to approval.',
      },
    };
  }

  // 10. Clarification Inquiry / Response
  if (content.includes('[CLARIFICATION INQUIRY')) {
    const opMatch = content.match(/CLARIFICATION INQUIRY\s*-\s*(OPS-[^\s\]]+)/i);
    const body = content.replace(/.*\[CLARIFICATION INQUIRY[^\]]*\]\n?/i, '').trim();

    return {
      type: 'CLARIFICATION_INQUIRY',
      data: {
        operationCode: opMatch?.[1] || (contextEntityId ? `OPS-${contextEntityId}` : ''),
        body,
      },
    };
  }

  if (content.includes('[CLARIFICATION RESPONSE')) {
    const opMatch = content.match(/CLARIFICATION RESPONSE\s*-\s*(OPS-[^\s\]]+)/i);
    const body = content.replace(/.*\[CLARIFICATION RESPONSE[^\]]*\]\n?/i, '').trim();

    return {
      type: 'CLARIFICATION_RESPONSE',
      data: {
        operationCode: opMatch?.[1] || (contextEntityId ? `OPS-${contextEntityId}` : ''),
        body,
      },
    };
  }

  // 11. Official Memo Amendment or Cancellation
  if (content.includes('[OFFICIAL MEMO AMENDMENT')) {
    const memoMatch = content.match(/OFFICIAL MEMO AMENDMENT\s*—\s*([^\s\]]+)/i);
    const body = content.replace(/.*\[OFFICIAL MEMO AMENDMENT[^\]]*\]\n?/i, '').trim();

    return {
      type: 'MEMO_AMENDMENT',
      data: {
        memoReference: memoMatch?.[1] || '',
        body,
      },
    };
  }

  if (content.includes('[OFFICIAL CANCELLATION NOTICE')) {
    const opMatch = content.match(/OFFICIAL CANCELLATION NOTICE\s*—\s*([^\s\]]+)/i);
    const body = content.replace(/.*\[OFFICIAL CANCELLATION NOTICE[^\]]*\]\n?/i, '').trim();

    return {
      type: 'CANCELLATION_NOTICE',
      data: {
        operationCode: opMatch?.[1] || (contextEntityId ? `OPS-${contextEntityId}` : ''),
        body,
      },
    };
  }

  // 12. Task Created / Updated
  if (content.includes('[TASK CREATED]') || content.includes('[TASK UPDATED]') || content.includes('Linked Task: TSK-')) {
    const tskMatch = content.match(/TSK-\d{6}-\d{3,4}/i);
    const titleMatch = content.match(/Task Title:\s*([^\n]+)/i) || content.match(/Task:\s*([^\n]+)/i);
    const assigneeMatch = content.match(/Assigned (?:To|User):\s*([^\n]+)/i);
    const statusMatch = content.match(/Status:\s*([^\n]+)/i);
    const dueMatch = content.match(/Due (?:Date)?:\s*([^\n]+)/i);

    return {
      type: 'TASK_UPDATE',
      data: {
        taskCode: tskMatch?.[0] || 'TSK-ACTIVE',
        title: titleMatch?.[1]?.trim() || 'Operational Task',
        assignee: assigneeMatch?.[1]?.trim() || 'Assigned Staff',
        status: statusMatch?.[1]?.trim() || 'PENDING',
        dueDate: dueMatch?.[1]?.trim() || '',
      },
    };
  }

  // 13. Default: Normal Chat Message
  return {
    type: 'NORMAL',
    data: {},
  };
}
