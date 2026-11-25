/**
 * Official Operations & Ticket Memorandum PDF Generator
 * BFA Apartments Management System
 *
 * Fixes all PDFKit cursor-state leaks (doc.x drift from x=48 / x=458),
 * enforces strict page-break & footer-margin containment, removes mock
 * placeholder names, and formats all timestamps in Africa/Lagos (WAT).
 */

const PDFDocument = require('pdfkit');

const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 40;
const PAGE_TOP = 38;
const FOOTER_RESERVE = 78; // Safe clearance above footer divider & text

function formatLagosDateTime(value, fallback = 'N/A') {
  if (!value) return fallback;
  try {
    const dt = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return `${dt.toLocaleString('en-GB', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })} WAT`;
  } catch {
    return String(value);
  }
}

function getTemplateLabel(templateType, targetAudienceType) {
  if (templateType === 'OFFICIAL_AMENDMENT') return 'OFFICIAL TICKET & MEMO AMENDMENT';
  if (templateType === 'MULTI_RECIPIENT_TEAM' || ['MULTI_RECIPIENT_TEAM', 'SPECIFIC_USERS'].includes(targetAudienceType)) {
    return 'MULTI-RECIPIENT OPERATIONAL TICKET';
  }
  if (
    templateType === 'GROUP_BROADCAST' ||
    ['ALL_MANAGEMENT', 'MANAGERS_ONLY', 'ALL_RECEPTIONISTS', 'ALL_STAFF', 'PROPERTY_ALL', 'DEPARTMENT'].includes(targetAudienceType)
  ) {
    return 'GROUP / DEPARTMENTAL OPERATIONAL TICKET';
  }
  return 'INDIVIDUAL OPERATIONAL TICKET DIRECTIVE';
}

function getPriorityColors(priority) {
  switch ((priority || 'NORMAL').toUpperCase()) {
    case 'CRITICAL':
      return { bg: '#fef2f2', border: '#dc2626', text: '#b91c1c' };
    case 'URGENT':
    case 'HIGH':
      return { bg: '#fff7ed', border: '#ea580c', text: '#c2410c' };
    case 'IMPORTANT':
      return { bg: '#fefce8', border: '#ca8a04', text: '#a16207' };
    case 'LOW':
      return { bg: '#f0f9ff', border: '#0284c7', text: '#0369a1' };
    default:
      return { bg: '#eff6ff', border: '#2563eb', text: '#1d4ed8' };
  }
}

function drawPageFooter(doc, refLabel, ticketRef, pageNumber, totalPages) {
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
  const footerLineY = doc.page.height - 54;
  const footerTextY = doc.page.height - 46;

  doc.save();
  doc.moveTo(MARGIN_LEFT, footerLineY).lineTo(pageWidth - MARGIN_RIGHT, footerLineY).strokeColor('#cbd5e1').lineWidth(0.75).stroke();
  doc
    .font('Helvetica')
    .fontSize(7.5)
    .fillColor('#64748b')
    .text(
      `OFFICIAL BFA APARTMENTS RECORD — Ref: ${refLabel} | Ticket: ${ticketRef} — Timezone: Africa/Lagos — Page ${pageNumber} of ${totalPages}`,
      MARGIN_LEFT,
      footerTextY,
      { width: contentWidth, align: 'center', lineBreak: false }
    );
  doc.restore();
}

/**
 * Generates an aligned, cursor-safe PDF buffer for any of the 4 Memo/Ticket formats.
 */
