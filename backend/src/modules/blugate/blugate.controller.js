const {
  callGlobalApi,
  resolveGlobalAuth,
} = require('../../services/blugate/global/blugate.global.api_client');

/**
 * Full BluGate client-account snapshot for the dedicated Usage & Billing page —
 * client status, every platform's health, and live billing/quota consumption.
 * (System Health's compact BluGate panel hits the same underlying service.)
 */
const getBillingInfo = async (req, res) => {
  try {
    const auth = await resolveGlobalAuth(req.tenantPrisma);
    if (!auth) {
      return res.status(200).json({
        ok: true,
        configured: false,
        message: "No platform has a BluGate API key & client key set yet — add one under Settings → Platforms.",
      });
    }

    const [healthResult, billingResult] = await Promise.allSettled([
      callGlobalApi('HEALTH', {}, auth),
      callGlobalApi('BILLING', {}, auth),
    ]);

    return res.status(200).json({
      ok: true,
      configured: true,
      fetched_at: new Date().toISOString(),
      health: healthResult.status === 'fulfilled' ? healthResult.value : null,
      health_error: healthResult.status === 'rejected' ? healthResult.reason.message : null,
      billing: billingResult.status === 'fulfilled' ? billingResult.value : null,
      billing_error: billingResult.status === 'rejected' ? billingResult.reason.message : null,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, message: error.message });
  }
};

module.exports = { getBillingInfo };
