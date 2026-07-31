/**
 * Daily Intelligence Report (DIR) — PDF generators.
 *
 * Each `download<Section>Pdf(dir)` produces a paginated A4 PDF for one DIR
 * section (Dial 100, grievance breakdown, events, top-50 alerts, top concepts,
 * profiles, top-10 keywords, etc.).
 *
 * `downloadFullDirPdf(dir)` chains every section into one big multi-page
 * report (the ~20-page combined briefing officers asked for).
 *
 * Implementation: jsPDF + jspdf-autotable, no DOM screenshotting — so the
 * resulting PDFs have crisp text, clickable URLs, proper page breaks, and
 * stay performant even for 50-row alert tables.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Theme / shared constants ────────────────────────────────────────────────

const BRAND = {
  primary: [37, 99, 235],     // indigo-600
  danger:  [220, 38, 38],     // red-600
  warning: [217, 119, 6],     // amber-600
  success: [22, 163, 74],     // green-600
  muted:   [100, 116, 139],   // slate-500
  ink:     [15, 23, 42],      // slate-900
  faint:   [241, 245, 249],   // slate-100
};

const PAGE = { marginX: 14, marginTop: 18, marginBottom: 18 };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTs(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function windowLabel(dir) {
  const h = dir?.window_hours || 24;
  if (h % 24 === 0) return `Last ${h / 24} day${h === 24 ? '' : 's'}`;
  return `Last ${h} hour${h === 1 ? '' : 's'}`;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

/** Standard A4-portrait jsPDF instance with header pre-drawn. */
function newDoc(title, dir) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  drawHeader(doc, title, dir);
  drawFooter(doc);
  return doc;
}

function drawHeader(doc, title, dir) {
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, 210, 12, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('SOC-EYE • Daily Intelligence Report', PAGE.marginX, 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const right = `${windowLabel(dir)}  •  Generated ${new Date().toLocaleString('en-IN')}`;
  doc.text(right, 210 - PAGE.marginX, 8, { align: 'right' });

  doc.setTextColor(...BRAND.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, PAGE.marginX, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.muted);
  if (dir?.window_start && dir?.window_end) {
    doc.text(
      `Window: ${fmtTs(dir.window_start)}  →  ${fmtTs(dir.window_end)}`,
      PAGE.marginX, 27,
    );
  }
  doc.setTextColor(...BRAND.ink);
}

function drawFooter(doc) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(
      'Confidential — Telangana Police Internal Use Only',
      PAGE.marginX, 290,
    );
    doc.text(`Page ${i} / ${total}`, 210 - PAGE.marginX, 290, { align: 'right' });
    doc.setTextColor(...BRAND.ink);
  }
}

/** Returns the current Y coord; if past `limit`, adds a new page and returns top. */
function ensureSpace(doc, currentY, needed = 40, limit = 280) {
  if (currentY + needed > limit) {
    doc.addPage();
    return PAGE.marginTop;
  }
  return currentY;
}

function sectionTitle(doc, y, label) {
  const next = ensureSpace(doc, y, 18);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BRAND.primary);
  doc.text(label, PAGE.marginX, next);
  doc.setDrawColor(...BRAND.primary);
  doc.setLineWidth(0.4);
  doc.line(PAGE.marginX, next + 1.5, 210 - PAGE.marginX, next + 1.5);
  doc.setTextColor(...BRAND.ink);
  doc.setFont('helvetica', 'normal');
  return next + 7;
}

function paragraph(doc, y, text, opts = {}) {
  const next = ensureSpace(doc, y, 8);
  doc.setFontSize(opts.size || 10);
  doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
  if (opts.color) doc.setTextColor(...opts.color);
  const lines = doc.splitTextToSize(text, 210 - PAGE.marginX * 2);
  doc.text(lines, PAGE.marginX, next);
  doc.setTextColor(...BRAND.ink);
  doc.setFont('helvetica', 'normal');
  return next + lines.length * (opts.size || 10) * 0.45 + 1;
}

