import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useLocation, useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import { cn } from '../../lib/utils';
import * as XLSX from 'xlsx';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../../components/ui/dialog';
import { Separator } from '../../components/ui/separator';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Calendar as CalendarComponent } from '../../components/ui/calendar';
import { toast } from 'sonner';
import { format, parse } from 'date-fns';
import {
  CalendarDays, Loader2, Play, Download, RefreshCw, ExternalLink,
  Youtube, Facebook, Radio, Pause, Trash2, Plus, MapPin, Clock,
  Search, ScanLine, UserPlus, Pencil, FileSpreadsheet,
  FileText, BarChart3, Activity, Zap, Timer, ChevronRight,
  ChevronDown, X, AlertTriangle, Globe, ArrowUpRight, History, Square
} from 'lucide-react';
import ContentCard from '../../components/ContentCard';
import AddSocialProfileDialog from '../../components/AddSocialProfileDialog';
import EventMonthSidebar, { MONTH_THEMES } from '../../components/EventMonthSidebar';
import { TelegramBrandLogo } from '../../components/PlatformBrandIcon';
import { QRCodeCanvas } from 'qrcode.react';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';


/* ── helpers ─────────────────────────────────────────── */
const splitKeywords = (value) => {
  if (!value) return [];
  return value.split(/\n|,|;/g).map((s) => s.trim()).filter(Boolean);
};

/** Guess language bucket from script (calendar keywords are often language: "all"). */
const detectKeywordLanguage = (keyword) => {
  const text = String(keyword || '');
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  return 'en';
};

/** Split event keywords into Telugu / Hindi / English form fields. */
const keywordsToLangFields = (keywords = []) => {
  const buckets = { te: [], hi: [], en: [] };
  for (const entry of keywords || []) {
    const raw = typeof entry === 'string' ? entry : entry?.keyword;
    if (!raw || !String(raw).trim()) continue;
    const tagged = String(entry?.language || '').toLowerCase();
    // Expand legacy comma-joined blobs that were dumped into one field.
    for (const text of splitKeywords(raw)) {
      const byScript = detectKeywordLanguage(text);
      const lang =
        byScript !== 'en'
          ? byScript
          : tagged === 'te' || tagged === 'hi' || tagged === 'en'
            ? tagged
            : 'en';
      buckets[lang].push(text);
    }
  }
  return {
    te: buckets.te.join(', '),
    hi: buckets.hi.join(', '),
    en: buckets.en.join(', '),
  };
};

const formatWhen = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(iso);
  }
};

