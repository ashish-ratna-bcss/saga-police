const fs = require('fs');
const path = require('path');

const STORAGE_DIR = process.env.REPORT_STORAGE_DIR || path.join(__dirname, '..', '..', 'storage');
const PUBLIC_BASE = (process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, '');

const TELEGRAM_FOLDER = 'telegram-media';

const uploadToS3 = async (buffer, key, _contentType = 'application/octet-stream') => {
    const absPath = path.join(STORAGE_DIR, key);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    await fs.promises.writeFile(absPath, buffer);

    const url = `${PUBLIC_BASE}/files/${key.split('/').map(encodeURIComponent).join('/')}`;
    return { url, key };
};

const existsInS3 = async (key) => {
    try {
        await fs.promises.access(path.join(STORAGE_DIR, key), fs.constants.F_OK);
        return true;
    } catch (_) {
        return false;
    }
};

const getTelegramS3Key = (groupId, messageId, fileId, extension = 'dat') => {
    return `${TELEGRAM_FOLDER}/${groupId}/${messageId}_${fileId}.${extension}`;
};

module.exports = {
    uploadToS3,
    existsInS3,
    getTelegramS3Key
};
