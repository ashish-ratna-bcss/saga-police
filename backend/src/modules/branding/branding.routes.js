const express = require('express');
const prisma = require('../../../prisma/client');
const { resolveLogoUrl } = require('../user/user.utils');
const { readApplicationDetails, parsePort } = require('../user/user.application');
const { isAllowedLogoMime, normalizeLogoMime } = require('../user/user.logo');
const logger = require('../../lib/logger');

const router = express.Router();

const DEFAULT = {
  application_name: 'Blura Saga',
  title: 'BLURA SAGA',
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

const findByPort = async (port) => {
  const p = parsePort(port);
  if (!p) return null;
  return prisma.users.findFirst({
    where: { port: p },
    select: BRANDING_SELECT,
  });
};

const findByHost = async (host) => {
  const h = String(host || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!h) return null;

  const candidates = await prisma.users.findMany({
    where: {
      port: { not: null },
      application_details: { not: null },
    },
    select: BRANDING_SELECT,
    take: 200,
  });

  return (
    candidates.find((u) => {
      const domains = readApplicationDetails(u).domains || [];
      return domains.includes(h);
    }) || null
  );
};

const toBrandingPayload = (user) => {
  const app = readApplicationDetails(user);
  // Keep logo relative (/api/branding/logo?…) so the browser uses the page
  // origin (incl. :3000/:3001/:3002). Absolute URLs built from nginx $host
  // drop the UI port and hit :80 (vLLM) instead of the tenant proxy.
  const logo = resolveLogoUrl(user);

  return {
    title: app.title,
    description: app.description,
    logo,
    port: user.port ?? null,
  };
};

/**
 * Public branding for login — no auth required.
 * GET /api/branding?port=3002 → { title, description, logo }
 * GET /api/branding/logo?port=3002 → image bytes
 */
router.get('/', async (req, res) => {
  try {
    let user = null;
    if (req.query.port) {
      user = await findByPort(req.query.port);
    }
    if (!user && req.query.host) {
      user = await findByHost(req.query.host);
    }
    if (!user && req.query.username) {
      const username = String(req.query.username).trim().toLowerCase();
      user = await prisma.users.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
        select: BRANDING_SELECT,
      });
    }

    if (!user) return res.json(DEFAULT);
    return res.json(toBrandingPayload(user));
  } catch (error) {
    logger.error('[Branding] lookup failed:', error.message);
    return res.status(500).json({ message: 'Failed to load branding' });
  }
});

/**
 * Public logo stream — no auth required.
 * GET /api/branding/logo?port=3002
 */
router.get('/logo', async (req, res) => {
  try {
    let user = null;
    if (req.query.port) {
      user = await findByPort(req.query.port);
    }
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
