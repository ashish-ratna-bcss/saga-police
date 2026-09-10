/** Auto-ported from archive grievanceWorkflowController PDF HTML builders. */
const QRCode = require('qrcode');
const logger = require('../../lib/logger');

const fmtDateHtml = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
};

const generateQrDataUrl = async (value, size = 120) => {
  if (!value) return '';
  try {
    return await QRCode.toDataURL(String(value), {
      width: size,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' }
    });
  } catch (err) {
    logger.error('[Grievance QR] generation failed:', err.message);
    return '';
  }
};

const buildReportHtml = (r, options = {}) => {
  const allLogs = [
    ...(r.complainant_logs || []).map(l => ({ ...l, _src: 'complainant' })),
    ...(r.officer_logs || []).map(l => ({ ...l, _src: 'officer' }))
  ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dash = v => v || '—';
  const effectivePdfUrl = options.pdfUrl || r.report_pdf_url || '';
  const postQrImageUrl = options.postQrImage || '';
  const pdfQrImageUrl = options.pdfQrImage || '';

  const logRows = allLogs.map(l => {
    let role = 'User', bg = '#fff7ed', border = '#fed7aa', roleColor = '#ea580c';
    const opName = l.operator?.name || 'Operator';
    const recName = l.recipient?.name || r.informed_to?.name || 'Officer';
    const recPhone = l.recipient?.phone || r.informed_to?.phone || '';
    let toFrom = '';
    if (l._src === 'officer' && l.is_escalation) {
      role = 'Escalation'; bg = '#fef2f2'; border = '#fecaca'; roleColor = '#dc2626';
      toFrom = `Operator (${opName}) → Officer (${recName}${recPhone ? ' · ' + recPhone : ''})`;
    } else if (l._src === 'officer') {
      role = 'Operator→Officer'; bg = '#eff6ff'; border = '#bfdbfe'; roleColor = '#2563eb';
      toFrom = `Operator (${opName}) → Officer (${recName}${recPhone ? ' · ' + recPhone : ''})`;
    } else if (l.type === 'OperatorRemark') {
      role = 'Operator Note'; bg = '#fffbeb'; border = '#fde68a'; roleColor = '#d97706';
      toFrom = `Operator (${opName}) — Internal`;
    } else if (l.type === 'Operator') {
      role = 'Operator→User'; bg = '#f0fdf4'; border = '#bbf7d0'; roleColor = '#16a34a';
      toFrom = `Operator (${opName}) → User`;
    } else {
      toFrom = r.posted_by?.display_name || r.profile_id || 'User';
    }
    return `<tr style="background:${bg}">
      <td style="padding:6px 8px;border:1px solid ${border};border-radius:4px;white-space:nowrap;vertical-align:top">
        <span style="color:${roleColor};font-weight:700;font-size:9px;text-transform:uppercase">${role}</span><br/>
        <span style="font-size:9px;color:#64748b">${esc(toFrom)}</span>
      </td>
      <td style="padding:6px 8px;border:1px solid ${border};font-size:9px;color:#475569;white-space:nowrap;vertical-align:top">${esc(l.mode || '—')}</td>
      <td style="padding:6px 8px;border:1px solid ${border};font-size:10px;color:#1e293b;white-space:pre-wrap;vertical-align:top">${esc(l.content)}</td>
      <td style="padding:6px 8px;border:1px solid ${border};font-size:9px;color:#64748b;white-space:nowrap;vertical-align:top">${fmtDateHtml(l.timestamp)}</td>
    </tr>`;
  }).join('<tr><td colspan="4" style="padding:2px"></td></tr>');

  const statusColor = r.status === 'CLOSED' ? '#16a34a' : r.status === 'ESCALATED' ? '#ea580c' : '#ca8a04';
  const statusBg = r.status === 'CLOSED' ? '#f0fdf4' : r.status === 'ESCALATED' ? '#fff7ed' : '#fefce8';

  const officerLogs = (r.officer_logs || []);
  const firstOfficerLog = officerLogs[0];
  const escalationLog = officerLogs.find(l => l.is_escalation);

  const cd = r.closing_details || {};
  const firConverted = cd.fir_converted || r.fir_status || '';
  const firNumber = cd.fir_number || r.fir_number || '';
  const firStation = cd.fir_station || '';
  const firDistrict = cd.fir_district || '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #1e293b; margin: 0; padding: 0; font-size: 11px; }
  .header { background: #1e293b; color: white; padding: 14px 20px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .meta-bar { background: #f8fafc; border-bottom: 2px solid #e2e8f0; padding: 8px 20px; display: flex; gap: 20px; flex-wrap: wrap; }
  .meta-item label { display:block; font-size:8px; font-weight:700; text-transform:uppercase; color:#94a3b8; letter-spacing:0.08em; }
  .meta-item span { font-size:11px; font-weight:600; color:#1e293b; }
  .section { margin: 12px 20px; }
  .section-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#64748b; border-bottom:2px solid #e2e8f0; padding-bottom:4px; margin-bottom:8px; }
  .kv-table td { padding: 3px 0; font-size:10px; vertical-align:top; }
  .kv-table td:first-child { width:140px; color:#64748b; font-weight:600; padding-right:12px; }
  .box { border-radius:6px; padding:10px 14px; font-size:11px; line-height:1.6; white-space:pre-wrap; }
  .log-table { width:100%; border-collapse:separate; border-spacing:0 4px; }
  .log-table th { background:#f1f5f9; font-size:8px; font-weight:700; text-transform:uppercase; color:#64748b; padding:5px 8px; text-align:left; }
  .two-col { display:flex; gap:16px; }
  .two-col > div { flex:1; }
  .metrics-qr-row { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  .metrics-table-wrap { flex:1; }
  .post-qr-side { min-width:92px; text-align:center; }
  .qr-stack { display:flex; justify-content:flex-end; margin-top:8px; }
  .qr-box { background:#fff; border:1px solid #cbd5e1; padding:4px; width:92px; border-radius:4px; text-align:center; }
  .qr-box img { width:82px; height:82px; display:block; margin:0 auto; }
  .qr-label { font-size:7px; color:#64748b; margin-top:3px; line-height:1.2; font-weight:600; text-transform:uppercase; letter-spacing:0.04em; }
  .qr-placeholder { width:82px; height:82px; display:flex; align-items:center; justify-content:center; border:1px dashed #cbd5e1; color:#94a3b8; font-size:7px; line-height:1.2; }
  .tag { display:inline-block; padding:1px 6px; border-radius:9999px; font-size:9px; font-weight:700; }
  /* Timeline */
  .timeline-section { margin: 12px 20px; border: 1.5px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  .timeline-header { padding: 10px 16px; background: #f8fafc; border-bottom: 1.5px solid #e2e8f0; display: flex; align-items: center; gap: 8px; }
  .timeline-header-icon { width: 28px; height: 28px; border-radius: 6px; background: rgba(219,234,254,0.5); display: flex; align-items: center; justify-content: center; }
  .timeline-body { padding: 20px 24px; }
  .tl-step { display: flex; position: relative; }
  .tl-step.inactive { opacity: 0.4; }
  .tl-date { width: 90px; padding-top: 2px; padding-right: 12px; text-align: right; flex-shrink: 0; }
  .tl-date-day { font-size: 10px; font-weight: 700; color: #0f172a; }
  .tl-date-time { font-size: 9px; color: #94a3b8; font-weight: 500; }
  .tl-center { width: 32px; display: flex; flex-direction: column; align-items: center; flex-shrink: 0; }
  .tl-dot { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #e2e8f0; background: #f8fafc; display: flex; align-items: center; justify-content: center; z-index: 1; font-size: 12px; }
  .tl-dot.active { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .tl-line { width: 2px; flex-grow: 1; margin: 3px 0; border-radius: 2px; background: #f1f5f9; }
  .tl-content { flex: 1; margin-left: 12px; padding-bottom: 24px; }
  .tl-content-last { padding-bottom: 0; }
  .tl-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #0f172a; }
  .tl-label.inactive { color: #94a3b8; }
  .tl-duration { display: inline-block; font-size: 9px; font-weight: 700; color: #64748b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 1px 6px; margin-left: 6px; vertical-align: middle; }
  .tl-card { margin-top: 6px; padding: 8px 12px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fff; }
  .tl-card.inactive { background: #fafafa; border-color: #f1f5f9; }
  .tl-officer { font-size: 10px; font-weight: 600; color: #334155; margin-bottom: 4px; }
  .tl-note { font-size: 10px; color: #64748b; font-style: italic; }
  /* Tweet thread */
  .thread-section { margin: 12px 20px; border: 1.5px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
  .thread-header { padding: 8px 16px; background: #f8fafc; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 8px; }
  .thread-body { padding: 16px; }
  .thread-tweet { display: flex; gap: 12px; position: relative; }
  .thread-avatar { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; border: 2px solid #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.08); flex-shrink: 0; background: #e2e8f0; }
  .thread-avatar-placeholder { width: 36px; height: 36px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: 14px; flex-shrink: 0; }
  .thread-connector { position: absolute; left: 17px; top: 40px; bottom: 0; width: 2px; background: #e2e8f0; }
  .thread-content { flex: 1; min-width: 0; padding-bottom: 16px; }
  .thread-name { font-size: 12px; font-weight: 700; color: #0f172a; }
  .thread-handle { font-size: 10px; color: #94a3b8; margin-left: 4px; }
  .thread-label { font-size: 9px; padding: 1px 6px; border-radius: 9999px; background: #f1f5f9; color: #64748b; font-weight: 500; margin-left: 6px; }
  .thread-date { font-size: 9px; color: #94a3b8; margin-top: 2px; }
  .thread-text { font-size: 11px; color: #334155; margin-top: 6px; white-space: pre-wrap; line-height: 1.6; }
  .thread-link { font-size: 9px; color: #3b82f6; text-decoration: none; margin-top: 4px; display: inline-block; }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div>
    <div style="font-size:15px;font-weight:800;letter-spacing:0.02em">Grievance Report</div>
    <div style="font-size:9px;opacity:0.55;margin-top:3px">Generated: ${fmtDateHtml(new Date())}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:18px;font-weight:900;font-family:monospace;color:#fbbf24">${esc(r.unique_code || '—')}</div>
    <div style="font-size:8px;opacity:0.5;margin-top:2px">UNIQUE REPORT ID</div>
    <div style="margin-top:4px;display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;background:${statusBg};color:${statusColor}">${r.status || 'PENDING'}</div>
    <div class="qr-stack">
      ${pdfQrImageUrl ? `
      <div class="qr-box">
        <img src="${esc(pdfQrImageUrl)}" alt="PDF QR"/>
        <div class="qr-label">PDF QR</div>
      </div>` : `
      <div class="qr-box">
        <div class="qr-placeholder">Generate PDF to enable QR</div>
        <div class="qr-label">PDF QR</div>
      </div>`}
    </div>
  </div>
</div>

<!-- META BAR -->
<div class="meta-bar">
  <div class="meta-item"><label>Category</label><span>${esc(dash(r.category))}</span></div>
  <div class="meta-item"><label>Platform</label><span>${(r.platform || '—').toUpperCase()}</span></div>
  <div class="meta-item"><label>Post Date</label><span>${fmtDateHtml(r.post_date)}</span></div>
  <div class="meta-item"><label>Phone</label><span>${esc(dash(r.complaint_phone))}</span></div>
  <div class="meta-item"><label>Profile</label><span>${esc(r.posted_by?.display_name || r.profile_id || '—')}</span></div>
  <div class="meta-item"><label>Created</label><span>${fmtDateHtml(r.created_at)}</span></div>
</div>

<!-- POST DETAILS -->
<div class="section">
  <div class="section-title">Post Details</div>
  <div class="two-col">
    <div>
      <table class="kv-table">
        <tr><td>Profile Handle</td><td>${esc(dash(r.posted_by?.handle || r.profile_id))}</td></tr>
        <tr><td>Profile Link</td><td>${(() => {
      const link = r.profile_link || (() => {
        const handle = r.posted_by?.handle || r.profile_id || '';
        if (!handle) return '';
        const p = (r.platform || '').toLowerCase();
        if (p === 'twitter' || p === 'x') return `https://x.com/${handle.replace(/^@/, '')}`;
        if (p === 'facebook') return `https://facebook.com/${handle.replace(/^@/, '')}`;
        if (p === 'youtube') return `https://youtube.com/${handle.startsWith('@') ? handle : '@' + handle}`;
        return '';
      })();
      return link ? `<a href="${esc(link)}" style="color:#2563eb;word-break:break-all">${esc(link)}</a>` : '—';
    })()}</td></tr>
        <tr><td>Post Link</td><td><a href="${esc(r.post_link || '')}" style="color:#2563eb;word-break:break-all">${esc(dash(r.post_link))}</a></td></tr>
        <tr><td>Post Date</td><td>${fmtDateHtml(r.post_date)}</td></tr>
      </table>
    </div>
    <div>
      <div class="metrics-qr-row">
        <div class="metrics-table-wrap">
          <table class="kv-table">
            <tr><td>Views</td><td>${dash(r.engagement?.views)}</td></tr>
            <tr><td>Likes</td><td>${dash(r.engagement?.likes)}</td></tr>
            <tr><td>Reposts</td><td>${dash(r.engagement?.reposts)}</td></tr>
            <tr><td>Replies</td><td>${dash(r.engagement?.replies)}</td></tr>
          </table>
        </div>
        ${(postQrImageUrl && r.post_link) ? `
        <div class="post-qr-side">
          <div class="qr-box">
            <img src="${esc(postQrImageUrl)}" alt="Post QR"/>
            <div class="qr-label">POST QR</div>
          </div>
        </div>` : ''}
      </div>
    </div>
  </div>
  ${r.post_description ? `<div class="box" style="background:#f8fafc;border:1px solid #e2e8f0;margin-top:8px">${esc(r.post_description)}</div>` : ''}
</div>


<!-- MEDIA -->
${(() => {
      const mediaUrls = (r.media_s3_urls && r.media_s3_urls.length > 0) ? r.media_s3_urls : (r.media_urls || []);
      const isVideo = (url) => /\.(mp4|webm|mov|mkv|avi|m3u8)(\?|$)/i.test(String(url || ''));

      return mediaUrls.length > 0 ? `
<div class="section">
  <div class="section-title">Post Media (${mediaUrls.length})</div>
  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
    ${mediaUrls.map((u, i) => `
      <div style="border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #f8fafc; min-height: 40px; display: flex; flex-direction: column;">
        ${isVideo(u)
          ? `<div style="padding: 20px 10px; text-align: center; font-size: 9px; color: #2563eb; font-weight: 500; background: #f1f5f9; flex: 1; display: flex; align-items: center; justify-content: center; word-break: break-all;">
               🎬 Video: <a href="${esc(u)}" style="color:#2563eb; text-decoration: underline; margin-left: 4px;">${esc(u)}</a>
             </div>`
          : `<img src="${esc(u)}" style="width: 100%; height: 160px; object-fit: contain; display: block; background: #f1f5f9;" />`
        }
        <div style="padding: 4px 8px; font-size: 8px; color: #64748b; background: white; border-top: 1px solid #e2e8f0; text-align: center; font-weight: 600;">
          <a href="${esc(u)}" style="color:#2563eb; text-decoration: underline;">📎 ${isVideo(u) ? 'Video' : 'Image'} ${i + 1} — Click to view</a>
        </div>
      </div>`).join('')}
  </div>
</div>` : '';
    })()}

<!-- STATUS TIMELINE -->
${(() => {
  const hist = r.status_history || [];
  const createdAt = r.created_at;
  const escalatedAt = r.escalated_at || (hist.find(h => h.to_status === 'ESCALATED' || h.to_status === 'ESCALED') || {}).timestamp;
  const closedAt = r.closed_at || (hist.find(h => h.to_status === 'CLOSED') || {}).timestamp;
  const currentStatus = (r.status || 'PENDING').toUpperCase();
  const escalateHist = hist.find(h => h.to_status === 'ESCALATED' || h.to_status === 'ESCALED');
  const closeHist = hist.find(h => h.to_status === 'CLOSED');
  const isEscalatedStep = currentStatus === 'ESCALATED' || currentStatus === 'ESCALED' || currentStatus === 'CLOSED';
  const isClosedStep = currentStatus === 'CLOSED';

  const calcDur = (from, to) => {
    if (!from) return '';
    const s = new Date(from), e = to ? new Date(to) : new Date();
    const ms = Math.max(0, e - s), mins = Math.floor(ms / 60000), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
    if (days > 0) return days + 'd ' + (hrs % 24) + 'h';
    if (hrs > 0) return hrs + 'h ' + (mins % 60) + 'm';
    return mins + 'm';
  };

  let escalatedNote = (escalateHist || {}).note || (r.informed_to?.name ? 'Escalated to ' + esc(r.informed_to.name) : '');
  if (r.informed_to?.phone && escalatedNote && !escalatedNote.includes(r.informed_to.phone)) {
    escalatedNote += ' (' + esc(r.informed_to.phone) + ')';
  }

  const steps = [
    { label: 'Pending', date: createdAt, active: true, current: currentStatus === 'PENDING', duration: calcDur(createdAt, escalatedAt || closedAt || (currentStatus === 'PENDING' ? null : createdAt)), officer: r.created_by?.name || r.informed_to?.name || '', note: 'Issue created', color: '#eab308', icon: '＋' },
    { label: 'Escalated', date: escalatedAt, active: isEscalatedStep, current: currentStatus === 'ESCALATED' || currentStatus === 'ESCALED', duration: isEscalatedStep ? calcDur(escalatedAt, closedAt || null) : '', officer: (escalateHist || {}).changed_by?.name || r.informed_to?.name || '', note: escalatedNote, color: '#f97316', icon: '⚠' },
    { label: 'Closed', date: closedAt, active: isClosedStep, current: isClosedStep, duration: isClosedStep ? calcDur(createdAt, closedAt) : '', officer: (closeHist || {}).changed_by?.name || '', note: r.closing_remarks || (closeHist || {}).note || 'Resolved', color: '#22c55e', icon: '✓' }
  ];

  const fmtShortDate = (d) => { if (!d) return ''; return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); };
  const fmtShortTime = (d) => { if (!d) return ''; return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }); };

  return `
<div class="timeline-section" style="page-break-inside:avoid">
  <div class="timeline-header">
    <div class="timeline-header-icon"><span style="font-size:13px;color:#2563eb">⏱</span></div>
    <div>
      <div style="font-size:12px;font-weight:700;color:#1e293b">Status Timeline</div>
      <div style="font-size:9px;color:#64748b;font-weight:500">Tracking the lifecycle of this grievance</div>
    </div>
  </div>
  <div class="timeline-body">
    ${steps.map((step, idx) => {
      const isLast = idx === steps.length - 1;
      const nextActive = !isLast && steps[idx + 1].active;
      return `
      <div class="tl-step${step.active ? '' : ' inactive'}">
        <div class="tl-date">
          ${step.date ? `<div class="tl-date-day">${fmtShortDate(step.date)}</div><div class="tl-date-time">${fmtShortTime(step.date)}</div>` : '<div style="font-size:9px;color:#cbd5e1;font-style:italic">Pending</div>'}
        </div>
        <div class="tl-center">
          <div class="tl-dot${step.active ? ' active' : ''}" style="${step.active ? 'border-color:' + step.color + ';' : ''}">
            <span style="color:${step.active ? step.color : '#cbd5e1'}">${step.icon}</span>
          </div>
          ${!isLast ? '<div class="tl-line" style="background:' + (nextActive ? step.color : '#f1f5f9') + '"></div>' : ''}
        </div>
        <div class="tl-content${isLast ? ' tl-content-last' : ''}">
          <span class="tl-label${step.active ? '' : ' inactive'}">${esc(step.label)}</span>
          ${(step.active && step.duration) ? '<span class="tl-duration">⏱ ' + esc(step.duration) + '</span>' : ''}
          <div class="tl-card${step.active ? '' : ' inactive'}">
            <div class="tl-officer">👤 ${esc(step.officer || '—')}</div>
            ${(step.note && step.note !== '—') ? '<div class="tl-note">"' + esc(step.note) + '"</div>' : ''}
          </div>
        </div>
      </div>`;
    }).join('')}
  </div>
</div>`;
})()}

<!-- FULL TWEET THREAD -->
${(() => {
  const gCtx = r.grievance_context || {};
  const isXPlatform = (r.platform || '').toLowerCase() === 'x' || (r.platform || '').toLowerCase() === 'twitter';
  const hasCtxContent = (node) => node && (node.tweet_id || node.content?.text || node.content?.full_text || (node.content?.media || []).length);
  const threadParent = hasCtxContent(gCtx.thread_parent) ? gCtx.thread_parent : null;
  const inReplyTo = hasCtxContent(gCtx.in_reply_to) ? gCtx.in_reply_to : null;
  const quotedCtx = hasCtxContent(gCtx.quoted) ? gCtx.quoted : null;
  const repostedFrom = hasCtxContent(gCtx.reposted_from) ? gCtx.reposted_from : null;
  const hasThread = isXPlatform && (threadParent || inReplyTo || quotedCtx || repostedFrom);

  if (!hasThread) return '';

  const renderTweet = (node, label, showConnector) => {
    const user = node.posted_by || {};
    const handle = (user.handle || '').replace('@', '');
    const text = node.content?.full_text || node.content?.text || '';
    const avatarUrl = user.profile_image_url || '';
    return `
    <div class="thread-tweet">
      ${showConnector ? '<div class="thread-connector"></div>' : ''}
      ${avatarUrl ? '<img src="' + esc(avatarUrl) + '" class="thread-avatar" referrerpolicy="no-referrer" />' : '<div class="thread-avatar-placeholder">👤</div>'}
      <div class="thread-content">
        <div>
          <span class="thread-name">${esc(user.display_name || handle || 'Unknown')}</span>
          ${handle ? '<span class="thread-handle">@' + esc(handle) + '</span>' : ''}
          <span class="thread-label">${esc(label)}</span>
        </div>
        ${node.post_date ? '<div class="thread-date">' + fmtDateHtml(node.post_date) + '</div>' : ''}
        ${text ? '<div class="thread-text">' + esc(text) + '</div>' : ''}
        ${node.tweet_url ? '<a href="' + esc(node.tweet_url) + '" class="thread-link">View on X →</a>' : ''}
      </div>
    </div>`;
  };

  const threadNodes = [
    threadParent && { node: threadParent, label: 'Thread Start' },
    repostedFrom && { node: repostedFrom, label: 'Reposted From' },
    inReplyTo && (!threadParent || threadParent?.tweet_id !== inReplyTo?.tweet_id) && { node: inReplyTo, label: 'Original Post' },
  ].filter(Boolean);

  const mainNode = { posted_by: r.posted_by || r.grievance_posted_by, content: r.grievance_content || { text: r.post_description }, post_date: r.post_date, tweet_url: r.post_link };

  return `
<div class="thread-section" style="page-break-inside:avoid">
  <div class="thread-header">
    <span style="font-size:12px">↩</span>
    <span style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.06em">Full Tweet Thread</span>
  </div>
  <div class="thread-body">
    ${threadNodes.map(item => renderTweet(item.node, item.label, true)).join('')}
    ${renderTweet(mainNode, threadNodes.length > 0 ? 'Reply' : 'Post', !!quotedCtx)}
    ${quotedCtx ? renderTweet(quotedCtx, 'Quoted', false) : ''}
  </div>
</div>`;
})()}

<!-- ESCALATION -->
${escalationLog ? `
<div class="section">
  <div class="section-title">Escalation Details</div>
  <div class="box" style="background:#fef2f2;border:1px solid #fecaca">
    <table class="kv-table">
      <tr><td>Escalated At</td><td>${fmtDateHtml(escalationLog.timestamp)}</td></tr>
      ${escalationLog.recipient?.name ? `<tr><td>Escalated To</td><td style="font-weight:700">${esc(escalationLog.recipient.name)}${escalationLog.recipient?.phone ? ' · ' + esc(escalationLog.recipient.phone) : ''}</td></tr>` : ''}
      ${escalationLog.content ? `<tr><td>Remarks</td><td>${esc(escalationLog.content)}</td></tr>` : ''}
    </table>
  </div>
</div>` : ''}

<!-- COMMUNICATION LOG -->
${allLogs.length > 0 ? `
<div class="section">
  <div class="section-title">Communication Log (${allLogs.length} entries)</div>
  <table class="log-table">
    <thead><tr><th>Comments By</th><th>Mode Of Communication</th><th>Message</th><th>Time</th></tr></thead>
    <tbody>${logRows}</tbody>
  </table>
</div>` : ''}

<!-- CLOSING -->
${(r.closing_remarks || r.final_reply_to_user || r.status === 'CLOSED') ? `
<div class="section">
  <div class="section-title">Closing Details</div>
  ${r.closing_remarks ? `
  <div style="margin-bottom:8px">
    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px">Closing Remarks</div>
    <div class="box" style="background:#f0fdf4;border:1px solid #bbf7d0">${esc(r.closing_remarks)}</div>
  </div>` : ''}
  ${r.final_reply_to_user ? `
  <div>
    <div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px">Final Reply to User</div>
    <div class="box" style="background:#f0fdf4;border:1px solid #bbf7d0">${esc(r.final_reply_to_user)}</div>
  </div>` : ''}
</div>` : ''}

<!-- FIR -->
${(firConverted === 'Yes' || firNumber) ? `
<div class="section">
  <div class="section-title">FIR Details</div>
  <div class="box" style="background:#fef2f2;border:1px solid #fecaca">
    <table class="kv-table">
      <tr><td>FIR Number</td><td style="font-weight:700;color:#dc2626;font-size:13px">${esc(firNumber || '—')}</td></tr>
      ${firStation ? `<tr><td>Police Station</td><td>${esc(firStation)}</td></tr>` : ''}
      ${firDistrict ? `<tr><td>District</td><td>${esc(firDistrict)}</td></tr>` : ''}
    </table>
  </div>
</div>` : ''}

<!-- FOOTER -->
<div style="margin:20px 20px 0;padding:8px 0;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8">
  <span>Grievance Report · ${esc(r.unique_code || '')}</span>
  <span>Generated ${fmtDateHtml(new Date())}</span>
</div>

</body>
</html>`;
};

module.exports = { fmtDateHtml, generateQrDataUrl, buildReportHtml };
