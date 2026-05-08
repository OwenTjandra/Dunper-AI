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

const BUSINESS_DOCS_DIR = path.join(__dirname, '..', 'uploads', 'business');
fs.mkdirSync(BUSINESS_DOCS_DIR, { recursive: true });

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
  return docs.map(doc => {
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
}

module.exports = {
  upload,
  recordUpload,
  listDocuments,
  removeDocument,
  buildDocumentBlocks,
  ALLOWED_MIME,
  MAX_BYTES,
};
