/**
 * PM2 Ecosystem Configuration for Multi-Tenant Deployments
 *
 * Manage each tenant independently:
 *   pm2 start ecosystem.config.js
 *   pm2 restart odisha-api
 *   pm2 restart delhipolice-api
 *   pm2 restart uttarakhandpolice-api
 *   pm2 logs odisha-api
 *   pm2 logs delhipolice-api
 */

const path = require('path');
const fs = require('fs');

let sitesConfig = { sites: [], backend_bind: '127.0.0.1', ip: '100.49.109.96' };
const sitesJsonPath = path.join(__dirname, 'sites.json');

if (fs.existsSync(sitesJsonPath)) {
  try {
    sitesConfig = JSON.parse(fs.readFileSync(sitesJsonPath, 'utf8'));
  } catch (e) {
    console.error('Error parsing deploy/sites.json:', e.message);
  }
}

const appRoot = path.join(__dirname, '..');
const backendDir = path.join(appRoot, 'backend');
const logsDir = path.join(backendDir, 'logs');
if (!fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch {}
}

const apps = (sitesConfig.sites || [])
  .filter((site) => site.enabled !== false)
  .map((site) => {
    const admin = site.admin;
    const port = site.backend_port;
    const bind = sitesConfig.backend_bind || '127.0.0.1';
    const serverIp = sitesConfig.ip || '127.0.0.1';
    const frontendPort = site.frontend_port;

    // Check if a tenant-specific .env exists (e.g. backend/.env.delhipolice)
    const tenantEnvPath = path.join(backendDir, `.env.${admin}`);
    const hasCustomEnv = fs.existsSync(tenantEnvPath);

    return {
      name: `${admin}-api`,
      cwd: backendDir,
      script: 'src/index.js',
      env_file: hasCustomEnv ? tenantEnvPath : undefined,
      env: {
        NODE_ENV: 'production',
        HOST: bind,
        PORT: port,
        CORS_ORIGINS: `http://${serverIp}:${frontendPort},http://localhost:${frontendPort}${site.domain ? `,https://${site.domain},http://${site.domain}` : ''}`,
      },
      out_file: path.join(logsDir, `${admin}-out.log`),
      error_file: path.join(logsDir, `${admin}-error.log`),
      merge_logs: true,
      time: true,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    };
  });

module.exports = {
  apps,
};