function statGrid(doc, y, items) {
  // 4-column key/value tile grid — used for "Daily Snapshot" type panels.
  const colW = (210 - PAGE.marginX * 2) / 4;
  const rowH = 18;
  let next = ensureSpace(doc, y, rowH * Math.ceil(items.length / 4));
  items.forEach((it, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = PAGE.marginX + col * colW;
    const yy = next + row * rowH;
    doc.setFillColor(...BRAND.faint);
    doc.roundedRect(x + 1, yy, colW - 2, rowH - 2, 1.5, 1.5, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(String(it.label).toUpperCase(), x + 4, yy + 5);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(it.color || BRAND.ink));
    doc.text(String(it.value ?? '—'), x + 4, yy + 12);
    doc.setFont('helvetica', 'normal');
    if (it.sub) {
      doc.setFontSize(7.5);
      doc.setTextColor(...BRAND.muted);
      doc.text(String(it.sub), x + 4, yy + 15.5);
    }
  });
  doc.setTextColor(...BRAND.ink);
  return next + Math.ceil(items.length / 4) * rowH + 2;
}

function table(doc, y, head, body, opts = {}) {
  autoTable(doc, {
    head: [head],
    body,
    startY: y,
    margin: { left: PAGE.marginX, right: PAGE.marginX },
    styles: { fontSize: 8.5, cellPadding: 1.6, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: BRAND.primary, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: BRAND.faint },
    columnStyles: opts.columnStyles || {},
    didDrawPage: () => {
      // Re-paint header band on every new auto-paginated page.
      doc.setFillColor(...BRAND.primary);
      doc.rect(0, 0, 210, 12, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('SOC-EYE • Daily Intelligence Report', PAGE.marginX, 8);
      doc.setTextColor(...BRAND.ink);
      doc.setFont('helvetica', 'normal');
    },
  });
  return doc.lastAutoTable.finalY + 4;
}

// ─── Section renderers (each returns next Y) ─────────────────────────────────

function renderSnapshot(doc, y, dir) {
  const s = dir.stats || {};
  const g = dir.grievance_breakdown || {};
  const ev = dir.events_breakdown || {};
  const pf = dir.profiles_breakdown || {};
  let next = sectionTitle(doc, y, 'Daily Snapshot');
  next = statGrid(doc, next, [
    { label: 'Total Alerts',   value: s.total_alerts ?? 0 },
    { label: 'HIGH-Risk',      value: s.high_alerts ?? 0,     color: BRAND.danger },
    { label: 'Active Alerts',  value: s.active_alerts ?? 0,   color: BRAND.warning },
    { label: 'Escalated',      value: s.escalated_alerts ?? 0, color: BRAND.danger },
    { label: 'Grievances',     value: s.total_grievances ?? 0 },
    { label: 'Dial 100 Calls', value: s.dial100_total ?? dir.dial100_total ?? 0 },
    { label: 'Threat Rate',    value: s.threat_rate_pct != null ? `${s.threat_rate_pct}%` : '—' },
    { label: 'Events Fetched', value: ev.fetched ?? 0 },
    { label: 'Events Relevant',value: ev.relevant ?? 0,        color: BRAND.success },
    { label: 'Profiles Active',value: pf.active ?? 0 },
    { label: 'Profiles Deleted', value: pf.deleted_24h ?? 0,   color: BRAND.danger,
      sub: 'in window' },
    { label: 'Workflow Esc.',  value: g.workflow_escalated ?? 0, color: BRAND.warning },
  ]);
  return next;
}

function renderDial100(doc, y, dir) {
  let next = sectionTitle(doc, y, 'Dial 100 Calls');
  const total = dir?.stats?.dial100_total ?? dir?.dial100_total ?? 0;
  next = paragraph(doc, next,
    `${total.toLocaleString()} Dial 100 emergency calls were received during the reporting window (${windowLabel(dir)}).`,
    { size: 10 });
  return next + 2;
}

function renderGrievanceBreakdown(doc, y, dir) {
  const g = dir.grievance_breakdown || {};
  let next = sectionTitle(doc, y, 'Grievances Generated');
  next = table(doc, next,
    ['Type', 'Count', 'Notes'],
    [
      ['Grievances (raw)',          String(g.grievances ?? 0),
        'Citizen complaints captured from social platforms.'],
      ['Criticism Reports (C)',     String(g.criticism_reports ?? 0),
        'Posts classified as criticism, escalated to operator.'],
      ['Suggestion Reports (S)',    String(g.suggestion_reports ?? 0),
        'Public suggestions captured & forwarded.'],
      ['Workflow Reports (G)',      String(g.grievance_workflow_reports ?? 0),
        'PENDING + ESCALATED + CLOSED rolled up.'],
      ['  → ESCALATED',             String(g.workflow_escalated ?? 0),
        'Awaiting closure / external action.'],
      ['  → PENDING',               String(g.workflow_pending ?? 0),  ''],
      ['  → CLOSED',                String(g.workflow_closed ?? 0),   ''],
    ],
    { columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 22, halign: 'right' } } },
  );
  return next;
}

