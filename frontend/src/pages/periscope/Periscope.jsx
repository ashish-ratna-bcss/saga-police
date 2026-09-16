import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Upload,
  Download,
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  Search,
  CheckCircle2,
  Building2,
  Users,
  Clock,
  Shield,
  FileText,
  History,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Pencil,
  Check,
  X,
  Layers,
  ArrowRight,
  Filter,
  Eye,
  FileSpreadsheet,
  FolderOpen,
} from 'lucide-react';
import { periscopeApi } from '../../api';
import { useAuth } from '../../context/auth.context';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { cn } from '../../lib/utils';

const PERMISSION_OPTIONS = [
  {
    value: 'Publicly reported',
    label: 'Publicly reported',
    badge: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    dot: 'bg-amber-500',
  },
  {
    value: 'Permission granted',
    label: 'Permission granted',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    dot: 'bg-emerald-500',
  },
  {
    value: 'Government Programme',
    label: 'Government Programme',
    badge: 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
    dot: 'bg-blue-500',
  },
  {
    value: 'Under verification',
    label: 'Under verification',
    badge: 'bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
    dot: 'bg-sky-500',
  },
  {
    value: 'Court matter',
    label: 'Court matter',
    badge: 'bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800',
    dot: 'bg-purple-500',
  },
  {
    value: 'Rejected',
    label: 'Rejected',
    badge: 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
    dot: 'bg-rose-500',
  },
];

function getPermissionMeta(status) {
  const s = String(status || '').toLowerCase().trim();
  const match = PERMISSION_OPTIONS.find((p) => p.value.toLowerCase() === s);
  return (
    match || {
      badge: 'bg-slate-50 text-slate-700 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700',
      dot: 'bg-slate-400',
      label: status || 'Publicly reported',
    }
  );
}

function formatDateDisplay(isoDate) {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return isoDate;
}

function getDayOfWeekName(isoDate) {
  if (!isoDate) return 'MONDAY';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'MONDAY';
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[d.getDay()];
}

