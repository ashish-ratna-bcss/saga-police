/**
 * storyS3Service.js
 * -----------------
 * Archives Instagram story media to local on-prem storage.
 * Field names (s3_url, s3_key) preserved for backwards compatibility.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const STORAGE_DIR = process.env.REPORT_STORAGE_DIR || path.join(__dirname, '..', '..', 'storage');
const PUBLIC_BASE = (process.env.PUBLIC_BACKEND_URL || `http://localhost:${process.env.PORT || 8000}`).replace(/\/+$/, '');

const STORIES_FOLDER = 'instagram-stories';
const MEDIA_DOWNLOAD_URL = process.env.MEDIA_ANALYZER_URL || 'http://localhost:8005';

const downloadViaPythonService = async (mediaUrl) => {
  try {
    const dlRes = await axios.post(`${MEDIA_DOWNLOAD_URL}/download`, {
        media_url: mediaUrl
    }, {
        headers: { 'x-api-key': process.env.GATEWAY_API_KEY || '' }
    });

    if (!dlRes.data || !dlRes.data.download_url) throw new Error("No download URL returned");

    const fileUrl = `${MEDIA_DOWNLOAD_URL}${dlRes.data.download_url}`;
    const fileRes = await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'arraybuffer',
        timeout: 60000
    });

    return {
        buffer: Buffer.from(fileRes.data),
        contentType: fileRes.headers['content-type']
    };
  } catch (err) {
      return null;
  }
}

/**
 * Write a buffer to local storage. Name kept as uploadStoryToS3 for compatibility.
 */
const uploadStoryToS3 = async (buffer, filename, _contentType = 'application/octet-stream') => {
  const key = `${STORIES_FOLDER}/${filename}`;
  const absPath = path.join(STORAGE_DIR, key);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  await fs.promises.writeFile(absPath, buffer);

  const url = `${PUBLIC_BASE}/files/${key.split('/').map(encodeURIComponent).join('/')}`;
  return { url, key };
};

const archiveStoryMedia = async (mediaUrl, storyPk, mediaType = 'image', suffix = '') => {
  if (!mediaUrl) return null;

  try {
    let buffer, contentType;

    const pyDl = await downloadViaPythonService(mediaUrl);

    if (pyDl) {
        buffer = pyDl.buffer;
        contentType = pyDl.contentType;
    } else {
        const response = await axios({
        method: 'GET',
        url: mediaUrl,
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        });
        buffer = Buffer.from(response.data);
        contentType = response.headers['content-type'] || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');
    }

    const ext = mediaType === 'video' ? 'mp4' : 'jpg';
    const filename = `${storyPk}${suffix}.${ext}`;

    const result = await uploadStoryToS3(buffer, filename, contentType);
    console.log(`[StoryS3] ✅ Archived story ${storyPk}${suffix} → ${result.key}`);
    return result;
  } catch (error) {
    console.error(`[StoryS3] ❌ Failed to archive story ${storyPk}${suffix}:`, error.message);
    return null;
  }
};

const deleteStoryFromS3 = async (s3Key) => {
  if (!s3Key) return false;
  try {
    await fs.promises.unlink(path.join(STORAGE_DIR, s3Key));
    console.log(`[StoryS3] 🗑️ Deleted ${s3Key}`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    console.error(`[StoryS3] ❌ Delete failed for ${s3Key}:`, error.message);
    return false;
  }
};

const storyExistsInS3 = async (s3Key) => {
  if (!s3Key) return false;
  try {
    await fs.promises.access(path.join(STORAGE_DIR, s3Key), fs.constants.F_OK);
    return true;
  } catch (_) {
    return false;
  }
};

module.exports = {
  uploadStoryToS3,
  archiveStoryMedia,
  deleteStoryFromS3,
  storyExistsInS3,
};