function renderEvents(doc, y, dir) {
  const ev = dir.events_breakdown || {};
  let next = sectionTitle(doc, y, 'Events');
  next = paragraph(doc, next,
    `Fetched ${ev.fetched ?? 0} event(s) in the window. ` +
    `${ev.relevant ?? 0} event(s) are linked to alerts/content (relevant). ` +
    `${ev.active ?? 0} event(s) are currently active or planned.`);
  if ((ev.recent || []).length > 0) {
    next = table(doc, next,
      ['Event', 'Status', 'Location', 'Window', 'Platforms', 'Keywords'],
      ev.recent.map(e => [
        e.name || '—',
        (e.status || '—').toUpperCase(),
        e.location || '—',
        `${(e.start_date || '').slice(0, 10)} → ${(e.end_date || '').slice(0, 10)}`,
        (e.platforms || []).join(', ') || '—',
        e.keywords || '—',
      ]),
      { columnStyles: { 0: { cellWidth: 40 }, 5: { cellWidth: 35 } } },
    );
  }
  return next;
}

function renderActiveAlerts(doc, y, dir) {
  let next = sectionTitle(doc, y, 'Alert Status');
  const s = dir.stats || {};
  next = statGrid(doc, next, [
    { label: 'Total',     value: s.total_alerts ?? 0 },
    { label: 'Active',    value: s.active_alerts ?? 0,    color: BRAND.warning },
    { label: 'Escalated', value: s.escalated_alerts ?? 0, color: BRAND.danger },
    { label: 'HIGH-Risk', value: s.high_alerts ?? 0,      color: BRAND.danger },
  ]);
  return next;
}

function renderTop50Alerts(doc, y, dir) {
  let next = sectionTitle(doc, y, 'Top 50 Alerts');
  const rows = (dir.top_50_alerts || []).map((a, i) => [
    String(i + 1),
    a.priority || '—',
    `${a.risk_score ?? 0}%`,
    `@${a.author_handle || '—'}\n${a.platform || ''}`,
    a.alert_type || '—',
    a.source_category || '—',
    (a.title || '—').slice(0, 70),
    fmtTs(a.timestamp),
  ]);
  if (rows.length === 0) {
    return paragraph(doc, next, 'No alerts in window.', { color: BRAND.muted });
  }
  next = table(doc, next,
    ['#', 'Pri', 'Risk', 'Author / Platform', 'Type', 'Concept', 'Title', 'Time'],
    rows,
    {
      columnStyles: {
        0: { cellWidth: 7,  halign: 'right' },
        1: { cellWidth: 10, halign: 'center' },
        2: { cellWidth: 12, halign: 'right' },
        3: { cellWidth: 32 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 55 },
        7: { cellWidth: 26 },
      },
    },
  );
  return next;
}

function renderTopConcepts(doc, y, dir) {
  let next = sectionTitle(doc, y, 'Top 5 Concepts');
  const rows = (dir.top_concepts || []).map((c, i) => [
    String(i + 1),
    c.label || c.concept || '—',
    String(c.alert_count ?? 0),
    String(c.high_risk ?? 0),
    `${c.avg_risk_score ?? 0}%`,
    (c.platforms || []).slice(0, 4).join(', ') || '—',
    (c.sample_handles || []).slice(0, 3).map(h => `@${h}`).join(', ') || '—',
  ]);
  if (rows.length === 0) {
    return paragraph(doc, next, 'No concept data in window.', { color: BRAND.muted });
  }
  return table(doc, next,
    ['#', 'Concept', 'Alerts', 'HIGH', 'Avg Risk', 'Platforms', 'Sample Handles'],
    rows,
    {
      columnStyles: {
        0: { cellWidth: 8, halign: 'right' },
        2: { cellWidth: 16, halign: 'right' },
        3: { cellWidth: 14, halign: 'right' },
        4: { cellWidth: 18, halign: 'right' },
      },
    },
  );
}

function renderProfiles(doc, y, dir) {
  const pf = dir.profiles_breakdown || {};
  let next = sectionTitle(doc, y, 'Monitored Profiles');
  next = statGrid(doc, next, [
    { label: 'Monitored',  value: pf.monitored ?? 0 },
    { label: 'Active',     value: pf.active ?? 0,        color: BRAND.success },
    { label: 'Added',      value: pf.added_24h ?? 0,     sub: 'in window' },
    { label: 'Deleted',    value: pf.deleted_24h ?? 0,   color: BRAND.danger, sub: 'in window' },
    { label: 'High-Risk',  value: pf.high_risk ?? 0,     color: BRAND.danger },
  ]);
  return next;
}

