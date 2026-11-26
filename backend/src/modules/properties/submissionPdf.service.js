const PDFDocument = require('pdfkit');
const pool = require('../../db/pool');
const { NotFoundError, ForbiddenError } = require('../../core/errors/apiError');

class SubmissionPdfService {
  /**
   * Build structured submission document payload (used by both JSON viewer & PDF generator)
   */
  static async buildDocumentData(submissionId, user = null) {
    const rows = await pool.query(
      `SELECT 
        s.*,
        p.name AS property_name,
        p.code AS property_code,
        p.address AS property_address,
        p.location AS property_location,
        p.district AS property_district,
        p.city AS property_city,
        p.state AS property_state,
        p.country AS property_country,
        p.category AS property_category,
        p.description AS property_description,
        p.environment_description AS property_environment,
        p.amenities AS property_amenities_json,
        p.technical_specs AS property_technical_specs,
        u.name AS submitted_by_name,
        u.email AS submitted_by_email,
        owner_u.name AS owner_reviewed_by_name,
        ops_u.name AS ops_reviewed_by_name,
        pub_u.name AS published_by_name
      FROM property_submissions s
      JOIN properties p ON s.property_id = p.id
      JOIN users u ON s.submitted_by_id = u.id
      LEFT JOIN users owner_u ON s.owner_reviewed_by_id = owner_u.id
      LEFT JOIN users ops_u ON s.ops_reviewed_by_id = ops_u.id
      LEFT JOIN users pub_u ON s.published_by_id = pub_u.id
      WHERE s.id = ? LIMIT 1`,
      [submissionId]
    );

    if (rows.length === 0) {
      throw new NotFoundError(`Submission #${submissionId} not found.`);
    }

    const sub = rows[0];

    // Enforce property isolation for property-scoped staff
    if (
      user &&
      ['OPERATIONS_MANAGER', 'MANAGER', 'RECEPTIONIST', 'STAFF'].includes(String(user.role || '').toUpperCase()) &&
      user.propertyId &&
      parseInt(user.propertyId, 10) !== parseInt(sub.property_id, 10)
    ) {
      throw new ForbiddenError('You are not authorized to access submission documents for another property.');
    }

    const snapshot = typeof sub.content_snapshot === 'string'
      ? (() => { try { return JSON.parse(sub.content_snapshot || '{}'); } catch { return {}; } })()
      : (sub.content_snapshot || {});

    let apartment = null;
    if (sub.apartment_id || sub.entity_type === 'APARTMENT') {
      const aptId = sub.apartment_id || snapshot.id;
      if (aptId) {
        const aptRows = await pool.query('SELECT * FROM apartments WHERE id = ? LIMIT 1', [aptId]);
        apartment = aptRows[0] || null;
      }
    }

    // Fetch property & apartment media (preferring linked submission media or entity media)
    const entityType = sub.entity_type === 'APARTMENT' && (sub.apartment_id || apartment?.id) ? 'APARTMENT' : 'PROPERTY';
    const entityId = entityType === 'APARTMENT' ? (sub.apartment_id || apartment?.id) : sub.property_id;

    let media = await pool.query(
      'SELECT id, entity_type, entity_id, file_url, mime_type, caption, is_primary, display_order, file_data FROM media_assets WHERE (submission_id = ? OR (entity_type = ? AND entity_id = ?)) ORDER BY is_primary DESC, display_order ASC, id ASC',
      [submissionId, entityType, entityId]
    );

    const comments = await pool.query(
      `SELECT c.*, u.name AS author_name, u.role AS author_role
       FROM property_review_comments c
       JOIN users u ON c.author_id = u.id
       WHERE c.submission_id = ?
       ORDER BY c.id ASC`,
      [submissionId]
    );

    const propAmenities = await pool.query(
      'SELECT name, description FROM property_amenities WHERE property_id = ? ORDER BY display_order ASC, id ASC',
      [sub.property_id]
    );

    let aptAmenities = [];
    if (apartment?.id) {
      aptAmenities = await pool.query(
        'SELECT name, description FROM apartment_amenities WHERE apartment_id = ? ORDER BY id ASC',
        [apartment.id]
      );
    }

    return {
      submission: {
        id: sub.id,
        submission_code: sub.submission_code,
        entity_type: sub.entity_type || (sub.apartment_id ? 'APARTMENT' : 'PROPERTY'),
        submission_type: sub.submission_type,
        version_number: sub.version_number,
        document_version: sub.document_version || sub.version_number || 1,
        status: sub.status,
        submitted_by_name: sub.submitted_by_name,
        submitted_by_email: sub.submitted_by_email,
        submitted_at: sub.submitted_at,
        owner_review_status: sub.owner_review_status || 'PENDING',
        owner_reviewed_by_name: sub.owner_reviewed_by_name,
        owner_reviewed_at: sub.owner_reviewed_at,
        owner_decision_notes: sub.owner_decision_notes,
        ops_review_status: sub.ops_review_status || 'PENDING',
        ops_reviewed_by_name: sub.ops_reviewed_by_name,
        ops_reviewed_at: sub.ops_reviewed_at,
        ops_decision_notes: sub.ops_decision_notes,
        published_by_name: sub.published_by_name,
        published_at: sub.published_at,
      },
      property: {
        id: sub.property_id,
        name: snapshot.property_name || (entityType === 'PROPERTY' && snapshot.name) || sub.property_name,
        code: sub.property_code,
        address: (entityType === 'PROPERTY' && snapshot.address) || sub.property_address,
        location: (entityType === 'PROPERTY' && snapshot.location) || sub.property_location,
        district: (entityType === 'PROPERTY' && snapshot.district) || sub.property_district,
        city: (entityType === 'PROPERTY' && snapshot.city) || sub.property_city,
        state: (entityType === 'PROPERTY' && snapshot.state) || sub.property_state,
        country: (entityType === 'PROPERTY' && snapshot.country) || sub.property_country,
        category: (entityType === 'PROPERTY' && snapshot.category) || sub.property_category,
        description: (entityType === 'PROPERTY' && snapshot.description) || sub.property_description,
        amenities: propAmenities,
        technical_specs: (entityType === 'PROPERTY' && snapshot.technical_specs) || sub.property_technical_specs || {},
      },
      apartment: apartment || (entityType === 'APARTMENT' ? snapshot : null)
        ? {
            id: apartment?.id || snapshot.id,
            unit_number: snapshot.unit_number || apartment?.unit_number,
            unit_name: snapshot.unit_name || apartment?.unit_name,
            unit_type: snapshot.unit_type || apartment?.unit_type,
            description: snapshot.description || apartment?.description,
            bedroom_count: snapshot.bedroom_count || apartment?.bedroom_count || 1,
            bathroom_count: snapshot.bathroom_count || apartment?.bathroom_count || 1,
            capacity: snapshot.capacity || apartment?.capacity || 2,
            entered_rate_per_night: snapshot.entered_rate_per_night ?? snapshot.rate_per_night ?? apartment?.entered_rate_per_night ?? apartment?.rate_per_night,
            approved_rate_per_night: apartment?.approved_rate_per_night,
            rate_type: snapshot.rate_type || apartment?.rate_type || 'PER_NIGHT',
            price_effective_date: snapshot.price_effective_date || apartment?.price_effective_date,
            pricing_status: apartment?.pricing_status || 'PENDING_APPROVAL',
            amenities: aptAmenities,
            technical_specs: snapshot.technical_specs || apartment?.technical_specs || {},
          }
        : null,
      media,
      comments,
      snapshot,
    };
  }