const formatDuration = (ms) => {
  if (ms == null || ms < 0 || Number.isNaN(ms)) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

/** Countdown like 59m 59s · under 1m shows 59s, 58s… */
const formatCountdown = (ms) => {
  const totalSec = Math.max(0, Math.ceil(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${totalSec}s`;
};

/**
 * Live monitoring phase for a started event.
 * - fetching: kickoff for this session / overdue
 * - waiting: between polls, with remainingMs until next fetch
 * - stopped: not monitoring
 *
 * sessionStartedAt: ignore last_fetched_at from a *previous* session after Start again.
 */
const getMonitoringPhase = (event, now = Date.now(), options = {}) => {
  const isFetching = Boolean(options.isFetching);
  const sessionStartedAt = options.sessionStartedAt || null;
  if (!isMonitoringStarted(event)) {
    return { phase: 'stopped', remainingMs: null, nextAt: null };
  }
  if (isFetching || !event?.last_fetched_at) {
    return { phase: 'fetching', remainingMs: null, nextAt: null };
  }
  const last = new Date(event.last_fetched_at).getTime();
  if (!Number.isFinite(last)) {
    return { phase: 'fetching', remainingMs: null, nextAt: null };
  }
  if (sessionStartedAt) {
    const startMs = new Date(sessionStartedAt).getTime();
    if (Number.isFinite(startMs) && last < startMs - 1500) {
      return { phase: 'fetching', remainingMs: null, nextAt: null };
    }
  }
  const intervalMs = Math.max(1, Number(event.polling_interval_minutes) || 60) * 60_000;
  const nextAt = last + intervalMs;
  const remainingMs = nextAt - now;
  if (remainingMs <= 0) {
    return { phase: 'due', remainingMs: 0, nextAt };
  }
  return { phase: 'waiting', remainingMs, nextAt };
};

/** Pair start→stop into readable history rows (newest first). Profiles pattern. */
const buildMonitoringHistory = (logs = [], monitoringStatus) => {
  const list = Array.isArray(logs) ? [...logs] : [];
  const sessions = [];
  let openStart = null;

  for (const entry of list) {
    const action = String(entry?.action || '').toLowerCase();
    if (action === 'start') {
      openStart = entry;
    } else if (action === 'stop' && openStart) {
      const startAt = openStart.at ? new Date(openStart.at).getTime() : null;
      const stopAt = entry.at ? new Date(entry.at).getTime() : null;
      sessions.push({
        id: `${openStart.at}-${entry.at}`,
        startedAt: openStart.at,
        stoppedAt: entry.at,
        durationMs: startAt != null && stopAt != null ? stopAt - startAt : null,
        state: 'done',
        startMessage: openStart.message,
        stopMessage: entry.message,
      });
      openStart = null;
    }
  }

  if (openStart) {
    const startAt = openStart.at ? new Date(openStart.at).getTime() : null;
    const now = Date.now();
    sessions.push({
      id: `${openStart.at}-running`,
      startedAt: openStart.at,
      stoppedAt: null,
      durationMs: startAt != null ? now - startAt : null,
      state: monitoringStatus === 'started' ? 'running' : 'incomplete',
      startMessage: openStart.message,
      stopMessage: null,
    });
  }

  return sessions.reverse();
};

/** Totals + newest-first rows from last_fetched_history. */
const summarizeFetchHistory = (history = [], monitoringSessions = []) => {
  const list = Array.isArray(history) ? history : [];
  const totals = list.reduce(
    (acc, e) => ({
      apiHits: acc.apiHits + (Number(e?.api_hits) || 0),
      postsNew: acc.postsNew + (Number(e?.posts_new ?? e?.items_new) || 0),
      postsReturned: acc.postsReturned + (Number(e?.posts_returned ?? e?.items_returned) || 0),
      runs: acc.runs + 1,
    }),
    { apiHits: 0, postsNew: 0, postsReturned: 0, runs: 0 }
  );
  const totalRunningMs = monitoringSessions.reduce(
    (sum, s) => sum + (Number.isFinite(s.durationMs) ? s.durationMs : 0),
    0
  );
  return {
    ...totals,
    totalRunningMs,
    runsNewestFirst: [...list].reverse(),
  };
};

const isMonitoringStarted = (e) => e?.monitoring_status === 'started';


const openPrintableReport = ({ event, stats, content, alerts }) => {
  const safe = (v) => (v === null || v === undefined ? '' : String(v));
  const companyLogoUrl = `${window.location.origin}/Logo.png`;
  const policeLogoUrl = `${window.location.origin}/appolicelogo.png`;


  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Event Report - ${safe(event?.name)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding: 32px; color: #1a1a2e; background: #fff; line-height: 1.5; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 3px solid #1a1a2e; }
    .logo { height: 72px; width: auto; object-fit: contain; }
    .titleBlock { flex: 1; text-align: center; }
    .titleBlock h1 { margin: 0 0 4px; font-size: 24px; font-weight: 700; color: #1a1a2e; }
    .titleBlock .sub { margin: 0; color: #666; font-size: 12px; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
    .stat-box { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; text-align: center; background: #f8fafc; }
    .stat-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
    .stat-value { font-size: 28px; font-weight: 700; margin-top: 4px; color: #1a1a2e; }
    .stat-value.danger { color: #dc2626; }
    .section-title { font-size: 14px; font-weight: 700; margin: 24px 0 10px; text-transform: uppercase; letter-spacing: .05em; color: #374151; border-left: 4px solid #3b82f6; padding-left: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
    th { background: #1a1a2e; color: #fff; padding: 10px 12px; text-align: left; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; }
    td { border-bottom: 1px solid #e5e7eb; padding: 10px 12px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    a { color: #2563eb; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 2px solid #e5e7eb; text-align: center; font-size: 10px; color: #999; }
    @media print { body { padding: 16px; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print" style="display:flex; gap:10px; margin-bottom:20px;">
    <button onclick="window.print()" style="padding:10px 20px; border:1px solid #ddd; border-radius:8px; background:#1a1a2e; color:#fff; cursor:pointer; font-weight:600;">Print / Save as PDF</button>
    <button onclick="window.close()" style="padding:10px 20px; border:1px solid #ddd; border-radius:8px; background:#fff; cursor:pointer;">Close</button>
  </div>
  <div class="header">
    <img class="logo" src="${companyLogoUrl}" alt="Logo" />
    <div class="titleBlock">
      <h1>Event Intelligence Report</h1>
      <p class="sub">${safe(event?.name)} &bull; Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' })}</p>
    </div>
    <img class="logo" src="${policeLogoUrl}" alt="Logo" />
  </div>
  <div class="stats-grid">
    <div class="stat-box"><div class="stat-label">Date Range</div><div style="font-size:13px;margin-top:6px;font-weight:600">${event?.start_date ? new Date(event.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''} to ${event?.end_date ? new Date(event.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</div></div>
    <div class="stat-box"><div class="stat-label">Location</div><div style="font-size:13px;margin-top:6px;font-weight:600">${safe(event?.location) || 'N/A'}</div></div>
    <div class="stat-box"><div class="stat-label">Total Content</div><div class="stat-value">${safe(stats?.content_total)}</div></div>
    <div class="stat-box"><div class="stat-label">Priority Alerts</div><div class="stat-value danger">${safe(stats?.alerts_priority)}</div></div>
  </div>
  ${alerts.filter(a => a.is_priority).length > 0 ? `
  <div class="section-title">Priority Alerts</div>
  <table>
    <thead><tr><th>Time</th><th>Platform</th><th>Title</th><th>Reason</th><th>Link</th></tr></thead>
    <tbody>${alerts.filter(a => a.is_priority).map(a => `
      <tr>
        <td>${safe(new Date(a.created_at).toLocaleString('en-IN'))}</td>
        <td><strong>${safe((a.platform || '').toUpperCase())}</strong></td>
        <td>${safe(a.title)}</td>
        <td style="color:#dc2626">${safe(a.priority_reason)}</td>
        <td><a href="${safe(a.content_url)}" target="_blank">Open</a></td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}
  <div class="section-title">Detected Content (${content.length})</div>
  <table>
    <thead><tr><th>Published</th><th>Platform</th><th>Author</th><th>Content</th><th>Link</th></tr></thead>
    <tbody>${content.map(c => `
      <tr>
        <td>${safe(new Date(c.published_at).toLocaleString('en-IN'))}</td>
        <td><strong>${safe((c.platform || '').toUpperCase())}</strong></td>
        <td>${safe(c.author)}</td>
        <td>${safe(c.text).slice(0, 200)}${(c.text || '').length > 200 ? '...' : ''}</td>
        <td><a href="${safe(c.content_url)}" target="_blank">Open</a></td>
      </tr>`).join('')}
    </tbody>
  </table>
  <div class="footer">Confidential &mdash; Generated by Events Control Center &bull; ${new Date().toLocaleDateString('en-IN')}</div>
</body>
</html>`;


  const w = window.open('', '_blank');
  if (!w) { toast.error('Popup blocked. Allow popups to export PDF.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
};


/** Format monitoring range — return the raw date string as-is */
const formatMonitoringRange = (rangeStr) => {
  if (!rangeStr) return '—';
  return rangeStr.trim();
};


/** Build merged report rows from calendar events + enriched events (with discovered_hashtags) */
const buildReportRows = ({ calendarEvents, events }) => {
  const eventList = Array.isArray(events) ? events : [];
  const calendarList = Array.isArray(calendarEvents) ? calendarEvents : [];
  const rows = [];
  calendarList.forEach(cal => {
    const matchedEvent = eventList.find(
      e => e.origin_calendar_id === cal.id || e.occasion_calendar_id === cal.id || (e.origin === 'master_calendar' && e.name?.toLowerCase() === (cal.occasion || cal.title || '').toLowerCase())
    );
    const newKeywords = matchedEvent?.discovered_hashtags || [];
    rows.push({
      slNo: cal.slNo,
      eventName: cal.occasion || cal.title || '',
      eventDate: cal.date || '',
      monitoringRange: formatMonitoringRange(cal.monitoringRange),
      keywordsGiven: cal.keywords || '',
      newKeywordsFetched: newKeywords.length > 0 ? newKeywords.join(', ') : '—',
      eventId: matchedEvent?.id || null,
      reportUrl: matchedEvent?.id ? `${window.location.origin}/events?selected=${matchedEvent.id}` : '',
    });
  });
  eventList.filter(e => e.origin !== 'master_calendar').forEach(evt => {
    const kwList = Array.isArray(evt.keywords) ? evt.keywords.map(k => (typeof k === 'string' ? k : k.keyword)).filter(Boolean).join(', ') : '';
    const startDate = evt.start_date ? new Date(evt.start_date) : null;
    const endDate = evt.end_date ? new Date(evt.end_date) : null;
    let monitoringRange = '—';
    if (startDate && endDate) {
      const fmt = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
      monitoringRange = `${fmt(startDate)} – ${fmt(endDate)}`;
    } else if (startDate) {
      monitoringRange = startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    }
    const newKeywords = evt.discovered_hashtags || [];
    rows.push({
      slNo: rows.length + 1,
      eventName: evt.name || '',
      eventDate: startDate ? startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—',
      monitoringRange,
      keywordsGiven: kwList,
      newKeywordsFetched: newKeywords.length > 0 ? newKeywords.join(', ') : '—',
      eventId: evt.id,
      reportUrl: `${window.location.origin}/events?selected=${evt.id}`,
    });
  });
  return rows;
};


const openPrintableEventsList = ({ events, calendarEvents }) => {
  const rows = buildReportRows({ calendarEvents, events });
  const companyLogoUrl = `${window.location.origin}/Logo.png`;
  const policeLogoUrl = `${window.location.origin}/appolicelogo.png`;
  const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Events Report</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding: 28px; color: #1a1a2e; background: #fff; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 3px solid #1a1a2e; }
    .logo { height: 62px; width: auto; object-fit: contain; }
    .title { flex: 1; text-align: center; }
    .title h1 { margin: 0; font-size: 24px; font-weight: 700; color: #1a1a2e; }
    .sub { margin-top: 4px; color: #6b7280; font-size: 12px; }
    .meta { margin: 12px 0 14px; font-size: 12px; color: #475569; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { background: #1f2937; color: #fff; text-align: left; padding: 10px 10px; font-size: 10px; letter-spacing: .04em; text-transform: uppercase; font-weight: 600; }
    td { border-bottom: 1px solid #e5e7eb; padding: 10px 10px; vertical-align: middle; }
    tr:nth-child(even) td { background: #f8fafc; }
    a { color: #2563eb; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
    .qr-cell { text-align: center; }
    .qr-cell canvas, .qr-cell img { width: 60px; height: 60px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 2px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 10px; color: #999; }
    @media print { body { padding: 16px; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print" style="display:flex; gap:10px; margin-bottom:16px;">
    <button onclick="window.print()" style="padding:10px 20px; border:1px solid #ddd; border-radius:8px; background:#1a1a2e; color:#fff; cursor:pointer; font-weight:600;">Print / Save as PDF</button>
    <button onclick="window.close()" style="padding:10px 20px; border:1px solid #ddd; border-radius:8px; background:#fff; cursor:pointer;">Close</button>
  </div>
  <div class="header">
    <img class="logo" src="${companyLogoUrl}" alt="Logo" />
    <div class="title">
      <h1>Events Report</h1>
      <div class="sub">Report Generated: ${generatedAt}</div>
    </div>
    <img class="logo" src="${policeLogoUrl}" alt="Logo" />
  </div>
  <div class="meta">Total Events: <strong>${rows.length}</strong></div>
  <table>
    <thead>
      <tr>
        <th>Sl.No</th>
        <th>Event Name</th>
        <th>Event Date</th>
        <th>Monitoring Range</th>
        <th>Keywords (Given by Team)</th>
        <th>New Keywords Fetched</th>
        <th style="text-align:center">Scan QR to Download Report</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${r.eventId ? '<a href="' + window.location.origin + '/events?selected=' + r.eventId + '">' + (r.eventName || '') + '</a>' : (r.eventName || '')}</td>
          <td>${r.eventDate || '—'}</td>
          <td>${r.monitoringRange || '—'}</td>
          <td>${r.keywordsGiven || '—'}</td>
          <td>${r.newKeywordsFetched || '—'}</td>
          <td class="qr-cell">${r.reportUrl ? '<div id="qr-' + idx + '"></div>' : '—'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="footer">
    <span>Confidential — Events Control Center</span>
    <span>${new Date().toLocaleDateString('en-IN')}</span>
  </div>
  <script>
    (function() {
      var rows = ${JSON.stringify(rows.map((r, i) => ({ idx: i, url: r.reportUrl })))};
      rows.forEach(function(r) {
        if (!r.url) return;
        var el = document.getElementById('qr-' + r.idx);
        if (!el) return;
        try {
          var qr = qrcode(0, 'M');
          qr.addData(r.url);
          qr.make();
          el.innerHTML = qr.createImgTag(2, 4);
        } catch(e) { el.textContent = 'QR Error'; }
      });
    })();
  <\/script>
</body>
</html>`;


  const w = window.open('', '_blank');
  if (!w) { toast.error('Popup blocked. Allow popups to export PDF.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
};


/* ── monitoring status (Profiles pattern: started | stopped) ── */
const STATUS_CONFIG = {
  started:  { color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800', dot: 'bg-emerald-500', label: 'Live' },
  stopped:  { color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',      dot: 'bg-amber-500',   label: 'Stopped' },
};


const XLogo = ({ className = '' }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const PLATFORM_CONFIG = {
  all:       { label: 'All Platforms', icon: Globe,     color: 'text-gray-500 dark:text-gray-400' },
  x:         { label: 'X / Twitter',  icon: XLogo,     color: 'text-gray-800 dark:text-gray-200' },
  youtube:   { label: 'YouTube',       icon: Youtube,   color: 'text-red-600 dark:text-red-400' },
  facebook:  { label: 'Facebook',      icon: Facebook,  color: 'text-blue-600 dark:text-blue-400' },
  telegram:  { label: 'Telegram',      icon: TelegramBrandLogo, color: 'text-sky-600 dark:text-sky-400' },
};

const EVENT_PLATFORM_OPTIONS = [
  { value: 'x', label: 'X', icon: XLogo, accent: 'text-foreground' },
  { value: 'youtube', label: 'YouTube', icon: Youtube, accent: 'text-red-600' },
  { value: 'facebook', label: 'Facebook', icon: Facebook, accent: 'text-blue-600' },
  { value: 'telegram', label: 'Telegram', icon: TelegramBrandLogo, accent: 'text-sky-600' },
];

const DEFAULT_EVENT_PLATFORMS = EVENT_PLATFORM_OPTIONS.map((p) => p.value);

const EventPlatformPicker = ({ value = [], onChange }) => {
  const selected = Array.isArray(value) ? value : [];
  const toggle = (slug) => {
    const next = selected.includes(slug)
      ? selected.filter((p) => p !== slug)
      : [...selected, slug];
    onChange?.(next);
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
      {EVENT_PLATFORM_OPTIONS.map(({ value: slug, label, icon: Icon, accent }) => {
        const on = selected.includes(slug);
        return (
          <button
            key={slug}
            type="button"
            onClick={() => toggle(slug)}
            aria-pressed={on}
            className={cn(
              'relative flex h-9 items-center justify-center gap-1.5 rounded-md border text-xs font-medium transition-colors',
              on
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:text-foreground'
            )}
          >
            <Icon className={cn('h-3.5 w-3.5 shrink-0', on ? 'text-primary-foreground' : accent)} />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
};

const KEYWORD_LANG_FIELDS = [
  { key: 'te', label: 'Telugu', placeholder: 'e.g. ఎన్నిక, ఓటు' },
  { key: 'hi', label: 'Hindi', placeholder: 'e.g. चुनाव, वोट' },
  { key: 'en', label: 'English', placeholder: 'e.g. election, vote' },
];

const EventKeywordsFields = ({ values, onChange }) => (
  <div className="space-y-2">
    <div>
      <Label className="text-xs font-semibold">Keywords</Label>
      <p className="text-[11px] text-muted-foreground mt-0.5">
        What should we search for? Add words in any language you need.
      </p>
    </div>
    <div className="space-y-2">
      {KEYWORD_LANG_FIELDS.map(({ key, label, placeholder }) => (
        <div key={key} className="flex items-center gap-2.5">
          <span className="w-16 shrink-0 text-[11px] font-medium text-muted-foreground">{label}</span>
          <Input
            value={values[key] || ''}
            onChange={(e) => onChange(key, e.target.value)}
            placeholder={placeholder}
            className="h-9 text-sm"
          />
        </div>
      ))}
    </div>
  </div>
);

const ymdToDate = (value) => {
  if (!value) return undefined;
  try {
    const d = parse(String(value).slice(0, 10), 'yyyy-MM-dd', new Date());
    return Number.isNaN(d.getTime()) ? undefined : d;
  } catch {
    return undefined;
  }
};

const dateToYmd = (date) => {
  if (!date) return '';
  return format(date, 'yyyy-MM-dd');
};

const EventDateField = ({ value, onChange, placeholder = 'Pick a date' }) => {
  const selected = ymdToDate(value);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-9 w-full justify-start px-3 text-left text-sm font-normal',
            !selected && 'text-muted-foreground'
          )}
        >
          <CalendarDays className="mr-2 h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {selected ? format(selected, 'dd MMM yyyy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarComponent
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(dateToYmd(date));
            setOpen(false);
          }}
          initialFocus
        />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onChange(dateToYmd(new Date()));
              setOpen(false);
            }}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const parseLabelDate = (label) => {
  if (!label) return undefined;
  const s = String(label).trim();
  for (const fmt of ['d MMMM yyyy', 'dd MMMM yyyy', 'd MMM yyyy', 'dd MMM yyyy', 'd MMMM', 'dd MMMM', 'd MMM', 'dd MMM']) {
    try {
      const d = parse(s, fmt, new Date());
      if (!Number.isNaN(d.getTime())) return d;
    } catch {
      /* try next */
    }
  }
  return undefined;
};

const formatLabelDate = (date, withYear = false) => {
  if (!date) return '';
  return format(date, withYear ? 'd MMMM yyyy' : 'd MMMM');
};

const formatRangePart = (date) => (date ? format(date, 'd MMM') : '');

const splitMonitoringRange = (range) => {
  if (!range) return { from: '', to: '' };
  const parts = String(range).split(/\s*[–—-]\s*/).map((p) => p.trim()).filter(Boolean);
  return { from: parts[0] || '', to: parts[1] || '' };
};

/** Calendar that stores friendly labels like "26 January" (recurring) or "26 January 2026". */
const OccasionDateField = ({ value, onChange, withYear = false, placeholder = 'Pick a date' }) => {
  const selected = parseLabelDate(value);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-9 w-full justify-start px-3 text-left text-sm font-normal',
            !selected && 'text-muted-foreground'
          )}
        >
          <CalendarDays className="mr-2 h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {selected ? formatLabelDate(selected, withYear) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarComponent
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(formatLabelDate(date, withYear));
            setOpen(false);
          }}
          initialFocus
        />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            Clear
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              onChange(formatLabelDate(new Date(), withYear));
              setOpen(false);
            }}
          >
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};


const POLL_PRESETS = [
  { value: '5', label: 'Every 5 minutes', minutes: 5 },
  { value: '15', label: 'Every 15 minutes', minutes: 15 },
  { value: '30', label: 'Every 30 minutes', minutes: 30 },
  { value: '60', label: 'Every 1 hour', minutes: 60 },
  { value: '360', label: 'Every 6 hours', minutes: 360 },
  { value: 'custom', label: 'Custom', minutes: null },
];

const resolvePollPreset = (minutes) => {
  const m = Number(minutes);
  const match = POLL_PRESETS.find((p) => p.minutes === m);
  return match ? match.value : 'custom';
};

const formatPollInterval = (minutes) => {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 1) return '—';
  if (m < 60) return `Every ${m}m`;
  if (m % 60 === 0) {
    const h = m / 60;
    return h === 1 ? 'Every 1h' : `Every ${h}h`;
  }
  return `Every ${m}m`;
};

/** e.g. 60 → "~12× / day" */
const fetchesPerDayHint = (minutes) => {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 1) return '';
  const n = Math.round((24 * 60) / m);
  if (n < 1) return '<1× / day';
  return `~${n}× / day`;
};

/** Profiles-style poll picker for event create/edit forms. */
const EventPollIntervalField = ({ minutes, preset, onChange }) => {
  const mins = Number(minutes);
  const activePreset = preset || resolvePollPreset(mins);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold flex items-center gap-1.5">
        <Timer className="h-3.5 w-3.5 text-muted-foreground" />
        Monitoring interval *
      </Label>
      <Select
        value={activePreset}
        onValueChange={(v) => {
          const p = POLL_PRESETS.find((x) => x.value === v);
          if (v === 'custom') {
            const keep =
              Number.isInteger(mins) &&
              mins >= 1 &&
              !POLL_PRESETS.some((x) => x.minutes === mins);
            onChange({ preset: 'custom', minutes: keep ? mins : 45 });
          } else {
            onChange({ preset: v, minutes: p.minutes });
          }
        }}
      >
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Select interval" />
        </SelectTrigger>
        <SelectContent>
          {POLL_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.minutes
                ? `${p.label} (${fetchesPerDayHint(p.minutes)})`
                : p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {activePreset === 'custom' ? (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={10080}
            className="h-9 w-28"
            value={Number.isFinite(mins) ? mins : ''}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({
                preset: 'custom',
                minutes: raw === '' ? '' : Math.max(1, Math.min(10080, Number(raw) || 1)),
              });
            }}
          />
          <span className="text-xs text-muted-foreground">minutes</span>
          {Number.isFinite(mins) && mins >= 1 && (
            <span className="text-[11px] text-muted-foreground">{fetchesPerDayHint(mins)}</span>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          While monitoring is <span className="font-medium text-foreground">Started</span>, fetch on this schedule
          {Number.isFinite(mins) && mins >= 1 ? ` · ${formatPollInterval(mins)} · ${fetchesPerDayHint(mins)}` : ''}.
        </p>
      )}
    </div>
  );
};


/* ══════════════════════════════════════════════════════
   Events Control Center
   ══════════════════════════════════════════════════════ */
const isRecurringEvent = (e) =>
  e?.origin === 'master_calendar' || e?.origin === 'occasion_calendar';

const Events = () => {
  const routeLocation = useLocation();


  // ── Core state ──
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [creating, setCreating] = useState(false);
  const [runningScan, setRunningScan] = useState(false);
  const [contentPlatform, setContentPlatform] = useState('all');
  const [contentItems, setContentItems] = useState([]);
  const [contentPage, setContentPage] = useState(1);
  const [contentHasMore, setContentHasMore] = useState(true);
  const [contentLoadingMore, setContentLoadingMore] = useState(false);
  const [processingAction, setProcessingAction] = useState(false);
  const [monitoringBusyId, setMonitoringBusyId] = useState(null);
  const monitoringBusyRef = useRef(null);
  const [fetchingKickoffId, setFetchingKickoffId] = useState(null);
  const kickoffPollRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [originFilter, setOriginFilter] = useState('all'); // 'all' | 'recurring' | 'manual'
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all'); // 'all' | 'started' | 'stopped'
  const [selectedMonth, setSelectedMonth] = useState(null); // null = all months
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());


  // ── Sidebar resize handlers ──
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMouseMove = (e) => {
      const newWidth = Math.min(500, Math.max(200, startWidth + (e.clientX - startX)));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);


  // ── Dialog state ──
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);


  // ── Occasion Calendar state ──
  const [hcpOpen, setHcpOpen] = useState(false);
  const [hcpTab, setHcpTab] = useState('recurring');
  const [hcpEvents, setHcpEvents] = useState([]);
  const [hcpLoading, setHcpLoading] = useState(false);
  const [hcpSearch, setHcpSearch] = useState('');
  const [hcpFormOpen, setHcpFormOpen] = useState(false);
  const [hcpEditId, setHcpEditId] = useState(null);
  const [hcpSaving, setHcpSaving] = useState(false);
  const [hcpForm, setHcpForm] = useState({
    occasion: '',
    date: '',
    monitoringRange: '',
    rangeFrom: '',
    rangeTo: '',
    keywords: '',
    remarks: '',
    platforms: [],
  });


  // ── Non-Recurring Event Form (uses real Event model) ──
  const [nrFormOpen, setNrFormOpen] = useState(false);
  const [nrEditId, setNrEditId] = useState(null);
  const [nrSaving, setNrSaving] = useState(false);
  const [nrForm, setNrForm] = useState({
    name: '', location: '', start_date: '', end_date: '',
    keywords_te: '', keywords_hi: '', keywords_en: '',
    polling_interval_minutes: 60, poll_preset: '60',
    platforms: DEFAULT_EVENT_PLATFORMS,
  });
  const [nrEvents, setNrEvents] = useState([]);
  const [nrLoading, setNrLoading] = useState(false);


  // ── Add to Monitor (Social Profiles) ──
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [addProfilePrefill, setAddProfilePrefill] = useState(null);


  // ── Form fields ──
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [keywordsTe, setKeywordsTe] = useState('');
  const [keywordsHi, setKeywordsHi] = useState('');
  const [keywordsEn, setKeywordsEn] = useState('');
  const [eventPollMinutes, setEventPollMinutes] = useState(60);
  const [eventPollPreset, setEventPollPreset] = useState('60');
  const [selectedPlatforms, setSelectedPlatforms] = useState(DEFAULT_EVENT_PLATFORMS);


  // ── Helpers ──
  const closeActionOverlays = () => {
    setEventFormOpen(false);
    setEditingEvent(null);
    setConfirmDeleteOpen(false);
    setAddProfileOpen(false);
    setAddProfilePrefill(null);
    setExportMenuOpen(false);
    setHcpOpen(false);
  };


  const openCreateDialog = () => { closeActionOverlays(); resetForm(); setEventFormOpen(true); };
  const openDeleteDialog = () => { closeActionOverlays(); setConfirmDeleteOpen(true); };
  const handleSelectEvent = (id) => { closeActionOverlays(); setSelectedId(id); };
  const openHcpCalendar = () => { closeActionOverlays(); setHcpOpen(true); setHcpTab('recurring'); fetchHcpEvents('recurring'); };
  const openHcpNonRecurring = () => { closeActionOverlays(); setHcpOpen(true); setHcpTab('nonRecurring'); fetchHcpEvents('nonRecurring'); };


  // ── Non-Recurring Events (real Event model) ──
  const fetchNrEvents = useCallback(async () => {
    setNrLoading(true);
    try {
      const res = await api.get('/events', { params: { status: 'all' } });
      setNrEvents(res.data || []);
    } catch { toast.error('Failed to load events'); }
    finally { setNrLoading(false); }
  }, []);


  const nrFiltered = useMemo(() => {
    if (!hcpSearch.trim()) return nrEvents;
    const q = hcpSearch.toLowerCase();
    return nrEvents.filter(e => e.name?.toLowerCase().includes(q) || e.location?.toLowerCase().includes(q) || e.keywords?.some(k => k.keyword?.toLowerCase().includes(q)));
  }, [nrEvents, hcpSearch]);


  const openNrCreate = () => {
    setNrEditId(null);
    setNrForm({
      name: '', location: '', start_date: '', end_date: '',
      keywords_te: '', keywords_hi: '', keywords_en: '',
      polling_interval_minutes: 60, poll_preset: '60',
      platforms: DEFAULT_EVENT_PLATFORMS,
    });
    setNrFormOpen(true);
  };
  const openNrEdit = (evt) => {
    setNrEditId(evt.id);
    const kwFields = keywordsToLangFields(evt.keywords || []);
    const plats = Array.isArray(evt.platforms) ? evt.platforms.filter(Boolean) : [];
    const minutes = Number(evt.polling_interval_minutes) || 60;
    setNrForm({
      name: evt.name || '',
      location: evt.location || '',
      start_date: evt.start_date ? new Date(evt.start_date).toISOString().split('T')[0] : '',
      end_date: evt.end_date ? new Date(evt.end_date).toISOString().split('T')[0] : '',
      keywords_te: kwFields.te,
      keywords_hi: kwFields.hi,
      keywords_en: kwFields.en,
      polling_interval_minutes: minutes,
      poll_preset: resolvePollPreset(minutes),
      platforms: plats.length ? plats : DEFAULT_EVENT_PLATFORMS,
    });
    setNrFormOpen(true);
  };


  const handleNrSave = async (e) => {
    e.preventDefault();
    if (!nrForm.name) { toast.error('Event name is required'); return; }
    if (!(nrForm.platforms || []).length) { toast.error('Select at least one platform'); return; }
    if (nrForm.start_date && nrForm.end_date && new Date(nrForm.end_date) < new Date(nrForm.start_date)) { toast.error('End date must be after start date'); return; }
    const pollMins = Number(nrForm.polling_interval_minutes);
    if (!Number.isFinite(pollMins) || pollMins < 1) {
      toast.error('Monitoring interval must be at least 1 minute');
      return;
    }
    setNrSaving(true);
    try {
      const kw = [];
      nrForm.keywords_te.split(/[,\n]/).filter(Boolean).forEach(k => kw.push({ keyword: k.trim(), language: 'te' }));
      nrForm.keywords_hi.split(/[,\n]/).filter(Boolean).forEach(k => kw.push({ keyword: k.trim(), language: 'hi' }));
      nrForm.keywords_en.split(/[,\n]/).filter(Boolean).forEach(k => kw.push({ keyword: k.trim(), language: 'en' }));
      const payload = {
        name: nrForm.name, location: nrForm.location,
        keywords: kw, platforms: nrForm.platforms || DEFAULT_EVENT_PLATFORMS,
        ...(nrForm.start_date ? { start_date: nrForm.start_date } : {}),
        ...(nrForm.end_date ? { end_date: nrForm.end_date } : {}),
        polling_interval_minutes: Number(nrForm.polling_interval_minutes) || 60
      };
      if (nrEditId) {
        await api.put(`/events/${nrEditId}`, payload);
        toast.success('Event updated');
      } else {
        await api.post('/events', payload);
        toast.success('Event created');
      }
      setNrFormOpen(false);
      setNrEditId(null);
      await fetchNrEvents();
      await fetchEvents(); // refresh main list too
    } catch (err) { toast.error(err?.response?.data?.message || 'Save failed'); }
    finally { setNrSaving(false); }
  };


  const handleNrDelete = async (id) => {
    if (!window.confirm('Delete this event permanently?')) return;
    try {
      await api.delete(`/events/${id}`);
      toast.success('Event deleted');
      await fetchNrEvents();
      await fetchEvents();
    } catch { toast.error('Delete failed'); }
  };


  // ── Data Fetching ──
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await api.get('/events', { params: { status: 'all' } });
      setEvents(res.data || []);
      if (!selectedIdRef.current && res.data?.length > 0) setSelectedId(res.data[0].id);
    } catch {
      toast.error('Failed to load events');
    } finally {
      setLoadingEvents(false);
    }
  }, []);


  const fetchDashboard = useCallback(async (id) => {
    if (!id) return;
    setLoadingDashboard(true);
    try {
      const res = await api.get(`/events/${id}/dashboard`);
      setDashboard(res.data);
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoadingDashboard(false);
    }
  }, []);


  const fetchEventContent = useCallback(async (id, page = 1, platform = 'all') => {
    if (!id) return;
    setContentLoadingMore(true);
    try {
      const res = await api.get(`/events/${id}/content`, {
        params: { page, limit: 50, platform }
      });
      const data = res.data || {};
      if (page === 1) {
        setContentItems(data.content || []);
      } else {
        setContentItems(prev => [...prev, ...(data.content || [])]);
      }
      setContentPage(page);
      setContentHasMore(data.has_more !== false);
    } catch {
      toast.error('Failed to load content');
    } finally {
      setContentLoadingMore(false);
    }
  }, []);


  // ── Occasion Calendar fetching & CRUD ──
  const fetchHcpEvents = useCallback(async (tabOverride) => {
    const t = tabOverride || hcpTab;
    setHcpLoading(true);
    try {
      const res = await api.get('/occasion-calendar', { params: { recurring: t === 'recurring' ? 'true' : 'false' } });
      setHcpEvents(res.data || []);
    } catch { toast.error('Failed to load calendar events'); }
    finally { setHcpLoading(false); }
  }, [hcpTab]);


  const hcpFiltered = useMemo(() => {
    if (!hcpSearch.trim()) return hcpEvents;
    const q = hcpSearch.toLowerCase();
    return hcpEvents.filter(e => e.occasion?.toLowerCase().includes(q) || e.keywords?.toLowerCase().includes(q) || e.date?.toLowerCase().includes(q));
  }, [hcpEvents, hcpSearch]);


  const handleHcpTabChange = (t) => {
    setHcpTab(t); setHcpSearch('');
    fetchHcpEvents(t);
  };
  const emptyHcpForm = () => ({
    occasion: '',
    date: '',
    monitoringRange: '',
    rangeFrom: '',
    rangeTo: '',
    keywords: '',
    remarks: '',
    platforms: [],
  });

  const openHcpCreate = () => {
    setHcpEditId(null);
    setHcpForm(emptyHcpForm());
    setHcpFormOpen(true);
  };
  const openHcpEdit = (evt) => {
    const range = splitMonitoringRange(evt.monitoringRange);
    const plats = Array.isArray(evt.platforms) ? evt.platforms.filter(Boolean) : [];
    setHcpEditId(evt.id);
    setHcpForm({
      occasion: evt.occasion || '',
      date: evt.date || '',
      monitoringRange: evt.monitoringRange || '',
      rangeFrom: range.from,
      rangeTo: range.to,
      keywords: evt.keywords || '',
      remarks: evt.remarks || '',
      platforms: plats.length ? plats : DEFAULT_EVENT_PLATFORMS,
    });
    setHcpFormOpen(true);
  };

  const updateHcpRange = (patch) => {
    setHcpForm((prev) => {
      const next = { ...prev, ...patch };
      const fromDate = parseLabelDate(next.rangeFrom);
      const toDate = parseLabelDate(next.rangeTo);
      const parts = [];
      if (fromDate) parts.push(formatRangePart(fromDate));
      else if (next.rangeFrom) parts.push(next.rangeFrom);
      if (toDate) parts.push(formatRangePart(toDate));
      else if (next.rangeTo) parts.push(next.rangeTo);
      next.monitoringRange = parts.join(' – ');
      return next;
    });
  };

  const handleHcpSave = async (e) => {
    e.preventDefault();
    if (!hcpForm.occasion || !hcpForm.date) { toast.error('Occasion name and date are required'); return; }
    if (!(hcpForm.platforms || []).length) { toast.error('Select at least one platform'); return; }
    setHcpSaving(true);
    try {
      const payload = {
        occasion: hcpForm.occasion,
        date: hcpForm.date,
        monitoringRange: hcpForm.monitoringRange,
        keywords: hcpForm.keywords,
        remarks: hcpForm.remarks,
        platforms: hcpForm.platforms || DEFAULT_EVENT_PLATFORMS,
      };
      if (hcpEditId) {
        await api.put(`/occasion-calendar/${hcpEditId}`, payload);
        toast.success(hcpTab === 'recurring'
          ? 'Festival updated — also updated in Events list'
          : 'One-time occasion updated — also updated in Events list');
      } else {
        await api.post('/occasion-calendar', { ...payload, isRecurring: hcpTab === 'recurring' });
        toast.success(hcpTab === 'recurring'
          ? 'Festival saved — now in Events list (Stopped). Press Start to monitor.'
          : 'One-time occasion saved — now in Events list (Stopped). Press Start to monitor.');
      }
      setHcpFormOpen(false);
      setHcpForm(emptyHcpForm());
      setHcpEditId(null);
      await fetchHcpEvents();
      await fetchEvents(); // linked monitoring event may have been created/updated
    } catch (err) { toast.error(err?.response?.data?.message || 'Save failed'); }
    finally { setHcpSaving(false); }
  };


  const handleHcpDelete = async (id) => {
    if (!window.confirm('Delete this occasion?')) return;
    try {
      await api.delete(`/occasion-calendar/${id}`);
      toast.success('Occasion deleted');
      await fetchHcpEvents();
      await fetchEvents();
    } catch { toast.error('Delete failed'); }
  };



  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => () => {
    if (kickoffPollRef.current) clearInterval(kickoffPollRef.current);
  }, []);

  // Backfill: ensure occasions have linked monitoring events (fixes missing Events)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([
          api.get('/occasion-calendar', { params: { recurring: 'true' } }),
          api.get('/occasion-calendar', { params: { recurring: 'false' } }),
        ]);
        if (!cancelled) await fetchEvents();
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [fetchEvents]);

  useEffect(() => {
    if (selectedId) {
      fetchDashboard(selectedId);
      fetchEventContent(selectedId, 1, contentPlatform);
    }
  }, [selectedId, fetchDashboard, fetchEventContent, contentPlatform]);


  // ── Prefill from Announcements ──
  useEffect(() => {
    const prefill = routeLocation.state?.prefill;
    if (prefill) {
      setName(prefill.name || '');
      setLocation(prefill.location || '');
      setStartDate(prefill.start_date || '');
      setEndDate(prefill.end_date || '');
      setKeywordsEn(prefill.keywords_en || '');
      setKeywordsTe(prefill.keywords_te || '');
      setKeywordsHi(prefill.keywords_hi || '');
      setEditingEvent(null);
      closeActionOverlays();
      setEventFormOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [routeLocation.state]);


  // ── Derived ──
  const selectedEvent = useMemo(
    () => events.find((e) => String(e.id) === String(selectedId)) || null,
    [events, selectedId]
  );

  const patchEventStatus = (id, next) => {
    setEvents((prev) =>
      prev.map((e) => (String(e.id) === String(id) ? { ...e, ...next } : e))
    );
  };

  const selectedMonitoringHistory = useMemo(
    () => buildMonitoringHistory(selectedEvent?.monitoring_logs, selectedEvent?.monitoring_status),
    [selectedEvent]
  );
  const selectedFetchStats = useMemo(
    () => summarizeFetchHistory(selectedEvent?.last_fetched_history, selectedMonitoringHistory),
    [selectedEvent, selectedMonitoringHistory]
  );

  // Live clock while monitoring — powers Waiting countdown
  const [monitorNow, setMonitorNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isMonitoringStarted(selectedEvent)) return undefined;
    setMonitorNow(Date.now());
    const id = setInterval(() => setMonitorNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [selectedEvent?.id, selectedEvent?.monitoring_status, selectedEvent?.last_fetched_at]);

  const selectedMonitorPhase = useMemo(() => {
    const openSession = selectedMonitoringHistory.find((s) => s.state === 'running');
    return getMonitoringPhase(selectedEvent, monitorNow, {
      isFetching: String(fetchingKickoffId) === String(selectedEvent?.id) || runningScan,
      sessionStartedAt: openSession?.startedAt || null,
    });
  }, [selectedEvent, monitorNow, fetchingKickoffId, runningScan, selectedMonitoringHistory]);


  // Compute events for the selected year (for month counts)
  const eventsForYear = useMemo(() => {
    return events.filter((e) => {
      // Events without dates are shown in all years
      if (!e.start_date && !e.end_date) return true;
      const start = e.start_date ? new Date(e.start_date) : null;
      const end = e.end_date ? new Date(e.end_date) : null;
      if (start && end) return start.getFullYear() === selectedYear || end.getFullYear() === selectedYear;
      if (start) return start.getFullYear() === selectedYear;
      if (end) return end.getFullYear() === selectedYear;
      return true;
    });
  }, [events, selectedYear]);


  // Count events per month for the selected year
  const monthCounts = useMemo(() => {
    const counts = {};
    eventsForYear.forEach((e) => {
      if (!e.start_date && !e.end_date) {
        // Open-ended events count in every month
        for (let m = 0; m < 12; m++) counts[m] = (counts[m] || 0) + 1;
        return;
      }
      const start = e.start_date ? new Date(e.start_date) : new Date(selectedYear, 0, 1);
      const end = e.end_date ? new Date(e.end_date) : new Date(selectedYear, 11, 31);
      const sYear = start.getFullYear();
      const sMonth = start.getMonth();
      const eYear = end.getFullYear();
      const eMonth = end.getMonth();
      let y = sYear, m = sMonth;
      while (y < eYear || (y === eYear && m <= eMonth)) {
        if (y === selectedYear) {
          counts[m] = (counts[m] || 0) + 1;
        }
        m++;
        if (m > 11) { m = 0; y++; }
      }
    });
    return counts;
  }, [eventsForYear, selectedYear]);


  // Filter events by selected month/year + search query + origin filter
  const filteredEvents = useMemo(() => {
    let result = events;


    // Filter by month/year
    if (selectedMonth !== null) {
      result = result.filter((e) => {
        // Events without dates shown in all months
        if (!e.start_date && !e.end_date) return true;
        const start = e.start_date ? new Date(e.start_date) : new Date(selectedYear, 0, 1);
        const end = e.end_date ? new Date(e.end_date) : new Date(selectedYear, 11, 31, 23, 59, 59);
        const monthStart = new Date(selectedYear, selectedMonth, 1);
        const monthEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
        return start <= monthEnd && end >= monthStart;
      });
    } else {
      // When "All" is selected, still scope to the selected year
      result = eventsForYear;
    }


    // Apply origin filter
    if (originFilter === 'recurring') {
      result = result.filter(isRecurringEvent);
    } else if (originFilter === 'manual') {
      result = result.filter((e) => !isRecurringEvent(e));
    }


    // Apply monitoring filter
    if (statusFilter === 'started' || statusFilter === 'active') {
      result = result.filter((e) => isMonitoringStarted(e));
    } else if (statusFilter === 'stopped' || statusFilter === 'paused') {
      result = result.filter((e) => !isMonitoringStarted(e));
    }


    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(q) || (e.location || '').toLowerCase().includes(q));
    }


    // Newest created first
    return [...result].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return Number(b.id) - Number(a.id);
    });
  }, [events, eventsForYear, searchQuery, selectedMonth, selectedYear, originFilter, statusFilter]);


  // Counts for origin filter badges
  const originCounts = useMemo(() => {
    const base = selectedMonth !== null
      ? events.filter((e) => {
          if (!e.start_date && !e.end_date) return true;
          const start = e.start_date ? new Date(e.start_date) : new Date(selectedYear, 0, 1);
          const end = e.end_date ? new Date(e.end_date) : new Date(selectedYear, 11, 31, 23, 59, 59);
          const monthStart = new Date(selectedYear, selectedMonth, 1);
          const monthEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59);
          return start <= monthEnd && end >= monthStart;
        })
      : eventsForYear;
    return {
      all: base.length,
      recurring: base.filter(isRecurringEvent).length,
      manual: base.filter((e) => !isRecurringEvent(e)).length,
    };
  }, [events, eventsForYear, selectedMonth, selectedYear]);


  const filteredRecentContent = useMemo(() => {
    return contentItems;
  }, [contentItems]);


  const filteredRecentAlerts = useMemo(() => {
    const arr = dashboard?.recent_alerts || [];
    return contentPlatform === 'all' ? arr : arr.filter((a) => a.platform === contentPlatform);
  }, [dashboard, contentPlatform]);

  const eventPlatformTabs = useMemo(() => {
    const configured = new Set(
      (Array.isArray(selectedEvent?.platforms) ? selectedEvent.platforms : [])
        .map((p) => String(p || '').toLowerCase().replace(/^twitter$/, 'x'))
        .filter(Boolean)
    );
    return Object.entries(PLATFORM_CONFIG).filter(([key]) => key === 'all' || configured.has(key));
  }, [selectedEvent]);

  useEffect(() => {
    if (contentPlatform === 'all') return;
    const allowed = new Set(eventPlatformTabs.map(([key]) => key));
    if (!allowed.has(contentPlatform)) setContentPlatform('all');
  }, [eventPlatformTabs, contentPlatform]);


  const eventCounts = useMemo(() => {
    const active = events.filter((e) => isMonitoringStarted(e)).length;
    const paused = events.filter((e) => !isMonitoringStarted(e)).length;
    return { active, paused, total: events.length };
  }, [events]);


  // ── Actions ──
  const buildPayload = () => {
    const kw = [];
    splitKeywords(keywordsTe).forEach((k) => kw.push({ keyword: k, language: 'te' }));
    splitKeywords(keywordsHi).forEach((k) => kw.push({ keyword: k, language: 'hi' }));
    splitKeywords(keywordsEn).forEach((k) => kw.push({ keyword: k, language: 'en' }));
    const payload = {
      name,
      location,
      keywords: kw,
      platforms: selectedPlatforms,
      polling_interval_minutes: Number(eventPollMinutes) || 60,
    };
    if (startDate) payload.start_date = startDate;
    if (endDate) payload.end_date = endDate;
    return payload;
  };


  const resetForm = () => {
    setName(''); setLocation(''); setStartDate(''); setEndDate('');
    setKeywordsTe(''); setKeywordsHi(''); setKeywordsEn('');
    setEventPollMinutes(60); setEventPollPreset('60');
    setSelectedPlatforms(DEFAULT_EVENT_PLATFORMS);
  };


  const handleStartEdit = () => {
    if (!selectedEvent) return;
    closeActionOverlays();
    const kwFields = keywordsToLangFields(selectedEvent.keywords || []);
    setName(selectedEvent.name || '');
    setLocation(selectedEvent.location || '');
    setStartDate(selectedEvent.start_date ? new Date(selectedEvent.start_date).toISOString().split('T')[0] : '');
    setEndDate(selectedEvent.end_date ? new Date(selectedEvent.end_date).toISOString().split('T')[0] : '');
    setKeywordsTe(kwFields.te);
    setKeywordsHi(kwFields.hi);
    setKeywordsEn(kwFields.en);
    const minutes = Number(selectedEvent.polling_interval_minutes) || 60;
    setEventPollMinutes(minutes);
    setEventPollPreset(resolvePollPreset(minutes));
    const plats = Array.isArray(selectedEvent.platforms) ? selectedEvent.platforms.filter(Boolean) : [];
    setSelectedPlatforms(plats.length ? plats : DEFAULT_EVENT_PLATFORMS);
    setEditingEvent(selectedEvent);
    setEventFormOpen(true);
  };


  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name) { toast.error('Event name is required'); return; }
    if (!selectedPlatforms.length) { toast.error('Select at least one platform'); return; }
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) { toast.error('End date must be after start date'); return; }
    const pollMins = Number(eventPollMinutes);
    if (!Number.isFinite(pollMins) || pollMins < 1) {
      toast.error('Monitoring interval must be at least 1 minute');
      return;
    }
    setCreating(true);
    try {
      if (editingEvent) {
        await api.put(`/events/${editingEvent.id}`, buildPayload());
        toast.success('Event updated successfully');
      } else {
        const res = await api.post('/events', buildPayload());
        toast.success('Event created (stopped). Press Start when you want monitoring.');
        setSelectedId(res.data?.id);
      }
      resetForm();
      setEventFormOpen(false);
      setEditingEvent(null);
      await fetchEvents();
      if (editingEvent) await fetchDashboard(selectedId);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Operation failed');
    } finally {
      setCreating(false);
    }
  };


  const handleRunScan = async () => {
    if (!selectedId) return;
    setRunningScan(true);
    try {
      await api.post(`/events/${selectedId}/run`);
      toast.success('Scan completed — new content ingested');
      await fetchDashboard(selectedId);
      await fetchEventContent(selectedId, 1, contentPlatform);
      await fetchEvents();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Scan failed');
    } finally {
      setRunningScan(false);
    }
  };


  const handleToggleMonitoring = async (eventId) => {
    const id = eventId || selectedId;
    if (!id) return;
    if (monitoringBusyRef.current) {
      toast.message('Wait for the current Start/Stop to finish');
      return;
    }
    monitoringBusyRef.current = String(id);
    setMonitoringBusyId(String(id));
    try {
      const res = await api.put(`/events/${id}/monitoring`);
      const next = res.data || {};
      patchEventStatus(id, next);
      toast.success(
        next.monitoring_status === 'started'
          ? 'Monitoring started — fetching in background'
          : 'Monitoring stopped'
      );
      await fetchEvents();
      if (String(id) === String(selectedIdRef.current)) {
        await fetchDashboard(id);
      }

      // Background first fetch: poll this event until last_fetched_at updates
      if (next.monitoring_status === 'started') {
        if (kickoffPollRef.current) clearInterval(kickoffPollRef.current);
        const startedAt = Date.now();
        setFetchingKickoffId(String(id));
        let tries = 0;
        kickoffPollRef.current = setInterval(async () => {
          tries += 1;
          try {
            const listRes = await api.get('/events', { params: { status: 'all' } });
            const list = listRes.data || [];
            setEvents(list);
            const ev = list.find((e) => String(e.id) === String(id));
            const fetchedAt = ev?.last_fetched_at ? new Date(ev.last_fetched_at).getTime() : 0;
            if (fetchedAt >= startedAt - 2000 || tries >= 45) {
              clearInterval(kickoffPollRef.current);
              kickoffPollRef.current = null;
              setFetchingKickoffId(null);
              if (String(id) === String(selectedIdRef.current)) {
                await fetchDashboard(id);
                await fetchEventContent(id, 1, contentPlatform);
              }
              if (fetchedAt >= startedAt - 2000) {
                toast.success('First fetch complete');
              }
            }
          } catch {
            if (tries >= 45) {
              clearInterval(kickoffPollRef.current);
              kickoffPollRef.current = null;
              setFetchingKickoffId(null);
            }
          }
        }, 2000);
      } else {
        if (kickoffPollRef.current) {
          clearInterval(kickoffPollRef.current);
          kickoffPollRef.current = null;
        }
        setFetchingKickoffId(null);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to update monitoring');
    } finally {
      monitoringBusyRef.current = null;
      setMonitoringBusyId(null);
    }
  };


  const handleDelete = async () => {
    if (!selectedId) return;
    setProcessingAction(true);
    try {
      await api.delete(`/events/${selectedId}`);
      toast.success('Event deleted');
      setSelectedId(null); setDashboard(null); setConfirmDeleteOpen(false);
      setContentItems([]); setContentPage(1); setContentHasMore(true);
      await fetchEvents();
    } catch { toast.error('Failed to delete'); } finally { setProcessingAction(false); }
  };


  // Keep the latest loader in a ref so the IntersectionObserver effect below
  // can stay stable (no re-attach on every render). Re-attaching the observer
  // each render caused it to fire immediately on layout, which on short feeds
  // looked like a fetch loop while the sentinel stayed in view.
  const loadMoreRef = useRef(() => {});
  loadMoreRef.current = () => {
    if (!selectedId || contentLoadingMore || !contentHasMore) return;
    fetchEventContent(selectedId, contentPage + 1, contentPlatform);
  };


  const contentSentinelRef = useRef(null);
  useEffect(() => {
    const el = contentSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreRef.current();
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectedId]);


  const handleOpenAddSource = (item) => {
    if (!item) return;
    closeActionOverlays();

    const sourcePlatform = String(item.platform || '')
      .trim()
      .toLowerCase()
      .replace(/^twitter$/, 'x');
    if (!sourcePlatform) {
      toast.error('Unable to identify platform for this post');
      return;
    }

    const cleanHandle = (value) => String(value || '').trim().replace(/^@/, '');
    const looksLikeUsername = (value) => {
      const v = cleanHandle(value);
      return Boolean(v) && !/\s/.test(v) && v.length <= 64 && !/^unknown$/i.test(v);
    };
    const raw = item.raw_data && typeof item.raw_data === 'object' ? item.raw_data : {};
    const contentUrl = String(item.content_url || item.url || '').trim();
    const displayName = String(item.author || item.author_name || '').trim();
    const data = {};

    if (sourcePlatform === 'youtube') {
      const channelId =
        cleanHandle(item.channel_id || raw.channelId || raw.channel_id || '') ||
        (/^UC[\w-]{20,}$/i.test(cleanHandle(item.author_handle))
          ? cleanHandle(item.author_handle)
          : '');
      const handleCandidate = cleanHandle(
        raw.customUrl ||
          (looksLikeUsername(item.author_handle) && !/^UC[\w-]{20,}$/i.test(cleanHandle(item.author_handle))
            ? item.author_handle
            : '')
      );
      if (channelId) {
        data.channel_id = channelId;
        data.channel_url = `https://www.youtube.com/channel/${channelId}`;
      } else if (handleCandidate) {
        data.channel_url = `https://www.youtube.com/@${handleCandidate.replace(/^@/, '')}`;
      } else {
        toast.error('Unable to identify YouTube channel for this post');
        return;
      }
    } else if (sourcePlatform === 'facebook') {
      const handle = cleanHandle(item.author_handle || raw.author?.id || raw.page_id || '');
      const authorUrl = String(raw.author?.url || '').trim();
      const isPageUrl = (u) =>
        /facebook\.com\//i.test(u) &&
        !/\/(posts|permalink|watch|reel|videos|share|story)\b/i.test(u);
      let pageUrl = '';
      if (authorUrl && isPageUrl(authorUrl)) pageUrl = authorUrl;
      else if (contentUrl && isPageUrl(contentUrl)) pageUrl = contentUrl;
      else if (contentUrl) {
        const m = contentUrl.match(/facebook\.com\/([^/?#]+)\/(?:posts|photos|videos|reels)\b/i);
        if (m?.[1] && !/^(permalink\.php|watch|story\.php)$/i.test(m[1])) {
          pageUrl = `https://www.facebook.com/${m[1]}`;
        }
      }
      if (!pageUrl && handle) {
        pageUrl = /^https?:\/\//i.test(handle)
          ? handle
          : `https://www.facebook.com/${handle}`;
      }
      if (!pageUrl) {
        toast.error('Unable to identify Facebook page for this post');
        return;
      }
      data.url = pageUrl;
      if (handle && /^\d+$/.test(handle)) data.page_id = handle;
      else if (raw.page_id) data.page_id = String(raw.page_id);
    } else if (sourcePlatform === 'telegram') {
      let username = '';
      const fromHandle = cleanHandle(item.author_handle || raw.author?.username || raw.channel_username || '');
      if (looksLikeUsername(fromHandle) && !/^\d+$/.test(fromHandle)) username = fromHandle;

      let tmeUrl = '';
      const urlCandidates = [contentUrl, raw.url, raw.author?.url].filter(Boolean);
      for (const u of urlCandidates) {
        const m = String(u).match(/t\.me\/([A-Za-z0-9_]+)/i);
        if (m?.[1] && !/^(c|s|joinchat)$/i.test(m[1])) {
          username = username || m[1];
          tmeUrl = `https://t.me/${m[1]}`;
          break;
        }
      }

      const externalId = String(item.content_id || '').trim();
      let channelId = String(raw.channel_id || raw.peer_id || raw.author?.id || '').trim();
      if (!channelId && externalId.includes('_')) {
        const head = externalId.split('_')[0];
        if (/^-?\d+$/.test(head)) channelId = head;
      }

      if (username) {
        data.username = username;
        data.url = tmeUrl || `https://t.me/${username}`;
      } else if (tmeUrl) {
        data.url = tmeUrl;
      }
      if (channelId) data.channel_id = channelId;

      if (!data.username && !data.url && !data.channel_id) {
        toast.error('Unable to identify Telegram channel for this post');
        return;
      }
    } else {
      // x / instagram / others
      const identifier = cleanHandle(
        item.author_handle || raw.author_handle || raw.username || item.author || ''
      );
      if (!looksLikeUsername(identifier)) {
        toast.error('Unable to identify handle for this post');
        return;
      }
      data.username = identifier;
    }

    setAddProfilePrefill({
      platform: sourcePlatform,
      display_name: displayName || data.username || data.channel_id || 'Profile',
      data,
    });
    setAddProfileOpen(true);
  };


  // ── Export ──
  const handleExportSelectedEventExcel = () => {
    if (!dashboard) return;
    const rows = [];
    filteredRecentAlerts.forEach((a) => {
      rows.push({
        Type: 'ALERT',
        Time: a.created_at ? new Date(a.created_at).toISOString() : '',
        Platform: a.platform || '',
        Author: a.author || '',
        Text: a.title || '',
        URL: a.content_url || ''
      });
    });
    filteredRecentContent.forEach((c) => {
      rows.push({
        Type: 'CONTENT',
        Time: c.published_at ? new Date(c.published_at).toISOString() : '',
        Platform: c.platform || '',
        Author: c.author || '',
        Text: c.text || '',
        URL: c.content_url || ''
      });
    });


    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Selected Event');
    XLSX.writeFile(wb, `event-${dashboard.event?.id || 'report'}-selected.xlsx`);
    toast.success('Selected event Excel exported');
    setExportMenuOpen(false);
  };


  const handleExportSelectedEventPdf = () => {
    if (!dashboard) return;
    openPrintableReport({ event: dashboard.event, stats: dashboard.stats, content: filteredRecentContent, alerts: filteredRecentAlerts });
    setExportMenuOpen(false);
  };


  /** Helper: render a QR code to a data URL using an offscreen QRCodeCanvas */
  const generateQRDataUrl = (url, size = 120) => {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);
    return new Promise((resolve) => {
      const root = createRoot(container);
      root.render(
        React.createElement(QRCodeCanvas, { value: url, size, level: 'M', includeMargin: true })
      );
      setTimeout(() => {
        const qrCanvas = container.querySelector('canvas');
        const dataUrl = qrCanvas ? qrCanvas.toDataURL('image/png') : null;
        root.unmount();
        document.body.removeChild(container);
        resolve(dataUrl);
      }, 100);
    });
  };


  /** Get the QR/report URL for a row — prefers S3 PDF URL */
  const getRowReportUrl = (row) => {
    if (row.reportUrl) return row.reportUrl;
    if (row.eventId) return `${window.location.origin}/events?selected=${row.eventId}`;
    return '';
  };


  const handleExportAllEventsExcel = async () => {
    try {
      const [reportRes, calRes] = await Promise.all([
        api.get('/events/report'),
        api.get('/occasion-calendar', { params: { recurring: 'true' } })
      ]);
      const enrichedEvents = Array.isArray(reportRes.data)
        ? reportRes.data
        : (reportRes.data?.events || []);
      const calendarEvents = Array.isArray(calRes.data) ? calRes.data : [];
      const rows = buildReportRows({ calendarEvents, events: enrichedEvents });
      if (!rows.length) {
        toast.error('No events to export');
        setExportMenuOpen(false);
        return;
      }
      const now = new Date();
      const generatedAt = now.toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });


      const wsData = [
        ['Events Report'],
        [`Report Generated: ${generatedAt}`],
        [],
        ['Sl.No', 'Event Name', 'Event Date', 'Monitoring Range', 'Keywords (Given by Team)', 'New Keywords Fetched', 'QR Code'],
      ];


      const qrImages = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const reportUrl = getRowReportUrl(r);
        wsData.push([
          i + 1,
          r.eventName,
          r.eventDate,
          r.monitoringRange,
          r.keywordsGiven,
          r.newKeywordsFetched,
          '' // QR placeholder
        ]);
        if (reportUrl) {
          const dataUrl = await generateQRDataUrl(reportUrl, 100);
          if (dataUrl) qrImages.push({ row: i + 4, col: 6, dataUrl });
        }
      }


      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 6 }, { wch: 40 }, { wch: 18 }, { wch: 16 },
        { wch: 35 }, { wch: 30 }, { wch: 18 }
      ];
      ws['!rows'] = [];
      for (let i = 0; i < wsData.length; i++) {
        if (i >= 4) ws['!rows'][i] = { hpt: 80 };
      }
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      ];
      qrImages.forEach(({ row }) => {
        const cell = XLSX.utils.encode_cell({ r: row, c: 6 });
        if (ws[cell]) ws[cell].v = '\uD83D\uDCF1 Scan QR in PDF/Print';
      });


      XLSX.utils.book_append_sheet(wb, ws, 'Events Report');
      const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      saveAs(new Blob([wbOut], { type: 'application/octet-stream' }), `Events_Report_${now.toISOString().slice(0, 10)}.xlsx`);
      toast.success('Events Report Excel exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export Excel');
    }
    setExportMenuOpen(false);
  };


  const handleExportAllEventsPdf = async () => {
    try {
      const [reportRes, calRes] = await Promise.all([
        api.get('/events/report'),
        api.get('/occasion-calendar', { params: { recurring: 'true' } })
      ]);
      const enrichedEvents = Array.isArray(reportRes.data)
        ? reportRes.data
        : (reportRes.data?.events || []);
      const calendarEvents = Array.isArray(calRes.data) ? calRes.data : [];
      const rows = buildReportRows({ calendarEvents, events: enrichedEvents });
      if (!rows.length) {
        toast.error('No events to export');
        setExportMenuOpen(false);
        return;
      }
      const now = new Date();
      const generatedAt = now.toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });


      // Pre-generate QR codes
      const qrDataUrls = {};
      for (const r of rows) {
        const url = getRowReportUrl(r);
        if (url) {
          const dataUrl = await generateQRDataUrl(url, 150);
          if (dataUrl) qrDataUrls[r.eventId || r.eventName] = dataUrl;
        }
      }


      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(18);
      doc.text('Events Report', 14, 20);
      doc.setFontSize(10);
      doc.text(`Report Generated: ${generatedAt}`, 14, 28);

      doc.autoTable({
        startY: 36,
        head: [['Sl.No', 'Event Name', 'Event Date', 'Monitoring\nRange', 'Keywords (Given by Team)', 'New Keywords\nFetched', 'QR Code']],
        body: rows.map((r, idx) => [
          idx + 1,
          r.eventName,
          r.eventDate,
          r.monitoringRange,
          r.keywordsGiven,
          r.newKeywordsFetched,
          '' // QR placeholder
        ]),
        columnStyles: {
          0: { cellWidth: 12 },
          1: { cellWidth: 55 },
          2: { cellWidth: 30 },
          3: { cellWidth: 24 },
          4: { cellWidth: 60 },
          5: { cellWidth: 45 },
          6: { cellWidth: 30 },
        },
        styles: { fontSize: 7, cellPadding: 3, minCellHeight: 25 },
        headStyles: { fillColor: [26, 26, 46], textColor: 255, fontStyle: 'bold', fontSize: 7 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 6) {
            const r = rows[data.row.index];
            const key = r?.eventId || r?.eventName;
            if (key && qrDataUrls[key]) {
              const dim = Math.min(data.cell.height - 2, 22);
              doc.addImage(
                qrDataUrls[key],
                'PNG',
                data.cell.x + (data.cell.width - dim) / 2,
                data.cell.y + (data.cell.height - dim) / 2,
                dim, dim
              );
            }
          }
        },
      });


      doc.save(`Events_Report_${now.toISOString().slice(0, 10)}.pdf`);
      toast.success('Events Report PDF exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export PDF');
    }
    setExportMenuOpen(false);
  };



  // ── Status badge ──
  const StatusBadge = ({ status }) => {
    const key = status === 'started' || status === 'active' ? 'started' : 'stopped';
    const cfg = STATUS_CONFIG[key];
    return (
      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 border font-semibold gap-1.5 ${cfg.color}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} ${key === 'started' ? 'animate-pulse' : ''}`} />
        {cfg.label}
      </Badge>
    );
  };


  // ══════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════
  return (
    <div
      className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] flex-col gap-2.5 max-w-[1600px] mx-auto w-full"
      data-testid="events-page"
    >
      {/* Title row — counts fill the middle (Grievances-style), actions stay right */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 shrink-0">
        <div className="min-w-0 shrink-0">
          <h1 className="text-xl font-heading font-bold tracking-tight leading-none">Events</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            Start / stop monitoring across platforms
          </p>
        </div>

        <div className="inline-flex items-center gap-1 flex-wrap">
          <button
            type="button"
            title="Events currently being monitored"
            onClick={() => setStatusFilter(statusFilter === 'started' || statusFilter === 'active' ? 'all' : 'started')}
            className={`inline-flex items-baseline gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
              statusFilter === 'started' || statusFilter === 'active'
                ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse self-center" />
            <span className="tabular-nums font-semibold text-foreground">{eventCounts.active}</span>
            <span>live</span>
          </button>
          <button
            type="button"
            title="Events with monitoring stopped"
            onClick={() => setStatusFilter(statusFilter === 'stopped' || statusFilter === 'paused' ? 'all' : 'stopped')}
            className={`inline-flex items-baseline gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
              statusFilter === 'stopped' || statusFilter === 'paused'
                ? 'border-amber-400 bg-amber-50 text-amber-900'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <span className="tabular-nums font-semibold text-foreground">{eventCounts.paused}</span>
            <span>stopped</span>
          </button>
          <button
            type="button"
            title="All events in the selected year"
            onClick={() => setStatusFilter('all')}
            className={`inline-flex items-baseline gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors ${
              statusFilter === 'all'
                ? 'border-foreground/30 bg-muted text-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
            }`}
          >
            <span className="tabular-nums font-semibold text-foreground">{eventCounts.total}</span>
            <span>total</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            title="Occasion Calendar · Recurring templates"
            onClick={openHcpCalendar}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Recurring</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            title="Occasion Calendar · One-time templates"
            onClick={openHcpNonRecurring}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">One-time</span>
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openCreateDialog}>
            <Plus className="h-3.5 w-3.5" />
            New Event
          </Button>
        </div>
      </div>


      {/* ── Main ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden w-full rounded-xl border border-border bg-card">


        {/* Far-Left — Month Sidebar */}
        <EventMonthSidebar
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          monthCounts={monthCounts}
          onSelectMonth={setSelectedMonth}
          onChangeYear={setSelectedYear}
          totalCount={eventsForYear.length}
        />


        {/* Left — Events List */}
        <div className="hidden md:flex shrink-0 border-r border-border flex-col bg-card relative" style={{ width: sidebarWidth }}>
          <div className="px-2.5 py-2 border-b border-border space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search events..."
                className="pl-8 h-8 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <div className="flex gap-1 flex-wrap">
              {[
                { key: 'all', label: 'All', count: originCounts.all, title: 'All monitoring events this year' },
                { key: 'recurring', label: 'Festivals', count: originCounts.recurring, title: 'From Occasion Calendar · Recurring' },
                { key: 'manual', label: 'One-time', count: originCounts.manual, title: 'One-time occasions + New Event' },
              ].map((f) => (
                <button
                  key={f.key}
                  type="button"
                  title={f.title}
                  onClick={() => setOriginFilter(f.key)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors ${
                    originFilter === f.key
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {f.label}
                  <span className="tabular-nums opacity-80">{f.count}</span>
                </button>
              ))}
            </div>
          </div>


          <ScrollArea className="flex-1">
            <div className="p-1.5 space-y-0.5">
              {loadingEvents ? (
                <div className="py-16 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-amber-500" /></div>
              ) : filteredEvents.length === 0 ? (
                <div className="py-12 px-3 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {searchQuery
                      ? 'No matching events'
                      : selectedMonth !== null
                        ? 'No events in this month'
                        : 'No events yet'}
                  </p>
                  {selectedMonth !== null && eventsForYear.length > 0 && (
                    <button
                      type="button"
                      className="text-[11px] text-primary underline underline-offset-2"
                      onClick={() => setSelectedMonth(null)}
                    >
                      Show all {eventsForYear.length} this year
                    </button>
                  )}
                </div>
              ) : (
                filteredEvents.map((e) => {
                  const isSelected = String(selectedId) === String(e.id);
                  const isLive = isMonitoringStarted(e);
                  const displayStatus = isLive ? 'started' : 'stopped';
                  const cfg = STATUS_CONFIG[displayStatus];
                  const eventMonth = e.start_date ? new Date(e.start_date).getMonth() : new Date().getMonth();
                  const mTheme = selectedMonth !== null ? MONTH_THEMES[selectedMonth] : MONTH_THEMES[eventMonth];
                  return (
                    <button key={e.id} type="button" onClick={() => handleSelectEvent(e.id)}
                      className={`w-full text-left rounded-lg px-2.5 py-2 transition-all duration-200 border
                        ${isSelected
                          ? `${mTheme.cardBg} ${mTheme.cardBorder} shadow-sm`
                          : `hover:${mTheme.cardBg} border-transparent hover:${mTheme.cardBorder}`
                        }`}>
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <span className={`font-semibold text-[13px] leading-snug line-clamp-2 min-w-0 ${isSelected ? mTheme.cardAccent : 'text-gray-800 dark:text-gray-200'}`}>{e.name}</span>
                        <span className={`shrink-0 text-[8px] font-bold uppercase rounded px-1.5 py-0.5 leading-none border ${cfg.color}`}>{cfg.label}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground mb-1">
                        {isRecurringEvent(e) ? 'Festival' : e.occasion_calendar_id || e.origin_calendar_id ? 'One-time' : 'Manual'}
                      </p>
                      <div className="flex flex-wrap gap-1 mb-1">
                        {(Array.isArray(e.platforms) ? e.platforms : []).slice(0, 4).map((p) => (
                          <span key={p} className="text-[9px] font-bold uppercase text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-800 rounded px-1.5 py-0.5">{p}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        {e.location && (<span className="flex items-center gap-0.5 truncate"><MapPin className="h-2.5 w-2.5 shrink-0" />{e.location}</span>)}
                        {(e.start_date || e.end_date) && (
                          <span className="flex items-center gap-0.5 shrink-0">
                            <Clock className="h-2.5 w-2.5 shrink-0" />
                            {e.start_date ? new Date(e.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Open'}
                            {' – '}
                            {e.end_date ? new Date(e.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Ongoing'}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5 shrink-0" title={fetchesPerDayHint(e.polling_interval_minutes || 60)}>
                          <Timer className="h-2.5 w-2.5 shrink-0" />
                          {formatPollInterval(e.polling_interval_minutes || 60)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>


          <div className="shrink-0 px-2.5 py-1.5 border-t border-border bg-muted/30 text-[10px] text-muted-foreground flex items-center justify-between">
            <span>{filteredEvents.length} shown · {events.length} total</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchEvents} disabled={loadingEvents}>
              {loadingEvents ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
          {/* Resize handle */}
          <div
            onMouseDown={handleMouseDown}
            className={`absolute top-0 right-0 w-1 h-full cursor-col-resize group hover:bg-amber-400 transition-colors z-10 ${isResizing ? 'bg-amber-400' : 'bg-transparent'}`}
          >
            <div className="absolute top-1/2 -translate-y-1/2 right-0 w-3 h-8 -mr-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-0.5 h-4 bg-amber-400 rounded-full" />
            </div>
          </div>
        </div>


        {/* Right — Dashboard */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden dark:bg-slate-950">


          {/* Mobile picker */}
          <div className="md:hidden shrink-0 px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <Select value={selectedId ? String(selectedId) : ''} onValueChange={(v) => handleSelectEvent(v)}>
              <SelectTrigger className="h-9 text-sm bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-900 dark:text-gray-100"><SelectValue placeholder="Select event..." /></SelectTrigger>
              <SelectContent>{events.map((e) => (<SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>))}</SelectContent>
            </Select>
          </div>


          {/* Dashboard Header */}
          {selectedEvent && (
            <div className="shrink-0 px-3 sm:px-4 py-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-[15px] leading-tight text-gray-900 dark:text-white truncate min-w-0 flex-1">
                    {selectedEvent.name}
                  </h2>
                  {selectedMonitorPhase.phase === 'waiting' ? (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 border font-semibold gap-1.5 border-amber-400 bg-amber-50 text-amber-900 shrink-0">
                      Waiting · <span className="tabular-nums">{formatCountdown(selectedMonitorPhase.remainingMs)}</span>
                    </Badge>
                  ) : selectedMonitorPhase.phase === 'fetching' || selectedMonitorPhase.phase === 'due' ? (
                    <Badge variant="outline" className="text-[10px] px-2 py-0.5 border font-semibold gap-1.5 border-sky-400 bg-sky-50 text-sky-900 shrink-0">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Fetching
                    </Badge>
                  ) : (
                    <StatusBadge status={selectedEvent.monitoring_status} />
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-muted-foreground">
                  {selectedEvent.location && (
                    <span className="inline-flex items-center gap-1 truncate max-w-[10rem]"><MapPin className="h-3 w-3 shrink-0" />{selectedEvent.location}</span>
                  )}
                  {(selectedEvent.start_date || selectedEvent.end_date) ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {selectedEvent.start_date ? new Date(selectedEvent.start_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Open'}
                      {' – '}
                      {selectedEvent.end_date ? new Date(selectedEvent.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Ongoing'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Open-ended</span>
                  )}
                  {selectedEvent.last_fetched_at && (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <Activity className="h-3 w-3" />
                      {new Date(selectedEvent.last_fetched_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1" title="Fetch schedule while Started">
                    <Timer className="h-3 w-3" />
                    {formatPollInterval(selectedEvent.polling_interval_minutes || 60)}
                    <span className="text-muted-foreground/80">({fetchesPerDayHint(selectedEvent.polling_interval_minutes || 60)})</span>
                  </span>
                </div>
                {selectedEvent.keywords?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {selectedEvent.keywords.slice(0, 6).map((kw, i) => (
                      <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                        {kw.keyword}
                      </span>
                    ))}
                    {selectedEvent.keywords.length > 6 && (
                      <span className="text-[10px] text-muted-foreground self-center">+{selectedEvent.keywords.length - 6}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  onClick={() => handleToggleMonitoring(selectedEvent.id)}
                  disabled={String(monitoringBusyId) === String(selectedEvent.id)}
                  className={`h-8 px-3 gap-1.5 text-xs font-semibold ${
                    !isMonitoringStarted(selectedEvent)
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
                  }`}
                >
                  {String(monitoringBusyId) === String(selectedEvent.id)
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : !isMonitoringStarted(selectedEvent)
                      ? <Play className="h-3.5 w-3.5" />
                      : <Square className="h-3.5 w-3.5" />}
                  {isMonitoringStarted(selectedEvent) ? 'Stop' : 'Start'}
                </Button>
                {String(fetchingKickoffId) === String(selectedEvent.id) || selectedMonitorPhase.phase === 'fetching' || selectedMonitorPhase.phase === 'due' ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Fetching…
                  </span>
                ) : selectedMonitorPhase.phase === 'waiting' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
                    <Timer className="h-3 w-3" />
                    Waiting
                    <span className="font-semibold tabular-nums text-amber-950">
                      {formatCountdown(selectedMonitorPhase.remainingMs)}
                    </span>
                  </span>
                ) : null}

                <Button onClick={handleRunScan} disabled={!selectedId || runningScan}
                  size="sm" variant="outline" className="h-8 px-3 gap-1.5 text-xs">
                  {runningScan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  Fetch Now
                </Button>

                <Popover onOpenChange={(open) => {
                  if (open && selectedId) fetchEvents();
                }}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs">
                      <History className="h-3.5 w-3.5" /> History
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-0">
                    <div className="border-b px-3 py-2">
                      <p className="text-sm font-medium">Monitoring history</p>
                      <p className="text-[11px] text-muted-foreground truncate">{selectedEvent.name}</p>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {selectedMonitoringHistory.length === 0 ? (
                        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                          No sessions yet — press Start to begin
                        </p>
                      ) : (
                        <ul className="divide-y">
                          {selectedMonitoringHistory.map((session, sessionIdx) => {
                            const isActive = session.state === 'running' && sessionIdx === 0;
                            const phase = isActive ? selectedMonitorPhase : { phase: session.state === 'done' ? 'stopped' : session.state };
                            const elapsedMs =
                              session.state === 'running' && session.startedAt
                                ? Math.max(0, monitorNow - new Date(session.startedAt).getTime())
                                : session.durationMs;
                            const badge =
                              phase.phase === 'waiting'
                                ? { label: 'Waiting', className: 'border-amber-500/30 bg-amber-500/10 text-amber-800' }
                                : phase.phase === 'fetching' || phase.phase === 'due'
                                  ? { label: 'Fetching', className: 'border-sky-500/30 bg-sky-500/10 text-sky-800' }
                                  : session.state === 'running'
                                    ? { label: 'Running', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' }
                                    : session.state === 'done'
                                      ? { label: 'Stopped', className: 'border-slate-500/25 bg-slate-500/10 text-slate-700' }
                                      : { label: 'Incomplete', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700' };
                            return (
                              <li key={session.id} className="px-3 py-2 text-xs">
                                <div className="mb-0.5 flex items-center justify-between gap-2">
                                  <Badge variant="outline" className={`h-5 capitalize text-[10px] ${badge.className}`}>
                                    {badge.label}
                                  </Badge>
                                  <span className="font-semibold tabular-nums text-muted-foreground">
                                    {formatDuration(elapsedMs)}
                                  </span>
                                </div>
                                <p className="text-muted-foreground">Started {formatWhen(session.startedAt)}</p>
                                {session.stoppedAt ? (
                                  <p className="text-muted-foreground">Stopped {formatWhen(session.stoppedAt)}</p>
                                ) : phase.phase === 'waiting' ? (
                                  <p className="text-amber-800">
                                    Next fetch in <span className="font-semibold tabular-nums">{formatCountdown(phase.remainingMs)}</span>
                                  </p>
                                ) : phase.phase === 'fetching' || phase.phase === 'due' ? (
                                  <p className="text-sky-800">Fetching now…</p>
                                ) : session.state === 'running' ? (
                                  <p className="text-emerald-700">Still monitoring…</p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover onOpenChange={(open) => {
                  if (open && selectedId) {
                    fetchEvents();
                    fetchDashboard(selectedId);
                  }
                }}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs">
                      <BarChart3 className="h-3.5 w-3.5" /> Stats
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-80 p-0">
                    <div className="border-b px-3 py-2">
                      <p className="text-sm font-medium">Fetch stats</p>
                      <p className="text-[11px] text-muted-foreground">Lifetime totals · survive Stop</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 px-3 py-2.5 text-xs">
                      <div>
                        <p className="text-muted-foreground">API hits</p>
                        <p className="font-medium tabular-nums">{selectedFetchStats.apiHits}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Items returned</p>
                        <p className="font-medium tabular-nums">{selectedFetchStats.postsReturned}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">New items</p>
                        <p className="font-medium tabular-nums">{selectedFetchStats.postsNew}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Run time</p>
                        <p className="font-medium tabular-nums">{formatDuration(selectedFetchStats.totalRunningMs)}</p>
                      </div>
                    </div>
                    <div className="border-t max-h-48 overflow-y-auto">
                      {selectedFetchStats.runsNewestFirst.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-muted-foreground">No fetches yet</p>
                      ) : (
                        <ul className="divide-y">
                          {selectedFetchStats.runsNewestFirst.slice(0, 20).map((run, idx) => (
                            <li key={`${run.at}-${idx}`} className="px-3 py-2 text-[11px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className={run.ok === false ? 'text-red-600' : 'text-emerald-700'}>
                                  {run.ok === false ? 'Failed' : 'OK'}
                                </span>
                                <span className="text-muted-foreground tabular-nums">{formatWhen(run.at)}</span>
                              </div>
                              <p className="text-muted-foreground mt-0.5">
                                {Number(run.api_hits) || 0} hits · {Number(run.posts_returned ?? run.items_returned) || 0} returned · {Number(run.posts_new ?? run.items_new) || 0} new
                                {run.source ? ` · ${run.source}` : ''}
                              </p>
                              {run.message && <p className="text-muted-foreground/80 mt-0.5 truncate">{run.message}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="ml-auto flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" onClick={handleStartEdit} className="h-8 w-8 text-muted-foreground" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={openDeleteDialog} disabled={processingAction} className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <div className="relative">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setExportMenuOpen(!exportMenuOpen)}
                      disabled={!dashboard && (events?.length || 0) === 0}
                      className="h-8 px-2 gap-1 text-xs text-muted-foreground"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', exportMenuOpen && 'rotate-180')} />
                    </Button>
                    {exportMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                        <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
                          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">This event</div>
                          <button type="button" onClick={handleExportSelectedEventPdf} disabled={!dashboard} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted disabled:opacity-40">
                            <FileText className="h-4 w-4 text-red-500" /> PDF
                          </button>
                          <button type="button" onClick={handleExportSelectedEventExcel} disabled={!dashboard} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted disabled:opacity-40">
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
                          </button>
                          <div className="my-1 border-t border-border" />
                          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">All events</div>
                          <button type="button" onClick={handleExportAllEventsPdf} disabled={(events?.length || 0) === 0} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted disabled:opacity-40">
                            <FileText className="h-4 w-4 text-red-500" /> PDF
                          </button>
                          <button type="button" onClick={handleExportAllEventsExcel} disabled={(events?.length || 0) === 0} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted disabled:opacity-40">
                            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* Platform tabs + inline summary stats */}
          {selectedEvent && dashboard && (
            <div className="shrink-0 px-4 sm:px-6 py-2 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-1 overflow-x-auto min-w-0" style={{ scrollbarWidth: 'none' }}>
                  {eventPlatformTabs.map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    const isActive = contentPlatform === key;
                    return (
                      <button key={key} onClick={() => setContentPlatform(key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ${isActive ? 'bg-gray-900 text-white shadow-sm dark:bg-white dark:text-gray-900' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-gray-200'}`}>
                        <Icon className={`h-3.5 w-3.5 ${isActive ? '' : cfg.color}`} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
                <div className="hidden md:flex items-center gap-3 shrink-0 text-[11px] font-medium">
                  {[
                    { label: 'Content', value: dashboard?.stats?.content_total ?? contentItems.length ?? 0, icon: BarChart3, color: 'text-amber-600 dark:text-amber-400', valueClass: 'text-gray-900 dark:text-white' },
                    { label: 'Priority', value: (dashboard?.stats?.content_priority || 0) + (dashboard?.stats?.alerts_priority || 0), icon: AlertTriangle, color: 'text-red-500 dark:text-red-400', valueClass: 'text-red-600 dark:text-red-400' },
                    { label: 'Recent', value: dashboard?.stats?.content_recent_24h || 0, icon: Activity, color: 'text-amber-500 dark:text-amber-400', valueClass: 'text-gray-900 dark:text-white' },
                    {
                      label: 'Platforms',
                      value:
                        dashboard?.stats?.platforms_configured ??
                        (Array.isArray(selectedEvent.platforms) ? selectedEvent.platforms.filter(Boolean).length : 0),
                      icon: Globe,
                      color: 'text-emerald-600 dark:text-emerald-400',
                      valueClass: 'text-gray-900 dark:text-white',
                      title: `Selected for this event${
                        dashboard?.stats?.platforms_active != null
                          ? ` · ${dashboard.stats.platforms_active} with content so far`
                          : ''
                      }`,
                    },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-1.5 whitespace-nowrap" title={s.title || s.label}>
                      <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                      <span className="text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px]">{s.label}</span>
                      <span className={`text-sm font-bold tabular-nums ${s.valueClass}`}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}


          {/* Content area */}
          <div className="flex-1 overflow-hidden min-w-0 w-full">
            {loadingDashboard ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-500 mx-auto mb-3" />
                  <p className="text-sm text-gray-400">Loading dashboard...</p>
                </div>
              </div>
            ) : !dashboard ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="h-12 w-12 rounded-xl bg-muted border border-border flex items-center justify-center mb-3">
                  <CalendarDays className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-semibold text-foreground">Select an event to view</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">Pick an event on the left, or create one with New Event.</p>
              </div>
            ) : (
              <ScrollArea className="h-full w-full">
                <div className="px-4 sm:px-6 pt-4 pb-8 w-full max-w-full overflow-x-hidden">


                  {/* Priority alerts */}
                  {filteredRecentAlerts.filter(a => a.is_priority).length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        <h3 className="text-xs font-bold text-red-600 uppercase tracking-wider">Priority Alerts</h3>
                        <Badge variant="destructive" className="text-[10px] h-5 px-1.5">{filteredRecentAlerts.filter(a => a.is_priority).length}</Badge>
                      </div>
                      <div className="space-y-2">
                        {filteredRecentAlerts.filter(a => a.is_priority).map((a) => (
                          <div key={a.id} className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30 p-3.5 flex items-start justify-between gap-3 group hover:border-red-300 dark:hover:border-red-700 transition-all duration-200">
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm mb-0.5 truncate text-gray-800 dark:text-gray-200">{a.title}</div>
                              <div className="text-[11px] text-gray-400 flex items-center gap-2">
                                <Badge variant="outline" className="text-[9px] h-4 px-1.5 uppercase font-bold">{a.platform}</Badge>
                                <span>{new Date(a.created_at).toLocaleString('en-IN')}</span>
                              </div>
                              {a.priority_reason && (<p className="text-[11px] mt-1.5 text-red-500/80 italic">"{a.priority_reason}"</p>)}
                            </div>
                            <Button asChild variant="outline" size="sm" className="shrink-0 text-[11px] h-7 gap-1 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 opacity-60 group-hover:opacity-100 transition-opacity">
                              <a href={a.content_url} target="_blank" rel="noopener noreferrer">View <ArrowUpRight className="h-3 w-3" /></a>
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}


                  {/* Content feed */}
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      Detected Content ({filteredRecentContent.length})
                    </h3>
                  </div>


                  {filteredRecentContent.length === 0 ? (
                    <div className="py-16 text-center">
                      <div className="h-14 w-14 rounded-2xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto mb-3">
                        <ScanLine className="h-7 w-7 text-amber-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No content detected yet</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {selectedEvent?.monitoring_status !== 'started'
                          ? 'Monitoring is stopped. Press “Start monitoring”, or use Fetch Now for a one-off scan.'
                          : 'Waiting for the next scheduled scan — or click Fetch Now.'}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Manual masonry: split items across two columns by
                          alternating index. Each column is an independent
                          vertical flex stack, so a tall card in one column
                          doesn't push the other column down — short cards
                          pack tightly upward instead of leaving grid gaps. */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start w-full">
                        {[0, 1].map(col => (
                          <div key={col} className="flex flex-col gap-4 min-w-0">
                            {filteredRecentContent
                              .filter((_, idx) => idx % 2 === col)
                              .map((c, idx) => (
                                <div key={c.id || `${col}-${idx}`} className="min-w-0">
                                  <ContentCard item={c} index={idx} onAddSource={handleOpenAddSource} />
                                </div>
                              ))}
                          </div>
                        ))}
                      </div>
                      {/* Infinite scroll sentinel */}
                      <div ref={contentSentinelRef} className="h-8 w-full flex items-center justify-center mt-4">
                        {contentLoadingMore && (
                          <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                        )}
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </div>


      {/* ══════ DIALOGS ══════ */}


      {/* Create/Edit Event */}
      <Dialog open={eventFormOpen} onOpenChange={(open) => { setEventFormOpen(open); if (!open) { setEditingEvent(null); resetForm(); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingEvent ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {editingEvent ? 'Update Event' : 'Create New Event'}
            </DialogTitle>
            <DialogDescription>
              {editingEvent ? 'Edit event configuration, keywords, and monitoring interval.' : 'Add a new event to begin cross-platform monitoring.'}
            </DialogDescription>
          </DialogHeader>


          <form className="space-y-5" onSubmit={handleCreate}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Event Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. LPG Supply Disruption" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Location</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Hyderabad" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Start Date</Label>
                <EventDateField value={startDate} onChange={setStartDate} placeholder="Start date" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">End Date</Label>
                <EventDateField value={endDate} onChange={setEndDate} placeholder="End date" />
              </div>
            </div>


            <EventPollIntervalField
              minutes={eventPollMinutes}
              preset={eventPollPreset}
              onChange={({ minutes, preset }) => {
                setEventPollMinutes(minutes);
                setEventPollPreset(preset);
              }}
            />

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Platforms *</Label>
              <EventPlatformPicker value={selectedPlatforms} onChange={setSelectedPlatforms} />
            </div>


            <EventKeywordsFields
              values={{ te: keywordsTe, hi: keywordsHi, en: keywordsEn }}
              onChange={(key, value) => {
                if (key === 'te') setKeywordsTe(value);
                else if (key === 'hi') setKeywordsHi(value);
                else setKeywordsEn(value);
              }}
            />


            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => { setEventFormOpen(false); setEditingEvent(null); resetForm(); }}>Cancel</Button>
              <Button type="submit" disabled={creating} className="gap-1.5">
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editingEvent ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {editingEvent ? 'Update Event' : 'Create Event'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      {/* Delete Confirmation */}
      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="h-4 w-4" /> Delete Event</DialogTitle>
            <DialogDescription>Permanently delete <strong>{selectedEvent?.name}</strong> and all data? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={processingAction} className="gap-1.5">
              {processingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Occasion Calendar Dialog */}
      <Dialog open={hcpOpen} onOpenChange={setHcpOpen}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              {hcpTab === 'recurring' ? 'Occasion Calendar · Recurring' : 'Occasion Calendar · One-time'}
            </DialogTitle>
            <DialogDescription>
              {hcpTab === 'recurring'
                ? 'Yearly occasions you watch every year — festivals, national days, and similar.'
                : 'One-time occasions for a specific incident or situation.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search occasions…"
                value={hcpSearch}
                onChange={(e) => setHcpSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
              {hcpSearch && (
                <button type="button" onClick={() => setHcpSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={openHcpCreate}>
              <Plus className="h-3.5 w-3.5" />
              Add occasion
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-border">
            {hcpLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : hcpFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
                <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">
                  {hcpSearch ? 'No matching occasions' : 'No occasions yet'}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  {hcpSearch
                    ? 'Try a different search.'
                    : 'Add an occasion to reuse its date and keywords when you create monitoring events.'}
                </p>
                {!hcpSearch && (
                  <Button size="sm" className="mt-2 h-8 gap-1.5 text-xs" onClick={openHcpCreate}>
                    <Plus className="h-3.5 w-3.5" />
                    Add occasion
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-14 text-center text-xs">#</TableHead>
                    <TableHead className="text-xs">Occasion</TableHead>
                    <TableHead className="w-36 text-xs">Date</TableHead>
                    <TableHead className="w-44 text-xs">Watch window</TableHead>
                    <TableHead className="text-xs">Keywords</TableHead>
                    <TableHead className="text-xs">Notes</TableHead>
                    <TableHead className="w-20 text-center text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hcpFiltered.map((evt) => (
                    <TableRow key={evt.id || evt._id}>
                      <TableCell className="text-center text-xs text-muted-foreground">{evt.slNo}</TableCell>
                      <TableCell className="font-medium text-sm">{evt.occasion}</TableCell>
                      <TableCell className="text-xs">{evt.date}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{evt.monitoringRange || '—'}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {evt.keywords
                            ? evt.keywords.split(',').filter((kw) => kw.trim()).map((kw, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                                {kw.trim()}
                              </Badge>
                            ))
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">{evt.remarks || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-0.5">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openHcpEdit(evt)} title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleHcpDelete(evt.id)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground text-right">
            {hcpFiltered.length} occasion{hcpFiltered.length !== 1 ? 's' : ''}
          </p>
        </DialogContent>
      </Dialog>


      {/* Occasion Calendar Create/Edit Sub-Dialog */}
      <Dialog open={hcpFormOpen} onOpenChange={(open) => { setHcpFormOpen(open); if (!open) { setHcpEditId(null); setHcpForm(emptyHcpForm()); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {hcpEditId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {hcpEditId ? 'Edit occasion' : 'Add occasion'}
            </DialogTitle>
            <DialogDescription>
              {hcpTab === 'recurring'
                ? 'Save a yearly occasion template. The date repeats every year.'
                : 'Save a one-time occasion you may want to monitor.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleHcpSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Occasion name *</Label>
              <Input
                placeholder="e.g. Republic Day"
                value={hcpForm.occasion}
                onChange={(e) => setHcpForm({ ...hcpForm, occasion: e.target.value })}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">When it happens *</Label>
              <OccasionDateField
                value={hcpForm.date}
                withYear={hcpTab !== 'recurring'}
                placeholder={hcpTab === 'recurring' ? 'Pick day & month' : 'Pick a date'}
                onChange={(date) => setHcpForm({ ...hcpForm, date })}
              />
              <p className="text-[11px] text-muted-foreground">
                {hcpTab === 'recurring'
                  ? 'Year is ignored — this occasion repeats annually.'
                  : 'Full date for this one-time occasion.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Watch window</Label>
              <div className="grid grid-cols-2 gap-3">
                <OccasionDateField
                  value={hcpForm.rangeFrom}
                  withYear={false}
                  placeholder="From"
                  onChange={(rangeFrom) => updateHcpRange({ rangeFrom })}
                />
                <OccasionDateField
                  value={hcpForm.rangeTo}
                  withYear={false}
                  placeholder="Until"
                  onChange={(rangeTo) => updateHcpRange({ rangeTo })}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Optional period to watch around the occasion
                {hcpForm.monitoringRange ? ` · ${hcpForm.monitoringRange}` : ''}.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Platforms *</Label>
              <EventPlatformPicker
                value={hcpForm.platforms || []}
                onChange={(platforms) => setHcpForm({ ...hcpForm, platforms })}
              />
              <p className="text-[11px] text-muted-foreground">
                Used when this occasion is linked as a monitoring event.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Suggested keywords</Label>
              <Input
                placeholder="e.g. Republic Day, parade, 26 January"
                value={hcpForm.keywords}
                onChange={(e) => setHcpForm({ ...hcpForm, keywords: e.target.value })}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">
                Words you might reuse when creating a monitoring event.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Notes</Label>
              <Input
                placeholder="Optional notes"
                value={hcpForm.remarks}
                onChange={(e) => setHcpForm({ ...hcpForm, remarks: e.target.value })}
                className="h-9"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setHcpFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={hcpSaving} className="gap-1.5">
                {hcpSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hcpEditId ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {hcpEditId ? 'Save changes' : 'Add occasion'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      {/* Non-Recurring Event Create/Edit Sub-Dialog (full Event model fields) */}
      <Dialog open={nrFormOpen} onOpenChange={setNrFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {nrEditId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {nrEditId ? 'Edit Event' : 'Create New Event'}
            </DialogTitle>
            <DialogDescription>
              {nrEditId ? 'Edit event configuration, keywords, and monitoring interval.' : 'Add a new non-recurring event to monitor. All data is stored permanently.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleNrSave} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Event Name *</Label>
                <Input value={nrForm.name} onChange={(e) => setNrForm({ ...nrForm, name: e.target.value })} placeholder="e.g. Ganesh Immersion Rally" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Location</Label>
                <Input value={nrForm.location} onChange={(e) => setNrForm({ ...nrForm, location: e.target.value })} placeholder="e.g. Hyderabad" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Start Date</Label>
                <EventDateField
                  value={nrForm.start_date}
                  onChange={(start_date) => setNrForm({ ...nrForm, start_date })}
                  placeholder="Start date"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">End Date</Label>
                <EventDateField
                  value={nrForm.end_date}
                  onChange={(end_date) => setNrForm({ ...nrForm, end_date })}
                  placeholder="End date"
                />
              </div>
            </div>
            <EventPollIntervalField
              minutes={nrForm.polling_interval_minutes}
              preset={nrForm.poll_preset}
              onChange={({ minutes, preset }) => {
                setNrForm({ ...nrForm, polling_interval_minutes: minutes, poll_preset: preset });
              }}
            />
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Platforms *</Label>
              <EventPlatformPicker
                value={nrForm.platforms || []}
                onChange={(platforms) => setNrForm({ ...nrForm, platforms })}
              />
            </div>
            <EventKeywordsFields
              values={{ te: nrForm.keywords_te, hi: nrForm.keywords_hi, en: nrForm.keywords_en }}
              onChange={(key, value) => {
                const field = key === 'te' ? 'keywords_te' : key === 'hi' ? 'keywords_hi' : 'keywords_en';
                setNrForm({ ...nrForm, [field]: value });
              }}
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setNrFormOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={nrSaving} className="gap-1.5">
                {nrSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : nrEditId ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {nrEditId ? 'Update Event' : 'Create Event'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>


      {/* Add to Monitor */}
      <AddSocialProfileDialog
        open={addProfileOpen}
        onOpenChange={(open) => {
          setAddProfileOpen(open);
          if (!open) setAddProfilePrefill(null);
        }}
        prefill={addProfilePrefill}
        title="Add to Monitor"
        description="Add this account to Social Profiles monitoring."
        onSuccess={() => toast.success('Profile added to monitoring list')}
      />
    </div>
  );
};


export default Events;