function renderTopKeywords(doc, y, dir) {
  let next = sectionTitle(doc, y, 'Top 10 Monitored Keywords');
  const rows = (dir.top_keywords_10 || []).map((k, i) => [
    String(i + 1),
    k.keyword || '—',
    k.category || '—',
    k.language || '—',
    String(k.weight ?? 0),
    k.active ? 'YES' : 'NO',
  ]);
  if (rows.length === 0) {
    next = paragraph(doc, next,
      'No configured keywords in the keywords collection.',
      { color: BRAND.muted });
  } else {
    next = table(doc, next,
      ['#', 'Keyword', 'Category', 'Language', 'Weight', 'Active'],
      rows,
      {
        columnStyles: {
          0: { cellWidth: 8,  halign: 'right' },
          4: { cellWidth: 18, halign: 'right' },
          5: { cellWidth: 16, halign: 'center' },
        },
      },
    );
  }
  // Trending (matched-in-alerts) keywords as an additional table
  if ((dir.trending_keywords || []).length > 0) {
    next = paragraph(doc, next, 'Trending in alerts (matched keywords):', { bold: true, size: 10 });
    next = table(doc, next,
      ['#', 'Keyword', 'Hits', 'HIGH', 'Platforms'],
      dir.trending_keywords.slice(0, 25).map((k, i) => [
        String(i + 1),
        k._id || '—',
        String(k.count ?? 0),
        String(k.high_count ?? 0),
        (k.platforms || []).slice(0, 4).join(', ') || '—',
      ]),
      {
        columnStyles: {
          0: { cellWidth: 8,  halign: 'right' },
          2: { cellWidth: 16, halign: 'right' },
          3: { cellWidth: 16, halign: 'right' },
        },
      },
    );
  }
  return next;
}

function renderViral(doc, y, dir) {
  let next = sectionTitle(doc, y, 'Viral / High-Velocity Posts');
  const rows = (dir.viral_posts || []).map((p, i) => [
    String(i + 1),
    `@${p.author_handle || '—'}`,
    p.platform || '—',
    p.priority || '—',
    `${p.risk_score ?? 0}%`,
    `${p.velocity_metric || ''} ×${p.velocity ?? 0}`,
    (p.reasoning || '').slice(0, 90),
  ]);
  if (rows.length === 0) {
    return paragraph(doc, next, 'No viral posts in window.', { color: BRAND.muted });
  }
  return table(doc, next,
    ['#', 'Author', 'Platform', 'Pri', 'Risk', 'Velocity', 'Notes'],
    rows,
    {
      columnStyles: {
        0: { cellWidth: 8,  halign: 'right' },
        4: { cellWidth: 14, halign: 'right' },
        5: { cellWidth: 26 },
      },
    },
  );
}

function renderActors(doc, y, dir) {
  let next = sectionTitle(doc, y, 'Most Active Threat Actors');
  const rows = (dir.active_accounts || []).map((a, i) => [
    String(i + 1),
    `@${a.handle || '—'}`,
    String(a.alert_count ?? 0),
    String(a.high_risk_count ?? 0),
    (a.platforms || []).join(', ') || '—',
    (a.categories || []).slice(0, 4).join(', ') || '—',
    `${a.max_risk_score ?? 0}%`,
  ]);
  if (rows.length === 0) {
    return paragraph(doc, next, 'No actor data in window.', { color: BRAND.muted });
  }
  return table(doc, next,
    ['#', 'Handle', 'Alerts', 'HIGH', 'Platforms', 'Categories', 'Max Risk'],
    rows,
    {
      columnStyles: {
        0: { cellWidth: 8,  halign: 'right' },
        2: { cellWidth: 16, halign: 'right' },
        3: { cellWidth: 14, halign: 'right' },
        6: { cellWidth: 18, halign: 'right' },
      },
    },
  );
}

