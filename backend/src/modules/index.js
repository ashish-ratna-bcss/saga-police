/**
 * Backend module boundaries (strangler facade).
 *
 * Current runtime still mounts routes from src/routes/* in index.js.
 * New work should land under modules/<domain>/{http,application,domain,infrastructure}
 * and re-export through these facades without changing public API URLs.
 *
 * Planned domains: alerts, monitoring, grievances, analysis, reports, poi
 */
module.exports = {
  // Populated as modules are extracted. Intentionally empty in this bootstrap step.
};
