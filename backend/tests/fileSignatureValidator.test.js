const request = require('supertest');
const app = require('../src/app');
const {
  validateImageUpload,
  validateDocumentOrImageUpload,
} = require('../src/utils/fileSignatureValidator');
const { generateOperationsMemoPdfBuffer } = require('../src/modules/workforce/memoPdfGenerator');

describe('Upload Security Hardening (CVE-2026-125396 Upload2Shell Defense) & Memo Layout', () => {
  test('blocks PostScript (%!PS-Adobe) payload disguised as image/jpeg in validateImageUpload', () => {
    const fakeJpeg = `data:image/jpeg;base64,${Buffer.from('%!PS-Adobe-3.0\n/showpage load\n').toString('base64')}`;
    expect(() =>
      validateImageUpload({ fileData: fakeJpeg, fileType: 'image/jpeg', fileName: 'receipt.jpg' })
    ).toThrow(/PostScript|Ghostscript/i);
  });

  test('blocks binary DOS EPS header even with PNG mime claim', () => {
    const dosEps = Buffer.concat([Buffer.from([0xc5, 0xd0, 0xd3, 0xc6]), Buffer.from('FAKE_EPS')]);
    expect(() =>
      validateImageUpload({
        fileData: `data:image/png;base64,${dosEps.toString('base64')}`,
        fileType: 'image/png',
        fileName: 'receipt.png',
      })
    ).toThrow(/EPS|PostScript/i);
  });

  test('blocks SVG and HTML XSS uploads across both image and document validators', () => {
    const svgB64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    expect(() =>
      validateImageUpload({ fileData: svgB64, fileType: 'image/svg+xml', fileName: 'xss.svg' })
    ).toThrow(/blocked/i);
    expect(() =>
      validateDocumentOrImageUpload({ fileData: svgB64, fileType: 'text/plain', fileName: 'note.txt' })
    ).toThrow(/SVG|HTML/i);
  });

  test('rejects MIME/magic mismatch (PNG bytes claimed as JPEG)', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    expect(() =>
      validateImageUpload({
        fileData: `data:image/jpeg;base64,${pngHeader.toString('base64')}`,
        fileType: 'image/jpeg',
        fileName: 'mismatch.jpg',
      })
    ).toThrow(/signature|match/i);
  });

  test('accepts authentic PNG, JPEG, WebP magic headers and safe PDF without PostScript/Launch actions', () => {
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    const validWebp = Buffer.concat([Buffer.from('RIFF\x20\x00\x00\x00WEBP'), Buffer.from('VP8 ')]);
    const validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF');

    expect(
      validateImageUpload({
        fileData: `data:image/png;base64,${validPng.toString('base64')}`,
        fileType: 'image/png',
      }).ext
    ).toBe('png');

    expect(
      validateImageUpload({
        fileData: `data:image/jpeg;base64,${validJpeg.toString('base64')}`,
        fileType: 'image/jpeg',
      }).ext
    ).toBe('jpg');

    expect(
      validateImageUpload({
        fileData: `data:image/webp;base64,${validWebp.toString('base64')}`,
        fileType: 'image/webp',
      }).ext
    ).toBe('webp');

    expect(
      validateDocumentOrImageUpload({
        fileData: validPdf.toString('base64'),
        fileType: 'application/pdf',
        fileName: 'report.pdf',
      }).mimeType
    ).toBe('application/pdf');
  });

  test('HTTP POST /api/v1/public/upload-proof rejects disguised PostScript (%!PS) payload with 4xx', async () => {
    const res = await request(app)
      .post('/api/v1/public/upload-proof')
      .send({
        fileData: `data:image/jpeg;base64,${Buffer.from('%!PS-Adobe-3.0\nshowpage').toString('base64')}`,
        fileName: 'exploit.jpg',
        fileType: 'image/jpeg',
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body.success).toBe(false);
  });

  test('Memo PDF contains valid %PDF header cleanly with FROM / TO summary layout', async () => {
    const pdfBuf = await generateOperationsMemoPdfBuffer({
      templateType: 'MULTI_RECIPIENT_TEAM',
      operation: {
        operation_code: 'OPS-202611-0009',
        ticket_reference: 'BFA-TKT-202611-0009',
        title: 'Lobby Lighting Audit',
        priority: 'HIGH',
        status: 'OPEN',
        category: 'MAINTENANCE',
        acknowledgment_sla_hours: 6,
        created_at: new Date('2026-11-25T10:00:00Z'),
      },
      memo: {
        memo_reference: 'MEMO-202611-0009',
        version_number: 1,
        subject: 'Lobby Audit',
        summary: 'Verify emergency ballast units across Wing B.',
        created_at: new Date('2026-11-25T10:00:00Z'),
      },
      initiator: { name: 'Chief Emeka BFA', role: 'OWNER' },
      recipients: [{ user_name: 'Marcus Vance', role_at_time: 'OPERATIONS_MANAGER' }],
    });

    expect(Buffer.isBuffer(pdfBuf)).toBe(true);
    expect(pdfBuf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(pdfBuf.length).toBeGreaterThan(1500);
  });
});
