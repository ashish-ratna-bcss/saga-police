/**
 * Alerts feature boundary (strangler facade).
 * App routing stays on legacy @/pages; new code should import from here.
 */
export { AlertLocationChip } from '@/components/AlertCards';
export { AlertService } from './api/alertService';
