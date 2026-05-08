const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const {
  addBusinessDocument,
  listBusinessDocuments,
  getBusinessDocument,
  deleteBusinessDocument,
} = require('./db');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const BUSINESS_DOCS_DIR = path.join(UPLOADS_ROOT, 'business');
const CUSTOMER_UPLOADS_DIR = path.join(UPLOADS_ROOT, 'customer');
const PUBLIC_UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
const BUSINESS_LOGOS_DIR = path.join(PUBLIC_UPLOADS_DIR, 'business-logos');
fs.mkdirSync(BUSINESS_DOCS_DIR, { recursive: true });
fs.mkdirSync(CUSTOMER_UPLOADS_DIR, { recursive: true });
fs.mkdirSync(BUSINESS_LOGOS_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
]);

const MAX_BYTES = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BUSINESS_DOCS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, plain text, markdown.`));
    }
    cb(null, true);
  },
});

function storagePathFor(storageName) {
  return path.join(BUSINESS_DOCS_DIR, storageName);
}

function recordUpload(file, user) {
  return addBusinessDocument({
    filename: file.originalname,
    contentType: file.mimetype,
    size: file.size,
    storageName: file.filename,
    user,
  });
}

function listDocuments() {
  return listBusinessDocuments().map(d => ({
    id: d.id,
    filename: d.filename,
    contentType: d.content_type,
    size: d.size,
    uploadedBy: d.uploaded_by_username,
    createdAt: d.created_at,
  }));
}

function removeDocument(id) {
  const doc = getBusinessDocument(id);
  if (!doc) return false;
  const filePath = storagePathFor(doc.storage_name);
  try { fs.unlinkSync(filePath); } catch { /* file already gone, fine */ }
  return deleteBusinessDocument(id);
}

function buildDocumentBlocks() {
  const docs = listBusinessDocuments();
  if (docs.length === 0) return [];
  const blocks = docs.map(doc => {
    const filePath = storagePathFor(doc.storage_name);
    if (doc.content_type === 'application/pdf') {
      const data = fs.readFileSync(filePath).toString('base64');
      return {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data },
        title: doc.filename,
      };
    }
    const text = fs.readFileSync(filePath, 'utf8');
    return {
      type: 'document',
      source: { type: 'text', media_type: 'text/plain', data: text },
      title: doc.filename,
    };
  });
  blocks[blocks.length - 1].cache_control = { type: 'ephemeral' };
  return blocks;
}

const CUSTOMER_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);
const CUSTOMER_MAX_BYTES = 5 * 1024 * 1024;

const customerStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    if (!req.customerProfile?.id) return cb(new Error('No customer profile.'));
    const dir = path.join(CUSTOMER_UPLOADS_DIR, String(req.customerProfile.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8);
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const customerUpload = multer({
  storage: customerStorage,
  limits: { fileSize: CUSTOMER_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!CUSTOMER_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported attachment type: ${file.mimetype}. Images only (JPEG, PNG, GIF, WEBP).`));
    }
    cb(null, true);
  },
});

function customerAttachmentPath(profileId, storageName) {
  return path.join(CUSTOMER_UPLOADS_DIR, String(profileId), storageName);
}

function readCustomerAttachmentBase64(profileId, storageName) {
  return fs.readFileSync(customerAttachmentPath(profileId, storageName)).toString('base64');
}

const LOGO_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);
const LOGO_MAX_BYTES = 3 * 1024 * 1024;

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BUSINESS_LOGOS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || '.png';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: LOGO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!LOGO_ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error(`Unsupported logo type: ${file.mimetype}. Allowed: JPEG, PNG, GIF, WEBP, SVG.`));
    }
    cb(null, true);
  },
});

function logoPublicUrl(filename) {
  return `/uploads/business-logos/${filename}`;
}

module.exports = {
  upload,
  recordUpload,
  listDocuments,
  removeDocument,
  buildDocumentBlocks,
  ALLOWED_MIME,
  MAX_BYTES,
  customerUpload,
  customerAttachmentPath,
  readCustomerAttachmentBase64,
  CUSTOMER_ALLOWED_MIME,
  CUSTOMER_MAX_BYTES,
  logoUpload,
  logoPublicUrl,
};
