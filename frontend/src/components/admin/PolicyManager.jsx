import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  Plus,
  Search,
  Shield,
  AlertTriangle,
  Trash2,
  X,
  Save,
  AlertOctagon,
  Info,
  Globe,
  Gavel,
  Scale,
  ChevronRight,
  ArrowLeft,
  Loader2,
  Tag,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';

/**
 * Settings-aligned Policy Manager — category definitions for AI analysis.
 */
const PolicyManager = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [keywordDraft, setKeywordDraft] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [activeTab, setActiveTab] = useState('basic');
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    isDelete: false,
  });

  const [formData, setFormData] = useState({
    category_id: '',
    definition: '',
    severity_level: 'High',
    keywords: [],
    legal_sections: [],
    meta_policies: [],
    x_policies: [],
    youtube_policies: [],
  });

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    try {
      const res = await api.get('/policies');
      if (res.data.success) {
        setPolicies(res.data.data);
      }
    } catch (error) {
      toast.error('Failed to load policies');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const emptyForm = () => ({
    category_id: '',
    definition: '',
    severity_level: 'High',
    keywords: [],
    legal_sections: [],
    meta_policies: [],
    x_policies: [],
    youtube_policies: [],
  });

  const handleOpenPanel = (policy = null) => {
    setActiveTab('basic');
    setKeywordDraft('');
    if (policy) {
      setEditingPolicy(policy);
      const meta = [
        ...(policy.platform_policies?.facebook || []),
        ...(policy.platform_policies?.instagram || []),
      ].filter((v, i, a) => a.findIndex((t) => t.name === v.name) === i);

      const initialData = {
        category_id: policy.category_id,
        definition: policy.definition || '',
        severity_level: policy.severity_level || 'High',
        keywords: policy.keywords ? JSON.parse(JSON.stringify(policy.keywords)) : [],
        legal_sections: policy.legal_sections
          ? JSON.parse(JSON.stringify(policy.legal_sections))
          : [],
        meta_policies: JSON.parse(JSON.stringify(meta)),
        x_policies: policy.platform_policies?.x
          ? JSON.parse(JSON.stringify(policy.platform_policies.x))
          : [],
        youtube_policies: policy.platform_policies?.youtube
          ? JSON.parse(JSON.stringify(policy.platform_policies.youtube))
          : [],
      };
      setFormData(initialData);
      setOriginalData(JSON.parse(JSON.stringify(initialData)));
    } else {
      setEditingPolicy(null);
      const initialData = emptyForm();
      setFormData(initialData);
      setOriginalData(initialData);
    }
    setIsPanelOpen(true);
  };

  const addLegalSection = () => {
    setFormData({
      ...formData,
      legal_sections: [...formData.legal_sections, { id: '', code: '', title: '', url: '' }],
    });
  };

  const removeLegalSection = (index) => {
    const next = [...formData.legal_sections];
    next.splice(index, 1);
    setFormData({ ...formData, legal_sections: next });
  };

  const updateLegalSection = (index, field, value) => {
    const next = [...formData.legal_sections];
    next[index][field] = value;
    setFormData({ ...formData, legal_sections: next });
  };

  const addPlatformPolicy = (platformField) => {
    setFormData({
      ...formData,
      [platformField]: [...formData[platformField], { id: '', name: '', url: '' }],
    });
  };

  const removePlatformPolicy = (platformField, index) => {
    const next = [...formData[platformField]];
    next.splice(index, 1);
    setFormData({ ...formData, [platformField]: next });
  };

  const updatePlatformPolicy = (platformField, index, field, value) => {
    const next = [...formData[platformField]];
    next[index][field] = value;
    setFormData({ ...formData, [platformField]: next });
  };

  const addKeyword = () => {
    const value = keywordDraft.trim();
    if (!value) return;
    if (formData.keywords.some((k) => k.toLowerCase() === value.toLowerCase())) {
      setKeywordDraft('');
      return;
    }
    setFormData({ ...formData, keywords: [...formData.keywords, value] });
    setKeywordDraft('');
  };

  const removeKeyword = (index) => {
    const next = [...formData.keywords];
    next.splice(index, 1);
    setFormData({ ...formData, keywords: next });
  };

  const filteredPolicies = policies.filter(
    (p) =>
      (p.category_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.definition || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isDirty = useMemo(
    () => JSON.stringify(formData) !== JSON.stringify(originalData),
    [formData, originalData]
  );

  const existingLegalSections = useMemo(() => {
    const map = new Map();
    policies.forEach((p) => {
      p.legal_sections?.forEach((s) => {
        if (s.code && !map.has(s.code)) map.set(s.code, s);
      });
    });
    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [policies]);

  const existingMetaPolicies = useMemo(() => {
    const map = new Map();
    policies.forEach((p) => {
      [...(p.platform_policies?.facebook || []), ...(p.platform_policies?.instagram || [])].forEach(
        (rule) => {
          if (rule.name && !map.has(rule.name)) map.set(rule.name, rule);
        }
      );
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [policies]);

  const existingXPolicies = useMemo(() => {
    const map = new Map();
    policies.forEach((p) => {
      p.platform_policies?.x?.forEach((rule) => {
        if (rule.name && !map.has(rule.name)) map.set(rule.name, rule);
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [policies]);

  const existingYoutubePolicies = useMemo(() => {
    const map = new Map();
    policies.forEach((p) => {
      p.platform_policies?.youtube?.forEach((rule) => {
        if (rule.name && !map.has(rule.name)) map.set(rule.name, rule);
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [policies]);

  const handleQuickAddLegal = (e) => {
    const code = e.target.value;
    if (!code) return;
    const section = existingLegalSections.find((s) => s.code === code);
    if (section) {
      setFormData((prev) => ({
        ...prev,
        legal_sections: [...prev.legal_sections, { ...section, id: section.id || '' }],
      }));
    }
    e.target.value = '';
  };

  const handleQuickAddPlatform = (field, list, e) => {
    const name = e.target.value;
    if (!name) return;
    const rule = list.find((r) => r.name === name);
    if (rule) {
      setFormData((prev) => ({
        ...prev,
        [field]: [...prev[field], { ...rule, id: rule.id || '' }],
      }));
    }
    e.target.value = '';
  };

  const openConfirm = (title, message, onConfirm, isDelete = false) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, isDelete });
  };

  const closeConfirm = () => {
    setConfirmModal((prev) => ({ ...prev, isOpen: false }));
  };

  const handleConfirmAction = () => {
    if (confirmModal.onConfirm) confirmModal.onConfirm();
    closeConfirm();
  };

  const handleDeleteClick = (id) => {
    openConfirm(
      'Delete Policy',
      'Delete this policy? AI analysis will stop using it immediately.',
      () => handleDelete(id),
      true
    );
  };

  const handleSaveClick = (e) => {
    e?.preventDefault?.();
    if (editingPolicy) {
      openConfirm('Update Policy', 'Save changes to this policy definition?', () => executeSubmit(), false);
    } else {
      executeSubmit();
    }
  };

  const executeSubmit = async () => {
    try {
      if (!formData.category_id || !formData.definition) {
        toast.error('Category name and definition are required');
        return;
      }

      const payload = {
        category_id: formData.category_id
          .trim()
          .replace(/\s+/g, '_')
          .replace(/[^a-zA-Z0-9_]/g, ''),
        definition: formData.definition,
        severity_level: formData.severity_level,
        keywords: formData.keywords,
        legal_sections: formData.legal_sections,
        platform_policies: {
          x: formData.x_policies,
          youtube: formData.youtube_policies,
          facebook: formData.meta_policies,
          instagram: formData.meta_policies,
        },
      };

      if (editingPolicy) {
        await api.put(`/policies/${editingPolicy._id}`, payload);
        toast.success('Policy updated');
      } else {
        await api.post('/policies', payload);
        toast.success('Policy created');
      }
      setIsPanelOpen(false);
      fetchPolicies();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/policies/${id}`);
      toast.success('Policy deleted');
      fetchPolicies();
      if (editingPolicy && editingPolicy._id === id) setIsPanelOpen(false);
    } catch (error) {
      toast.error('Failed to delete policy');
    }
  };

  const ruleCount = (policy) =>
    (policy.platform_policies?.x?.length || 0) +
    (policy.platform_policies?.youtube?.length || 0) +
    (policy.platform_policies?.facebook?.length || 0);

  return (
    <div className="space-y-3 relative">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-start gap-2">
          {location.state?.fromTools && (
            <button
              type="button"
              onClick={() => navigate('/analysis-tools')}
              className="mt-0.5 h-7 w-7 rounded-md border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-primary shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <div>
            <h2 className="text-xl font-heading font-semibold tracking-tight flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Policy Manager
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Category definitions that steer AI analysis, legal refs, and platform rules
            </p>
          </div>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => handleOpenPanel()}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Policy
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search policies…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-8 pl-8 text-xs"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filteredPolicies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 px-4 py-12 text-center">
          <Scale className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm font-medium text-foreground">
            {searchTerm ? 'No matching policies' : 'No policies yet'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-sm mx-auto">
            {searchTerm
              ? 'Try a different search term.'
              : 'Create categories like Hate Speech or Misinformation so alerts cite the right legal sections and platform rules.'}
          </p>
          {!searchTerm && (
            <Button size="sm" className="h-8 text-xs mt-4" onClick={() => handleOpenPanel()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Create first policy
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredPolicies.map((policy) => (
            <button
              key={policy._id}
              type="button"
              onClick={() => handleOpenPanel(policy)}
              className="group text-left rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors flex flex-col"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex flex-wrap gap-1.5 items-center">
                  <Badge variant="secondary" className="text-[10px] font-semibold">
                    {(policy.category_id || '').replace(/_/g, ' ')}
                  </Badge>
                  {policy.is_global && (
                    <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200 bg-blue-50">
                      System Default
                    </Badge>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground line-clamp-3 flex-1 leading-relaxed">
                {policy.definition || 'No definition'}
              </p>
              <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Scale className="h-3 w-3 text-primary/70" />
                  {policy.legal_sections?.length || 0} legal
                </span>
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-3 w-3 text-primary/70" />
                  {ruleCount(policy)} rules
                </span>
                {(policy.keywords?.length || 0) > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Tag className="h-3 w-3 text-primary/70" />
                    {policy.keywords.length} keywords
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {isPanelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsPanelOpen(false)} />
          <div className="relative w-full max-w-xl bg-background h-full shadow-2xl border-l border-border flex flex-col animate-in slide-in-from-right duration-200">
            <div className="px-5 py-3.5 border-b border-border flex justify-between items-center bg-muted/20">
              <div>
                <h3 className="text-sm font-semibold tracking-tight">
                  {editingPolicy ? 'Edit policy' : 'New policy'}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {editingPolicy
                    ? (editingPolicy.category_id || '').replace(/_/g, ' ')
                    : 'General · Legal · Platform rules'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {editingPolicy && !editingPolicy.is_global && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteClick(editingPolicy._id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsPanelOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex border-b border-border px-5 gap-4 bg-background">
              {[
                { id: 'basic', label: 'General' },
                { id: 'legal', label: 'Legal Framework' },
                { id: 'platform', label: 'Platform Rules' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-2.5 pt-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 bg-muted/5">
              {editingPolicy?.is_global && (
                <div className="mb-5 flex items-start gap-2.5 p-3 text-xs text-blue-800 bg-blue-50 border border-blue-200 rounded-lg">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block mb-0.5">System Default Policy</span>
                    This policy is maintained globally and cannot be modified or deleted.
                  </div>
                </div>
              )}
              <form id="panelForm" onSubmit={handleSaveClick} className="space-y-5">
                {activeTab === 'basic' && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">Category name</label>
                      <Input
                        value={formData.category_id}
                        onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                        placeholder="e.g. Hate Speech"
                        className="h-8 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Spaces become underscores; punctuation is removed on save.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">AI definition</label>
                      <Textarea
                        value={formData.definition}
                        onChange={(e) => setFormData({ ...formData, definition: e.target.value })}
                        placeholder="Describe what content belongs in this category…"
                        className="min-h-[140px] text-xs leading-relaxed"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        The model reads this when classifying posts for Cyber Intelligence SOC.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium inline-flex items-center gap-1.5">
                        <Tag className="h-3 w-3" /> Keywords
                      </label>
                      <div className="flex gap-2">
                        <Input
                          value={keywordDraft}
                          onChange={(e) => setKeywordDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addKeyword();
                            }
                          }}
                          placeholder="Add keyword and press Enter"
                          className="h-8 text-xs"
                        />
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addKeyword}>
                          Add
                        </Button>
                      </div>
                      {formData.keywords.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {formData.keywords.map((kw, idx) => (
                            <Badge key={`${kw}-${idx}`} variant="outline" className="gap-1 text-[10px] pr-1">
                              {kw}
                              <button
                                type="button"
                                className="rounded-sm p-0.5 hover:bg-muted"
                                onClick={() => removeKeyword(idx)}
                                aria-label={`Remove ${kw}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">No keywords yet.</p>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'legal' && (
                  <div className="space-y-4">
                    {!formData.category_id && (
                      <div className="flex items-center gap-2 p-2.5 text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
                        Enter a category name on General first.
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Gavel className="h-3.5 w-3.5 text-muted-foreground" />
                        Mapped sections
                      </div>
                      <div className="flex items-center gap-2">
                        <NativeSelect
                          onChange={handleQuickAddLegal}
                          defaultValue=""
                          className="h-8 text-xs max-w-[200px]"
                        >
                          <option value="" disabled>
                            Add existing…
                          </option>
                          {existingLegalSections.map((s) => (
                            <option key={s.code} value={s.code}>
                              {s.code} — {s.title?.length > 40 ? `${s.title.slice(0, 40)}…` : s.title}
                            </option>
                          ))}
                        </NativeSelect>
                        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addLegalSection}>
                          <Plus className="h-3 w-3 mr-1" /> New
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {formData.legal_sections.map((section, idx) => (
                        <div key={idx} className="flex gap-2 p-3 border border-border rounded-lg bg-card">
                          <div className="flex-1 flex gap-2">
                            <Input
                              placeholder="Code"
                              value={section.code}
                              onChange={(e) => updateLegalSection(idx, 'code', e.target.value)}
                              className="h-8 text-xs w-24"
                            />
                            <Input
                              placeholder="Description"
                              value={section.title}
                              onChange={(e) => updateLegalSection(idx, 'title', e.target.value)}
                              className="h-8 text-xs flex-1"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeLegalSection(idx)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      {formData.legal_sections.length === 0 && (
                        <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                          No legal sections mapped
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'platform' && (
                  <div className="space-y-6">
                    {!formData.category_id && (
                      <div className="flex items-center gap-2 p-2.5 text-xs text-amber-700 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <AlertOctagon className="h-3.5 w-3.5 shrink-0" />
                        Enter a category name on General first.
                      </div>
                    )}
                    {[
                      { label: 'Meta (Facebook & Instagram)', field: 'meta_policies', list: existingMetaPolicies },
                      { label: 'X (Twitter)', field: 'x_policies', list: existingXPolicies },
                      { label: 'YouTube', field: 'youtube_policies', list: existingYoutubePolicies },
                    ].map((platform, pIdx) => (
                      <div
                        key={platform.field}
                        className={`space-y-2 ${pIdx !== 0 ? 'pt-4 border-t border-border' : ''}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-xs font-medium">{platform.label}</h4>
                          <div className="flex items-center gap-2">
                            <NativeSelect
                              onChange={(e) => handleQuickAddPlatform(platform.field, platform.list, e)}
                              defaultValue=""
                              className="h-8 text-xs max-w-[180px]"
                            >
                              <option value="" disabled>
                                Add existing…
                              </option>
                              {platform.list.map((p) => (
                                <option key={p.name} value={p.name}>
                                  {p.name.length > 40 ? `${p.name.slice(0, 40)}…` : p.name}
                                </option>
                              ))}
                            </NativeSelect>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => addPlatformPolicy(platform.field)}
                            >
                              <Plus className="h-3 w-3 mr-1" /> New
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {formData[platform.field].map((p, i) => (
                            <div key={i} className="flex gap-2 items-center">
                              <Input
                                placeholder="Policy name"
                                value={p.name}
                                onChange={(e) =>
                                  updatePlatformPolicy(platform.field, i, 'name', e.target.value)
                                }
                                className="h-8 text-xs flex-1"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => removePlatformPolicy(platform.field, i)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                          {formData[platform.field].length === 0 && (
                            <p className="text-[10px] text-muted-foreground italic pl-0.5">
                              No rules defined
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </form>
            </div>

            <div className="p-4 border-t border-border bg-muted/20 flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setIsPanelOpen(false)}>
                {editingPolicy?.is_global ? 'Close' : 'Cancel'}
              </Button>
              {(!editingPolicy || !editingPolicy.is_global) && (
                <Button size="sm" className="h-8 text-xs min-w-[110px]" onClick={handleSaveClick} disabled={!isDirty}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  Save Changes
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={confirmModal.isOpen} onOpenChange={(open) => !open && closeConfirm()}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {confirmModal.isDelete ? (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              ) : (
                <Info className="h-5 w-5 text-primary" />
              )}
              {confirmModal.title}
            </DialogTitle>
            <DialogDescription>{confirmModal.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={closeConfirm}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              variant={confirmModal.isDelete ? 'destructive' : 'default'}
              onClick={handleConfirmAction}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const NativeSelect = ({ children, className = '', ...props }) => (
  <div className="relative">
    <select
      {...props}
      className={`w-full appearance-none rounded-md border border-input bg-background px-2.5 pr-7 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </select>
    <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none rotate-90" />
  </div>
);

export default PolicyManager;