async function generateOperationsMemoPdfBuffer({
  operation = {},
  memo = {},
  initiator = {},
  recipients = [],
  property = null,
  templateType = null,
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: PAGE_TOP, bottom: 20, left: MARGIN_LEFT, right: MARGIN_RIGHT },
        bufferPages: true,
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
      const pageBottomSafe = () => doc.page.height - FOOTER_RESERVE;

      const primaryDark = '#0f172a';
      const secondaryGray = '#475569';
      const brandAccent = '#b45309';
      const lightSlateBg = '#f8fafc';
      const borderSlate = '#cbd5e1';

      const resetCursor = (y = doc.y) => {
        doc.x = MARGIN_LEFT;
        doc.y = y;
      };

      const addNewPage = () => {
        doc.addPage();
        doc.rect(0, 0, pageWidth, 8).fill(primaryDark);
        doc.rect(0, 8, pageWidth, 3).fill('#ca8a04');
        resetCursor(28);
      };

      const ensureSpace = (neededHeight = 40) => {
        if (doc.y + neededHeight > pageBottomSafe()) {
          addNewPage();
          return true;
        }
        return false;
      };

      // Top Header Banner (First Page)
      doc.rect(0, 0, pageWidth, 108).fill(primaryDark);
      doc.rect(0, 108, pageWidth, 4).fill('#ca8a04');

      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#ffffff')
        .text('BFA APARTMENTS LIMITED', MARGIN_LEFT, 16, { width: 255 });

      doc
        .font('Helvetica')
        .fontSize(8.2)
        .fillColor('#cbd5e1')
        .text('Operations Ticketing & Executive Governance Memorandum', MARGIN_LEFT, 37, { width: 260 });

      const effectiveTemplate = templateType || (recipients.length > 1 ? 'MULTI_RECIPIENT_TEAM' : 'DIRECTIVE_PERSONAL');
      const bannerTitle = getTemplateLabel(effectiveTemplate, operation.target_audience_type);
      const memoRef = memo.memo_reference || operation.operation_code || 'MEMO-UNASSIGNED';
      const ticketRef = operation.ticket_reference || operation.operation_code || 'TKT-UNASSIGNED';

      doc
        .font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor('#fbbf24')
        .text(bannerTitle, 295, 18, { width: pageWidth - MARGIN_RIGHT - 295, align: 'right' });

      // Subtle divider separating top identity row from centered Memo / Ticket reference row
      doc
        .moveTo(MARGIN_LEFT, 54)
        .lineTo(pageWidth - MARGIN_RIGHT, 54)
        .lineWidth(0.6)
        .strokeColor('#334155')
        .stroke();

      doc
        .font('Helvetica-Bold')
        .fontSize(13)
        .fillColor('#ffffff')
        .text(`MEMO: ${memoRef}   |   TICKET: ${ticketRef}`, MARGIN_LEFT, 62, {
          width: contentWidth,
          align: 'center',
        });

      const verNum = memo.version_number || 1;
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor('#cbd5e1')
        .text(`Version v${verNum}   |   Issued: ${formatLagosDateTime(memo.created_at || operation.created_at)}`, MARGIN_LEFT, 82, {
          width: contentWidth,
          align: 'center',
        });

      resetCursor(124);

      // Metadata Summary Box — FROM & TO Only
      const issuerDisplay =
        memo.issuer_designation ||
        `${initiator?.name || 'Authorised Management'} (${initiator?.role || 'MANAGEMENT'})`;
      const recipientSummary =
        memo.recipient_summary ||
        (recipients.length > 0
          ? recipients.map((r) => `${r.user_name || r.name} (${r.role_at_time || r.role || 'Staff'})`).join(', ')
          : operation.current_responsible_group || operation.target_audience_type || 'Designated Personnel');

      const ackSlaDisplay = operation.acknowledgment_deadline_at
        ? `${formatLagosDateTime(operation.acknowledgment_deadline_at)} (${operation.acknowledgment_sla_hours || 12}h SLA)`
        : `${operation.acknowledgment_sla_hours || 12} hours from issuance`;

      const metaRows = [
        ['FROM:', issuerDisplay],
        ['TO:', recipientSummary],
      ];

      const colLabelX = MARGIN_LEFT + 12;
      const labelWidth = 46;
      const colValX = MARGIN_LEFT + 60;
      const valWidth = contentWidth - 72;

      const measuredRows = metaRows.map(([label, val]) => {
        doc.font('Helvetica-Bold').fontSize(9.2);
        const vh = doc.heightOfString(String(val), { width: valWidth });
        return { label, val: String(val), h: Math.max(20, vh + 8) };
      });

      const totalBoxHeight = measuredRows.reduce((s, r) => s + r.h, 12);
      ensureSpace(totalBoxHeight + 12);
      const boxTop = doc.y;

      doc.rect(MARGIN_LEFT, boxTop, contentWidth, totalBoxHeight).fill(lightSlateBg);
      doc.rect(MARGIN_LEFT, boxTop, contentWidth, totalBoxHeight).strokeColor(borderSlate).lineWidth(0.8).stroke();
      const priBadge = getPriorityColors(operation.priority);
      doc.rect(MARGIN_LEFT, boxTop, 4, totalBoxHeight).fill(priBadge.border);

      let metaY = boxTop + 7;
      measuredRows.forEach((row, idx) => {
        if (idx > 0) {
          doc
            .moveTo(MARGIN_LEFT + 10, metaY - 3)
            .lineTo(MARGIN_LEFT + contentWidth - 10, metaY - 3)
            .lineWidth(0.5)
            .strokeColor('#e2e8f0')
            .stroke();
        }
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryGray).text(row.label, colLabelX, metaY + 1, { width: labelWidth });
        doc.font('Helvetica-Bold').fontSize(9.2).fillColor(primaryDark).text(row.val, colValX, metaY, { width: valWidth });
        metaY += row.h;
      });

      resetCursor(boxTop + totalBoxHeight + 12);

      // Subject Line Banner
      const subjText = `SUBJECT: ${(memo.subject || operation.subject || operation.title || 'Operational Ticket Directive').toUpperCase()}`;
      doc.font('Helvetica-Bold').fontSize(9);
      const subjTextHeight = doc.heightOfString(subjText, { width: contentWidth - 18 });
      const subjBoxHeight = Math.max(24, subjTextHeight + 10);
      ensureSpace(subjBoxHeight + 12);

      const subjY = doc.y;
      doc.rect(MARGIN_LEFT, subjY, contentWidth, subjBoxHeight).fill('#e2e8f0');
      doc.font('Helvetica-Bold').fontSize(9).fillColor(primaryDark).text(subjText, MARGIN_LEFT + 9, subjY + 5, {
        width: contentWidth - 18,
      });
      resetCursor(subjY + subjBoxHeight + 12);

      // Cursor-Safe Section Renderer Helper
      const renderSection = (num, secTitle, secBody, options = {}) => {
        if (!secBody || !String(secBody).trim()) return;
        const cleanBody = String(secBody).trim();
        const heading = `${num}. ${secTitle.toUpperCase()}`;

        doc.font('Helvetica-Bold').fontSize(9.5);
        const headingH = doc.heightOfString(heading, { width: contentWidth });
        doc.font('Helvetica').fontSize(8.8);
        const sampleFirstBlockH = Math.min(48, doc.heightOfString(cleanBody, { width: contentWidth, lineGap: 2.5 }));
        ensureSpace(headingH + sampleFirstBlockH + 14);

        resetCursor();
        doc
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .fillColor(options.headingColor || brandAccent)
          .text(heading, MARGIN_LEFT, doc.y, { width: contentWidth });

        const lineY = doc.y + 2;
        doc
          .moveTo(MARGIN_LEFT, lineY)
          .lineTo(MARGIN_LEFT + Math.min(200, contentWidth), lineY)
          .strokeColor('#e2e8f0')
          .lineWidth(0.75)
          .stroke();

        resetCursor(lineY + 5);

        // Render paragraph-by-paragraph so long text paginates cleanly above footer
        const paragraphs = cleanBody.split(/\r?\n\r?\n/);
        paragraphs.forEach((para) => {
          const trimmedPara = para.trim();
          if (!trimmedPara) return;
          doc.font('Helvetica').fontSize(8.8);
          const paraH = doc.heightOfString(trimmedPara, { width: contentWidth, lineGap: 2.5 });

          // If single paragraph fits on current page after break, break cleanly; if taller than a page, let PDFKit stream line by line while resetting x
          if (paraH < pageBottomSafe() - PAGE_TOP - 20 && doc.y + paraH > pageBottomSafe()) {
            addNewPage();
          } else if (doc.y + 18 > pageBottomSafe()) {
            addNewPage();
          }

          resetCursor();
          doc.font('Helvetica').fontSize(8.8).fillColor(primaryDark).text(trimmedPara, MARGIN_LEFT, doc.y, {
            align: 'left',
            lineGap: 2.5,
            width: contentWidth,
          });
          resetCursor(doc.y + 4);
        });

        resetCursor(doc.y + 6);
      };

      // Amendment Reason Notice Box if OFFICIAL_AMENDMENT or memo amendment_reason exists
      if (memo.amendment_reason) {
        const amendHeading = `OFFICIAL AMENDMENT NOTICE (v${verNum})`;
        const amendBody = String(memo.amendment_reason).trim();
        doc.font('Helvetica').fontSize(8.5);
        const amendH = 26 + doc.heightOfString(amendBody, { width: contentWidth - 20 });
        ensureSpace(amendH + 12);
        const ay = doc.y;
        doc.rect(MARGIN_LEFT, ay, contentWidth, amendH).fill('#fffbeb');
        doc.rect(MARGIN_LEFT, ay, contentWidth, amendH).strokeColor('#f59e0b').lineWidth(0.8).stroke();
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#b45309').text(amendHeading, MARGIN_LEFT + 10, ay + 6, {
          width: contentWidth - 20,
        });
        doc.font('Helvetica').fontSize(8.5).fillColor(primaryDark).text(amendBody, MARGIN_LEFT + 10, ay + 19, {
          width: contentWidth - 20,
        });
        resetCursor(ay + amendH + 12);
      }

      // Main Sections 1..3
      renderSection('1', 'Executive Rationale & Operational Purpose', memo.purpose || operation.purpose);
      renderSection(
        '2',
        'Specific Operational Instructions & Mandates',
        memo.operational_instructions || operation.operational_instructions
      );
      renderSection(
        '3',
        'Expected Outcome, Deliverables & Responsibility Definition',
        [
          memo.expected_outcome || operation.expected_outcome,
          memo.responsibility_definition || operation.responsibility_definition,
        ]
          .filter(Boolean)
          .join('\n\n')
      );

      // Recipients & Acknowledgement Ledger Table (always rendered cleanly with actual DB data)
      const recHeading = 'RECIPIENT ACCOUNTABILITY & ACKNOWLEDGEMENT LEDGER';
      ensureSpace(58);
      resetCursor();
      doc.font('Helvetica-Bold').fontSize(9).fillColor(primaryDark).text(recHeading, MARGIN_LEFT, doc.y, {
        width: contentWidth,
      });
      resetCursor(doc.y + 4);

      const drawRecTableHeader = (yPos) => {
        doc.rect(MARGIN_LEFT, yPos, contentWidth, 20).fill(primaryDark);
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff');
        doc.text('PERSONNEL / RECIPIENT', MARGIN_LEFT + 8, yPos + 6, { width: 170 });
        doc.text('DESIGNATION / ROLE', MARGIN_LEFT + 184, yPos + 6, { width: 120 });
        doc.text('ACK STATUS', MARGIN_LEFT + 310, yPos + 6, { width: 100 });
        doc.text('TIMESTAMP (WAT)', MARGIN_LEFT + 414, yPos + 6, { width: 95 });
        return yPos + 20;
      };

      let recRowY = drawRecTableHeader(doc.y);

      const cleanRecipients = (recipients || []).map((r) => ({
        name: r.user_name || r.name || 'Designated Staff',
        role: (r.role_at_time || r.role || 'STAFF').replace(/_/g, ' '),
        status: r.reassigned_out
          ? 'REASSIGNED OUT'
          : r.acknowledged_at
            ? `ACKNOWLEDGED (${(r.acceptance_status || 'ACCEPTED').replace(/_/g, ' ')})`
            : (r.acceptance_status || r.status || 'PENDING').replace(/_/g, ' '),
        ts: r.acknowledged_at ? formatLagosDateTime(r.acknowledged_at) : 'Awaiting Ack',
      }));

      if (cleanRecipients.length === 0) {
        doc.rect(MARGIN_LEFT, recRowY, contentWidth, 20).fill(lightSlateBg);
        doc.font('Helvetica').fontSize(8).fillColor(secondaryGray).text(
          `Audience Scope: ${recipientSummary} (individual recipient acknowledgement records populate upon dispatch/claim)`,
          MARGIN_LEFT + 8,
          recRowY + 5,
          { width: contentWidth - 16 }
        );
        recRowY += 22;
      } else {
        cleanRecipients.forEach((r, idx) => {
          doc.font('Helvetica').fontSize(7.8);
          const h1 = doc.heightOfString(r.name, { width: 170 });
          const h2 = doc.heightOfString(r.role, { width: 120 });
          const h3 = doc.heightOfString(r.status, { width: 100 });
          const h4 = doc.heightOfString(r.ts, { width: 95 });
          const rowH = Math.max(19, Math.ceil(Math.max(h1, h2, h3, h4)) + 7);

          if (recRowY + rowH > pageBottomSafe()) {
            addNewPage();
            recRowY = drawRecTableHeader(doc.y);
          }

          if (idx % 2 === 1) {
            doc.rect(MARGIN_LEFT, recRowY, contentWidth, rowH).fill('#f8fafc');
          }
          doc
            .moveTo(MARGIN_LEFT, recRowY + rowH)
            .lineTo(MARGIN_LEFT + contentWidth, recRowY + rowH)
            .strokeColor('#e2e8f0')
            .lineWidth(0.5)
            .stroke();

          doc.font('Helvetica-Bold').fontSize(7.8).fillColor(primaryDark).text(r.name, MARGIN_LEFT + 8, recRowY + 4, { width: 170 });
          doc.font('Helvetica').fontSize(7.5).fillColor(secondaryGray).text(r.role, MARGIN_LEFT + 184, recRowY + 4, { width: 120 });
          doc
            .font('Helvetica-Bold')
            .fontSize(7.3)
            .fillColor(r.status.startsWith('ACKNOWLEDGED') ? '#047857' : '#b45309')
            .text(r.status, MARGIN_LEFT + 310, recRowY + 4, { width: 100 });
          doc.font('Helvetica').fontSize(7.3).fillColor(secondaryGray).text(r.ts, MARGIN_LEFT + 414, recRowY + 4, { width: 95 });

          recRowY += rowH;
        });
      }

      resetCursor(recRowY + 14);

      // Section 4: Inter-Departmental Handoff & Escalation Protocols
      renderSection(
        '4',
        'Inter-Departmental Handoff & Escalation Protocols',
        memo.reporting_requirements ||
          operation.reporting_requirements ||
          `All updates, clarifications, deadline extension requests, and blockers must be logged directly inside Ticket ${ticketRef}. Unacknowledged or overdue tickets trigger automated reminders and escalate strictly through the supervisory hierarchy.`
      );

      // Section 5: Compliance & Sign-Off Mandate
      const complianceBody =
        `Official governance directive issued under BFA Apartments Management System protocol. Acknowledgment SLA (${operation.acknowledgment_sla_hours || 12}h for ${(operation.priority || 'NORMAL').toUpperCase()} priority) expires ${ackSlaDisplay}. Timestamps are recorded canonically in Africa/Lagos (WAT).`;
      doc.font('Helvetica').fontSize(8.2);
      const compHeight = 28 + doc.heightOfString(complianceBody, { width: contentWidth - 20 });
      ensureSpace(compHeight + 12);

      const signY = doc.y;
      doc.rect(MARGIN_LEFT, signY, contentWidth, compHeight).fill('#fef2f2');
      doc.rect(MARGIN_LEFT, signY, 3, compHeight).fill('#dc2626');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#991b1b').text(
        '5. MANDATORY COMPLIANCE & SLA ACCOUNTABILITY NOTICE',
        MARGIN_LEFT + 10,
        signY + 6,
        { width: contentWidth - 20 }
      );
      doc.font('Helvetica').fontSize(8).fillColor('#7f1d1d').text(complianceBody, MARGIN_LEFT + 10, signY + 19, {
        width: contentWidth - 20,
      });

      resetCursor(signY + compHeight + 10);

      // Stamp global footer across every buffered page cleanly
      const range = doc.bufferedPageRange();
      const totalPages = range.count;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(range.start + i);
        drawPageFooter(doc, memoRef, ticketRef, i + 1, totalPages);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateOperationsMemoPdfBuffer,
  formatLagosDateTime,
};
