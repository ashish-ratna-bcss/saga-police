const express = require('express');
const prisma = require('../../../prisma/client');
const { resolveLogoUrl } = require('../user/user.utils');
const { readApplicationDetails } = require('../user/user.application');
const { isAllowedLogoMime, normalizeLogoMime } = require('../user/user.logo');
const logger = require('../../lib/logger');

const router = express.Router();

const DEFAULT = {
  application_name: 'Bengaluru Police Saga',
  title: 'Bengaluru Police Saga',
  logo: '/blura_saga_logo.jpg',
  description:
    'Next-generation Social Media Observation, Threat Monitoring & Cyber Intelligence Platform — built for real-time situational awareness and rapid investigation.',
  port: null,
  has_logo: false,
};

const BRANDING_SELECT = {
  id: true,
  username: true,
  name: true,
  port: true,
  application_details: true,
  theme_color: true,
  logo_mime: true,
  updated_at: true,
};

const findAdmin = async () =>
  prisma.users.findFirst({
    where: { roles: { slug: 'admin' } },
    select: BRANDING_SELECT,
    orderBy: { id: 'asc' },
  });

const toBrandingPayload = (user) => {
  const app = readApplicationDetails(user);
  // Keep logo relative (/api/branding/logo?…) so the browser uses the page
  // origin (incl. :3000/:3001/:3002). Absolute URLs built from nginx $host
  // drop the UI port and hit :80 (vLLM) instead of the tenant proxy.
  const logo = resolveLogoUrl(user);
  const hasLogo = Boolean(user.logo_mime);

  return {
    application_name: app.application_name,
    title: app.title,
    description: app.description,
    logo,
    port: user.port ?? null,
    has_logo: hasLogo,
  };
};

/**
 * Public branding for login — no auth required.
 * GET /api/branding → Bengaluru Police Saga (admin row when one exists)
 */
router.get('/', async (req, res) => {
  try {
    const user = await findAdmin();
    if (!user) return res.json(DEFAULT);
    return res.json(toBrandingPayload(user));
  } catch (error) {
    logger.error('[Branding] lookup failed:', error.message);
    return res.status(500).json({ message: 'Failed to load branding' });
  }
});

/**
 * Public logo stream — no auth required.
 * GET /api/branding/logo
 */
router.get('/logo', async (req, res) => {
  try {
    let user = await findAdmin();
    if (!user && req.query.username) {
      const username = String(req.query.username).trim().toLowerCase();
      user = await prisma.users.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
        select: {
          logo_data: true,
          logo_mime: true,
          updated_at: true,
        },
      });
    } else if (user) {
      user = await prisma.users.findUnique({
        where: { id: user.id },
        select: { logo_data: true, logo_mime: true, updated_at: true },
      });
    }

    if (!user?.logo_data || !user.logo_mime) {
      return res.status(404).json({ message: 'Logo not found' });
    }

    const mime = normalizeLogoMime(user.logo_mime);
    if (!isAllowedLogoMime(mime)) {
      return res.status(404).json({ message: 'Logo not found' });
    }

    const buf = Buffer.isBuffer(user.logo_data)
      ? user.logo_data
      : Buffer.from(user.logo_data);

    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (user.updated_at) {
      res.setHeader('Last-Modified', new Date(user.updated_at).toUTCString());
    }
    return res.status(200).send(buf);
  } catch (error) {
    logger.error('[Branding] logo stream failed:', error.message);
    return res.status(500).json({ message: 'Failed to load logo' });
  }
});

module.exports = { brandingRoutes: router };
