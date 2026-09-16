import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
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
  User,
  Users,
  Clock,
  ShieldAlert,
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
  LayoutGrid,
  MapPin,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { periscopeApi, eventsApi } from '../../api';
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
  const clean = String(isoDate).split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return clean;
}

function getDayOfWeekName(isoDate) {
  if (!isoDate) return 'MONDAY';
  const clean = String(isoDate).split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    return days[d.getDay()] || 'MONDAY';
  }
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'MONDAY';
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  return days[d.getDay()] || 'MONDAY';
}

export default function Periscope() {
  const { user } = useAuth();

  // Multi-tenant organization title: dynamically extracted from tenant session
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
  const [notes, setNotes] = useState('');

  const [status, setStatus] = useState('draft');
  const [createdBy, setCreatedBy] = useState('');
  const [programmes, setProgrammes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [pendingUploadData, setPendingUploadData] = useState(null);



  // Active view tab: 'table' | 'cards' | 'abstract'
  const [activeTab, setActiveTab] = useState('table');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [permissionFilter, setPermissionFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [collapsedCategories, setCollapsedCategories] = useState({});

  // Modals
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProgramme, setEditingProgramme] = useState(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyReports, setHistoryReports] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // "Add to Events Monitoring" Modal
  const [isMonitoringModalOpen, setIsMonitoringModalOpen] = useState(false);
  const [monitoringForm, setMonitoringForm] = useState(null);
  const [submittingMonitoring, setSubmittingMonitoring] = useState(false);

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

  // Extract REAL categories present in current programmes
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

  // Priority count stats
  const priorityStats = useMemo(() => {
    let high = 0;
    let medium = 0;
    let low = 0;
    programmes.forEach((p) => {
      const pri = String(p.priority || 'Low').toLowerCase();
      if (pri === 'high') high += 1;
      else if (pri === 'medium') medium += 1;
      else low += 1;
    });
    return { high, medium, low };
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
          setCreatedBy(d.created_by || '');
          const rawProgs = Array.isArray(d.programmes) ? d.programmes : [];
          // Ensure every programme has priority defaulting to 'Low'
          const progs = rawProgs.map((p, idx) => ({
            ...p,
            sl_no: p.sl_no || idx + 1,
            priority: p.priority || 'Low',
          }));
          setProgrammes(progs);
          setIsDirty(false);
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
    const cleanDate = String(newDate).split('T')[0];
    setCurrentDate(cleanDate);
    setDayOfWeek(getDayOfWeekName(cleanDate));
  };

  const handleShiftDate = (days) => {
    const cur = new Date(currentDate);
    if (Number.isNaN(cur.getTime())) return;
    cur.setDate(cur.getDate() + days);
    const iso = cur.toISOString().split('T')[0];
    handleDateChange(iso);
  };

  // Background silent save to persist priority or monitoring changes
  const handleSilentSave = async (updatedProgrammes) => {
    try {
      await periscopeApi.saveReport({
        report_date: currentDate,
        day_of_week: dayOfWeek,
        title: reportTitle,
        organization,
        status,
        programmes: updatedProgrammes,
        abstract: calculatedAbstract,
        notes,
      });
    } catch {
      // Ignored for background updates
    }
  };

  // Upload DOCX: parse official file and prompt Save or Discard
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const backup = {
      programmes: [...programmes],
      organization,
      notes,
      currentDate,
      dayOfWeek,
      status,
    };
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
        const progs = (Array.isArray(parsed.programmes) ? parsed.programmes : []).map(
          (p, idx) => ({
            ...p,
            sl_no: p.sl_no || idx + 1,
            priority: p.priority || 'Low',
          })
        );
        setProgrammes(progs);
        if (parsed.notes) setNotes(parsed.notes);
        setPendingUploadData({
          fileName: file.name,
          programmesCount: progs.length,
          backup,
        });
        toast.success(
          `Imported ${progs.length} programmes. Review and click Save & Publish or Discard.`,
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

  const handleSaveUploadedDocx = async () => {
    setSaving(true);
    const toastId = toast.loading('Saving imported Periscope DSR report...');
    try {
      const payload = {
        report_date: currentDate,
        day_of_week: dayOfWeek,
        title: reportTitle,
        organization,
        status: 'published',
        programmes,
        abstract: calculatedAbstract,
        notes,
        created_by: user?.username || user?.name || user?.email || 'Officer',
      };
      const res = await periscopeApi.saveReport(payload);
      if (res.data?.ok) {
        setStatus('published');
        setPendingUploadData(null);
        setIsDirty(false);
        toast.success('Periscope DSR saved and published successfully', { id: toastId });
      }
    } catch (err) {
      toast.error('Save failed: ' + err.message, { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardUpload = () => {
    if (pendingUploadData?.backup) {
      const b = pendingUploadData.backup;
      setProgrammes(b.programmes);
      setOrganization(b.organization);
      setNotes(b.notes);
      setCurrentDate(b.currentDate);
      setDayOfWeek(b.dayOfWeek);
      setStatus(b.status);
    }
    setPendingUploadData(null);
    setIsDirty(false);
    toast.info('Uploaded DOCX draft discarded');
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
      link.download = `PERISCOPE_DSR_${currentDate.replace(/[^0-9-]/g, '_')}.docx`;
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
        created_by: user?.username || user?.name || user?.email || 'Officer',
      };
      const res = await periscopeApi.saveReport(payload);
      if (res.data?.ok) {
        setStatus(newStatus);
        setIsDirty(false);
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
          return combined.map((item, idx) => ({
            ...item,
            sl_no: idx + 1,
            priority: item.priority || 'Low',
          }));
        });
        toast.success(`Imported ${imported.length} monitored event items`, { id: toastId });
      }
    } catch (err) {
      toast.error('Import events failed: ' + err.message, { id: toastId });
    }
  };

  // Priority Toggle Handlers
  const handleSetPriority = (progId, newPriority) => {
    setProgrammes((prev) => {
      const updated = prev.map((p) =>
        p.id === progId ? { ...p, priority: newPriority } : p
      );
      handleSilentSave(updated);
      return updated;
    });
  };

  const handleToggleHighPriority = (progId) => {
    setProgrammes((prev) => {
      const updated = prev.map((p) => {
        if (p.id !== progId) return p;
        const current = (p.priority || 'Low').toLowerCase();
        const next = current === 'high' ? 'Low' : 'High';
        return { ...p, priority: next };
      });
      handleSilentSave(updated);
      return updated;
    });
  };

  // Add to Events Monitoring modal open
  const handleOpenAddMonitoring = (prog) => {
    const keywords = [prog.name, prog.organizer, prog.zone, prog.police_station_place]
      .filter(Boolean)
      .join(', ');

    setMonitoringForm({
      programmeId: prog.id,
      name: prog.name || '',
      location: prog.police_station_place || prog.zone || '',
      keywords,
      startDate: currentDate,
      endDate: currentDate,
      pollingMinutes: 60,
      platforms: ['twitter', 'youtube', 'facebook', 'instagram', 'telegram'],
    });
    setIsMonitoringModalOpen(true);
  };

  const handleSubmitMonitoring = async () => {
    if (!monitoringForm.name?.trim()) {
      toast.error('Event name is required');
      return;
    }
    if (!monitoringForm.platforms?.length) {
      toast.error('Select at least one platform to monitor');
      return;
    }
    setSubmittingMonitoring(true);
    try {
      const payload = {
        name: monitoringForm.name.trim(),
        location: monitoringForm.location.trim(),
        keywords: monitoringForm.keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
          .map((keyword) => ({ keyword, language: 'all' })),
        platforms: monitoringForm.platforms,
        polling_interval_minutes: Number(monitoringForm.pollingMinutes) || 60,
        start_date: monitoringForm.startDate,
        end_date: monitoringForm.endDate,
      };

      const res = await eventsApi.create(payload);
      const createdId = res.data?.id;

      setProgrammes((prev) => {
        const updated = prev.map((p) =>
          p.id === monitoringForm.programmeId
            ? { ...p, is_monitored: true, monitored_event_id: createdId }
            : p
        );
        handleSilentSave(updated);
        return updated;
      });

      toast.success('Added to Events Monitoring successfully! Monitoring created.');
      setIsMonitoringModalOpen(false);
      setMonitoringForm(null);
    } catch (err) {
      toast.error('Failed to add event to monitoring: ' + (err.response?.data?.message || err.message));
    } finally {
      setSubmittingMonitoring(false);
    }
  };

  // Programme CRUD
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
      priority: 'Low',
      comments: '',
    });
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (prog) => {
    setEditingProgramme({ ...prog, priority: prog.priority || 'Low' });
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
      const reindexed = updated.map((p, i) => ({
        ...p,
        sl_no: i + 1,
        priority: p.priority || 'Low',
      }));
      handleSilentSave(reindexed);
      return reindexed;
    });
    setIsEditModalOpen(false);
    setEditingProgramme(null);
    toast.success('Programme saved');
  };

  const handleDelete = (id) => {
    setProgrammes((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      const reindexed = updated.map((p, i) => ({ ...p, sl_no: i + 1 }));
      handleSilentSave(reindexed);
      return reindexed;
    });
    toast.info('Programme removed');
  };

  const handleDuplicate = (prog) => {
    const dup = {
      ...prog,
      id: `p-dup-${Date.now()}`,
      name: `${prog.name} (Copy)`,
      sl_no: programmes.length + 1,
      priority: prog.priority || 'Low',
      is_monitored: false,
    };
    setProgrammes((prev) => {
      const updated = [...prev, dup];
      handleSilentSave(updated);
      return updated;
    });
    toast.success('Programme duplicated');
  };

  const toggleCategoryCollapse = (cat) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }));
  };

  // Past DSRs Archive
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await periscopeApi.list({ limit: 50 });
      if (res.data?.ok) {
        setHistoryReports(res.data.data?.reports || []);
      }
    } catch (err) {
      toast.error('Failed to load history: ' + (err.message || 'Unknown error'));
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleOpenHistory = () => {
    setIsHistoryOpen(true);
    loadHistory();
  };

  const handleDeleteArchiveReport = async (reportId, reportDate, e) => {
    if (e) e.stopPropagation();
    const cleanDate = String(reportDate).split('T')[0];
    const displayDate = formatDateDisplay(cleanDate);
    if (!window.confirm(`Are you sure you want to delete the Periscope report for ${displayDate}?`)) {
      return;
    }
    try {
      await periscopeApi.delete(reportId || cleanDate);
      toast.success(`Periscope report for ${displayDate} deleted`);
      loadHistory();
      if (cleanDate === currentDate) {
        setProgrammes([]);
        setReportId(null);
      }
    } catch (err) {
      console.error('Failed to delete report:', err);
      toast.error('Failed to delete report: ' + (err.response?.data?.message || err.message));
    }
  };

  // Filtered programmes
  const filteredProgrammes = useMemo(() => {
    return programmes.filter((p) => {
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (permissionFilter !== 'ALL' && p.permission_status !== permissionFilter) return false;
      if (priorityFilter !== 'ALL') {
        const itemPriority = (p.priority || 'Low').toLowerCase();
        if (itemPriority !== priorityFilter.toLowerCase()) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${p.zone} ${p.name} ${p.police_station_place} ${p.organizer} ${p.gist} ${p.comments}`.toLowerCase();
        return text.includes(q);
      }
      return true;
    });
  }, [programmes, categoryFilter, permissionFilter, priorityFilter, searchQuery]);

  // Group by category
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
    <div
      className="flex flex-col gap-3 w-full animate-in fade-in duration-200"
      data-testid="periscope-page"
    >
      {/* Hidden file input for DOCX upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
      />

      {/* ── 1. HEADER ROW: Executive Title on left, Date Navigator on right ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-border/60">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-bold tracking-tight leading-none">
              Periscope DSR
            </h1>
            <Badge
              variant="outline"
              className="text-[10px] font-bold uppercase tracking-wider py-0.5 px-2 bg-primary/5 text-primary border-primary/20"
            >
              Daily Situation Report
            </Badge>
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground flex-wrap">
            <Building2 className="h-3 w-3 text-primary shrink-0" />
            <span className="font-semibold text-foreground">
              {organization || 'Organization'}
            </span>
            <span>• Situation Report for {formatDateDisplay(currentDate)}</span>
            {createdBy && programmes.length > 0 && (
              <>
                <span>•</span>
                <span className="inline-flex items-center gap-1 font-medium text-foreground/85">
                  <User className="h-3 w-3 text-muted-foreground" />
                  Uploaded by: <span className="text-foreground font-semibold capitalize">{createdBy}</span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Date Navigator nicely balanced on right of header */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex items-center rounded-lg border border-border bg-card px-1 py-0.5 shadow-2xs">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-md"
              onClick={() => handleShiftDate(-1)}
              title="Previous Day"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>

            <div className="flex items-center gap-1.5 px-1.5">
              <Calendar className="h-3 w-3 text-primary" />
              <input
                type="date"
                value={currentDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="bg-transparent text-xs font-semibold text-foreground focus:outline-none cursor-pointer"
              />
              <Badge
                variant="secondary"
                className="text-[9px] font-bold uppercase tracking-wider px-1 py-0 rounded"
              >
                {dayOfWeek}
              </Badge>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-md"
              onClick={() => handleShiftDate(1)}
              title="Next Day"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs font-medium"
            onClick={() => handleDateChange(new Date().toISOString().split('T')[0])}
          >
            Today
          </Button>
        </div>
      </div>

      {/* ── 2. ACTIONS & VIEW SWITCHER TOOLBAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-2 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
            onClick={() => handleOpenAdd()}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Programme
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5 text-primary" />
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
            Export DOCX
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

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleOpenHistory}
          >
            <History className="h-3.5 w-3.5" />
            Archive
          </Button>
        </div>

        {/* View Switch Tabs */}
        <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 ml-auto">
          <button
            type="button"
            onClick={() => setActiveTab('table')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all',
              activeTab === 'table'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Table View ({filteredProgrammes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cards')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all',
              activeTab === 'cards'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Cards View ({filteredProgrammes.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('abstract')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all',
              activeTab === 'abstract'
                ? 'bg-background text-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Table 1: Abstract ({calculatedAbstract.length})
          </button>
        </div>
      </div>

      {/* ── DOCX UPLOAD CONFIRMATION BANNER (Shows only when DOCX is uploaded: Save or Discard) ── */}
      {pendingUploadData && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 animate-in slide-in-from-top-1 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">
                DOCX Uploaded: {programmes.length} programmes parsed for {formatDateDisplay(currentDate)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Review the parsed programmes below. Click Save &amp; Publish to persist, or Discard to revert.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-amber-300 hover:bg-amber-100 text-amber-900 dark:text-amber-200"
              onClick={handleDiscardUpload}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Discard
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0 shadow-2xs"
              onClick={handleSaveUploadedDocx}
              disabled={saving}
            >
              <Check className="h-3.5 w-3.5 mr-1" /> {saving ? 'Saving...' : 'Save & Publish'}
            </Button>
          </div>
        </div>
      )}


      {/* ── 2. DYNAMIC REAL-DATA KPI METRIC CARDS ── */}
      {programmes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {/* Total Programmes */}
          <div className="flex flex-col justify-between p-3 rounded-xl border border-border/70 bg-card shadow-2xs">
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                Total Programmes
              </span>
              <div className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20">
                <FileText className="h-3 w-3" />
              </div>
            </div>
            <div>
              <p className="text-xl font-bold font-heading tabular-nums tracking-tight text-foreground">
                {programmes.length}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {categoriesList.length} Categories
              </p>
            </div>
          </div>

          {/* High Priority Programmes */}
          <div
            onClick={() => setPriorityFilter(priorityFilter === 'high' ? 'ALL' : 'high')}
            className={cn(
              'flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer shadow-2xs',
              priorityFilter === 'high'
                ? 'border-rose-400 bg-rose-50/40 dark:bg-rose-950/30'
                : 'border-border/70 bg-card hover:border-rose-300'
            )}
          >
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 truncate">
                High Priority
              </span>
              <div className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0 bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/20">
                <ShieldAlert className="h-3 w-3" />
              </div>
            </div>
            <div>
              <p className="text-xl font-bold font-heading tabular-nums tracking-tight text-rose-700 dark:text-rose-400">
                {priorityStats.high}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Critical focus
              </p>
            </div>
          </div>

          {/* Medium Priority */}
          <div
            onClick={() => setPriorityFilter(priorityFilter === 'medium' ? 'ALL' : 'medium')}
            className={cn(
              'flex flex-col justify-between p-3 rounded-xl border transition-all cursor-pointer shadow-2xs',
              priorityFilter === 'medium'
                ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/30'
                : 'border-border/70 bg-card hover:border-amber-300'
            )}
          >
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 truncate">
                Medium Priority
              </span>
              <div className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/20">
                <AlertTriangle className="h-3 w-3" />
              </div>
            </div>
            <div>
              <p className="text-xl font-bold font-heading tabular-nums tracking-tight text-amber-700 dark:text-amber-400">
                {priorityStats.medium}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Elevated attention
              </p>
            </div>
          </div>

          {/* Dynamic Real Category Cards */}
          {categoryStats.slice(0, 3).map((c) => (
            <div
              key={c.name}
              className="flex flex-col justify-between p-3 rounded-xl border border-border/70 bg-card shadow-2xs"
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate" title={c.name}>
                  {c.name}
                </span>
                <div className="h-6 w-6 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Layers className="h-3 w-3" />
                </div>
              </div>
              <div>
                <p className="text-xl font-bold font-heading tabular-nums tracking-tight text-foreground">
                  {c.count}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {c.pct}% of scheduled
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 3. SEARCH & FILTERS STRIP ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search zone, programme, PS, organizer..."
            className="pl-8 h-8 text-xs bg-background"
          />
        </div>

        {/* Category Filter */}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 text-xs w-[160px] bg-background">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Categories</SelectItem>
            {categoriesList.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Permission Filter */}
        <Select value={permissionFilter} onValueChange={setPermissionFilter}>
          <SelectTrigger className="h-8 text-xs w-[175px] bg-background">
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

        {/* Priority Filter */}
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="h-8 text-xs w-[155px] bg-background">
            <SelectValue placeholder="All Priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Priorities</SelectItem>
            <SelectItem value="high">High Priority ({priorityStats.high})</SelectItem>
            <SelectItem value="medium">Medium Priority ({priorityStats.medium})</SelectItem>
            <SelectItem value="low">Low Priority ({priorityStats.low})</SelectItem>
          </SelectContent>
        </Select>

        {(searchQuery || categoryFilter !== 'ALL' || permissionFilter !== 'ALL' || priorityFilter !== 'ALL') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground px-2"
            onClick={() => {
              setSearchQuery('');
              setCategoryFilter('ALL');
              setPermissionFilter('ALL');
              setPriorityFilter('ALL');
            }}
          >
            <X className="h-3 w-3 mr-1" /> Reset
          </Button>
        )}
      </div>


      {/* ── 4. VIEW TAB 1: TABLE VIEW ── */}
      {activeTab === 'table' && (
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <RefreshCw className="h-7 w-7 animate-spin text-primary mb-2.5" />
                <p className="text-xs font-semibold text-foreground">Loading Situation Report...</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Fetching report data for {formatDateDisplay(currentDate)}
                </p>
              </div>
            ) : filteredProgrammes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <div className="h-12 w-12 rounded-xl bg-muted/60 flex items-center justify-center mb-2.5 text-muted-foreground/60">
                  <FileText className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold text-foreground">
                  No Programmes Recorded for {formatDateDisplay(currentDate)}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-md">
                  Upload an official Periscope DSR (.docx) document, import monitored events, or add
                  programmes manually.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload DOCX
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={() => handleOpenAdd()}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Programme
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5"
                    onClick={handleOpenHistory}
                  >
                    <FolderOpen className="h-3.5 w-3.5" /> View Past DSRs
                  </Button>
                </div>
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/60 border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="p-2.5 border-r border-border/50 text-center font-bold w-12">
                      Sl.No
                    </th>
                    <th className="p-2.5 border-r border-border/50 font-bold w-28">
                      Zones
                    </th>
                    <th className="p-2.5 border-r border-border/50 font-bold min-w-[200px]">
                      Name of the Programme
                    </th>
                    <th className="p-2.5 border-r border-border/50 font-bold w-36">
                      Police Station &amp; Place
                    </th>
                    <th className="p-2.5 border-r border-border/50 font-bold w-44">
                      Organizer Details
                    </th>
                    <th className="p-2.5 border-r border-border/50 text-center font-bold w-24">
                      Expected
                    </th>
                    <th className="p-2.5 border-r border-border/50 text-center font-bold w-28">
                      Time
                    </th>
                    <th className="p-2.5 border-r border-border/50 font-bold min-w-[260px]">
                      Gist of Programme
                    </th>
                    <th className="p-2.5 border-r border-border/50 text-center font-bold w-36">
                      Permission
                    </th>
                    <th className="p-2.5 border-r border-border/50 text-center font-bold w-32">
                      Priority Tag
                    </th>
                    <th className="p-2.5 text-center font-bold min-w-[180px]">
                      Actions &amp; Monitoring
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/60">
                  {Array.from(groupedProgrammes.entries()).map(([catName, items]) => {
                    const isCollapsed = Boolean(collapsedCategories[catName]);
                    return (
                      <React.Fragment key={catName}>
                        {/* Spanning Category Header Row */}
                        <tr className="bg-muted/40 border-y border-border">
                          <td colSpan={11} className="px-3 py-2">
                            <div className="flex items-center justify-between">
                              <button
                                type="button"
                                onClick={() => toggleCategoryCollapse(catName)}
                                className="flex items-center gap-1.5 text-xs font-bold text-foreground hover:text-primary transition-colors text-left"
                              >
                                {isCollapsed ? (
                                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                                <span className="uppercase tracking-wide">
                                  {catName}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] font-bold px-1.5 py-0 rounded"
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

                        {/* Programme Rows */}
                        {!isCollapsed &&
                          items.map((p) => {
                            const perm = getPermissionMeta(p.permission_status);
                            const currentPriority = p.priority || 'Low';
                            const isHigh = currentPriority.toLowerCase() === 'high';

                            return (
                              <tr
                                key={p.id || p.sl_no}
                                className={cn(
                                  'hover:bg-muted/30 transition-colors border-b border-border/50 text-xs',
                                  isHigh && 'bg-rose-50/20 dark:bg-rose-950/20'
                                )}
                              >
                                <td className="p-2.5 text-center font-bold text-muted-foreground align-top border-r border-border/50">
                                  {p.sl_no}
                                </td>
                                <td className="p-2.5 font-semibold text-foreground align-top border-r border-border/50">
                                  {p.zone || '—'}
                                </td>
                                <td className="p-2.5 align-top border-r border-border/50">
                                  <div className="font-bold text-foreground leading-snug">
                                    {p.name}
                                  </div>
                                </td>
                                <td className="p-2.5 text-muted-foreground align-top border-r border-border/50">
                                  {p.police_station_place || '—'}
                                </td>
                                <td className="p-2.5 text-foreground/90 align-top border-r border-border/50">
                                  {p.organizer || '—'}
                                </td>
                                <td className="p-2.5 text-center text-muted-foreground tabular-nums align-top border-r border-border/50">
                                  {p.expected_members || '—'}
                                </td>
                                <td className="p-2.5 text-center text-muted-foreground whitespace-nowrap align-top border-r border-border/50">
                                  {p.time || '—'}
                                </td>
                                <td className="p-2.5 text-foreground/90 align-top border-r border-border/50">
                                  <p className="leading-relaxed whitespace-pre-wrap">{p.gist || '—'}</p>
                                  {p.comments && (
                                    <div className="mt-1 text-[11px] text-muted-foreground bg-muted/30 p-1.5 rounded border border-border/30">
                                      <span className="font-semibold text-foreground">Note:</span> {p.comments}
                                    </div>
                                  )}
                                </td>
                                <td className="p-2.5 text-center align-top border-r border-border/50">
                                  <span
                                    className={cn(
                                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border',
                                      perm.badge
                                    )}
                                  >
                                    <span className={cn('h-1.5 w-1.5 rounded-full', perm.dot)} />
                                    {p.permission_status || 'Publicly reported'}
                                  </span>
                                </td>

                                {/* Priority 3-Tag Toggle Column */}
                                <td className="p-2.5 text-center align-top border-r border-border/50">
                                  <div className="inline-flex rounded-md border border-border/70 bg-muted/40 p-0.5">
                                    {['Low', 'Medium', 'High'].map((lvl) => {
                                      const isSel = currentPriority.toLowerCase() === lvl.toLowerCase();
                                      return (
                                        <button
                                          key={lvl}
                                          type="button"
                                          onClick={() => handleSetPriority(p.id, lvl)}
                                          className={cn(
                                            'px-1.5 py-0.5 text-[10px] font-semibold rounded transition-all',
                                            isSel && lvl === 'High' && 'bg-rose-600 text-white shadow-2xs',
                                            isSel && lvl === 'Medium' && 'bg-amber-500 text-white shadow-2xs',
                                            isSel && lvl === 'Low' && 'bg-emerald-600 text-white shadow-2xs',
                                            !isSel && 'text-muted-foreground hover:text-foreground'
                                          )}
                                        >
                                          {lvl}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </td>

                                {/* Actions & Add to Monitoring Column */}
                                <td className="p-2.5 text-center align-top">
                                  <div className="flex flex-col items-center gap-1.5">
                                    {p.is_monitored ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] font-semibold py-0.5 px-1.5 gap-1 border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                      >
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        Monitored
                                      </Badge>
                                    ) : (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 text-[10px] gap-1 px-2 border-primary/40 text-primary hover:bg-primary/10"
                                        onClick={() => handleOpenAddMonitoring(p)}
                                        title="Add this programme to active Events Monitoring"
                                      >
                                        <Activity className="h-3 w-3" />
                                        Add to Events
                                      </Button>
                                    )}

                                    <div className="flex items-center justify-center gap-0.5">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                        onClick={() => handleOpenEdit(p)}
                                        title="Edit programme"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                        onClick={() => handleDuplicate(p)}
                                        title="Duplicate"
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                        onClick={() => handleDelete(p.id)}
                                        title="Delete"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
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

      {/* ── 5. VIEW TAB 2: CARDS VIEW ── */}
      {activeTab === 'cards' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <RefreshCw className="h-7 w-7 animate-spin text-primary mb-2.5" />
              <p className="text-xs font-semibold text-foreground">Loading Situation Report...</p>
            </div>
          ) : filteredProgrammes.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-16 text-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2.5" />
              <h3 className="text-sm font-bold text-foreground">
                No Programmes Found for {formatDateDisplay(currentDate)}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Try adjusting your search or filters, or add a programme manually.
              </p>
            </div>
          ) : (
            Array.from(groupedProgrammes.entries()).map(([catName, items]) => {
              const isCollapsed = Boolean(collapsedCategories[catName]);
              return (
                <div key={catName} className="space-y-2">
                  {/* Category header strip */}
                  <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-muted/40 border border-border">
                    <button
                      type="button"
                      onClick={() => toggleCategoryCollapse(catName)}
                      className="flex items-center gap-2 text-xs font-bold text-foreground hover:text-primary transition-colors text-left"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="uppercase tracking-wide">{catName}</span>
                      <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0 rounded">
                        {items.length}
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

                  {/* Cards Grid */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {items.map((p) => {
                        const perm = getPermissionMeta(p.permission_status);
                        const currentPriority = p.priority || 'Low';
                        const isHigh = currentPriority.toLowerCase() === 'high';
                        const isMedium = currentPriority.toLowerCase() === 'medium';

                        return (
                          <div
                            key={p.id || p.sl_no}
                            className={cn(
                              'rounded-xl border bg-card p-3.5 flex flex-col justify-between transition-all shadow-2xs hover:shadow-sm',
                              isHigh
                                ? 'border-rose-300 dark:border-rose-800/80 bg-rose-50/15 dark:bg-rose-950/15'
                                : isMedium
                                ? 'border-amber-300 dark:border-amber-800/80 bg-amber-50/15 dark:bg-amber-950/15'
                                : 'border-border/70 hover:border-border'
                            )}
                          >
                            <div>
                              {/* Top row: Sl. No, Zone, Time */}
                              <div className="flex items-center justify-between gap-1 mb-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-muted-foreground tabular-nums bg-muted px-1.5 py-0.5 rounded">
                                    #{p.sl_no}
                                  </span>
                                  {p.zone && (
                                    <span className="text-[10px] font-semibold text-foreground bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                      {p.zone}
                                    </span>
                                  )}
                                </div>
                                {p.time && (
                                  <span className="text-[10px] text-muted-foreground font-medium inline-flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-primary" />
                                    {p.time}
                                  </span>
                                )}
                              </div>

                              {/* Programme Name */}
                              <h4 className="font-bold text-sm text-foreground leading-snug">
                                {p.name}
                              </h4>

                              {/* Location & Organizer */}
                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                {p.police_station_place && (
                                  <div className="flex items-start gap-1.5">
                                    <MapPin className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0 mt-0.5" />
                                    <span className="text-foreground/90 font-medium break-words">
                                      {p.police_station_place}
                                    </span>
                                  </div>
                                )}
                                {p.organizer && (
                                  <div className="flex items-start gap-1.5">
                                    <Users className="h-3.5 w-3.5 text-muted-foreground/80 shrink-0 mt-0.5" />
                                    <span className="break-words">{p.organizer}</span>
                                  </div>
                                )}
                              </div>

                              {/* Gist of Programme */}
                              {p.gist && (
                                <div className="mt-2.5 p-2 rounded-lg bg-muted/40 border border-border/40 text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                                  {p.gist}
                                </div>
                              )}

                              {/* Comments */}
                              {p.comments && (
                                <div className="mt-1.5 text-[11px] text-muted-foreground italic break-words">
                                  Note: {p.comments}
                                </div>
                              )}

                              {/* Permission status & expected members */}
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-border/40">
                                <span
                                  className={cn(
                                    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border',
                                    perm.badge
                                  )}
                                >
                                  <span className={cn('h-1.5 w-1.5 rounded-full', perm.dot)} />
                                  {p.permission_status || 'Publicly reported'}
                                </span>
                                {p.expected_members && (
                                  <span className="text-[11px] text-muted-foreground tabular-nums">
                                    👥 {p.expected_members}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Card Footer Controls: Priority + Add to Monitoring + Actions */}
                            <div className="mt-3 pt-2.5 border-t border-border/60 flex flex-col gap-2">
                              {/* Priority toggle */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                                    Priority:
                                  </span>
                                  <div className="inline-flex rounded-md border border-border/70 bg-muted/30 p-0.5">
                                    {['Low', 'Medium', 'High'].map((lvl) => {
                                      const isSel = currentPriority.toLowerCase() === lvl.toLowerCase();
                                      return (
                                        <button
                                          key={lvl}
                                          type="button"
                                          onClick={() => handleSetPriority(p.id, lvl)}
                                          className={cn(
                                            'px-2 py-0.5 text-[10px] font-semibold rounded transition-all',
                                            isSel && lvl === 'High' && 'bg-rose-600 text-white shadow-2xs',
                                            isSel && lvl === 'Medium' && 'bg-amber-500 text-white shadow-2xs',
                                            isSel && lvl === 'Low' && 'bg-emerald-600 text-white shadow-2xs',
                                            !isSel && 'text-muted-foreground hover:text-foreground'
                                          )}
                                        >
                                          {lvl}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isHigh ? 'destructive' : 'outline'}
                                  className="h-6 text-[10px] gap-1 px-2 font-semibold"
                                  onClick={() => handleToggleHighPriority(p.id)}
                                >
                                  <ShieldAlert className="h-3 w-3" />
                                  {isHigh ? 'High Priority' : 'Mark High'}
                                </Button>
                              </div>

                              {/* Monitoring Button + Actions */}
                              <div className="flex items-center justify-between gap-1.5">
                                {p.is_monitored ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] font-semibold py-1 px-2 gap-1 border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  >
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Monitored in Events
                                    <Link to="/events" className="ml-1 underline hover:text-foreground">
                                      View
                                    </Link>
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                                    onClick={() => handleOpenAddMonitoring(p)}
                                  >
                                    <Activity className="h-3 w-3" />
                                    Add to Events Monitoring
                                  </Button>
                                )}

                                <div className="flex items-center gap-0.5 ml-auto">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => handleOpenEdit(p)}
                                    title="Edit programme"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => handleDuplicate(p)}
                                    title="Duplicate"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDelete(p.id)}
                                    title="Delete"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── 6. VIEW TAB 3: TABLE 1 ABSTRACT OF PROGRAMMES ── */}
      {activeTab === 'abstract' && (
        <div className="rounded-xl border border-border bg-card shadow-2xs p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3 pb-2.5 border-b border-border">
            <div>
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <h3 className="font-heading text-base font-bold text-foreground">
                  Table 1: Abstract of Programmes
                </h3>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Category aggregation matching Periscope DSR official standard
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-semibold py-0.5 px-2">
                Total: {programmes.length} Programmes Scheduled
              </Badge>
            </div>
          </div>

          {calculatedAbstract.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              No categories or programmes scheduled for this date.
            </p>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-muted/60 text-muted-foreground text-[11px] uppercase tracking-wider font-semibold border-b border-border">
                    <th className="p-2.5 text-center w-16 border-r border-border/50">
                      Sl. No.
                    </th>
                    <th className="p-2.5 text-left border-r border-border/50">
                      Name of the Programmes
                    </th>
                    <th className="p-2.5 text-center w-36 border-r border-border/50">
                      No. of Programmes
                    </th>
                    <th className="p-2.5 text-right w-36">
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
                        <td className="p-2.5 text-center font-bold text-muted-foreground border-r border-border/50">
                          {row.sl_no}
                        </td>
                        <td className="p-2.5 font-semibold text-foreground border-r border-border/50">
                          {row.category}
                        </td>
                        <td className="p-2.5 text-center font-bold text-foreground tabular-nums border-r border-border/50">
                          {row.count}
                        </td>
                        <td className="p-2.5 text-right tabular-nums">
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
                  <tr className="bg-muted/50 font-bold border-t border-border text-xs">
                    <td colSpan={2} className="p-2.5 text-right uppercase tracking-wider border-r border-border/50">
                      Total Programmes
                    </td>
                    <td className="p-2.5 text-center tabular-nums text-foreground border-r border-border/50">
                      {programmes.length}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-foreground">
                      100%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── 7. ADD TO EVENTS MONITORING MODAL ── */}
      <Dialog open={isMonitoringModalOpen} onOpenChange={setIsMonitoringModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Add to Events Monitoring
            </DialogTitle>
            <DialogDescription className="text-xs">
              Monitor social media posts and activity across platforms for this programme.
            </DialogDescription>
          </DialogHeader>

          {monitoringForm && (
            <div className="space-y-3 py-1 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-foreground">Event Name</label>
                <Input
                  value={monitoringForm.name}
                  onChange={(e) =>
                    setMonitoringForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Event name"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Location / Jurisdiction</label>
                <Input
                  value={monitoringForm.location}
                  onChange={(e) =>
                    setMonitoringForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                  placeholder="e.g. Town Hall, Central PS"
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-foreground">Keywords (comma-separated)</label>
                <Textarea
                  value={monitoringForm.keywords}
                  onChange={(e) =>
                    setMonitoringForm((prev) => ({ ...prev, keywords: e.target.value }))
                  }
                  rows={2}
                  className="text-xs"
                  placeholder="Keywords to track across platforms..."
                />
                <p className="text-[10px] text-muted-foreground">
                  Content matching these keywords will be scanned and analyzed.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">Start Date</label>
                  <Input
                    type="date"
                    value={monitoringForm.startDate}
                    onChange={(e) =>
                      setMonitoringForm((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-foreground">End Date</label>
                  <Input
                    type="date"
                    value={monitoringForm.endDate}
                    onChange={(e) =>
                      setMonitoringForm((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Platforms to Monitor</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'twitter', label: 'Twitter / X' },
                    { id: 'facebook', label: 'Facebook' },
                    { id: 'instagram', label: 'Instagram' },
                    { id: 'youtube', label: 'YouTube' },
                    { id: 'telegram', label: 'Telegram' },
                  ].map((plat) => {
                    const isChecked = monitoringForm.platforms.includes(plat.id);
                    return (
                      <button
                        key={plat.id}
                        type="button"
                        onClick={() => {
                          setMonitoringForm((prev) => ({
                            ...prev,
                            platforms: isChecked
                              ? prev.platforms.filter((p) => p !== plat.id)
                              : [...prev.platforms, plat.id],
                          }));
                        }}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-medium border transition-colors',
                          isChecked
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted/30 text-muted-foreground border-border hover:text-foreground'
                        )}
                      >
                        {isChecked ? '✓ ' : '+ '}
                        {plat.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setIsMonitoringModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs bg-primary text-primary-foreground gap-1.5"
              disabled={submittingMonitoring}
              onClick={handleSubmitMonitoring}
            >
              {submittingMonitoring ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Activity className="h-3.5 w-3.5" />
              )}
              {submittingMonitoring ? 'Adding...' : 'Add to Events Monitoring'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 8. ADD / EDIT PROGRAMME MODAL ── */}
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
              Fill in the canonical fields according to the official Periscope DSR standard.
            </DialogDescription>
          </DialogHeader>

          {editingProgramme && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 text-xs">
              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-foreground">Category Name</label>
                <input
                  list="periscope-categories-list"
                  value={editingProgramme.category || ''}
                  onChange={(e) =>
                    setEditingProgramme((prev) => ({ ...prev, category: e.target.value }))
                  }
                  placeholder="Enter or select category (e.g. Political Programmes, Agitations)"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

              <div className="space-y-1 sm:col-span-2">
                <label className="font-semibold text-foreground">Priority Level</label>
                <div className="flex items-center gap-2">
                  {['Low', 'Medium', 'High'].map((lvl) => {
                    const isSel = (editingProgramme.priority || 'Low').toLowerCase() === lvl.toLowerCase();
                    return (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() =>
                          setEditingProgramme((prev) => ({ ...prev, priority: lvl }))
                        }
                        className={cn(
                          'px-3 py-1 text-xs font-semibold rounded-md border transition-all',
                          isSel && lvl === 'High' && 'bg-rose-600 text-white border-rose-600',
                          isSel && lvl === 'Medium' && 'bg-amber-500 text-white border-amber-500',
                          isSel && lvl === 'Low' && 'bg-emerald-600 text-white border-emerald-600',
                          !isSel && 'bg-muted/30 text-muted-foreground border-border hover:text-foreground'
                        )}
                      >
                        {lvl} Priority
                      </button>
                    );
                  })}
                </div>
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

      {/* ── 9. PAST DSRs ARCHIVE DIALOG ── */}
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
              historyReports.map((r) => {
                const count = r.programme_count ?? r.programmes_count ?? 0;
                const cleanDate = String(r.report_date).split('T')[0];
                return (
                  <div
                    key={r.id || r.report_date}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-foreground">
                          {formatDateDisplay(cleanDate)}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {r.day_of_week || getDayOfWeekName(cleanDate)}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground mt-0.5">
                        <span>{r.organization || 'Organization'}</span>
                        <span>•</span>
                        <span>{count} {count === 1 ? 'programme' : 'programmes'}</span>
                        {r.created_by && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 font-medium text-foreground/85">
                              <User className="h-3 w-3 text-muted-foreground" />
                              Uploaded by: <span className="text-foreground font-semibold capitalize">{r.created_by}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          handleDateChange(cleanDate);
                          setIsHistoryOpen(false);
                        }}
                      >
                        Open <ArrowRight className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete from archive"
                        onClick={(e) => handleDeleteArchiveReport(r.id, r.report_date, e)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
