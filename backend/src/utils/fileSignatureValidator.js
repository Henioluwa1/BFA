const path = require('path');
const { ValidationError } = require('../core/errors/apiError');

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const BLOCKED_EXTENSIONS = new Set([
  '.ps',
  '.eps',
  '.epsf',
  '.epsi',
  '.ai',
  '.svg',
  '.svgz',
  '.html',
  '.htm',
  '.xhtml',
  '.exe',
  '.dll',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.vbs',
  '.js',
  '.mjs',
  '.php',
]);

const BLOCKED_MIMES = new Set([
  'application/postscript',
  'application/eps',
  'application/x-eps',
  'image/eps',
  'image/x-eps',
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'application/x-msdownload',
  'application/x-sh',
  'application/javascript',
  'text/javascript',
]);

/**
 * Normalize raw base64 or data URI payload into Buffer + declared MIME type.
 */
function parseBase64Payload(rawData, fallbackMime = 'application/octet-stream', label = 'File') {
  if (Buffer.isBuffer(rawData)) {
    if (rawData.length === 0) {
      throw new ValidationError(`${label} payload is empty.`);
    }
    return { buffer: rawData, mimeType: String(fallbackMime || 'application/octet-stream').toLowerCase() };
  }

  if (typeof rawData !== 'string' || !rawData.trim()) {
    throw new ValidationError(`${label} data is required (base64 payload).`);
  }

  let mimeType = String(fallbackMime || 'application/octet-stream').toLowerCase();
  let base64Content = rawData.trim();

  if (base64Content.startsWith('data:')) {
    const match = base64Content.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9.+_-]+)(?:;[^,]*)?;base64,(.+)$/s);
    if (!match) {
      throw new ValidationError(`${label} payload contains a malformed data URI.`);
    }
    mimeType = match[1].toLowerCase();
    base64Content = match[2].replace(/\s+/g, '');
  } else {
    base64Content = base64Content.replace(/\s+/g, '');
  }

  if (!base64Content || !/^[A-Za-z0-9+/=]+$/.test(base64Content)) {
    throw new ValidationError(`${label} contains invalid base64 content.`);
  }

  const buffer = Buffer.from(base64Content, 'base64');
  if (!buffer || buffer.length === 0) {
    throw new ValidationError(`${label} decoded to an empty buffer.`);
  }

  return { buffer, mimeType };
}

/**
 * Detect Ghostscript/Upload2Shell (CVE-2026-125396) PostScript/EPS, polyglot, SVG/HTML, and executable headers.
 */
function assertNoHazardousSignature(buffer, mimeType = '', fileName = '', label = 'File') {
  const lowerMime = String(mimeType || '').toLowerCase();
  const ext = path.extname(String(fileName || '')).toLowerCase();

  if (BLOCKED_MIMES.has(lowerMime) || BLOCKED_EXTENSIONS.has(ext)) {
    throw new ValidationError(
      `${label} format is blocked by security policy (PostScript, EPS, SVG, HTML, and executable formats are prohibited).`
    );
  }

  if (!Buffer.isBuffer(buffer) || buffer.length < 2) {
    throw new ValidationError(`${label} binary payload is corrupted or too short.`);
  }

  // DOS EPS binary header (C5 D0 D3 C6)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xc5 &&
    buffer[1] === 0xd0 &&
    buffer[2] === 0xd3 &&
    buffer[3] === 0xc6
  ) {
    throw new ValidationError(`${label} rejected: Binary EPS / PostScript header detected.`);
  }

  // Windows PE (MZ) or Linux ELF executables
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    throw new ValidationError(`${label} rejected: Windows PE executable signature is not permitted.`);
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x7f &&
    buffer[1] === 0x45 &&
    buffer[2] === 0x4c &&
    buffer[3] === 0x46
  ) {
    throw new ValidationError(`${label} rejected: ELF binary executable signature is not permitted.`);
  }

  // Strip optional UTF-8 BOM and leading ASCII whitespace for text/PostScript signature inspection
  const headSlice = buffer.subarray(0, Math.min(buffer.length, 4096));
  const headText = headSlice.toString('latin1');
  const trimmedHead = headText.replace(/^\xEF\xBB\xBF/, '').replace(/^[\x00-\x20]+/, '');
  const trimmedLower = trimmedHead.toLowerCase();

  if (
    trimmedHead.startsWith('%!PS') ||
    trimmedHead.startsWith('\x1b%-12345X') ||
    /@PJL\s+ENTER\s+LANGUAGE/i.test(headText) ||
    /%!PS-Adobe/i.test(headText)
  ) {
    throw new ValidationError(
      `${label} rejected: PostScript / Ghostscript instruction header (%!PS) detected and blocked.`
    );
  }

  if (trimmedHead.startsWith('#!')) {
    throw new ValidationError(`${label} rejected: Shell script shebang header is not permitted.`);
  }

  if (
    trimmedLower.startsWith('<svg') ||
    trimmedLower.startsWith('<html') ||
    trimmedLower.startsWith('<!doctype html') ||
    trimmedLower.startsWith('<script') ||
    (trimmedLower.startsWith('<?xml') && trimmedLower.includes('<svg'))
  ) {
    throw new ValidationError(`${label} rejected: SVG/HTML active markup signatures are blocked.`);
  }
}

