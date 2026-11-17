import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import {
  Download,
  FileText,
  FileSpreadsheet,
  Search,
  X,
  RefreshCw,
  Shield,
  Users,
  Activity,
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import api from '../../lib/api';
import { useToast } from '../../hooks/use-toast';
import { AuditChangeCell, AuditDetailModal } from './AuditChangeViewer';
import { cn } from '../../lib/utils';

const ACTION_COLORS = {
  create: 'bg-emerald-600',
  update: 'bg-sky-600',
  delete: 'bg-red-600',
  login: 'bg-violet-600',
  login_force: 'bg-violet-600',
  failed_login: 'bg-orange-600',
  manual_check: 'bg-amber-600',
};

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState(null);
  const [actionFilter, setActionFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const { toast } = useToast();
  const dateRangeRef = useRef(dateRange);
  dateRangeRef.current = dateRange;

  const fetchLogs = useCallback(
    async (overrides = {}) => {
      setLoading(true);
      try {
        const params = {};
        const start = Object.prototype.hasOwnProperty.call(overrides, 'start')
          ? overrides.start
          : dateRangeRef.current.start;
        const end = Object.prototype.hasOwnProperty.call(overrides, 'end')
          ? overrides.end
          : dateRangeRef.current.end;
        if (start) params.start_date = start;
        if (end) params.end_date = end;

        const response = await api.get('/audit', { params });
        setLogs(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error('Error fetching logs:', error);
        toast({
          title: 'Error',
          description: 'Failed to fetch audit logs',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleDateChange = (type, value) => {
    setDateRange((prev) => ({ ...prev, [type]: value }));
  };

  const applyFilters = () => fetchLogs();

  const clearDateFilters = () => {
    setDateRange({ start: '', end: '' });
    fetchLogs({ start: '', end: '' });
  };

  const formatLogTimestamp = (timestamp) => {
    try {
      if (!timestamp) return { date: 'Invalid Date', time: '--:--' };
      const date = new Date(timestamp);
      if (!isValid(date)) return { date: 'Invalid Date', time: '--:--' };
      return {
        date: format(date, 'MMM d, yyyy'),
        time: format(date, 'HH:mm:ss'),
      };
    } catch {
      return { date: 'Invalid Date', time: '--:--' };
    }
  };

  const filteredLogs = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return logs.filter((log) => {
      if (!log) return false;
      const hay = [
        log.user_name,
        log.user_email,
        log.action,
        log.resource_type,
        log.tenant_label,
        log.tenant_db,
        log.device_label,
        log.ip,
        JSON.stringify(log.details || {}),
        log.old_data ? JSON.stringify(log.old_data) : '',
        log.new_data ? JSON.stringify(log.new_data) : '',
      ]
        .join(' ')
        .toLowerCase();
      const matchesSearch = !q || hay.includes(q);
      const matchesAction = actionFilter === 'all' || log.action === actionFilter;
      const matchesResource = resourceFilter === 'all' || log.resource_type === resourceFilter;
      return matchesSearch && matchesAction && matchesResource;
    });
  }, [logs, searchTerm, actionFilter, resourceFilter]);

  const uniqueUsers = useMemo(
    () => new Set(logs.filter((log) => log?.user_id).map((log) => log.user_id)).size,
    [logs]
  );

  const stats = useMemo(
    () => ({
      total: logs.length,
      manual: logs.filter((l) => l?.action === 'manual_check').length,
      security: logs.filter((l) => ['login', 'login_force', 'failed_login'].includes(l?.action))
        .length,
      users: uniqueUsers,
    }),
    [logs, uniqueUsers]
  );

  const actionBadge = (action) => {
    const key = String(action || '').toLowerCase();
    return ACTION_COLORS[key] || 'bg-slate-500';
  };

  const handleExport = (formatType) => {
    if (!filteredLogs.length) {
      toast({
        title: 'No Data',
        description: 'No logs to export',
        variant: 'destructive',
      });
      return;
    }

    if (formatType === 'excel') {
      try {
        const worksheet = XLSX.utils.json_to_sheet(
          filteredLogs.map((log) => ({
            Timestamp: format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
            User: log.user_name || log.user_email || 'Unknown',
            Action: log.action,
            Resource: log.resource_type,
            Details: JSON.stringify(log.details || {}),
          }))
        );
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Audit Logs');
        const dateStr = dateRange.start
          ? `_${dateRange.start}_to_${dateRange.end || 'now'}`
          : '';
        XLSX.writeFile(
          workbook,
          `audit_logs${dateStr}_${new Date().toISOString().split('T')[0]}.xlsx`
        );
        toast({ title: 'Export Complete', description: 'Excel report has been generated.' });
      } catch (error) {
        console.error('Excel Export Error:', error);
        toast({
          title: 'Export Failed',
          description: 'Could not generate Excel report.',
          variant: 'destructive',
        });
      }
      return;
    }

    if (formatType === 'pdf') {
      try {
        const doc = new jsPDF();
        const primaryColor = [15, 23, 42];
        const accentColor = [234, 179, 8];
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, doc.internal.pageSize.width, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont('helvetica', 'bold');
        doc.text('BLURA - SAGA', 20, 20);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text('SENTIMENT & GOODWILL ANALYSIS', 20, 30);
        doc.setFontSize(16);
        doc.setTextColor(...accentColor);
        doc.text('OFFICIAL AUDIT RECORD', doc.internal.pageSize.width - 20, 20, {
          align: 'right',
        });
        doc.setFontSize(10);
        doc.setTextColor(200, 200, 200);
        doc.text('CONFIDENTIAL - INTERNAL USE ONLY', doc.internal.pageSize.width - 20, 30, {
          align: 'right',
        });
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.text(`Generated On: ${format(new Date(), 'PPpp')}`, 20, 50);
        doc.text(
          `Report Period: ${dateRange.start || 'Beginning'} to ${dateRange.end || 'Present'}`,
          20,
          55
        );
        doc.text(`Total Records: ${filteredLogs.length}`, 20, 60);

        autoTable(doc, {
          head: [['Timestamp', 'User', 'Action', 'Resource', 'Details']],
          body: filteredLogs.map((log) => [
            format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
            log.user_name || log.user_email || 'Unknown',
            String(log.action || '').toUpperCase(),
            String(log.resource_type || '').toUpperCase(),
            `${JSON.stringify(log.details || {}).substring(0, 50)}${
              JSON.stringify(log.details || {}).length > 50 ? '...' : ''
            }`,
          ]),
          startY: 70,
          theme: 'grid',
          headStyles: {
            fillColor: primaryColor,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
          },
          styles: { fontSize: 8, cellPadding: 3 },
          alternateRowStyles: { fillColor: [241, 245, 249] },
        });
        doc.save(`audit_report_${new Date().toISOString().split('T')[0]}.pdf`);
        toast({ title: 'Export Complete', description: 'PDF report has been generated.' });
      } catch (error) {
        console.error('PDF Export Error:', error);
        toast({
          title: 'Export Failed',
          description: 'Could not generate PDF report.',
          variant: 'destructive',
        });
      }
      return;
    }

    try {
      const headers = ['Timestamp', 'User', 'Action', 'Resource', 'Details'];
      const csvContent = [
        headers.join(','),
        ...filteredLogs.map((log) =>
          [
            `"${log.timestamp || ''}"`,
            `"${log.user_name || log.user_email || 'Unknown'}"`,
            `"${log.action || ''}"`,
            `"${log.resource_type || ''}"`,
            `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`,
          ].join(',')
        ),
      ].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      const dateStr = dateRange.start
        ? `_${dateRange.start}_to_${dateRange.end || 'now'}`
        : '';
      link.setAttribute('href', url);
      link.setAttribute(
        'download',
        `audit_logs${dateStr}_${new Date().toISOString().split('T')[0]}.csv`
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast({
        title: 'Export Complete',
        description: `${filteredLogs.length} logs exported successfully.`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to export logs',
        variant: 'destructive',
      });
    }
  };

  const Stat = ({ icon: Icon, label, value }) => (
    <div className="flex min-w-0 items-center gap-3 border border-border bg-card px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-muted/60">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
      </div>
    </div>
  );

  const LogCard = ({ log, index }) => {
    const t = formatLogTimestamp(log.timestamp);
    return (
      <button
        type="button"
        onClick={() => setSelectedLogForDetails(log)}
        className="w-full border border-border bg-card p-3 text-left transition hover:bg-muted/30"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {log.user_name || log.user_email || 'Unknown User'}
            </p>
            {(log.tenant_label || log.tenant_db) && (
              <p className="truncate text-[11px] text-muted-foreground">
                {log.tenant_label || log.tenant_db}
              </p>
            )}
          </div>
          <Badge className={cn(actionBadge(log.action), 'shrink-0 text-white')}>
            {String(log.action || 'unknown').replace(/_/g, ' ').toUpperCase()}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span>
            {t.date} · {t.time}
          </span>
          <span className="capitalize">{log.resource_type || 'unknown'}</span>
          {(log.device_label || log.ip) && (
            <span className="truncate">
              {[log.device_label, log.ip].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          <AuditChangeCell log={log} onOpenDetails={(item) => setSelectedLogForDetails(item)} />
        </div>
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background" data-testid="audit-logs-page">
      <div className="shrink-0 border-b border-border bg-card px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight sm:text-lg">Audit Logs</h1>
            <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
              Track system activities and user actions
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-[11px]"
              onClick={() => fetchLogs()}
              disabled={loading}
            >
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 px-2 text-[11px]"
              onClick={() => handleExport('csv')}
            >
              <FileText className="h-3 w-3" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 hidden gap-1 px-2 text-[11px] sm:inline-flex"
              onClick={() => handleExport('excel')}
            >
              <FileSpreadsheet className="h-3 w-3" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 hidden gap-1 px-2 text-[11px] md:inline-flex"
              onClick={() => handleExport('pdf')}
            >
              <Download className="h-3 w-3" />
              PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Stat icon={Activity} label="Total" value={stats.total} />
            <Stat icon={FileText} label="Manual checks" value={stats.manual} />
            <Stat icon={Shield} label="Security" value={stats.security} />
            <Stat icon={Users} label="Active users" value={stats.users} />
          </div>

          <div className="flex flex-col gap-2 border border-border bg-card p-2.5 sm:p-3">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search user, action, tenant, IP…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="manual_check">Manual check</SelectItem>
                </SelectContent>
              </Select>
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue placeholder="Resource" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All resources</SelectItem>
                  <SelectItem value="source">Source</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="alert">Alert</SelectItem>
                  <SelectItem value="settings">Settings</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateRange.start}
                onChange={(e) => handleDateChange('start', e.target.value)}
                className="h-9"
              />
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => handleDateChange('end', e.target.value)}
                  className="h-9 min-w-0 flex-1"
                />
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={applyFilters}
                  title="Apply dates"
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
                {(dateRange.start || dateRange.end) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={clearDateFilters}
                    title="Clear dates"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Mobile / tablet cards */}
          <div className="space-y-2 lg:hidden">
            {loading ? (
              [...Array(4)].map((_, i) => (
                <div key={i} className="h-24 animate-pulse border border-border bg-muted/40" />
              ))
            ) : filteredLogs.length === 0 ? (
              <p className="border border-border bg-card px-3 py-8 text-center text-sm text-muted-foreground">
                No logs found matching your criteria
              </p>
            ) : (
              filteredLogs.map((log, index) => (
                <LogCard key={log._id || log.id || `log-${index}`} log={log} index={index} />
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-hidden border border-border bg-card lg:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Timestamp</th>
                    <th className="px-3 py-2.5 font-medium">User</th>
                    <th className="px-3 py-2.5 font-medium">Action</th>
                    <th className="px-3 py-2.5 font-medium">Resource</th>
                    <th className="px-3 py-2.5 font-medium">Device / IP</th>
                    <th className="min-w-[240px] px-3 py-2.5 font-medium">Change</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i}>
                        {[1, 2, 3, 4, 5, 6].map((j) => (
                          <td key={j} className="px-3 py-3">
                            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-10 text-center text-sm text-muted-foreground"
                      >
                        No logs found matching your criteria
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log, index) => {
                      const t = formatLogTimestamp(log.timestamp);
                      return (
                        <tr
                          key={log._id || log.id || `log-${index}`}
                          className="align-top hover:bg-muted/20"
                        >
                          <td className="whitespace-nowrap px-3 py-3">
                            <div className="font-medium">{t.date}</div>
                            <div className="text-xs text-muted-foreground">{t.time}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold">
                                {(log.user_name || log.user_email || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate">
                                  {log.user_name || log.user_email || 'Unknown User'}
                                </div>
                                {(log.tenant_label || log.tenant_db) && (
                                  <div
                                    className="truncate text-xs text-muted-foreground"
                                    title={log.tenant_db || ''}
                                  >
                                    {log.tenant_label || log.tenant_db}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <Badge className={cn(actionBadge(log.action), 'text-white')}>
                              {String(log.action || 'unknown').replace(/_/g, ' ').toUpperCase()}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 capitalize">{log.resource_type || 'unknown'}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">
                            <div>{log.device_label || '—'}</div>
                            <div>{log.ip || ''}</div>
                          </td>
                          <td className="max-w-md px-3 py-3">
                            <AuditChangeCell
                              log={log}
                              onOpenDetails={(item) => setSelectedLogForDetails(item)}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <AuditDetailModal
        log={selectedLogForDetails}
        isOpen={Boolean(selectedLogForDetails)}
        onClose={() => setSelectedLogForDetails(null)}
      />
    </div>
  );
};

export default AuditLogs;
