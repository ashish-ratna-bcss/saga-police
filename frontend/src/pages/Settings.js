import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Save, Plus, Trash2, TrendingUp, ShieldAlert, BrainCircuit, FileText, Upload, Star, ChevronDown, ChevronUp, Eye, Pencil, Copy, Check, X, HelpCircle, AlertTriangle, Clock, Activity, MessageSquare, Radio, Settings2, Zap, Bot, Youtube, Facebook, Instagram, Gauge, Loader2, Moon, Sun, Palette } from 'lucide-react';

const XLogo = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { ScrollArea } from '../components/ui/scroll-area';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';
import AccessManagement from './AccessManagement';
import PolicyManager from '../components/PolicyManager';
import { Badge } from '../components/ui/badge';
import RichTextEditor from '../components/RichTextEditor';
import { cn } from '../lib/utils';
import { applyThemeColor } from '../utils/theme';
import { useAuth } from '../context/auth.context';

const THEME_PRESETS = ['#1e3a8a', '#0f766e', '#7c2d12', '#4c1d95', '#1f2937', '#166534'];

const ThemeTab = () => {
  const { user, updateUiMode, updateThemeColor } = useAuth();
  const [colorMode, setColorMode] = useState(user?.ui_mode === 'dark' ? 'dark' : 'light');
  const [themeColor, setThemeColor] = useState(user?.theme_color || '#1e3a8a');
  const [savingMode, setSavingMode] = useState(false);
  const [savingColor, setSavingColor] = useState(false);

  useEffect(() => {
    setColorMode(user?.ui_mode === 'dark' ? 'dark' : 'light');
    setThemeColor(user?.theme_color || '#1e3a8a');
  }, [user?.ui_mode, user?.theme_color]);

  const setMode = async (mode) => {
    if (mode === colorMode || savingMode) return;
    const prev = colorMode;
    setColorMode(mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
    setSavingMode(true);
    try {
      await updateUiMode(mode);
    } catch (error) {
      setColorMode(prev);
      document.documentElement.classList.toggle('dark', prev === 'dark');
      toast.error(error.response?.data?.message || 'Failed to update color mode');
    } finally {
      setSavingMode(false);
    }
  };

  const setColor = async (hex) => {
    if (!hex || savingColor) return;
    const prev = themeColor;
    setThemeColor(hex);
    applyThemeColor(hex);
    setSavingColor(true);
    try {
      await updateThemeColor(hex);
    } catch (error) {
      setThemeColor(prev);
      applyThemeColor(prev);
      toast.error(error.response?.data?.message || 'Failed to update theme color');
    } finally {
      setSavingColor(false);
    }
  };

  return (
    <Card className="border shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b">
        <Palette className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Theme</h3>
        {(savingMode || savingColor) && (
          <Loader2 className="h-3.5 w-3.5 ml-auto animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="p-4 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-medium">Color mode</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Saves automatically for your account.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border p-1 bg-muted/40">
            <Button
              type="button"
              variant={colorMode === 'light' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={savingMode}
              onClick={() => setMode('light')}
            >
              <Sun className="h-3.5 w-3.5 mr-1.5" /> Light
            </Button>
            <Button
              type="button"
              variant={colorMode === 'dark' ? 'default' : 'ghost'}
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={savingMode}
              onClick={() => setMode('dark')}
            >
              <Moon className="h-3.5 w-3.5 mr-1.5" /> Dark
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div>
            <span className="text-xs font-medium">Primary color</span>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Saves automatically for your account.
            </p>
          </div>
          <input
            type="color"
            value={themeColor}
            disabled={savingColor}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-14 p-0 border-0 rounded cursor-pointer disabled:opacity-50"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {THEME_PRESETS.map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              disabled={savingColor}
              className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-105 disabled:opacity-50 ${
                themeColor.toLowerCase() === hex
                  ? 'border-foreground ring-2 ring-offset-2 ring-foreground/30'
                  : 'border-transparent'
              }`}
              style={{ backgroundColor: hex }}
              onClick={() => setColor(hex)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
};
const PLACEHOLDERS_GUIDE = [
  { key: 'SERIAL_NUMBER', desc: 'Case ID / Serial (e.g. X-2026-001)' },
  { key: 'DATE', desc: 'Current date (dd.mm.yyyy)' },
  { key: 'DATE_LONG', desc: 'Full date (e.g. 1st January 2026)' },
  { key: 'PLATFORM', desc: 'Platform name (X, YouTube, etc.)' },
  { key: 'PLATFORM_OPERATOR', desc: 'Company name (X Corp., Meta)' },
  { key: 'PLATFORM_DOMAIN', desc: 'URL (www.x.com, www.youtube.com)' },
  { key: 'AUTHOR_NAME', desc: 'Target user display name' },
  { key: 'AUTHOR_HANDLE', desc: 'Target user handle (with @)' },
  { key: 'PROFILE_URL', desc: 'Link to target profile' },
  { key: 'CONTENT_URL', desc: 'Link to the flagged post' },
  { key: 'CONTENT_TEXT', desc: 'Text content of the violation' },
  { key: 'POST_DATE', desc: 'Original post date' },
  { key: 'LEGAL_SECTIONS', desc: 'Full Law/BNS sections' },
  { key: 'LEGAL_SECTIONS_NUMBERS', desc: 'Just section numbers (e.g. 152)' },
  { key: 'CATEGORY', desc: 'Violation category (e.g. Hate Speech)' },
  { key: 'RISK_LEVEL', desc: 'Threat level (HIGH, MEDIUM, LOW)' },
  { key: 'IS_REPOST', desc: 'Repost flag (Yes/No)' },
  { key: 'ALERT_DESCRIPTION', desc: 'Full alert description' },
  { key: 'DEPARTMENT_NAME', desc: 'Police Department name' },
  { key: 'GOVERNMENT_NAME', desc: 'Government name' },
];

const PlaceholderSidebar = ({ onClose }) => {
  const [copiedKey, setCopiedKey] = useState(null);

  const handleCopy = (key) => {
    navigator.clipboard.writeText('{{' + key + '}}');
    setCopiedKey(key);
    toast.success(`Copied {{${key}}}`, {
      description: "Paste into your document",
      duration: 1500,
    });
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="w-56 shrink-0 bg-secondary/5 border-l flex flex-col min-h-0 animate-in slide-in-from-right-2 duration-200">
      <div className="p-2.5 border-b bg-secondary/10 flex items-center justify-between">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <BrainCircuit className="h-3 w-3" /> Data Tags
        </h4>
        <Button variant="ghost" size="icon" className="h-5 w-5 opacity-50 hover:opacity-100" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {PLACEHOLDERS_GUIDE.map(p => (
            <div
              key={p.key}
              onClick={() => handleCopy(p.key)}
              className="p-1.5 rounded-md bg-background border border-border/40 hover:border-primary/30 hover:bg-secondary/5 transition-all group cursor-pointer active:scale-[0.98]"
            >
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <code className="text-[9px] font-mono font-bold text-slate-700 dark:text-slate-300 tracking-tight bg-slate-100 dark:bg-slate-800 px-1 rounded">
                  {'{{' + p.key + '}}'}
                </code>
                <div className="flex items-center text-muted-foreground group-hover:text-primary transition-colors">
                  {copiedKey === p.key ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
              <p className="text-[8.5px] text-muted-foreground leading-tight">{p.desc}</p>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-2 border-t bg-secondary/5">
        <div className="flex items-start gap-1.5">
          <div className="h-1 w-1 rounded-full bg-primary mt-1 shrink-0" />
          <p className="text-[8.5px] leading-relaxed text-muted-foreground italic">
            <strong>Click to copy</strong>
          </p>
        </div>
      </div>
    </div>
  );
};

// Module-level settings cache — survives component remounts (back-navigation)
let _settingsCache = null;
let _settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 60_000; // 1 minute
const VALID_TABS = ['general', 'keywords', 'templates', 'access', 'policies', 'theme'];

const Settings = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState(null);
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [monPlatformTab, setMonPlatformTab] = useState('x');
  const [monCategory, setMonCategory] = useState('political');
  const [newKeyword, setNewKeyword] = useState('');
  const [editingKeywordId, setEditingKeywordId] = useState(null);
  const [keywordSaving, setKeywordSaving] = useState(false);
  const [keywordRescanning, setKeywordRescanning] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [thresholds, setThresholds] = useState([]);

  // Report Templates state
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templatePlatform, setTemplatePlatform] = useState('all');
  const [templateIsDefault, setTemplateIsDefault] = useState(false);
  const [templateFile, setTemplateFile] = useState(null);
  const [templateDragging, setTemplateDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPlaceholders, setShowPlaceholders] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  // 2-step upload: parse first, edit, then save
  const [uploadStep, setUploadStep] = useState(1); // 1 = pick file, 2 = edit content
  const [parsedHtml, setParsedHtml] = useState('');
  const [editedHtml, setEditedHtml] = useState('');
  const [showPlaceholderGuide, setShowPlaceholderGuide] = useState(true);
  // Edit existing template
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingHtml, setEditingHtml] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [thresholdsLoading, setThresholdsLoading] = useState(false);
  const tabFromUrl = searchParams.get('tab');
  const initialTab = VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'general';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isSaving, setIsSaving] = useState(false);

  // Mount-only URL seed: keep latest values in refs so deps stay empty without eslint-disable
  const searchParamsRef = useRef(searchParams);
  const initialTabRef = useRef(initialTab);
  searchParamsRef.current = searchParams;
  initialTabRef.current = initialTab;

  // Ensure URL always has ?tab= on mount (so back-navigation works)
  useEffect(() => {
    if (!searchParamsRef.current.get('tab')) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', initialTabRef.current);
        return next;
      }, { replace: true });
    }
  }, [setSearchParams]);

  // View mode: 'tabs' or 'editor'
  const [viewMode, setViewMode] = useState('tabs');

  // ─── Unsaved changes tracking ───
  const [savedSettings, setSavedSettings] = useState(null);
  const [savedThresholds, setSavedThresholds] = useState([]);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const pendingTabRef = useRef(null);

  const hasUnsavedChanges = useCallback(() => {
    if (!savedSettings || !settings) return false;
    return JSON.stringify(settings) !== JSON.stringify(savedSettings) ||
           JSON.stringify(thresholds) !== JSON.stringify(savedThresholds);
  }, [settings, savedSettings, thresholds, savedThresholds]);

  const handleTabChange = (newTab) => {
    if (hasUnsavedChanges()) {
      pendingTabRef.current = newTab;
      setShowUnsavedDialog(true);
    } else {
      // Only update the URL — the effect below will sync activeTab from it,
      // avoiding a race where setActiveTab and setSearchParams update at different ticks.
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('tab', newTab);
        next.delete('platform');
        return next;
      }, { replace: true });
    }
  };

  // Single source of truth: activeTab always follows the URL (covers clicks + back/forward)
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams, activeTab]);

  // Warn on browser/tab close
  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);




  useEffect(() => {
    // Use cached data if fresh (instant back-navigation)
    if (_settingsCache && Date.now() - _settingsCacheTime < SETTINGS_CACHE_TTL) {
      const { settings: s, keywords: k, thresholds: t, templates: tp } = _settingsCache;
      setSettings(s);
      setSavedSettings(JSON.parse(JSON.stringify(s)));
      setKeywords(k);
      setThresholds(t);
      setSavedThresholds(JSON.parse(JSON.stringify(t)));
      setTemplates(tp);
      setLoading(false);
      setThresholdsLoading(false);
      setTemplatesLoading(false);
    } else {
      fetchAllSettingsData();
    }
  }, []);

  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const res = await api.get('/templates');
      setTemplates(res.data);
    } catch (error) {
      console.error('Failed to load templates');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleUploadTemplate = async (e) => {
    e.preventDefault();
    if (!templateFile || !templateName.trim()) {
      toast.error('Please provide a template name and DOCX file');
      return;
    }
    // Step 1: Parse the DOCX first
    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('template', templateFile);
      const res = await api.post('/templates/parse', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setParsedHtml(res.data.html);
      setEditedHtml(res.data.html);
      setUploadStep(2);
      setTemplateDialogOpen(false);
      setViewMode('editor');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to parse document');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveWithEditor = async () => {
    try {
      setUploading(true);
      // Upload original file to create the template record
      const formData = new FormData();
      formData.append('template', templateFile);
      formData.append('name', templateName.trim());
      formData.append('platform', templatePlatform);
      formData.append('is_default', templateIsDefault);
      const res = await api.post('/templates/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      // Always save the edited HTML (user may have made edits or content was cleaned on load)
      await api.put(`/templates/${res.data.id}/content`, { html_content: editedHtml });
      toast.success('Template saved successfully');
      resetUploadDialog();
      setViewMode('tabs');
      fetchTemplates();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Save failed');
    } finally {
      setUploading(false);
    }
  };

  const resetUploadDialog = () => {
    setTemplateDialogOpen(false);
    setTemplateName('');
    setTemplatePlatform('all');
    setTemplateIsDefault(false);
    setTemplateFile(null);
    setUploadStep(1);
    setParsedHtml('');
    setEditedHtml('');
    setViewMode('tabs');
  };

  const handleEditTemplate = async (template) => {
    setEditingTemplate(template);
    setEditingHtml(template.html_content);
    setViewMode('editor');
  };

  const handleSaveEditedTemplate = async () => {
    try {
      setSavingEdit(true);
      await api.put(`/templates/${editingTemplate.id}/content`, { html_content: editingHtml });
      toast.success('Template updated');
      setEditingTemplate(null);
      setViewMode('tabs');
      fetchTemplates();
    } catch (error) {
      toast.error('Failed to save template');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    try {
      await api.delete(`/templates/${id}`);
      toast.success('Template deleted');
      fetchTemplates();
    } catch (error) {
      toast.error('Failed to delete template');
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await api.put(`/templates/${id}/default`);
      toast.success('Default template updated');
      fetchTemplates();
    } catch (error) {
      toast.error('Failed to set default');
    }
  };

  const handlePreviewTemplate = async (id) => {
    try {
      const res = await api.post(`/templates/${id}/preview`);
      setPreviewHtml(res.data.html);
      setPreviewOpen(true);
    } catch (error) {
      toast.error('Preview failed');
    }
  };

  // Single API call to load all settings page data
  const fetchAllSettingsData = async () => {
    try {
      const res = await api.get('/settings/all');
      const { settings: s, keywords: k, thresholds: t, templates: tp } = res.data;
      setSettings(s);
      setSavedSettings(JSON.parse(JSON.stringify(s)));
      setKeywords(k);
      setThresholds(t);
      setSavedThresholds(JSON.parse(JSON.stringify(t)));
      setTemplates(tp);
      // Populate module-level cache
      _settingsCache = { settings: s, keywords: k, thresholds: t, templates: tp };
      _settingsCacheTime = Date.now();
    } catch (error) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
      setThresholdsLoading(false);
      setTemplatesLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [settingsRes, keywordsRes] = await Promise.all([
        api.get('/settings'),
        api.get('/keywords')
      ]);
      setSettings(settingsRes.data);
      setSavedSettings(JSON.parse(JSON.stringify(settingsRes.data)));
      setKeywords(keywordsRes.data);
    } catch (error) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const fetchThresholds = async () => {
    try {
      setThresholdsLoading(true);
      const res = await api.get('/alert-thresholds');
      setThresholds(res.data);
      setSavedThresholds(JSON.parse(JSON.stringify(res.data)));
    } catch (error) {
      toast.error('Failed to load velocity thresholds');
    } finally {
      setThresholdsLoading(false);
    }
  };

  const handleSaveThresholds = async () => {
    try {
      await api.put('/alert-thresholds/bulk', { thresholds });
      setSavedThresholds(JSON.parse(JSON.stringify(thresholds)));
      toast.success('Viral alert thresholds saved');
    } catch (error) {
      toast.error('Failed to save thresholds');
    }
  };



  const updateThreshold = (platform, metric, field, value) => {
    setThresholds(prev => prev.map(t =>
      t.platform === platform
        ? { ...t, [field]: parseInt(value) || 0 }
        : t
    ));
  };

  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await api.put('/settings', settings);
      setSavedSettings(JSON.parse(JSON.stringify(res.data)));
      setSettings(res.data);
      _settingsCache = null; // Invalidate cache on save
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const resetKeywordForm = () => {
    setNewKeyword('');
    setEditingKeywordId(null);
  };

  const handleSaveKeyword = async (e) => {
    e.preventDefault();
    const value = String(newKeyword || '').trim();
    if (!value) {
      toast.error('Enter a keyword');
      return;
    }
    setKeywordSaving(true);
    try {
      if (editingKeywordId) {
        await api.put(`/keywords/${editingKeywordId}`, { keyword: value });
        toast.success('Keyword updated');
      } else {
        await api.post('/keywords', { keyword: value });
        toast.success('Keyword added');
      }
      resetKeywordForm();
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save keyword');
    } finally {
      setKeywordSaving(false);
    }
  };

  const handleEditKeyword = (kw) => {
    setEditingKeywordId(kw.id);
    setNewKeyword(kw.keyword || '');
    setDialogOpen(true);
  };

  const handleDeleteKeyword = async (id) => {
    if (!window.confirm('Delete this keyword?')) return;
    try {
      await api.delete(`/keywords/${id}`);
      toast.success('Keyword deleted');
      if (editingKeywordId === id) resetKeywordForm();
      fetchData();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to delete keyword');
    }
  };

  const handleCatalogRescan = async () => {
    setKeywordRescanning(true);
    try {
      const res = await api.post('/keywords/catalog-rescan');
      const r = res.data?.result || {};
      toast.success(
        `Rescan done · matched ${r.posts_matched || 0}/${r.posts_scanned || 0} posts · ` +
          `${r.alerts_created || 0} new alerts · ${r.alerts_skipped_existing || 0} already existed`
      );
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Rescan failed');
    } finally {
      setKeywordRescanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (viewMode === 'editor') {
    const isEditing = !!editingTemplate;
    const title = isEditing ? `Edit Template — ${editingTemplate.name}` : `Upload Template — ${templateName}`;
    const handleSave = isEditing ? handleSaveEditedTemplate : handleSaveWithEditor;
    const currentHtml = isEditing ? editingHtml : editedHtml;
    const setCurrentHtml = isEditing ? setEditingHtml : setEditedHtml;
    const isSaving = isEditing ? savingEdit : uploading;

    return (
      <div className="flex flex-col h-[calc(100vh-120px)] bg-background border rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300 select-text">
        {/* Editor Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-none">{title}</h2>
              <p className="text-xs text-gray-500 mt-1">Refine your legal document structure and placeholders.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => isEditing ? setViewMode('tabs') : resetUploadDialog()} className="h-9 px-4">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold">
              {isSaving ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>

        {/* Editor Content Area */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Main Editor Surface */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <RichTextEditor
              initialContent={currentHtml}
              onChange={setCurrentHtml}
              minHeight="100%"
              placeholder="Start drafting your template content..."
            />
          </div>

          {/* Integration Sidebar */}
          <PlaceholderSidebar />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 p-4 md:p-6 lg:p-8 max-w-none" data-testid="settings-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="h-10 p-1 bg-muted/50 rounded-lg">
          <TabsTrigger value="general" className="text-xs px-5 py-2 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:font-semibold">Configuration</TabsTrigger>
          <TabsTrigger value="keywords" className="text-xs px-5 py-2 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:font-semibold">Keywords</TabsTrigger>
          <TabsTrigger value="templates" className="text-xs px-5 py-2 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:font-semibold">Report Templates</TabsTrigger>
          <TabsTrigger value="access" className="text-xs px-5 py-2 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:font-semibold">Access Management</TabsTrigger>
          <TabsTrigger value="policies" className="text-xs px-5 py-2 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:font-semibold">Policy Manager</TabsTrigger>
          <TabsTrigger value="theme" className="text-xs px-5 py-2 rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:font-semibold">Theme</TabsTrigger>
        </TabsList>

      {/* Unsaved changes dialog */}
      <Dialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Unsaved Changes
            </DialogTitle>
            <DialogDescription>
              You have unsaved changes. Do you want to save them before leaving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => {
              setSettings(JSON.parse(JSON.stringify(savedSettings)));
              setThresholds(JSON.parse(JSON.stringify(savedThresholds)));
              setIsDirty(false);
              setShowUnsavedDialog(false);
              if (pendingTabRef.current) {
                const t = pendingTabRef.current;
                setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('tab', t); next.delete('platform'); return next; }, { replace: true });
                pendingTabRef.current = null;
              }
            }}>Discard</Button>
            <Button onClick={async () => {
              await handleSaveSettings();
              await handleSaveThresholds();
              setShowUnsavedDialog(false);
              if (pendingTabRef.current) {
                const t = pendingTabRef.current;
                setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('tab', t); next.delete('platform'); return next; }, { replace: true });
                pendingTabRef.current = null;
              }
            }}>Save & Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        {/* ═══ Configuration Tab ═══ */}
        <TabsContent value="general" className="space-y-6">

          {/* Save Bar */}
          {hasUnsavedChanges() && (
            <div className="sticky top-0 z-10 flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5 shadow-sm">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">You have unsaved changes</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => {
                  setSettings(JSON.parse(JSON.stringify(savedSettings)));
                  setThresholds(JSON.parse(JSON.stringify(savedThresholds)));
                }}>Discard</Button>
                <Button size="sm" className="h-8 text-xs" disabled={isSaving} onClick={async () => { setIsSaving(true); try { await handleSaveSettings(); await handleSaveThresholds(); } finally { setIsSaving(false); } }}>
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />} {isSaving ? 'Saving...' : 'Save All Changes'}
                </Button>
              </div>
            </div>
          )}

          {/* ── Row 1: Profile Monitoring + Risk Levels + Viral Alerts ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Profile Monitoring */}
            <Card className="border shadow-sm">
              <div className="flex items-center justify-between px-4 py-2.5 border-b">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Profile Monitoring</h3>
                </div>
                <Switch className="scale-90"
                  checked={settings?.api_config?.monitoring?.enabled !== false}
                  onCheckedChange={(checked) => setSettings(prev => ({
                    ...prev,
                    api_config: { ...prev?.api_config, monitoring: { ...prev?.api_config?.monitoring, enabled: checked } }
                  }))}
                />
              </div>
              <div className="p-4 space-y-3">
                <div className="flex gap-0.5 bg-muted/50 p-0.5 rounded-md">
                  {[
                    { key: 'x', label: 'X', Icon: XLogo },
                    { key: 'instagram', label: 'Instagram', Icon: Instagram },
                    { key: 'facebook', label: 'Facebook', Icon: Facebook },
                    { key: 'youtube', label: 'YouTube', Icon: Youtube }
                  ].map(({ key, label, Icon }) => (
                    <button key={key} onClick={() => setMonPlatformTab(key)}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all',
                        monPlatformTab === key
                          ? 'bg-primary text-primary-foreground shadow-md ring-1 ring-primary/30 font-semibold'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {[
                    { key: 'political', label: 'Political' },
                    { key: 'communal', label: 'Communal' },
                    { key: 'trouble_makers', label: 'Trouble Makers' },
                    { key: 'defamation', label: 'Defamation' },
                    { key: 'narcotics', label: 'Narcotics' },
                    { key: 'history_sheeters', label: 'History Sheeters' },
                    { key: 'others', label: 'Others' }
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-xs">{label}</span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="text" inputMode="numeric"
                          value={Math.round((settings?.api_config?.monitoring?.frequencies?.[monPlatformTab]?.[key] ?? 0) / 60)}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, '');
                            const hrs = raw === '' ? 0 : parseInt(raw);
                            setSettings(prev => ({
                              ...prev,
                              api_config: {
                                ...prev?.api_config,
                                monitoring: {
                                  ...prev?.api_config?.monitoring,
                                  frequencies: {
                                    ...prev?.api_config?.monitoring?.frequencies,
                                    [monPlatformTab]: {
                                      ...prev?.api_config?.monitoring?.frequencies?.[monPlatformTab],
                                      [key]: hrs * 60
                                    }
                                  }
                                }
                              }
                            }));
                          }}
                          className="h-7 w-16 text-xs text-center"
                          disabled={settings?.api_config?.monitoring?.enabled === false}
                        />
                        <span className="text-[10px] text-muted-foreground">hrs</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Risk Levels */}
            <Card className="border shadow-sm">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                <h3 className="text-sm font-semibold">Risk Levels</h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-500" /> High Risk
                  </Label>
                  <span className="text-[10px] text-red-500 font-medium">{settings?.risk_threshold_high ?? 70} – 100</span>
                </div>
                <Input
                  type="text" inputMode="numeric"
                  value={settings?.risk_threshold_high ?? 70}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setSettings({ ...settings, risk_threshold_high: raw === '' ? 0 : parseInt(raw) });
                  }}
                  className="h-8 text-xs"
                />
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Medium Risk
                  </Label>
                  <span className="text-[10px] text-amber-500 font-medium">{settings?.risk_threshold_medium ?? 40} – {(settings?.risk_threshold_high ?? 70) - 1}</span>
                </div>
                <Input
                  type="text" inputMode="numeric"
                  value={settings?.risk_threshold_medium ?? 40}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setSettings({ ...settings, risk_threshold_medium: raw === '' ? 0 : parseInt(raw) });
                  }}
                  className="h-8 text-xs"
                />
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-green-500" /> Low Risk
                  </Label>
                  <span className="text-[10px] text-green-500 font-medium">0 – {(settings?.risk_threshold_medium ?? 40) - 1}</span>
                </div>
              </div>
            </Card>

            {/* Viral Alerts */}
            <Card className="border shadow-sm">
              <div className="flex items-center justify-between px-4 py-2.5 border-b">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-semibold">Viral Alerts</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Switch className="scale-90"
                    checked={settings?.velocity_alerts_enabled ?? true}
                    onCheckedChange={(checked) => setSettings({ ...settings, velocity_alerts_enabled: checked })}
                  />
                </div>
              </div>
              <div className="p-4">
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="text-left font-medium px-2 py-1.5 text-muted-foreground"></th>
                        <th className="text-center font-medium px-1 py-1.5 text-green-600">Low</th>
                        <th className="text-center font-medium px-1 py-1.5 text-amber-600">Med</th>
                        <th className="text-center font-medium px-1 py-1.5 text-red-600">High</th>
                        <th className="text-center font-medium px-1 py-1.5 text-muted-foreground">Hrs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { platform: 'x', name: 'X', Icon: XLogo },
                        { platform: 'instagram', name: 'Instagram', Icon: Instagram },
                        { platform: 'facebook', name: 'Facebook', Icon: Facebook },
                        { platform: 'youtube', name: 'YouTube', Icon: Youtube }
                      ].map(({ platform, name, Icon }) => {
                        const t = thresholds.find(th => th.platform === platform);
                        if (!t) return null;
                        return (
                          <tr key={platform} className="border-t">
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium">{name}</span>
                              </div>
                            </td>
                            <td className="px-0.5 py-1.5">
                              <Input type="text" inputMode="numeric" value={t.low_threshold}
                                onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); updateThreshold(platform, null, 'low_threshold', raw === '' ? 0 : raw); }}
                                className="h-6 text-xs text-center px-1" />
                            </td>
                            <td className="px-0.5 py-1.5">
                              <Input type="text" inputMode="numeric" value={t.medium_threshold}
                                onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); updateThreshold(platform, null, 'medium_threshold', raw === '' ? 0 : raw); }}
                                className="h-6 text-xs text-center px-1" />
                            </td>
                            <td className="px-0.5 py-1.5">
                              <Input type="text" inputMode="numeric" value={t.high_threshold}
                                onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); updateThreshold(platform, null, 'high_threshold', raw === '' ? 0 : raw); }}
                                className="h-6 text-xs text-center px-1" />
                            </td>
                            <td className="px-0.5 py-1.5">
                              <Input type="text" inputMode="numeric" value={Math.round((t.time_window_minutes ?? 0) / 60)}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/[^0-9]/g, '');
                                  const hrs = raw === '' ? 0 : parseInt(raw);
                                  updateThreshold(platform, null, 'time_window_minutes', hrs * 60);
                                }}
                                className="h-6 text-xs text-center px-1" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </div>

          {/* ── Row 2: Event + Grievance ────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card className="border shadow-sm">
              <div className="flex items-center justify-between px-4 py-2.5 border-b">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-semibold">Events Monitoring</h3>
                </div>
                <Switch className="scale-90"
                  checked={settings?.api_config?.events?.enabled !== false}
                  onCheckedChange={(checked) => setSettings(prev => ({
                    ...prev,
                    api_config: { ...prev?.api_config, events: { ...prev?.api_config?.events, enabled: checked } }
                  }))}
                />
              </div>
              <div className="p-4 space-y-2">
                {[
                  { key: 'x', label: 'X', Icon: XLogo },
                  { key: 'instagram', label: 'Instagram', Icon: Instagram },
                  { key: 'facebook', label: 'Facebook', Icon: Facebook },
                  { key: 'youtube', label: 'YouTube', Icon: Youtube }
                ].map(({ key, label, Icon }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs">{label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="text" inputMode="numeric"
                        value={Math.round((settings?.api_config?.events?.[key] ?? 0) / 60)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          const hrs = raw === '' ? 0 : parseInt(raw);
                          setSettings(prev => ({
                            ...prev,
                            api_config: { ...prev?.api_config, events: { ...prev?.api_config?.events, [key]: hrs * 60 } }
                          }));
                        }}
                        className="h-7 w-16 text-xs text-center"
                        disabled={settings?.api_config?.events?.enabled === false}
                      />
                      <span className="text-[10px] text-muted-foreground">hrs</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border shadow-sm">
              <div className="flex items-center justify-between px-4 py-2.5 border-b">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold">Grievance Monitoring</h3>
                </div>
                <Switch className="scale-90"
                  checked={settings?.api_config?.grievances?.enabled !== false}
                  onCheckedChange={(checked) => setSettings(prev => ({
                    ...prev,
                    api_config: { ...prev?.api_config, grievances: { ...prev?.api_config?.grievances, enabled: checked } }
                  }))}
                />
              </div>
              <div className="p-4 space-y-2">
                {[
                  { key: 'x', label: 'X', Icon: XLogo },
                  { key: 'facebook', label: 'Facebook', Icon: Facebook }
                ].map(({ key, label, Icon }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs">{label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="text" inputMode="numeric"
                        value={Math.round((settings?.api_config?.grievances?.[key] ?? 0) / 60)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^0-9]/g, '');
                          const hrs = raw === '' ? 0 : parseInt(raw);
                          setSettings(prev => ({
                            ...prev,
                            api_config: { ...prev?.api_config, grievances: { ...prev?.api_config?.grievances, [key]: hrs * 60 } }
                          }));
                        }}
                        className="h-7 w-16 text-xs text-center"
                        disabled={settings?.api_config?.grievances?.enabled === false}
                      />
                      <span className="text-[10px] text-muted-foreground">hrs</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <Button disabled={isSaving} onClick={async () => { setIsSaving(true); try { await handleSaveSettings(); await handleSaveThresholds(); } finally { setIsSaving(false); } }} className="px-6">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />} {isSaving ? 'Saving...' : 'Save All Changes'}
            </Button>
          </div>
        </TabsContent>



        {/* Keywords */}
        <TabsContent value="keywords" className="space-y-4">
          <Card className="p-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Keywords</h3>
                  <p className="text-xs text-muted-foreground">
                    Phrases matched in monitored posts to raise catalog alerts.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    disabled={keywordRescanning || keywords.length === 0}
                    onClick={handleCatalogRescan}
                  >
                    {keywordRescanning ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : null}
                    Rescan
                  </Button>
                <Dialog
                  open={dialogOpen}
                  onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) resetKeywordForm();
                  }}
                >
                  <DialogTrigger asChild>
                    <Button
                      size="sm"
                      className="h-8 px-3 text-xs"
                      onClick={() => {
                        resetKeywordForm();
                        setDialogOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                      <DialogTitle className="text-base">
                        {editingKeywordId ? 'Edit keyword' : 'Add keyword'}
                      </DialogTitle>
                      <DialogDescription className="text-xs">
                        One phrase per entry. Matching posts can create alerts.
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSaveKeyword} className="flex items-center gap-2">
                      <Input
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        placeholder="Enter keyword"
                        required
                        className="h-9 text-sm flex-1"
                        autoComplete="off"
                        autoFocus
                      />
                      <Button type="submit" className="h-9 text-xs shrink-0" disabled={keywordSaving}>
                        {keywordSaving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : editingKeywordId ? (
                          'Update'
                        ) : (
                          'Add'
                        )}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
                </div>
              </div>

              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 bg-muted/40 text-[11px] font-medium text-muted-foreground border-b">
                  <span>Keyword</span>
                  <span className="pr-1">Actions</span>
                </div>
                {keywords.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-10">No keywords yet</p>
                ) : (
                  <ScrollArea className="h-[320px]">
                    <ul className="divide-y">
                      {keywords.map((kw) => (
                        <li key={kw.id} className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2.5 text-sm">
                          <span className="truncate font-medium">{kw.keyword}</span>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title="Edit"
                              onClick={() => handleEditKeyword(kw)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              title="Delete"
                              onClick={() => handleDeleteKeyword(kw.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Report Templates */}
        <TabsContent value="templates" className="space-y-4">
          <Card className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold">Report Templates</h3>
                    <p className="text-[10px] text-muted-foreground">Upload any DOCX — edit before saving. Alert data auto-fills when generating reports.</p>
                  </div>
                </div>

                {/* Upload Template Dialog */}
                <Dialog open={templateDialogOpen} onOpenChange={(open) => {
                  if (!open) resetUploadDialog();
                  else setTemplateDialogOpen(true);
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-7 px-2 text-xs"><Upload className="h-3 w-3 mr-1" /> Upload Template</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[450px]">
                    <DialogHeader>
                      <DialogTitle className="text-base">Upload DOCX Template</DialogTitle>
                      <DialogDescription className="text-[10px]">Select a DOCX file to use as a report base.</DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleUploadTemplate} className="space-y-4">
                      <div>
                        <Label className="text-xs">Template Name</Label>
                        <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. IT Cell Notice - X" className="h-8 text-xs mt-1" required />
                      </div>
                      <div>
                        <Label className="text-xs">Platform</Label>
                        <Select value={templatePlatform} onValueChange={setTemplatePlatform}>
                          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Platforms</SelectItem>
                            <SelectItem value="x">X (Twitter)</SelectItem>
                            <SelectItem value="youtube">YouTube</SelectItem>
                            <SelectItem value="facebook">Facebook</SelectItem>
                            <SelectItem value="instagram">Instagram</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">DOCX File</Label>
                        <div
                          className={`mt-1 border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${templateDragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'}`}
                          onClick={() => document.getElementById('template-file-input').click()}
                          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setTemplateDragging(true); }}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; }}
                          onDragLeave={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            if (e.currentTarget.contains(e.relatedTarget)) return;
                            setTemplateDragging(false);
                          }}
                          onDrop={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            setTemplateDragging(false);
                            const file = e.dataTransfer?.files?.[0];
                            if (!file) return;
                            if (!/\.(docx?|DOCX?)$/.test(file.name)) {
                              toast.error('Only .doc or .docx files are supported');
                              return;
                            }
                            setTemplateFile(file);
                          }}
                        >
                          <input id="template-file-input" type="file" accept=".docx,.doc" className="hidden" onChange={(e) => setTemplateFile(e.target.files[0])} />
                          {templateFile ? (
                            <div className="flex items-center justify-center gap-2">
                              <FileText className="h-4 w-4 text-green-600" />
                              <span className="text-xs font-medium">{templateFile.name}</span>
                            </div>
                          ) : (
                            <div>
                              <Upload className={`h-6 w-6 mx-auto mb-1 ${templateDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                              <p className="text-xs text-muted-foreground">
                                {templateDragging ? 'Drop the file here' : 'Click to browse or drag a .docx file'}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={templateIsDefault} onCheckedChange={setTemplateIsDefault} className="scale-75" />
                        <Label className="text-xs">Set as default for this platform</Label>
                      </div>
                      <Button type="submit" className="w-full h-8 text-xs" disabled={uploading}>
                        {uploading ? 'Parsing document...' : 'Next — Parse & Edit ▸'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Placeholder Reference */}
              <div className="border rounded-lg">
                <button onClick={() => setShowPlaceholders(!showPlaceholders)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-accent/50 transition-colors">
                  <span className="flex items-center gap-1.5"><BrainCircuit className="h-3.5 w-3.5" /> Placeholders Reference</span>
                  {showPlaceholders ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showPlaceholders && (
                  <div className="px-3 pb-3 border-t">
                    <p className="text-[10px] text-muted-foreground mt-2 mb-2">For advanced control, add these placeholders in your DOCX</p>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { key: 'SERIAL_NUMBER', desc: 'Report serial number' },
                        { key: 'DATE', desc: 'Current date (dd.mm.yyyy)' },
                        { key: 'DATE_LONG', desc: 'Full date format' },
                        { key: 'PLATFORM', desc: 'Platform name' },
                        { key: 'PLATFORM_OPERATOR', desc: 'Platform company' },
                        { key: 'PLATFORM_DOMAIN', desc: 'Platform URL' },
                        { key: 'AUTHOR_NAME', desc: 'User display name' },
                        { key: 'AUTHOR_HANDLE', desc: 'User handle (@)' },
                        { key: 'PROFILE_URL', desc: 'Profile URL' },
                        { key: 'CONTENT_URL', desc: 'Flagged post URL' },
                        { key: 'CONTENT_TEXT', desc: 'Flagged content text' },
                        { key: 'POST_DATE', desc: 'Post publish date' },
                        { key: 'LEGAL_SECTIONS', desc: 'Full legal sections' },
                        { key: 'LEGAL_SECTIONS_NUMBERS', desc: 'Section numbers' },
                        { key: 'CATEGORY', desc: 'Alert category' },
                        { key: 'RISK_LEVEL', desc: 'Risk level' },
                        { key: 'IS_REPOST', desc: 'Repost flag (Yes/No)' },
                        { key: 'ORIGINAL_AUTHOR', desc: 'Original author' },
                        { key: 'INTENT', desc: 'Detected intent' },
                        { key: 'ALERT_DESCRIPTION', desc: 'Alert description' },
                      ].map(p => (
                        <div key={p.key} className="flex items-center gap-1.5 px-2 py-1 rounded bg-secondary/30 text-[10px]">
                          <code className="font-mono font-bold text-primary">{'{{' + p.key + '}}'}</code>
                          <span className="text-muted-foreground truncate">{p.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Template List */}
              {templates.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">No templates uploaded yet</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Upload any DOCX to get started — no placeholders needed!</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2 pr-2">
                    {templates.map(t => (
                      <div key={t.id} className="group flex items-center justify-between p-3 rounded-lg border hover:border-primary/30 transition-colors bg-background">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="shrink-0 h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileText className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold truncate">{t.name}</span>
                              {t.is_default && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-300 text-amber-600 shrink-0">
                                  <Star className="h-2 w-2 mr-0.5 fill-current" /> Default
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                {t.platform === 'all' ? 'All Platforms' : t.platform.charAt(0).toUpperCase() + t.platform.slice(1)}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {(t.placeholders?.length || 0) > 0 ? `${t.placeholders.length} placeholders` : 'Auto-fill mode'}
                              </span>
                              <span className="text-[10px] text-muted-foreground">{t.original_filename}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEditTemplate(t)} title="Edit Template">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEditTemplate(t)} title="View / Edit Template">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {!t.is_default && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleSetDefault(t.id)} title="Set as default">
                              <Star className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteTemplate(t.id)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="access" className="mt-2">
          <AccessManagement />
        </TabsContent>

        <TabsContent value="policies" className="mt-2">
          <PolicyManager />
        </TabsContent>

        <TabsContent value="theme" className="space-y-4">
          <ThemeTab />
        </TabsContent>

        {/* Template Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">Template Preview</DialogTitle>
              <DialogDescription className="sr-only">Visual preview of how the report will look with sample data.</DialogDescription>
            </DialogHeader>
            <div className="border rounded-lg p-6 bg-white dark:bg-slate-900 text-black dark:text-white prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(previewHtml) }} />
          </DialogContent>
        </Dialog>

        {/* Edit Existing Template Dialog replaced by Full-Page Editor */}
      </Tabs>
    </div>
  );
};

export default Settings;
