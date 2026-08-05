/**
 * Platform monitors feature boundary (strangler facade).
 * Pages stay in place; new shared monitor utilities land here over time.
 */
export { default as InstagramMonitor } from '@/pages/InstagramMonitor';
export { default as XMonitor } from '@/pages/XMonitor';
export { default as FacebookMonitor } from '@/pages/FacebookMonitor';
export { default as YouTubeMonitor } from '@/pages/YouTubeMonitor';
export { proxyInstagramMediaUrl, buildInstagramMediaCandidates } from '@/shared/utils/mediaProxy';