function renderThreats(doc, y, dir) {
  let next = sectionTitle(doc, y, 'HIGH-Priority Threats');
  const rows = (dir.threat_posts || []).map((p, i) => [
    String(i + 1),
    `@${p.author_handle || '—'}\n${p.platform || ''}`,
    p.alert_type || '—',
    p.source_category || '—',
    `${p.risk_score ?? 0}%`,
    p.legal_sections || '—',
    (p.reasoning || '').slice(0, 110),
  ]);
  if (rows.length === 0) {
    return paragraph(doc, next, 'No HIGH-priority threats in window.', { color: BRAND.muted });
  }
  return table(doc, next,
    ['#', 'Author / Platform', 'Type', 'Concept', 'Risk', 'Legal', 'Reasoning'],
    rows,
    {
      columnStyles: {
        0: { cellWidth: 7,  halign: 'right' },
        4: { cellWidth: 14, halign: 'right' },
        6: { cellWidth: 60 },
      },
    },
  );
}

// ─── Public API: per-section + combined downloads ────────────────────────────

function save(doc, name) {
  drawFooter(doc);
  doc.save(`${name}_${todayStamp()}.pdf`);
}

export function downloadSnapshotPdf(dir) {
  const doc = newDoc('Daily Snapshot', dir);
  renderSnapshot(doc, 32, dir);
  save(doc, 'DIR_Snapshot');
}

export function downloadDial100Pdf(dir) {
  const doc = newDoc('Dial 100 Calls', dir);
  renderDial100(doc, 32, dir);
  save(doc, 'DIR_Dial100');
}

export function downloadGrievancePdf(dir) {
  const doc = newDoc('Grievances Generated', dir);
  renderGrievanceBreakdown(doc, 32, dir);
  save(doc, 'DIR_Grievances');
}

export function downloadEventsPdf(dir) {
  const doc = newDoc('Events', dir);
  renderEvents(doc, 32, dir);
  save(doc, 'DIR_Events');
}

export function downloadAlertStatusPdf(dir) {
  const doc = newDoc('Alert Status', dir);
  renderActiveAlerts(doc, 32, dir);
  save(doc, 'DIR_AlertStatus');
}

export function downloadTop50AlertsPdf(dir) {
  const doc = newDoc('Top 50 Alerts', dir);
  renderTop50Alerts(doc, 32, dir);
  save(doc, 'DIR_Top50Alerts');
}

export function downloadTopConceptsPdf(dir) {
  const doc = newDoc('Top 5 Concepts', dir);
  renderTopConcepts(doc, 32, dir);
  save(doc, 'DIR_TopConcepts');
}

export function downloadProfilesPdf(dir) {
  const doc = newDoc('Monitored Profiles', dir);
  renderProfiles(doc, 32, dir);
  save(doc, 'DIR_Profiles');
}

export function downloadTopKeywordsPdf(dir) {
  const doc = newDoc('Top 10 Keywords', dir);
  renderTopKeywords(doc, 32, dir);
  save(doc, 'DIR_TopKeywords');
}

export function downloadViralPdf(dir) {
  const doc = newDoc('Viral / High-Velocity Posts', dir);
  renderViral(doc, 32, dir);
  save(doc, 'DIR_Viral');
}

export function downloadActorsPdf(dir) {
  const doc = newDoc('Most Active Threat Actors', dir);
  renderActors(doc, 32, dir);
  save(doc, 'DIR_Actors');
}

export function downloadThreatsPdf(dir) {
  const doc = newDoc('HIGH-Priority Threats', dir);
  renderThreats(doc, 32, dir);
  save(doc, 'DIR_Threats');
}

/** Combined ~20-page DIR — every section in one PDF, in officer-briefing order. */
export function downloadFullDirPdf(dir) {
  const doc = newDoc('Daily Intelligence Report', dir);
  let y = 32;

  y = renderSnapshot(doc, y, dir);
  doc.addPage();      y = PAGE.marginTop;
  y = renderDial100(doc, y, dir);
  y = renderGrievanceBreakdown(doc, y, dir);
  doc.addPage();      y = PAGE.marginTop;
  y = renderEvents(doc, y, dir);
  doc.addPage();      y = PAGE.marginTop;
  y = renderActiveAlerts(doc, y, dir);
  y = renderTopConcepts(doc, y, dir);
  doc.addPage();      y = PAGE.marginTop;
  y = renderTop50Alerts(doc, y, dir);
  doc.addPage();      y = PAGE.marginTop;
  y = renderProfiles(doc, y, dir);
  y = renderTopKeywords(doc, y, dir);
  doc.addPage();      y = PAGE.marginTop;
  y = renderThreats(doc, y, dir);
  doc.addPage();      y = PAGE.marginTop;
  y = renderViral(doc, y, dir);
  doc.addPage();      y = PAGE.marginTop;
  renderActors(doc, y, dir);

  save(doc, 'DIR_FullReport');
}
