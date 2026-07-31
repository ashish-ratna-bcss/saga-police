/**
 * periscopeS3Service.js
 * ---------------------
 * Stores Periscope DOCX files on the local on-prem filesystem and returns
 * server URLs for download. Function names preserved for compatibility.
 */

const fs = require('fs');
const path = require('path');

const STORAGE_DIR = process.env.REPORT_STORAGE_DIR || path.join(__dirname, '..', '..', 'storage');
const PUBLIC_BASE = (process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, '');

const PERISCOPE_FOLDER = 'periscope-documents';

const uploadPeriscopeToS3 = async (buffer, dateStr, originalFilename) => {
    const safeName = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${PERISCOPE_FOLDER}/${dateStr}/${safeName}`;
    const absPath = path.join(STORAGE_DIR, key);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    await fs.promises.writeFile(absPath, buffer);

    const url = `${PUBLIC_BASE}/files/${key.split('/').map(encodeURIComponent).join('/')}`;
    return { url, key };
};

const getPeriscopeDownloadUrl = async (s3Key) => {
    return `${PUBLIC_BASE}/files/${s3Key.split('/').map(encodeURIComponent).join('/')}`;
};

module.exports = {
    uploadPeriscopeToS3,
    getPeriscopeDownloadUrl,
};
