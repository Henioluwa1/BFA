/**
 * Intent Resolver for BFA Operations Assistant
 * Deterministic, Rule-Based Natural Language Intent Parsing & Parameter Extraction
 *
 * Designed as a modular, replaceable component.
 * Used as the primary resolver when AI provider is disabled, and as a
 * pre-classification fallback when AI provider fails.
 *
 * Strict Zero Dynamic Execution: Proposes only registered actions with validated schemas.
 */

const { NavigationRegistry } = require('../navigation/navigationRegistry');

// Adversarial patterns and prompt injection signatures
const ADVERSARIAL_PATTERNS = [
  /ignore\s+(?:all\s+|previous\s+|prior\s+)*(?:instructions|rules|prompts|guidelines|constraints)/i,
  /you\s+are\s+now\s+(an?\s+)?admin/i,
  /system\s+prompt/i,
  /drop\s+table/i,
  /select\s+.*\s+from/i,
  /truncate\s+table/i,
  /delete\s+from/i,
  /(?:bypass|override)\s+(?:auth|security|rbac|permissions|rules|guards)/i,
  /\b(?:navigate|redirect|go)\s+to\s+.*(?:bypass|unauthorized|admin_override)/i,
  /<script>/i,
  /;\s*--/i,
  /\bexec\s*\(/i,
  /\beval\s*\(/i,
];

/**
 * Format Date to YYYY-MM-DD
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Extract date from text (ISO YYYY-MM-DD or relative like 'today', 'tomorrow')
 * @param {string} text
 * @returns {string|null}
 */
function extractDate(text) {
  // ISO date format YYYY-MM-DD
  const isoMatch = text.match(/\b(20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/);
  if (isoMatch) {
    const raw = isoMatch[1];
    const [y, m, d] = raw.split('-').map((n) => parseInt(n, 10));
    const testDate = new Date(y, m - 1, d);
    if (testDate.getFullYear() === y && testDate.getMonth() === m - 1 && testDate.getDate() === d) {
      return raw;
    }
    return null; // Invalid calendar date e.g. 2026-02-31
  }

  const lower = text.toLowerCase();
  const now = new Date();

  if (/\btoday\b|\btday\b/.test(lower)) {
    return formatDate(now);
  }
  if (/\btomorrow\b|\btommorow\b|\btmrw\b/.test(lower)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }
  if (/\bday\s+after\s+tomorrow\b|\bday\s+after\s+tommorow\b/.test(lower)) {
    const nextDay = new Date(now);
    nextDay.setDate(nextDay.getDate() + 2);
    return formatDate(nextDay);
  }

  return null;
}

/**
 * Extract apartment/unit ID from text or conversation history
 * @param {string} text
 * @param {Array} [history]
 * @returns {number|null}
 */
function extractApartmentId(text, history = []) {
  const match = text.match(/\b(?:apartment|apratment|unit|apt|room)\s*(?:#|no\.?|id)?\s*(\d+)\b/i);
  if (match) return parseInt(match[1], 10);

  // Fallback to conversation history for ordinal/pronoun references
  if (Array.isArray(history) && history.length > 0) {
    const lower = text.toLowerCase();
    let targetIndex = null;
    if (/\b(?:first|1st)\b/.test(lower)) targetIndex = 0;
    else if (/\b(?:second|2nd)\b/.test(lower)) targetIndex = 1;
    else if (/\b(?:third|3rd)\b/.test(lower)) targetIndex = 2;
    else if (/\b(?:fourth|4th)\b/.test(lower)) targetIndex = 3;
    else if (/\b(?:fifth|5th)\b/.test(lower)) targetIndex = 4;

    const recentAssistantMsgs = history
      .filter((m) => m.role === 'assistant' || m.sender === 'assistant')
      .reverse();

    for (const msg of recentAssistantMsgs) {
      const content = msg.text || msg.content || '';
      if (targetIndex !== null) {
        const itemRegex = /(?:^|\n)\s*(\d+)\.\s+\*\*([^*]+)\*\*/g;
        const matches = [];
        let m;
        while ((m = itemRegex.exec(content)) !== null) {
          matches.push(m[2]);
        }
        if (matches[targetIndex]) {
          const aptIdMatch = matches[targetIndex].match(/\b(?:apartment|unit|apt|room)?\s*#?(\d+)\b/i);
          if (aptIdMatch) return parseInt(aptIdMatch[1], 10);
        }
      }
      if (/\b(?:that|the|this)\s+(?:apartment|unit|apt|room|one)\b/i.test(lower)) {
        const aptMatch = content.match(/\b(?:apartment|unit|apt|room)\s*(?:#|no\.?|id)?\s*(\d+)\b/i);
        if (aptMatch) return parseInt(aptMatch[1], 10);
      }
    }
  }

  return null;
}

/**
 * Extract date from conversation history when user omits date in follow-up
 * @param {Array} history
 * @returns {string|null}
 */
function extractDateFromHistory(history = []) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const recentMsgs = [...history].reverse();
  for (const msg of recentMsgs) {
    const content = msg.text || msg.content || '';
    const date = extractDate(content);
    if (date) return date;
  }
  return null;
}

/**
 * Extract property ID from text
 * @param {string} text
 * @returns {number|null}
 */
function extractPropertyId(text) {
  const match = text.match(/\bproperty\s*(?:#|no\.?|id)?\s*(\d+)\b/i);
  if (match) return parseInt(match[1], 10);
  return null;
}

/**
 * Extract reservation code or ID from text
 * @param {string} text
 * @returns {{ reservationId?: number, reservationCode?: string }|null}
 */
function extractReservationTarget(text) {
  // Strip email addresses so domain names like @bfa-test.com are not misidentified as booking codes
  const cleanedText = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ' ');

  // Booking code pattern: BFA-... or RES-...
  const codeMatch = cleanedText.match(/\b((?:BFA|RES)-[A-Za-z0-9_-]{3,30})\b/i);
  if (codeMatch) {
    return { reservationCode: codeMatch[1].toUpperCase() };
  }

  const idMatch = cleanedText.match(/\b(?:reservation|booking)\s*(?:#|no\.?|id)?\s*(\d+)\b/i);
  if (idMatch) {
    return { reservationId: parseInt(idMatch[1], 10) };
  }

  return null;
}

/**
 * Extract guest contact info (email, phone, name)
 * @param {string} text
 */
function extractGuestDetails(text) {
  // Email
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  const email = emailMatch ? emailMatch[0] : null;

  // Phone: +234... or 080... or digits >= 10
  const phoneMatch = text.match(/(?:\+?234|0)[789][01]\d{8}|\b\d{10,14}\b/);
  const phone = phoneMatch ? phoneMatch[0] : null;

  // Name: "for [Name]", "guest [Name]", "tenant [Name]", "name [Name]"
  let name = null;
  const nameMatch = text.match(/\b(?:for|guest|tenant|name(?:d)?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/);
  if (nameMatch) {
    name = nameMatch[1].trim();
  }

  return { email, phone, name };
}

/**
 * Detect if this is a "list all available apartments" request
 * vs a "check a specific apartment" request.
 * Supports natural synonyms and common misspellings.
 * @param {string} lower
 * @returns {boolean}
 */
function isListAvailableIntent(lower) {
  return (
    /\b(?:all|any|some|every|which|wich|what|show|list|find|see)\b.*\b(?:apartment|apratment|unit|apt|room|flat)s?\b.*\b(?:available|availabile|avialable|availability|free|vacant|vacnat|open|book|reserve)\b/i.test(lower) ||
    /\b(?:available|availabile|avialable|availability|free|vacant|vacnat|open)\b.*\b(?:apartment|apratment|unit|apt|room|flat)s?\b/i.test(lower) ||
    /\bwhat(?:'s|\s+is)\s+(?:free|available|avialable|vacant)\b/i.test(lower) ||
    /\bshow\s+me\s+(?:what(?:'s|\s+is)\s+)?(?:available|avialable|free|vacant)\b/i.test(lower) ||
    /\b(?:vacant|vacnat|empty)\s+(?:unit|apartment|apratment|apt|room)s?\b/i.test(lower) ||
    /\b(?:which|wich|what)\s+(?:unit|apartment|apratment|apt|room|option)s?\s+(?:can|are|could|do\s+we\s+have)\s+(?:i\s+)?(?:book|reserve|use|have)?\b/i.test(lower) ||
    /\b(?:show\s+me\s+(?:the\s+)?)?options\s+for\s+(?:one|1|a)\s+night\b/i.test(lower) ||
    /\bare\s+there\s+any\s+(?:available\s+)?(?:units?|apartments?|apratments?|rooms?)\b/i.test(lower)
  );
}

/**
 * Intent Resolver main entry point
 * @param {string} message - Untrusted raw user text
 * @param {Object} context - { user, propertyId }
 * @returns {Object} Resolution result
 */
function resolveIntent(message, context = {}) {
  if (!message || typeof message !== 'string') {
    return {
      type: 'UNSUPPORTED',
      message: 'Empty or invalid message received.',
    };
  }

  const text = message.trim();

  // 1. Check for prompt injection / adversarial patterns
  for (const pattern of ADVERSARIAL_PATTERNS) {
    if (pattern.test(text)) {
      return {
        type: 'ADVERSARIAL_REJECTED',
        reason: 'Request contained unauthorized instructions or unapproved command syntax.',
      };
    }
  }

  const lower = text.toLowerCase();

  // 2. Check for explicit unsupported operations
  // Unsupported: Refunds
  if (/\b(?:refund|chargeback|return money|reverse payment)\b/i.test(lower)) {
    return {
      type: 'UNSUPPORTED',
      message: 'Refund operations cannot be executed through the Operations Assistant. Please submit refund requests through the Financials module subject to manager approval.',
    };
  }

  // Unsupported: Reservation Deletion / Direct Cancellation
  if (/\b(?:delete|drop|remove)\s+(?:an?\s+)?(?:reservation|booking)\b/i.test(lower) || /\bcancel\s+(?:an?\s+)?(?:reservation|booking)\b/i.test(lower)) {
    return {
      type: 'UNSUPPORTED',
      message: 'Reservation deletion or cancellation is not supported via the Assistant. Please use the official Reservations management interface to handle cancellations with proper reason logging.',
    };
  }

  // Unsupported: Role or Permission Alterations
  if (/\b(?:change|alter|modify|escalate)\s+(?:my\s+|user\s+)?(?:role|permission|privilege)s?\b/i.test(lower) || /\bmake\s+me\s+(?:an?\s+)?(?:admin|manager|superadmin)\b/i.test(lower)) {
    return {
      type: 'UNSUPPORTED',
      message: 'User roles and permissions can only be modified by a Super Administrator within the User Management console.',
    };
  }

  // Unsupported: Bulk Data Exports
  if (/\b(?:export|dump|download|extract)\s+(?:all\s+)?(?:guests?|customers?|tenants?|database|pii|phones?|emails?)\b/i.test(lower)) {
    return {
      type: 'UNSUPPORTED',
      message: 'Bulk guest data export is prohibited through the Assistant to protect customer privacy and data governance policies. Authorized reports can be generated in the Reporting module.',
    };
  }

  // 3. Detect operational action intents
  const hasArrivals = /\barrivals?\b|\barivals?\b|\bcheck(?:ing)?[\s-]?ins?\b|\bchekin\b|\bwho is (?:arriving|ariving)\b|\b(?:arriving|ariving) today\b/i.test(lower);
  const hasDepartures = /\bdepartures?\b|\bdepatures?\b|\bcheck(?:ing)?[\s-]?outs?\b|\bchekout\b|\bwho is (?:departing|leaving|checking\s+out)\b|\b(?:departing|leaving|checking\s+out) today\b/i.test(lower);
  const hasListAvailable = isListAvailableIntent(lower);
  const hasAptFollowup = /\b(?:details?\s+(?:for|about)|tell\s+me\s+about)\s+(?:the\s+)?(?:second|first|third|2nd|1st|3rd|that|this)\b/i.test(lower);
  const hasSingleAvailability = !hasListAvailable && (
    /\bavailab\w*\b|\bavialab\w*\b/i.test(lower) ||
    /\bis (?:unit|apartment|apt)\b/i.test(lower) ||
    /\bfree units?\b/i.test(lower) ||
    /\b(?:can|could|whether)\s+.*\bbooked\s+for\s+(?:one|1|a)\s+night\b/i.test(lower) ||
    hasAptFollowup
  );
  const hasFinancial = /\b(outstanding|unpaid|debt|owing)\b/.test(lower) || /\bfinancial summary\b/.test(lower) || /\bwho owes\b/.test(lower) || /\bpayments? summary\b/.test(lower);
  const textWithoutEmails = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ' ');
  const hasDetails = !hasAptFollowup && (
    /\b(?:lookup|find|show|view|get)\s+(?:reservation|booking)\b/.test(lower) ||
    /\breservation details?\b/.test(lower) ||
    /\bbooking details?\b/.test(lower) ||
    /\b(?:BFA|RES)-[A-Za-z0-9_-]{3,30}\b/i.test(textWithoutEmails)
  );
  const hasCreate = !hasListAvailable && (
    /\b(?:create|make|book|new)\s+(?:an?\s+)?(?:reservation|booking)\b/i.test(lower) ||
    /\bbook\s+(?:an?\s+)?(?:apartment|unit|apt|room)\b/i.test(lower) ||
    /\breserve\s+(?:an?\s+)?(?:apartment|unit|apt|room)\b/i.test(lower)
  );

  const hasDevRegister = /\b(?:development\s+register|dev\s+register|continuous\s+development|release\s+gates|baseline\s+version|show\s+register|project\s+register)\b/i.test(lower);
  const hasDevStatus = /\b(?:system\s+diagnostic(?:s)?|diagnostic\s+status|subsystem\s+health|health\s+check|migration\s+status|system\s+health)\b/i.test(lower);
  const hasDevPlan = /\b(?:plan\s+(?:task|feature|improvement|implementation)|generate\s+plan|development\s+plan)\b/i.test(lower);

  const isDevQuery = hasDevRegister || hasDevStatus || hasDevPlan;
  const isOperationalQuery = hasArrivals || hasDepartures || hasListAvailable || hasSingleAvailability || hasFinancial || hasDetails || hasCreate || isDevQuery;

  // 4. Natural-Language Navigation Intent Resolution (WP-B)
  const isExplicitNav = /^(?:please\s+)?(?:can\s+you\s+)?(?:take\s+me\s+to|navigate\s+to|open|go\s+to|switch\s+to|head\s+to|return\s+to|visit)\b/i.test(lower) ||
    /\b(?:page\s+where\s+i\s+can|page\s+for|take\s+me\s+to|navigate\s+to|go\s+to|show\s+me\s+the\s+page)\b/i.test(lower);

  const navMatch = NavigationRegistry.matchPhrase(text, context.user?.role);

  // If explicit navigation, or if direct navigation query with high confidence that is NOT an operational action
  if (isExplicitNav || (!isOperationalQuery && navMatch.status === 'MATCHED' && navMatch.confidence >= 0.7)) {
    if (navMatch.status === 'MATCHED') {
      const userRole = (context.user?.role || 'STAFF').toUpperCase();
      if (!NavigationRegistry.isAuthorized(navMatch.route, userRole)) {
        return {
          type: 'UNAUTHORIZED_NAVIGATION',
          route: navMatch.route,
          message: `Access Restricted: Your current role (${userRole}) is not authorized to navigate to '${navMatch.route.displayName}'.`,
        };
      }
      return {
        type: 'INTENT_MATCHED',
        actionId: 'navigation.navigate',
        parameters: {
          destination: navMatch.route.routeId,
          params: navMatch.params || {},
        },
      };
    } else if (navMatch.status === 'AMBIGUOUS' && isExplicitNav) {
      const candidateNames = navMatch.candidates.map((c) => `**${c.displayName}**`).join(', ');
      return {
        type: 'CLARIFICATION',
        actionId: 'navigation.navigate',
        message: `Your request could refer to multiple destinations: ${candidateNames}. Where would you like to go?`,
        missingFields: ['destination'],
      };
    } else if (isExplicitNav) {
      // Explicit navigation to unrecognized destination
      return {
        type: 'UNSUPPORTED',
        message: `I couldn't find an application page matching '${text}'. You can ask me to open properties, calendar, front desk, reservations, guests, employees, performance, ID cards, financials, maintenance, inspections, analytics, reports, audit, access control, announcements, communications, notifications, or return to your dashboard.`,
      };
    }
  }

  // 5. Detect overlapping operational intents to avoid ambiguous dispatch
  const matchedActionsCount = [hasArrivals, hasDepartures, hasListAvailable, hasSingleAvailability, hasFinancial, hasDetails, hasCreate].filter(Boolean).length;
  if (matchedActionsCount > 1) {
    return {
      type: 'MULTI_ACTION_DETECTED',
      message: 'Multiple operations were detected in your request. For operational precision, security, and verification, please submit one request at a time.',
    };
  }

  // 4. Match: operations.get_today_arrivals
  if (hasArrivals) {
    const propertyId = extractPropertyId(text) || (context.propertyId ? parseInt(context.propertyId, 10) : undefined);
    const params = {};
    if (propertyId) params.propertyId = propertyId;

    return {
      type: 'INTENT_MATCHED',
      actionId: 'operations.get_today_arrivals',
      parameters: params,
    };
  }

  // 5. Match: operations.get_today_departures
  if (hasDepartures) {
    const propertyId = extractPropertyId(text) || (context.propertyId ? parseInt(context.propertyId, 10) : undefined);
    const params = {};
    if (propertyId) params.propertyId = propertyId;

    return {
      type: 'INTENT_MATCHED',
      actionId: 'operations.get_today_departures',
      parameters: params,
    };
  }

  // 6. Match: apartments.list_available — "show me all available apartments"
  if (hasListAvailable) {
    const checkInDate = extractDate(text);
    const propertyId = extractPropertyId(text) || (context.propertyId ? parseInt(context.propertyId, 10) : undefined);

    if (!checkInDate) {
      return {
        type: 'CLARIFICATION',
        actionId: 'apartments.list_available',
        message: 'Which date would you like to check for available apartments? Please specify a date (e.g. "tomorrow" or "2026-11-20").',
        missingFields: ['checkInDate'],
      };
    }

    const params = { checkInDate };
    if (propertyId) params.propertyId = propertyId;

    return {
      type: 'INTENT_MATCHED',
      actionId: 'apartments.list_available',
      parameters: params,
    };
  }

  // 7. Match: apartments.check_availability — single apartment check
  if (hasSingleAvailability) {
    const apartmentId = extractApartmentId(text, context.conversationHistory);
    const checkInDate = extractDate(text) || extractDateFromHistory(context.conversationHistory);

    if (!apartmentId && !checkInDate) {
      return {
        type: 'CLARIFICATION',
        actionId: 'apartments.check_availability',
        message: 'To check apartment availability, please specify the apartment number and target date.\nExample: "Check availability for apartment 2 on 2026-11-20" or "Is unit 1 available tomorrow?"\n\nTo see **all** available apartments, try: "Show me available apartments for tomorrow"',
        missingFields: ['apartmentId', 'checkInDate'],
      };
    }

    if (!apartmentId) {
      return {
        type: 'CLARIFICATION',
        actionId: 'apartments.check_availability',
        message: `Which apartment number would you like to check for ${checkInDate}? (e.g. "Apartment 1")\n\nAlternatively, to see all available apartments, ask: "Show me available apartments for ${checkInDate}"`,
        missingFields: ['apartmentId'],
      };
    }

    if (!checkInDate) {
      return {
        type: 'CLARIFICATION',
        actionId: 'apartments.check_availability',
        message: `Which date would you like to check for Apartment ${apartmentId}? (e.g. "tomorrow" or "2026-11-20")`,
        missingFields: ['checkInDate'],
      };
    }

    return {
      type: 'INTENT_MATCHED',
      actionId: 'apartments.check_availability',
      parameters: {
        apartmentId,
        checkInDate,
      },
    };
  }

  // 8. Match: financial.summarize_outstanding_payments
  if (hasFinancial) {
    const propertyId = extractPropertyId(text) || (context.propertyId ? parseInt(context.propertyId, 10) : undefined);
    const params = {};
    if (propertyId) params.propertyId = propertyId;

    return {
      type: 'INTENT_MATCHED',
      actionId: 'financial.summarize_outstanding_payments',
      parameters: params,
    };
  }

  // 9. Match: reservations.get_details
  if (hasDetails) {
    const target = extractReservationTarget(text);
    if (!target) {
      return {
        type: 'CLARIFICATION',
        actionId: 'reservations.get_details',
        message: 'Please provide the reservation ID (e.g. "Reservation 15") or booking code (e.g. "BFA-2026-00015") to retrieve details.',
        missingFields: ['reservationId_or_code'],
      };
    }

    return {
      type: 'INTENT_MATCHED',
      actionId: 'reservations.get_details',
      parameters: target,
    };
  }

  // 10. Match: reservations.create
  if (hasCreate) {
    const apartmentId = extractApartmentId(text);
    const checkInDate = extractDate(text);
    const { name, email, phone } = extractGuestDetails(text);

    // Compute checkOutDate enforcing the strict 1-night maximum rule
    let checkOutDate = null;
    if (checkInDate) {
      const parts = checkInDate.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      d.setDate(d.getDate() + 1);
      checkOutDate = formatDate(d);
    }

    const missing = [];
    if (!apartmentId) missing.push('apartment number (e.g. "Apartment 1")');
    if (!name) missing.push('guest name (e.g. "for Jane Doe")');
    if (!email) missing.push('guest email (e.g. "jane@example.com")');
    if (!phone) missing.push('guest phone (e.g. "08012345678")');
    if (!checkInDate) missing.push('check-in date (e.g. "2026-11-20" or "tomorrow")');

    if (missing.length > 0) {
      return {
        type: 'CLARIFICATION',
        actionId: 'reservations.create',
        message: `To create a reservation, please provide the following details:\n- ${missing.join('\n- ')}\n\n*Note: BFA policy strictly enforces a 1-night maximum stay per reservation.*`,
        missingFields: missing,
      };
    }

    return {
      type: 'INTENT_MATCHED',
      actionId: 'reservations.create',
      parameters: {
        apartmentId,
        tenantName: name,
        tenantEmail: email,
        tenantPhone: phone,
        checkInDate,
        checkOutDate,
      },
    };
  }

  // 11. Match: dev.get_register
  if (hasDevRegister) {
    return {
      type: 'INTENT_MATCHED',
      actionId: 'dev.get_register',
      parameters: {},
    };
  }

  // 12. Match: dev.get_system_status
  if (hasDevStatus) {
    return {
      type: 'INTENT_MATCHED',
      actionId: 'dev.get_system_status',
      parameters: {},
    };
  }

  // 13. Match: dev.plan_task
  if (hasDevPlan) {
    const titleMatch = text.match(/\b(?:plan\s+(?:task|feature|improvement|implementation)|generate\s+plan|development\s+plan)(?:\s+for)?\s+(.+)$/i);
    const taskTitle = titleMatch ? titleMatch[1].trim().replace(/^[:"']+|[:"']+$/g, '') : null;
    if (!taskTitle) {
      return {
        type: 'CLARIFICATION',
        actionId: 'dev.plan_task',
        message: 'What feature or task would you like to plan? (e.g. "Plan task for Guest Loyalty Points")',
        missingFields: ['taskTitle'],
      };
    }
    return {
      type: 'INTENT_MATCHED',
      actionId: 'dev.plan_task',
      parameters: { taskTitle },
    };
  }

  // 14. Unsupported intent fallback
  return {
    type: 'UNSUPPORTED',
    message: "I couldn't match your request to a supported BFA operation. Here is what I can assist with:\n" +
      "• **Arrivals**: \"Show today's arrivals\"\n" +
      "• **Departures**: \"Who is checking out today?\"\n" +
      "• **All Available Apartments**: \"Show me available apartments for tomorrow\"\n" +
      "• **Single Apartment Check**: \"Is apartment 2 available tomorrow?\"\n" +
      "• **Reservation Details**: \"Show reservation BFA-2026-00001\"\n" +
      "• **Financials**: \"Summarize outstanding payments\"\n" +
      "• **Booking**: \"Create reservation for John Doe in apartment 1 on 2026-11-20 with email john@example.com and phone 08012345678\"\n" +
      "• **Continuous Development**: \"Show development register\", \"System diagnostics\", or \"Plan task for Loyalty Points\"",
  };
}

module.exports = {
  resolveIntent,
  extractDate,
  extractApartmentId,
  extractPropertyId,
  extractReservationTarget,
  extractGuestDetails,
  formatDate,
  isListAvailableIntent,
};