  /**
   * Generate a branded BFA Apartments PDF Buffer for a submission
   */
  static async generatePdfBuffer(submissionId, user = null) {
    const data = await this.buildDocumentData(submissionId, user);
    const { submission, property, apartment, media, comments } = data;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 45, size: 'A4' });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : 'Pending');
      const fmtNaira = (val) => `NGN ${Number(val || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Header Banner
      doc.rect(0, 0, doc.page.width, 82).fill('#0b1b15');
      doc.fillColor('#d4af37').fontSize(10).font('Helvetica-Bold').text('BFA APARTMENTS MANAGEMENT SYSTEM', 45, 22);
      doc.fillColor('#ffffff').fontSize(18).text(
        submission.entity_type === 'APARTMENT'
          ? 'APARTMENT APPROVAL SUBMISSION DOCUMENT'
          : 'PROPERTY APPROVAL SUBMISSION DOCUMENT',
        45,
        38
      );
      doc.fillColor('#cbd5e1').fontSize(9).font('Helvetica').text(
        `Ref: ${submission.submission_code}  |  Version: v${submission.document_version}  |  Status: ${submission.status}`,
        45,
        62
      );

      doc.y = 100;
      doc.fillColor('#0f172a');

      const sectionTitle = (title) => {
        if (doc.y > 700) doc.addPage();
        doc.moveDown(0.5);
        doc.fillColor('#0b1b15').fontSize(12).font('Helvetica-Bold').text(title);
        doc.moveTo(45, doc.y + 2).lineTo(550, doc.y + 2).strokeColor('#d4af37').lineWidth(1).stroke();
        doc.moveDown(0.45);
        doc.fillColor('#1e293b').fontSize(9.5).font('Helvetica');
      };

      const kv = (label, value) => {
        if (doc.y > 740) doc.addPage();
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(value != null && String(value).trim() !== '' ? String(value) : '—');
      };

      // A. Submission Information
      sectionTitle('A. SUBMISSION INFORMATION');
      kv('Document Title', `${submission.entity_type === 'APARTMENT' ? 'Apartment' : 'Property'} Approval Review — ${submission.submission_code}`);
      kv('Submission Type', submission.submission_type);
      kv('Submission Reference', `#${submission.id} (${submission.submission_code})`);
      kv('Submitted By', `${submission.submitted_by_name} (${submission.submitted_by_email || ''})`);
      kv('Submission Date', fmtDate(submission.submitted_at));
      kv('Current Approval Status', submission.status);

      // B. Property Information
      sectionTitle('B. PROPERTY INFORMATION');
      kv('Property Name', `${property.name} (${property.code || ''})`);
      kv('Category', property.category || 'SERVICED_APARTMENTS');
      kv('Address & Location', [property.address, property.location, property.district, property.city, property.state, property.country].filter(Boolean).join(', '));
      kv('Description', property.description);
      if (Array.isArray(property.amenities) && property.amenities.length > 0) {
        kv('Property Amenities', property.amenities.map((a) => a.name).join(', '));
      }
      if (property.technical_specs && typeof property.technical_specs === 'object') {
        const tsEntries = Object.entries(property.technical_specs).filter(([k, v]) => k !== 'custom' && v);
        tsEntries.forEach(([k, v]) => kv(`Tech Spec (${k.replace(/_/g, ' ')})`, v));
      }

      // C. Apartment Information (where applicable)
      if (apartment) {
        sectionTitle('C. APARTMENT INFORMATION');
        kv('Parent Property', property.name);
        kv('Apartment Name / Number', `${apartment.unit_name || ''} (#${apartment.unit_number || ''})`);
        kv('Apartment Type', apartment.unit_type);
        kv('Capacity & Rooms', `${apartment.capacity} Guests | ${apartment.bedroom_count} Bedroom(s) | ${apartment.bathroom_count} Bathroom(s)`);
        kv('Submitted Booking Price', `${fmtNaira(apartment.entered_rate_per_night)} (${apartment.rate_type || 'PER_NIGHT'})`);
        kv('Pricing Approval Status', apartment.pricing_status || 'PENDING_APPROVAL');
        if (apartment.approved_rate_per_night != null) {
          kv('Last Approved Public Price', fmtNaira(apartment.approved_rate_per_night));
        }
        if (apartment.price_effective_date) {
          kv('Price Effective Date', String(apartment.price_effective_date).slice(0, 10));
        }
        kv('Description', apartment.description);
        if (Array.isArray(apartment.amenities) && apartment.amenities.length > 0) {
          kv('Apartment Amenities', apartment.amenities.map((a) => a.name).join(', '));
        }
        if (apartment.technical_specs && typeof apartment.technical_specs === 'object') {
          Object.entries(apartment.technical_specs)
            .filter(([k, v]) => k !== 'custom' && v)
            .forEach(([k, v]) => kv(`Unit Spec (${k.replace(/_/g, ' ')})`, v));
        }
      }

      // D. Photographs
      sectionTitle('D. PHOTOGRAPHS');
      const photoRows = media.filter((m) => m.file_data);
      if (photoRows.length === 0) {
        doc.text('No photographs uploaded for this submission yet.');
      } else {
        photoRows.slice(0, 5).forEach((m, idx) => {
          if (doc.y > 570) doc.addPage();
          const label = m.is_primary ? 'MAIN PHOTOGRAPH' : `Gallery Photo #${idx + 1}`;
          doc.font('Helvetica-Bold').text(`${label}: ${m.caption || 'Untitled'}`);
          try {
            const imgBuf = Buffer.isBuffer(m.file_data) ? m.file_data : Buffer.from(m.file_data);
            doc.image(imgBuf, { fit: [240, 145] });
            doc.moveDown(0.5);
          } catch {
            doc.font('Helvetica').text('[Image preview unavailable in PDF; stored in portal]');
          }
        });
      }

      // E. Approval Section
      sectionTitle('E. APPROVAL & AUDIT SIGN-OFF');
      kv('1. Owner Approval Status', submission.owner_review_status);
      kv('Owner Reviewer & Timestamp', `${submission.owner_reviewed_by_name || 'Pending'} — ${fmtDate(submission.owner_reviewed_at)}`);
      if (submission.owner_decision_notes) kv('Owner Notes', submission.owner_decision_notes);

      doc.moveDown(0.25);
      kv('2. Operations Manager Approval Status', submission.ops_review_status);
      kv('Operations Manager Reviewer & Timestamp', `${submission.ops_reviewed_by_name || 'Pending'} — ${fmtDate(submission.ops_reviewed_at)}`);
      if (submission.ops_decision_notes) kv('Operations Manager Notes', submission.ops_decision_notes);

      const outstanding = [];
      if (submission.owner_review_status !== 'APPROVED') outstanding.push('Owner Approval');
      if (submission.ops_review_status !== 'APPROVED') outstanding.push('Operations Manager Approval');
      if (submission.status === 'APPROVED') outstanding.push('Authorized Publication');
      kv('Outstanding Actions', outstanding.length > 0 ? outstanding.join(' -> ') : 'Fully Approved & Published');

      if (comments.length > 0) {
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').text('Review Comments History:');
        comments.forEach((c) => {
          doc.font('Helvetica').text(`• [${fmtDate(c.created_at)}] ${c.author_name} (${c.author_role}): ${c.content}`);
        });
      }

      doc.end();
    });
  }
}

module.exports = SubmissionPdfService;
