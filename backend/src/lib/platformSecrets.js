const crypto = require('crypto');

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;
const ENC_PREFIX = 'enc:v1:';

const isBcryptHash = (value) => BCRYPT_RE.test(String(value || ''));
const isEncrypted = (value) => String(value || '').startsWith(ENC_PREFIX);

/** 32-byte key from PLATFORM_SECRETS_KEY or JWT_SECRET. */
const getSecretsKey = () => {
  const raw = String(process.env.PLATFORM_SECRETS_KEY || process.env.JWT_SECRET || '').trim();
  if (!raw) {
    throw new Error('PLATFORM_SECRETS_KEY or JWT_SECRET is required to encrypt platform keys');
  }
  return crypto.createHash('sha256').update(raw).digest();
};

/** Encrypt plaintext for DB storage (reversible — needed to show / use keys). */
const encryptPlatformSecret = (plain) => {
  const value = String(plain || '').trim();
  if (!value) return null;
  if (isEncrypted(value)) return value;
  // Legacy bcrypt cannot be decrypted — leave as-is until admin re-enters
  if (isBcryptHash(value)) return value;

  const key = getSecretsKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
};

/** Decrypt stored value; returns null if missing / bcrypt legacy / bad ciphertext. */
const decryptPlatformSecret = (stored) => {
  const value = String(stored || '').trim();
  if (!value) return null;
  if (isBcryptHash(value)) return null;
  if (!isEncrypted(value)) {
    // Legacy plaintext still in DB
    return value;
  }

  try {
    const payload = value.slice(ENC_PREFIX.length);
    const [ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const key = getSecretsKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
};

/** Encrypt any plaintext (or leave bcrypt) still sitting in the DB. */
const migratePlaintextPlatformSecrets = async (prisma) => {
  if (!prisma?.platforms?.findMany) return;
  const rows = await prisma.platforms.findMany({
    select: { id: true, blugate_client_key: true, api_key: true },
  });
  for (const row of rows) {
    const data = {};
    for (const field of ['blugate_client_key', 'api_key']) {
      const current = row[field];
      if (!current || isEncrypted(current) || isBcryptHash(current)) continue;
      data[field] = encryptPlatformSecret(current);
    }
    if (Object.keys(data).length > 0) {
      await prisma.platforms.update({ where: { id: row.id }, data });
    }
  }
};

/** Admin UI: return decrypted secrets so edit form + eye toggle can show them. */
const revealPlatformSecrets = (row) => {
  if (!row || typeof row !== 'object') return row;
  const blugateStored = row.blugate_client_key;
  const apiStored = row.api_key;
  const blugate = decryptPlatformSecret(blugateStored);
  const api = decryptPlatformSecret(apiStored);
  return {
    ...row,
    blugate_client_key: blugate || '',
    api_key: api || '',
    blugate_client_key_set: Boolean(blugateStored),
    api_key_set: Boolean(apiStored),
    /** True when value was bcrypt'd earlier and must be re-entered */
    blugate_client_key_needs_reset: Boolean(blugateStored) && !blugate,
    api_key_needs_reset: Boolean(apiStored) && !api,
  };
};

// Back-compat alias used by older call sites
const hashPlatformSecret = encryptPlatformSecret;
const redactPlatformSecrets = revealPlatformSecrets;

module.exports = {
  encryptPlatformSecret,
  decryptPlatformSecret,
  hashPlatformSecret,
  migratePlaintextPlatformSecrets,
  revealPlatformSecrets,
  redactPlatformSecrets,
  isBcryptHash,
  isEncrypted,
};
