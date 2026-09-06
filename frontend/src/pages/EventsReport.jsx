import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import api from '../lib/api';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '../components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '../components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Download, Search, Loader2, FileSpreadsheet, FileText, ChevronDown, CalendarDays, RefreshCw } from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

/* ── Month config ───────────────────────────────── */
const MONTHS = [
  { key: 0,  label: 'Jan' },
  { key: 1,  label: 'Feb' },
  { key: 2,  label: 'Mar' },
  { key: 3,  label: 'Apr' },
  { key: 4,  label: 'May' },
  { key: 5,  label: 'Jun' },
  { key: 6,  label: 'Jul' },
  { key: 7,  label: 'Aug' },
  { key: 8,  label: 'Sep' },
  { key: 9,  label: 'Oct' },
  { key: 10, label: 'Nov' },
  { key: 11, label: 'Dec' },
];

/* ── Helpers ───────────────────────────────── */

/** Parse a date string like "14 March" or "1 January" and return month index (0-based) */
const parseMonthFromDateStr = (dateStr) => {
  if (!dateStr) return -1;
  const monthNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  const lower = dateStr.toLowerCase().trim();
  for (let i = 0; i < monthNames.length; i++) {
    if (lower.includes(monthNames[i]) || lower.includes(monthNames[i].slice(0, 3))) {
      return i;
    }
  }
  return -1;
};

/** Format a date range for display (returns the raw range string as-is) */
const formatMonitoringRange = (rangeStr) => {
  if (!rangeStr) return '—';
  return rangeStr.trim();
};

/** Get deep-link URL for an event (QR target) */
const getReportUrl = (event) => {
  if (event?.eventId) {
    return `${window.location.origin}/events?selected=${event.eventId}`;
  }
  return `${window.location.origin}/events`;
};

const formatKeywords = (keywords) => {
  if (!keywords) return '';
  if (typeof keywords === 'string') return keywords;
  if (!Array.isArray(keywords)) return '';
  return keywords
    .map((k) => (typeof k === 'string' ? k : k?.keyword))
    .filter(Boolean)
    .join(', ');
};

const isCalendarLinkedEvent = (e) =>
  Boolean(e?.occasion_calendar_id || e?.origin_calendar_id) ||
  e?.origin === 'master_calendar' ||
  e?.origin === 'occasion_calendar';

/* ══════════════════════════════════════════════
   Events Report Page
   ══════════════════════════════════════════════ */