/**
 * Sniff canonical raster image format via magic bytes (JPEG, PNG, WebP).
 */
function sniffRasterImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', ext: 'png' };
  }

  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', ext: 'webp' };
  }

  return null;
}

/**
 * Strictly validate an uploaded raster image (JPEG/PNG/WebP only) using size + blocklist + magic bytes.
 */
function validateImageUpload({
  fileData,
  fileType = 'image/jpeg',
  fileName = '',
  maxSizeBytes = 5 * 1024 * 1024,
  label = 'Image upload',
}) {
  const { buffer, mimeType } = parseBase64Payload(fileData, fileType, label);

  if (buffer.length > maxSizeBytes) {
    throw new ValidationError(
      `${label} exceeds ${(maxSizeBytes / (1024 * 1024)).toFixed(0)} MB limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`
    );
  }

  assertNoHazardousSignature(buffer, mimeType, fileName, label);

  const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  if (!ALLOWED_IMAGE_MIMES.includes(mimeType)) {
    throw new ValidationError(`Invalid file type '${mimeType}'. Only JPEG, PNG, and WebP images are allowed.`);
  }

  const detected = sniffRasterImage(buffer);
  if (!detected) {
    throw new ValidationError(
      `${label} file signature does not match valid JPEG, PNG, or WebP image bytes.`
    );
  }

  if (detected.mimeType !== normalizedMime) {
    throw new ValidationError(
      `${label} MIME type (${mimeType}) does not match actual binary signature (${detected.mimeType}).`
    );
  }

  return {
    buffer,
    mimeType: detected.mimeType,
    ext: detected.ext,
  };
}

/**
 * Validate general operational evidence or staff chat attachment (raster images, hardened PDFs, text/office docs).
 */
function validateDocumentOrImageUpload({
  fileData,
  fileType = 'application/octet-stream',
  fileName = '',
  maxSizeBytes = 10 * 1024 * 1024,
  label = 'Attachment',
}) {
  const { buffer, mimeType } = parseBase64Payload(fileData, fileType, label);

  if (buffer.length > maxSizeBytes) {
    throw new ValidationError(
      `${label} exceeds ${(maxSizeBytes / (1024 * 1024)).toFixed(0)} MB limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`
    );
  }

  assertNoHazardousSignature(buffer, mimeType, fileName, label);

  // Check if declared or named as raster image -> require matching image magic bytes
  const ext = path.extname(String(fileName || '')).toLowerCase();
  if (ALLOWED_IMAGE_MIMES.includes(mimeType) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    const detected = sniffRasterImage(buffer);
    if (!detected) {
      throw new ValidationError(
        `${label} claims to be an image (${mimeType || ext}) but failed magic-byte image signature inspection.`
      );
    }
    return { buffer, mimeType: detected.mimeType, ext: detected.ext };
  }

  // Check if declared or named as PDF -> enforce genuine %PDF- signature & reject active launch/PS/JS payloads
  if (mimeType === 'application/pdf' || ext === '.pdf') {
    const head = buffer.subarray(0, 16).toString('latin1').replace(/^[\x00-\x20]+/, '');
    if (!head.startsWith('%PDF-')) {
      throw new ValidationError(`${label} rejected: Claimed PDF lacks a valid %PDF- file header.`);
    }
    const sample = buffer.toString('latin1');
    if (/%!PS-Adobe/i.test(sample) || /\/Launch\b/i.test(sample)) {
      throw new ValidationError(
        `${label} rejected: PDF contains prohibited PostScript or Launch actions.`
      );
    }
    return { buffer, mimeType: 'application/pdf', ext: 'pdf' };
  }

  // Allowlist safe Office / text formats for non-image/non-PDF attachments
  const safeDocMimes = new Set([
    'text/plain',
    'text/csv',
    'application/csv',
    'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
  ]);

  if (!safeDocMimes.has(mimeType)) {
    throw new ValidationError(
      `${label} MIME type '${mimeType}' is not permitted for operational attachments.`
    );
  }

  return { buffer, mimeType, ext: ext ? ext.slice(1) : 'bin' };
}

module.exports = {
  ALLOWED_IMAGE_MIMES,
  parseBase64Payload,
  assertNoHazardousSignature,
  sniffRasterImage,
  validateImageUpload,
  validateDocumentOrImageUpload,
};