export default function Periscope() {
  const { user } = useAuth();

  // Multi-tenant organization title: dynamically extracted from tenant session with ZERO fallbacks
  const tenantOrg = useMemo(() => {
    return (
      user?.blurasagatitle ||
      user?.theme_name ||
      user?.application_details?.title ||
      ''
    );
  }, [user]);

  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dayOfWeek, setDayOfWeek] = useState(() => getDayOfWeekName(new Date().toISOString().split('T')[0]));
  const [organization, setOrganization] = useState(tenantOrg);
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('draft');
  const [programmes, setProgrammes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Active view tab: 'table' or 'abstract'
  const [activeTab, setActiveTab] = useState('table');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [permissionFilter, setPermissionFilter] = useState('ALL');
  const [collapsedCategories, setCollapsedCategories] = useState({});

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProgramme, setEditingProgramme] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyReports, setHistoryReports] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fileInputRef = useRef(null);

  // Sync tenant org if user profile loads asynchronously
  useEffect(() => {
    if (tenantOrg && !organization) {
      setOrganization(tenantOrg);
    }
  }, [tenantOrg, organization]);

  // Derived Title matching real organization and selected date
  const reportTitle = useMemo(() => {
    const formatted = formatDateDisplay(currentDate);
    return organization
      ? `PERISCOPE REPORT OF ${organization.toUpperCase()} FOR THE DAY ${formatted} (${dayOfWeek})`
      : `PERISCOPE REPORT FOR THE DAY ${formatted} (${dayOfWeek})`;
  }, [organization, currentDate, dayOfWeek]);

  // Extract REAL categories present in current programmes (No hardcoding)
  const categoriesList = useMemo(() => {
    const set = new Set();
    programmes.forEach((p) => {
      const cat = String(p.category || '').trim();
      if (cat) set.add(cat);
    });
    return Array.from(set);
  }, [programmes]);

  // Abstract calculations derived 100% from real data
  const calculatedAbstract = useMemo(() => {
    const map = {};
    programmes.forEach((p) => {
      const cat = String(p.category || 'General').trim();
      map[cat] = (map[cat] || 0) + 1;
    });
    let idx = 1;
    return Object.entries(map).map(([cat, count]) => ({
      sl_no: idx++,
      category: `${cat} - ${String(count).padStart(2, '0')}`,
      count,
    }));
  }, [programmes]);

  // Dynamic Category Stats for KPI Metric Cards
  const categoryStats = useMemo(() => {
    const map = {};
    programmes.forEach((p) => {
      const cat = String(p.category || 'General').trim();
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map).map(([name, count]) => ({
      name,
      count,
      pct: programmes.length > 0 ? Math.round((count / programmes.length) * 100) : 0,
    }));
  }, [programmes]);

  // Load report strictly from tenant DB for the specified date
  const loadReport = useCallback(
    async (date) => {
      setLoading(true);
      try {
        const res = await periscopeApi.getByDate(date);
        if (res.data?.ok && res.data.data) {
          const d = res.data.data;
          setCurrentDate(d.report_date);
          setDayOfWeek(d.day_of_week || getDayOfWeekName(d.report_date));
          if (d.organization) {
            setOrganization(d.organization);
          } else if (tenantOrg) {
            setOrganization(tenantOrg);
          }
          setNotes(d.notes || '');
          setStatus(d.status || 'draft');
          setProgrammes(Array.isArray(d.programmes) ? d.programmes : []);
        }
      } catch (err) {
        toast.error('Failed to load report: ' + err.message);
      } finally {
        setLoading(false);
      }
    },
    [tenantOrg]
  );

  useEffect(() => {
    loadReport(currentDate);
  }, [currentDate, loadReport]);

  // Date Navigation
  const handleDateChange = (newDate) => {
    if (!newDate) return;
    setCurrentDate(newDate);
    setDayOfWeek(getDayOfWeekName(newDate));
  };

  const handleShiftDate = (days) => {
    const cur = new Date(currentDate);
    if (Number.isNaN(cur.getTime())) return;
    cur.setDate(cur.getDate() + days);
    const iso = cur.toISOString().split('T')[0];
    handleDateChange(iso);
  };

  // Upload DOCX: strictly parse uploaded file without mock defaults
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const toastId = toast.loading('Parsing official Periscope DOCX file...');
    try {
      const res = await periscopeApi.uploadDocx(file);
      if (res.data?.ok && res.data.data) {
        const parsed = res.data.data;
        if (parsed.report_date) {
          setCurrentDate(parsed.report_date);
          setDayOfWeek(parsed.day_of_week || getDayOfWeekName(parsed.report_date));
        }
        if (parsed.organization) {
          setOrganization(parsed.organization);
        } else if (tenantOrg) {
          setOrganization(tenantOrg);
        }
        const progs = Array.isArray(parsed.programmes) ? parsed.programmes : [];
        setProgrammes(progs);
        if (parsed.notes) setNotes(parsed.notes);
        toast.success(
          `Imported ${progs.length} programmes for ${parsed.report_date || currentDate}`,
          { id: toastId }
        );
      }
    } catch (err) {
      toast.error('Failed to parse DOCX: ' + (err.response?.data?.message || err.message), {
        id: toastId,
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Export DOCX: strictly exports current tenant's report data
  const handleExportDocx = async () => {
    if (programmes.length === 0) {
      toast.error('No programmes to export for this date.');
      return;
    }
    setExporting(true);
    const toastId = toast.loading('Generating official Periscope DSR DOCX document...');
    try {
      const payload = {
        report_date: currentDate,
        day_of_week: dayOfWeek,
        title: reportTitle,
        organization,
        status,
        programmes,
        abstract: calculatedAbstract,
        notes,
      };
      const res = await periscopeApi.exportDocx(payload);
      const blob = new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `PerISCOPE_DSR_${currentDate.replace(/[^0-9-]/g, '_')}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Official Periscope DOCX exported successfully', { id: toastId });
    } catch (err) {
      toast.error('Export failed: ' + err.message, { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  // Save / Publish to current tenant database
  const handleSaveReport = async (publish = false) => {
    setSaving(true);
    const newStatus = publish ? 'published' : 'draft';
    const toastId = toast.loading(
      publish ? 'Publishing Periscope DSR...' : 'Saving Periscope DSR draft...'
    );
    try {
      const payload = {
        report_date: currentDate,
        day_of_week: dayOfWeek,
        title: reportTitle,
        organization,
        status: newStatus,
        programmes,
        abstract: calculatedAbstract,
        notes,
      };
      const res = await periscopeApi.saveReport(payload);
      if (res.data?.ok) {
        setStatus(newStatus);
        toast.success(
          publish
            ? 'Periscope DSR published successfully'
            : 'Periscope DSR draft saved successfully',
          { id: toastId }
        );
      }
    } catch (err) {
      toast.error('Save failed: ' + err.message, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  // Import Monitored Events from tenant database
  const handleImportEvents = async () => {
    const toastId = toast.loading(`Importing monitored events for ${currentDate}...`);
    try {
      const res = await periscopeApi.importEvents(currentDate);
      if (res.data?.ok) {
        const imported = res.data.data || [];
        if (imported.length === 0) {
          toast.info(`No monitored events recorded in tenant database for ${currentDate}`, { id: toastId });
          return;
        }
        setProgrammes((prev) => {
          const existingNames = new Set(prev.map((p) => p.name.trim().toLowerCase()));
          const novel = imported.filter((i) => !existingNames.has(i.name.trim().toLowerCase()));
          const combined = [...prev, ...novel];
          return combined.map((item, idx) => ({ ...item, sl_no: idx + 1 }));
        });
        toast.success(`Imported ${imported.length} monitored event items`, { id: toastId });
      }
    } catch (err) {
      toast.error('Import events failed: ' + err.message, { id: toastId });
    }
  };

  // Programme CRUD (Real fields without artificial placeholder comments)
  const handleOpenAdd = (categoryDefault) => {
    setEditingProgramme({
      id: `prog-${Date.now()}`,
      sl_no: programmes.length + 1,
      category: categoryDefault || (categoriesList[0] || ''),
      zone: '',
      name: '',
      police_station_place: '',
      organizer: '',
      expected_members: '',
      time: '',
      gist: '',
      permission_status: 'Publicly reported',
      comments: '',
    });
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (prog) => {
    setEditingProgramme({ ...prog });
    setIsEditModalOpen(true);
  };

  const handleSaveModal = () => {
    if (!editingProgramme.name?.trim()) {
      toast.error('Programme Name is required');
      return;
    }
    setProgrammes((prev) => {
      const exists = prev.some((p) => p.id === editingProgramme.id);
      let updated;
      if (exists) {
        updated = prev.map((p) => (p.id === editingProgramme.id ? editingProgramme : p));
      } else {
        updated = [...prev, editingProgramme];
      }
      return updated.map((p, i) => ({ ...p, sl_no: i + 1 }));
    });
    setIsEditModalOpen(false);
    setEditingProgramme(null);
    toast.success('Programme saved');
  };

  const handleDelete = (id) => {
    setProgrammes((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      return updated.map((p, i) => ({ ...p, sl_no: i + 1 }));
    });
    toast.info('Programme removed');
  };

  const handleDuplicate = (prog) => {
    const dup = {
      ...prog,
      id: `p-dup-${Date.now()}`,
      name: `${prog.name} (Copy)`,
      sl_no: programmes.length + 1,
    };
    setProgrammes((prev) => [...prev, dup]);
    toast.success('Programme duplicated');
  };

  const toggleCategoryCollapse = (cat) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  // Past DSRs Archive (Strictly from tenant database)
  const handleOpenHistory = async () => {
    setIsHistoryOpen(true);
    setLoadingHistory(true);
    try {
      const res = await periscopeApi.list({ limit: 50 });
      if (res.data?.ok) {
        setHistoryReports(res.data.data?.reports || []);
      }
    } catch (err) {
      toast.error('Failed to load history: ' + err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Filtered programmes
  const filteredProgrammes = useMemo(() => {
    return programmes.filter((p) => {
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (permissionFilter !== 'ALL' && p.permission_status !== permissionFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${p.zone} ${p.name} ${p.police_station_place} ${p.organizer} ${p.gist} ${p.comments}`.toLowerCase();
        return text.includes(q);
      }
      return true;
    });
  }, [programmes, categoryFilter, permissionFilter, searchQuery]);

  // Group by category dynamically from real items
  const groupedProgrammes = useMemo(() => {
    const map = new Map();
    filteredProgrammes.forEach((p) => {
      const cat = String(p.category || 'General').trim();
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(p);
    });
    return map;
  }, [filteredProgrammes]);

  return (
    <div className="space-y-4 w-full max-w-[1680px] mx-auto pb-16 animate-in fade-in duration-200">
      {/* Hidden file input for DOCX upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
      />

      {/* ── 1. TENANT EXECUTIVE HEADER ── */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Branding & Unit Name */}
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  Periscope DSR
                </h1>
                <Badge
                  variant="outline"
                  className="text-[10px] font-bold uppercase tracking-wider py-0.5 bg-primary/5 text-primary border-primary/20"
                >
                  Daily Situation Report
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-semibold capitalize py-0.5 border',
                    status === 'published'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  )}
                >
                  ● {status}
                </Badge>
              </div>

              {/* Dynamic Tenant Title with zero hardcoded fallbacks */}
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {isEditingOrg ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      className="h-6 text-xs w-60 bg-background"
                      placeholder="Tenant Organization Name"
                      autoFocus
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setIsEditingOrg(false)}
                    >
                      <Check className="h-3 w-3 mr-1" /> Done
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingOrg(true)}
                    className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors text-left"
                    title="Click to rename organization"
                  >
                    <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-bold text-foreground underline decoration-dotted underline-offset-4">
                      {organization || 'Organization'}
                    </span>
                    <span className="text-muted-foreground">
                      • Situation Report for {formatDateDisplay(currentDate)}
                    </span>
                    <Pencil className="h-3 w-3 opacity-60 hover:opacity-100 transition-opacity" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: Date Navigator */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-xl border border-border/80 bg-background px-1 py-1 shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                onClick={() => handleShiftDate(-1)}
                title="Previous Day"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-2 px-2">
                <Calendar className="h-3.5 w-3.5 text-primary" />
                <input
                  type="date"
                  value={currentDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
                />
                <Badge
                  variant="secondary"
                  className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                >
                  {dayOfWeek}
                </Badge>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
                onClick={() => handleShiftDate(1)}
                title="Next Day"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={() => handleDateChange(new Date().toISOString().split('T')[0])}
            >
              Today
            </Button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="mt-4 pt-3.5 border-t border-border/60 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload DOCX
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={exporting || programmes.length === 0}
              onClick={handleExportDocx}
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? 'Generating...' : 'Export DOCX'}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => handleOpenAdd()}
            >
              <Plus className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Add Programme
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleImportEvents}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              Import Monitored
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleOpenHistory}
            >
              <History className="h-3.5 w-3.5" />
              Past DSR Archive
            </Button>

            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-sm"
              disabled={saving}
              onClick={() => handleSaveReport(true)}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {saving ? 'Saving...' : 'Save & Publish'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2. DYNAMIC REAL-DATA KPI METRIC CARDS ── */}
      {programmes.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {/* Total Card */}
          <div className="group relative flex flex-col justify-between p-4 rounded-2xl border border-border/70 bg-card shadow-sm">
            <div className="flex items-center justify-between gap-1 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                Total Programmes
              </span>
              <div className="h-7 w-7 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20">
                <FileText className="h-3.5 w-3.5" />
              </div>
            </div>
            <div>
              <p className="text-2xl font-black tabular-nums tracking-tight text-foreground">
                {programmes.length}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {categoriesList.length} Active Categories
              </p>
            </div>
            <div className="mt-2.5 h-1 w-full bg-blue-100 dark:bg-blue-950 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 rounded-full w-full" />
            </div>
          </div>

          {/* Dynamic Real Category Cards */}
          {categoryStats.slice(0, 4).map((c, i) => {
            const colors = [
              { bar: 'bg-indigo-600', ring: 'bg-indigo-500/10 text-indigo-600 ring-indigo-500/20', bg: 'bg-indigo-100 dark:bg-indigo-950' },
              { bar: 'bg-purple-600', ring: 'bg-purple-500/10 text-purple-600 ring-purple-500/20', bg: 'bg-purple-100 dark:bg-purple-950' },
              { bar: 'bg-amber-600', ring: 'bg-amber-500/10 text-amber-600 ring-amber-500/20', bg: 'bg-amber-100 dark:bg-amber-950' },
              { bar: 'bg-emerald-600', ring: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20', bg: 'bg-emerald-100 dark:bg-emerald-950' },
            ];
            const color = colors[i % colors.length];
            return (
              <div
                key={c.name}
                className="group relative flex flex-col justify-between p-4 rounded-2xl border border-border/70 bg-card shadow-sm"
              >
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate" title={c.name}>
                    {c.name}
                  </span>
                  <div className={cn('h-7 w-7 rounded-xl flex items-center justify-center shrink-0 ring-1', color.ring)}>
                    <Layers className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl font-black tabular-nums tracking-tight text-foreground">
                    {c.count}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {c.pct}% of total programmes
                  </p>
                </div>
                <div className={cn('mt-2.5 h-1 w-full rounded-full overflow-hidden', color.bg)}>
                  <div className={cn('h-full rounded-full', color.bar)} style={{ width: `${c.pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ── 3. FILTER TOOLBAR & TAB SWITCHER ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-card p-2.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[300px]">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search zone, programme, PS, organizer..."
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-8 text-xs w-[220px] bg-background">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories ({programmes.length})</SelectItem>
              {categoriesList.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={permissionFilter} onValueChange={setPermissionFilter}>
            <SelectTrigger className="h-8 text-xs w-[170px] bg-background">
              <SelectValue placeholder="All Permissions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Permissions</SelectItem>
              {PERMISSION_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* View Switch Tabs */}
        <div className="inline-flex rounded-lg border border-border/80 bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('table')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all',
              activeTab === 'table'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Schedule Table ({filteredProgrammes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('abstract')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all',
              activeTab === 'abstract'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Table 1: Abstract ({calculatedAbstract.length})
          </button>
        </div>
      </div>

      {/* ── 4. CANONICAL 10-COLUMN SCHEDULE TABLE (Real Data Only) ── */}
      {activeTab === 'table' && (
        <div className="rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-28 text-muted-foreground">
                <RefreshCw className="h-8 w-8 animate-spin text-primary mb-3" />
                <p className="text-sm font-semibold text-foreground">Loading Situation Report...</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Fetching report data for {formatDateDisplay(currentDate)}
                </p>
              </div>
            ) : filteredProgrammes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-3 text-muted-foreground/60">
                  <FileText className="h-8 w-8" />
                </div>
                <h3 className="text-base font-bold text-foreground">
                  No Programmes Recorded for {formatDateDisplay(currentDate)}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  Upload an official Periscope DSR (.docx) document, import monitored events, or add
                  programmes manually.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
                  <Button
                    size="sm"
                    className="text-xs gap-1.5 bg-primary text-primary-foreground"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload DOCX
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1.5"
                    onClick={() => handleOpenAdd()}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Programme
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1.5"
                    onClick={handleOpenHistory}
                  >
                    <FolderOpen className="h-3.5 w-3.5" /> View Past DSRs
                  </Button>
                </div>
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 dark:bg-slate-800 text-white border-b border-slate-700">
                    <th className="p-3 border-r border-slate-800 dark:border-slate-700 text-center font-bold text-[10px] uppercase tracking-wider w-12">
                      Sl.No
                    </th>
                    <th className="p-3 border-r border-slate-800 dark:border-slate-700 text-left font-bold text-[10px] uppercase tracking-wider w-32">
                      Zones
                    </th>
                    <th className="p-3 border-r border-slate-800 dark:border-slate-700 text-left font-bold text-[10px] uppercase tracking-wider min-w-[220px]">
                      Name of the Programme
                    </th>
                    <th className="p-3 border-r border-slate-800 dark:border-slate-700 text-left font-bold text-[10px] uppercase tracking-wider w-40">
                      Police Station &amp; Place
                    </th>
                    <th className="p-3 border-r border-slate-800 dark:border-slate-700 text-left font-bold text-[10px] uppercase tracking-wider w-48">
                      Organizer Details &amp; Affiliation
                    </th>
                    <th className="p-3 border-r border-slate-800 dark:border-slate-700 text-center font-bold text-[10px] uppercase tracking-wider w-28">
                      Expected Members
                    </th>
                    <th className="p-3 border-r border-slate-800 dark:border-slate-700 text-center font-bold text-[10px] uppercase tracking-wider w-28">
                      Time (From &amp; To)
                    </th>
                    <th className="p-3 border-r border-slate-800 dark:border-slate-700 text-left font-bold text-[10px] uppercase tracking-wider min-w-[300px]">
                      Gist of the Programmes
                    </th>
                    <th className="p-3 border-r border-slate-800 dark:border-slate-700 text-center font-bold text-[10px] uppercase tracking-wider w-36">
                      Permission Status
                    </th>
                    <th className="p-3 text-center font-bold text-[10px] uppercase tracking-wider w-24">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/60">
                  {Array.from(groupedProgrammes.entries()).map(([catName, items]) => {
                    const isCollapsed = Boolean(collapsedCategories[catName]);
                    return (
                      <React.Fragment key={catName}>
                        {/* Spanning Category Header Row */}
                        <tr className="bg-slate-100/90 dark:bg-slate-800/80 border-y border-border">
                          <td colSpan={10} className="px-4 py-2.5">
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => toggleCategoryCollapse(catName)}
                                className="flex items-center gap-2 text-xs font-bold text-foreground hover:text-primary transition-colors text-left"
                              >
                                {isCollapsed ? (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="uppercase tracking-wide">
                                  {catName}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] font-bold px-1.5 py-0 rounded-md"
                                >
                                  {String(items.length).padStart(2, '0')}
                                </Badge>
                              </button>

                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                                onClick={() => handleOpenAdd(catName)}
                              >
                                <Plus className="h-3 w-3" /> Add to category
                              </Button>
                            </div>
                          </td>
                        </tr>

                        {/* Programme Rows under this category */}
                        {!isCollapsed &&
                          items.map((p) => {
                            const perm = getPermissionMeta(p.permission_status);
                            return (
                              <tr
                                key={p.id || p.sl_no}
                                className="hover:bg-muted/40 transition-colors border-b border-border/50 text-xs"
                              >
                                <td className="p-3 text-center font-bold text-muted-foreground align-top border-r border-border/50">
                                  {p.sl_no}
                                </td>
                                <td className="p-3 font-semibold text-foreground align-top border-r border-border/50">
                                  {p.zone || '—'}
                                </td>
                                <td className="p-3 align-top border-r border-border/50">
                                  <div className="font-bold text-foreground leading-snug">
                                    {p.name}
                                  </div>
                                </td>
                                <td className="p-3 text-muted-foreground align-top border-r border-border/50">
                                  {p.police_station_place || '—'}
                                </td>
                                <td className="p-3 text-foreground/90 align-top border-r border-border/50">
                                  {p.organizer || '—'}
                                </td>
                                <td className="p-3 text-center text-muted-foreground tabular-nums align-top border-r border-border/50">
                                  {p.expected_members || '—'}
                                </td>
                                <td className="p-3 text-center text-muted-foreground whitespace-nowrap align-top border-r border-border/50">
                                  {p.time || '—'}
                                </td>
                                <td className="p-3 text-foreground/90 align-top border-r border-border/50">
                                  <p className="leading-relaxed whitespace-pre-wrap">{p.gist || '—'}</p>
                                  {p.comments && (
                                    <div className="mt-1.5 text-[11px] text-muted-foreground bg-muted/40 p-1.5 rounded-md border border-border/40">
                                      <span className="font-semibold text-foreground">Note:</span> {p.comments}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3 text-center align-top border-r border-border/50">
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border shadow-2xs',
                                      perm.badge
                                    )}
                                  >
                                    <span className={cn('h-1.5 w-1.5 rounded-full', perm.dot)} />
                                    {p.permission_status || 'Publicly reported'}
                                  </span>
                                </td>
                                <td className="p-3 text-center align-top">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => handleOpenEdit(p)}
                                      title="Edit programme"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => handleDuplicate(p)}
                                      title="Duplicate"
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                      onClick={() => handleDelete(p.id)}
                                      title="Delete"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── 5. TAB 2: TABLE 1 ABSTRACT OF PROGRAMMES ── */}
      {activeTab === 'abstract' && (
        <div className="rounded-2xl border border-border/80 bg-card shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-border/80">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-primary" />
                <h3 className="font-heading text-lg font-bold text-foreground">
                  Table 1: Abstract of Programmes
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Canonical category aggregation matching Periscope DSR official standard
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-semibold py-1 px-2.5">
                Total: {programmes.length} Programmes Scheduled
              </Badge>
            </div>
          </div>

          {calculatedAbstract.length === 0 ? (
            <p className="text-xs text-muted-foreground py-10 text-center">
              No categories or programmes scheduled for this date.
            </p>
          ) : (
            <div className="rounded-xl border border-border/80 overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-900 dark:bg-slate-800 text-white">
                    <th className="p-3 text-center font-bold text-[10px] uppercase tracking-wider w-16 border-r border-slate-800">
                      Sl. No.
                    </th>
                    <th className="p-3 text-left font-bold text-[10px] uppercase tracking-wider border-r border-slate-800">
                      Name of the Programmes
                    </th>
                    <th className="p-3 text-center font-bold text-[10px] uppercase tracking-wider w-40 border-r border-slate-800">
                      No. of Programmes
                    </th>
                    <th className="p-3 text-right font-bold text-[10px] uppercase tracking-wider w-40">
                      % Share
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {calculatedAbstract.map((row) => {
                    const pct =
                      programmes.length > 0
                        ? Math.round((row.count / programmes.length) * 100)
                        : 0;
                    return (
                      <tr key={row.sl_no} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-center font-bold text-muted-foreground border-r border-border/50">
                          {row.sl_no}
                        </td>
                        <td className="p-3 font-semibold text-foreground border-r border-border/50">
                          {row.category}
                        </td>
                        <td className="p-3 text-center font-bold text-foreground tabular-nums text-sm border-r border-border/50">
                          {row.count}
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-semibold text-foreground">{pct}%</span>
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted/60 font-bold border-t-2 border-border text-xs">
                    <td colSpan={2} className="p-3 text-right uppercase tracking-wider border-r border-border/50">
                      Total Programmes
                    </td>
                    <td className="p-3 text-center tabular-nums text-sm text-foreground border-r border-border/50">
                      {programmes.length}
                    </td>
                    <td className="p-3 text-right tabular-nums text-foreground">
                      100%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 6. ADD / EDIT PROGRAMME MODAL (Free text Category with suggestions) ── */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingProgramme?.id?.startsWith('p-dup-')
                ? 'Duplicate Programme'
                : editingProgramme?.sl_no
                ? `Edit Programme #${editingProgramme.sl_no}`
                : 'Add New Programme'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Fill in the 10 canonical fields according to the official Periscope DSR standard.
            </DialogDescription>
          </DialogHeader>

          {editingProgramme && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 py-2 text-xs">
              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-foreground">Category Name</label>
                <input
                  list="periscope-categories-list"
                  value={editingProgramme.category || ''}
                  onChange={(e) =>
                    setEditingProgramme((prev) => ({ ...prev, category: e.target.value }))
                  }
                  placeholder="Enter or select category (e.g. Political Programmes, Agitations)"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <datalist id="periscope-categories-list">
                  {categoriesList.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Zone / District</label>
                <Input
                  value={editingProgramme.zone || ''}
                  onChange={(e) =>
                    setEditingProgramme((prev) => ({ ...prev, zone: e.target.value }))
                  }
                  placeholder="e.g. Zone-I, City, District"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Police Station &amp; Place</label>
                <Input
                  value={editingProgramme.police_station_place || ''}
                  onChange={(e) =>
                    setEditingProgramme((prev) => ({
                      ...prev,
                      police_station_place: e.target.value,
                    }))
                  }
                  placeholder="e.g. Central PS, Town Hall"
                  className="h-8 text-xs"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-foreground">
                  Name of the Programme <span className="text-destructive">*</span>
                </label>
                <Input
                  value={editingProgramme.name || ''}
                  onChange={(e) =>
                    setEditingProgramme((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Name of the meeting, rally, or event"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Organizer &amp; Affiliation</label>
                <Input
                  value={editingProgramme.organizer || ''}
                  onChange={(e) =>
                    setEditingProgramme((prev) => ({ ...prev, organizer: e.target.value }))
                  }
                  placeholder="Organizer name / party / association"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Expected Members</label>
                <Input
                  value={editingProgramme.expected_members || ''}
                  onChange={(e) =>
                    setEditingProgramme((prev) => ({
                      ...prev,
                      expected_members: e.target.value,
                    }))
                  }
                  placeholder="e.g. 500 members"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Time (From &amp; To)</label>
                <Input
                  value={editingProgramme.time || ''}
                  onChange={(e) =>
                    setEditingProgramme((prev) => ({ ...prev, time: e.target.value }))
                  }
                  placeholder="e.g. 10:00 AM to 02:00 PM"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Permission Status</label>
                <Select
                  value={editingProgramme.permission_status}
                  onValueChange={(val) =>
                    setEditingProgramme((prev) => ({ ...prev, permission_status: val }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Permission Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERMISSION_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-foreground">Gist of the Programme</label>
                <Textarea
                  value={editingProgramme.gist || ''}
                  onChange={(e) =>
                    setEditingProgramme((prev) => ({ ...prev, gist: e.target.value }))
                  }
                  rows={3}
                  className="w-full text-xs"
                  placeholder="Key demands, procession route, or programme summary..."
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-foreground">Comments</label>
                <Input
                  value={editingProgramme.comments || ''}
                  onChange={(e) =>
                    setEditingProgramme((prev) => ({ ...prev, comments: e.target.value }))
                  }
                  placeholder="Security arrangements or operational notes..."
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setIsEditModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs bg-primary text-primary-foreground"
              onClick={handleSaveModal}
            >
              Save Programme
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 7. PAST DSRs ARCHIVE DIALOG (From Tenant DB) ── */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Past Periscope DSR Archive</DialogTitle>
            <DialogDescription className="text-xs">
              Reports saved in your tenant database.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto space-y-2 py-2">
            {loadingHistory ? (
              <div className="flex justify-center py-10">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : historyReports.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">
                No past Periscope reports saved in this tenant database yet.
              </p>
            ) : (
              historyReports.map((r) => (
                <div
                  key={r.id || r.report_date}
                  className="flex items-center justify-between p-3 rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-foreground">
                        {formatDateDisplay(r.report_date)}
                      </span>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {r.day_of_week || 'DAY'}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] capitalize',
                          r.status === 'published'
                            ? 'text-emerald-600 border-emerald-300'
                            : 'text-amber-600 border-amber-300'
                        )}
                      >
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                      {r.organization || 'Organization'} • {r.programmes_count || 0} programmes
                    </p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      handleDateChange(r.report_date);
                      setIsHistoryOpen(false);
                    }}
                  >
                    Open <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