const EventsReport = () => {
  const [enrichedEvents, setEnrichedEvents] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());

  /* ── Fetch data ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, calendarRes] = await Promise.all([
        api.get('/events/report'),
        api.get('/occasion-calendar', { params: { recurring: 'true' } }),
      ]);
      const events = Array.isArray(reportRes.data)
        ? reportRes.data
        : (reportRes.data?.events || []);
      setEnrichedEvents(events);
      setCalendarEvents(Array.isArray(calendarRes.data) ? calendarRes.data : []);
    } catch {
      toast.error('Failed to load events data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Build merged report rows ── */
  const reportRows = useMemo(() => {
    const rows = [];
    const eventList = Array.isArray(enrichedEvents) ? enrichedEvents : [];
    const calendarList = Array.isArray(calendarEvents) ? calendarEvents : [];

    calendarList.forEach((cal) => {
      const matchedEvent = eventList.find(
        (e) =>
          e.origin_calendar_id === cal.id ||
          e.occasion_calendar_id === cal.id ||
          ((e.origin === 'master_calendar' || e.origin === 'occasion_calendar') &&
            e.name?.toLowerCase() === (cal.occasion || cal.title || '').toLowerCase())
      );

      const newKeywords = matchedEvent?.discovered_hashtags || [];
      const contentCount = matchedEvent?.content_count || 0;

      rows.push({
        slNo: cal.slNo,
        eventName: cal.occasion || cal.title || '',
        eventDate: cal.date || cal.date_label || '',
        monitoringRange: formatMonitoringRange(cal.monitoringRange || cal.monitoring_range),
        keywordsGiven: formatKeywords(cal.keywords || cal.suggested_keywords),
        newKeywordsFetched:
          newKeywords.length > 0
            ? newKeywords.join(', ')
            : contentCount === 0
              ? 'No posts yet'
              : '—',
        eventId: matchedEvent?.id || null,
        monitoringStatus: matchedEvent?.monitoring_status || null,
        contentCount,
        monthIndex: parseMonthFromDateStr(cal.date || cal.date_label),
        isCalendar: true,
      });
    });

    eventList.filter((e) => !isCalendarLinkedEvent(e)).forEach((evt) => {
      const kwList = formatKeywords(evt.keywords);
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
      const contentCount = evt.content_count || 0;

      rows.push({
        slNo: rows.length + 1,
        eventName: evt.name || '',
        eventDate: startDate
          ? startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
          : '—',
        monitoringRange,
        keywordsGiven: kwList,
        newKeywordsFetched:
          newKeywords.length > 0
            ? newKeywords.join(', ')
            : contentCount === 0
              ? 'No posts yet'
              : '—',
        eventId: evt.id,
        monitoringStatus: evt.monitoring_status || null,
        contentCount,
        monthIndex: startDate ? startDate.getMonth() : -1,
        isCalendar: false,
      });
    });

    return rows;
  }, [enrichedEvents, calendarEvents]);

  /* ── Filter by month and search ── */
  const filteredRows = useMemo(() => {
    let rows = reportRows;

    // Filter by month
    if (selectedMonth !== null && selectedMonth !== undefined) {
      rows = rows.filter(r => r.monthIndex === selectedMonth);
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(r =>
        r.eventName.toLowerCase().includes(q) ||
        r.keywordsGiven.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [reportRows, selectedMonth, searchQuery]);

  /* ── Month event counts ── */
  const monthCounts = useMemo(() => {
    const counts = {};
    reportRows.forEach(r => {
      if (r.monthIndex >= 0) {
        counts[r.monthIndex] = (counts[r.monthIndex] || 0) + 1;
      }
    });
    return counts;
  }, [reportRows]);

  /** Generate a QR code as a data URL (PNG base64) */
  const generateQRDataUrl = (url, size = 120) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    // Use a hidden QRCodeCanvas to render
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    document.body.appendChild(container);

    return new Promise((resolve) => {
      const root = createRoot(container);
      root.render(
        React.createElement(QRCodeCanvas, {
          value: url,
          size,
          level: 'M',
          includeMargin: true,
        })
      );
      // Give it a frame to render
      setTimeout(() => {
        const qrCanvas = container.querySelector('canvas');
        const dataUrl = qrCanvas ? qrCanvas.toDataURL('image/png') : null;
        root.unmount();
        document.body.removeChild(container);
        resolve(dataUrl);
      }, 100);
    });
  };

  /* ── Export to Excel with QR code images ── */
  const exportToExcel = async () => {
    if (!filteredRows.length) {
      toast.error('No events to export for this month');
      return;
    }
    try {
      const monthLabel = selectedMonth !== null ? MONTHS[selectedMonth]?.label : 'All';
      const now = new Date();
      const generatedAt = now.toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });

      const wsData = [
        ['Events Report'],
        [`Report Generated: ${generatedAt}`],
        [`Month: ${monthLabel}`],
        [],
        ['Sl.No', 'Event Name', 'Event Date', 'Monitoring Range', 'Keywords (Given by Team)', 'New Keywords Fetched', 'QR Code'],
      ];

      const qrImages = [];
      for (let i = 0; i < filteredRows.length; i++) {
        const row = filteredRows[i];
        const reportUrl = row.eventId ? getReportUrl(row) : null;
        wsData.push([
          i + 1,
          row.eventName,
          row.eventDate,
          row.monitoringRange,
          row.keywordsGiven,
          row.newKeywordsFetched,
          '',
        ]);
        if (reportUrl) {
          const dataUrl = await generateQRDataUrl(reportUrl, 100);
          if (dataUrl) qrImages.push({ row: i + 5, col: 7, dataUrl });
        }
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [
        { wch: 6 }, { wch: 40 }, { wch: 18 }, { wch: 16 },
        { wch: 35 }, { wch: 30 }, { wch: 18 },
      ];
      ws['!rows'] = [];
      for (let i = 0; i < wsData.length; i++) {
        if (i >= 5) ws['!rows'][i] = { hpt: 80 };
      }
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
      ];
      XLSX.utils.book_append_sheet(wb, ws, `Events - ${monthLabel}`);
      qrImages.forEach(({ row }) => {
        const cell = XLSX.utils.encode_cell({ r: row, c: 6 });
        if (ws[cell]) ws[cell].v = 'Scan QR in PDF/Print';
      });

      const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      saveAs(
        new Blob([wbOut], { type: 'application/octet-stream' }),
        `Events_Report_${monthLabel}_${now.toISOString().slice(0, 10)}.xlsx`
      );
      toast.success('Excel exported successfully');
    } catch (err) {
      toast.error(err?.message || 'Failed to export Excel');
    }
  };

  /* ── Export to PDF with QR code images ── */
  const exportToPDF = async () => {
    if (!filteredRows.length) {
      toast.error('No events to export for this month');
      return;
    }
    try {
      const monthLabel = selectedMonth !== null ? MONTHS[selectedMonth]?.label : 'All';
      const now = new Date();
      const generatedAt = now.toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });

      const qrDataUrls = {};
      for (const row of filteredRows) {
        if (row.eventId) {
          const url = getReportUrl(row);
          const dataUrl = await generateQRDataUrl(url, 150);
          if (dataUrl) qrDataUrls[row.eventId] = dataUrl;
        }
      }

      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(18);
      doc.text('Events Report', 14, 20);
      doc.setFontSize(10);
      doc.text(`Report Generated: ${generatedAt}`, 14, 28);
      doc.text(`Month: ${monthLabel}`, 14, 34);

      doc.autoTable({
        startY: 40,
        head: [['Sl.No', 'Event Name', 'Event Date', 'Monitoring\nRange', 'Keywords (Given by Team)', 'New Keywords\nFetched', 'QR Code']],
        body: filteredRows.map((row, idx) => [
          idx + 1,
          row.eventName,
          row.eventDate,
          row.monitoringRange,
          row.keywordsGiven,
          row.newKeywordsFetched,
          '',
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
            const row = filteredRows[data.row.index];
            if (row?.eventId && qrDataUrls[row.eventId]) {
              const dim = Math.min(data.cell.height - 2, 22);
              doc.addImage(
                qrDataUrls[row.eventId],
                'PNG',
                data.cell.x + (data.cell.width - dim) / 2,
                data.cell.y + (data.cell.height - dim) / 2,
                dim,
                dim
              );
            }
          }
        },
      });

      doc.save(`Events_Report_${monthLabel}_${now.toISOString().slice(0, 10)}.pdf`);
      toast.success('PDF exported successfully');
    } catch (err) {
      toast.error(err?.message || 'Failed to export PDF');
    }
  };

  /* ── Derived stats ── */
  const totalEvents = reportRows.length;
  const liveCount = reportRows.filter((r) => r.monitoringStatus === 'started').length;
  const withContent = reportRows.filter((r) => (r.contentCount || 0) > 0).length;
  const currentMonthCount = monthCounts[selectedMonth] || 0;

  /* ── Render ── */
  return (
    <div className="w-full space-y-4 px-1 max-w-[1600px] mx-auto">

      {/* ═══════════ PAGE HEADER ═══════════ */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <div className="min-w-0 shrink-0">
          <h1 className="text-xl font-heading font-bold tracking-tight leading-none">Events Report</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5 hidden sm:block">
            Calendar + manual events · QR opens the live Events page
          </p>
        </div>
        <div className="inline-flex items-center gap-1 flex-wrap">
          <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
            <span className="tabular-nums font-semibold text-foreground">{totalEvents}</span>
            <span>total</span>
          </span>
          <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
            <span className="tabular-nums font-semibold text-foreground">{currentMonthCount}</span>
            <span>{MONTHS[selectedMonth]?.label || 'month'}</span>
          </span>
          <span className="inline-flex items-baseline gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
            <span className="tabular-nums font-semibold">{liveCount}</span>
            <span>live</span>
          </span>
          <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
            <span className="tabular-nums font-semibold text-foreground">{withContent}</span>
            <span>with content</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                Export
                <ChevronDown className="h-3 w-3 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={exportToExcel} className="gap-2 cursor-pointer">
                <FileSpreadsheet className="h-4 w-4 text-green-600" />
                Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToPDF} className="gap-2 cursor-pointer">
                <FileText className="h-4 w-4 text-red-600" />
                PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ═══════════ MAIN TABLE CARD ═══════════ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">

        {/* ── Month Tabs + Search Bar ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-5 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-800/30">
          {/* Month tabs */}
          <div className="flex items-center gap-0.5 flex-wrap bg-white dark:bg-slate-800/60 rounded-xl p-1 border border-gray-200 dark:border-slate-700 shadow-sm">
            {MONTHS.map(m => {
              const isActive = selectedMonth === m.key;
              const count = monthCounts[m.key] || 0;
              return (
                <button
                  key={m.key}
                  onClick={() => setSelectedMonth(m.key)}
                  className={`
                    relative px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
                    ${isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-blue-900/40'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-800 dark:hover:text-gray-200'
                    }
                  `}
                >
                  {m.label}
                  {count > 0 && isActive && (
                    <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-white/25 text-[10px] font-bold px-1">
                      {count}
                    </span>
                  )}
                  {count > 0 && !isActive && (
                    <span className="absolute -top-1.5 -right-1 h-4 min-w-[16px] flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[9px] font-bold px-1 shadow-sm">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search events or keywords..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 rounded-lg border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 text-sm shadow-sm"
            />
          </div>
        </div>

        {/* ── Table Content ── */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-28">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-400/20 rounded-full blur-xl animate-pulse" />
                <Loader2 className="h-10 w-10 animate-spin text-blue-600 relative" />
              </div>
              <span className="mt-4 text-gray-500 dark:text-gray-400 text-sm font-medium">Loading events data...</span>
              <span className="mt-1 text-gray-400 dark:text-gray-500 text-xs">Fetching calendar and report data</span>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 text-gray-400 dark:text-gray-500">
              <div className="bg-gray-100 dark:bg-slate-800 rounded-2xl p-5 mb-4">
                <CalendarDays className="h-10 w-10 opacity-40" />
              </div>
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No events found for {MONTHS[selectedMonth]?.label || 'this month'}</p>
              <p className="text-xs mt-1.5 text-gray-400 dark:text-gray-500 max-w-xs text-center">Try selecting a different month or adjusting your search query above.</p>
              <Button variant="outline" size="sm" onClick={() => { setSearchQuery(''); }} className="mt-4 gap-2 text-xs">
                Clear Search
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-900 dark:bg-slate-800 border-b-0">
                  <TableHead className="w-[52px] text-center font-bold text-[10px] uppercase tracking-widest text-white/80 py-3.5">Sl.No</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-widest text-white/80 min-w-[200px] py-3.5">Event Name</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-widest text-white/80 min-w-[120px] py-3.5">Event Date</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-widest text-white/80 text-center min-w-[130px] py-3.5">Monitoring Range</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-widest text-white/80 min-w-[200px] py-3.5">Keywords (Given)</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-widest text-white/80 min-w-[180px] py-3.5">New Keywords Fetched</TableHead>
                  <TableHead className="font-bold text-[10px] uppercase tracking-widest text-white/80 text-center min-w-[130px] py-3.5">Open / QR</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row, idx) => (
                  <TableRow
                    key={`${row.slNo}-${idx}`}
                    className={`
                      transition-colors border-b border-gray-100 dark:border-slate-800
                      ${idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/70 dark:bg-slate-800/30'}
                      hover:bg-blue-50/70 dark:hover:bg-blue-950/20
                    `}
                  >
                    {/* Sl.No */}
                    <TableCell className="text-center py-4">
                      <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {idx + 1}
                      </span>
                    </TableCell>

                    {/* Event Name */}
                    <TableCell className="py-4">
                      <div className="flex flex-col gap-1">
                        {row.eventId ? (
                          <a
                            href={`/events?selected=${row.eventId}`}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-semibold text-[13px] leading-snug transition-colors hover:underline decoration-blue-300/50 underline-offset-2"
                          >
                            {row.eventName}
                          </a>
                        ) : (
                          <span className="text-gray-800 dark:text-gray-200 font-semibold text-[13px] leading-snug">{row.eventName}</span>
                        )}
                        {row.isCalendar && (
                          <span className="self-start inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 tracking-wide">
                            Calendar
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Event Date */}
                    <TableCell className="py-4">
                      <div className="flex items-center gap-1.5">
                        <div className="h-6 w-6 rounded-md bg-gray-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          <CalendarDays className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                        </div>
                        <span className="text-gray-700 dark:text-gray-300 text-[12px] whitespace-nowrap font-medium">{row.eventDate}</span>
                      </div>
                    </TableCell>

                    {/* Monitoring Range */}
                    <TableCell className="text-center py-4">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700">
                        {row.monitoringRange}
                      </span>
                    </TableCell>

                    {/* Keywords Given */}
                    <TableCell className="py-4">
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {row.keywordsGiven
                          ? row.keywordsGiven.split(',').slice(0, 8).map((kw, ki) => (
                              <span
                                key={ki}
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/50"
                              >
                                {kw.trim()}
                              </span>
                            ))
                          : <span className="text-gray-400 dark:text-gray-500 text-[11px] italic">No keywords</span>
                        }
                        {row.keywordsGiven && row.keywordsGiven.split(',').length > 8 && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium self-center">+{row.keywordsGiven.split(',').length - 8}</span>
                        )}
                      </div>
                    </TableCell>

                    {/* New Keywords Fetched */}
                    <TableCell className="py-4">
                      <div className="flex flex-wrap gap-1 max-w-[240px]">
                        {row.newKeywordsFetched && row.newKeywordsFetched !== '—' && row.newKeywordsFetched !== 'No posts yet'
                          ? row.newKeywordsFetched.split(',').slice(0, 6).map((kw, ki) => (
                              <span
                                key={ki}
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/50"
                              >
                                {kw.trim()}
                              </span>
                            ))
                          : <span className="text-gray-400 dark:text-gray-500 text-[11px] italic">{row.newKeywordsFetched || '—'}</span>
                        }
                        {row.newKeywordsFetched && row.newKeywordsFetched !== '—' && row.newKeywordsFetched !== 'No posts yet' && row.newKeywordsFetched.split(',').length > 6 && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium self-center">+{row.newKeywordsFetched.split(',').length - 6}</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Report / QR */}
                    <TableCell className="text-center py-4">
                      {row.eventId ? (
                        <div className="flex flex-col items-center justify-center gap-1.5">
                          <div className="bg-white dark:bg-slate-800 p-1.5 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 inline-block">
                            <QRCodeCanvas
                              value={getReportUrl(row)}
                              size={52}
                              level="M"
                              includeMargin={false}
                            />
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              row.monitoringStatus === 'started'
                                ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800/40'
                                : 'text-muted-foreground bg-muted border-border'
                            }`}
                          >
                            {row.monitoringStatus === 'started' ? 'Live' : 'Stopped'}
                          </span>
                          <a
                            href={`/events?selected=${row.eventId}`}
                            className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Open event
                          </a>
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 text-lg">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* ── Footer Summary ── */}
        {!loading && filteredRows.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/20">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Showing <span className="font-bold text-gray-800 dark:text-gray-200">{filteredRows.length}</span> event{filteredRows.length !== 1 ? 's' : ''} for <span className="font-bold text-blue-600 dark:text-blue-400">{MONTHS[selectedMonth]?.label}</span>
              </span>
              <span className="hidden sm:inline h-3.5 w-px bg-gray-300 dark:bg-gray-700" />
              <span className="hidden sm:inline text-xs text-gray-400 dark:text-gray-500">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">{filteredRows.filter((r) => r.monitoringStatus === 'started').length}</span> live
              </span>
              <span className="hidden sm:inline h-3.5 w-px bg-gray-300 dark:bg-gray-700" />
              <span className="hidden sm:inline text-xs text-gray-400 dark:text-gray-500">
                <span className="text-amber-600 dark:text-amber-400 font-bold">{filteredRows.filter((r) => r.eventId && r.monitoringStatus !== 'started').length}</span> stopped
              </span>
            </div>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              Last refreshed: {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventsReport;
