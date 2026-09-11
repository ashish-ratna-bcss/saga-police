import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  Tag,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Check,
  X,
  Search,
} from 'lucide-react';
import { AlertService } from '../../api';
import { toast } from 'sonner';

export function AlertKeywordsSection() {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [keywordText, setKeywordText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  const fetchKeywords = useCallback(async () => {
    try {
      setLoading(true);
      const res = await AlertService.listKeywords();
      const records = Array.isArray(res.data) ? res.data : [];
      records.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      setKeywords(records);
    } catch (err) {
      toast.error('Failed to load keywords');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const value = String(keywordText || '').trim();
    if (!value) {
      toast.error('Enter a keyword');
      return;
    }

    setSaving(true);
    try {
      const payload = { keyword: value, rescan_catalog: true };
      if (editingId) {
        await AlertService.updateKeyword(editingId, payload);
        toast.success('Keyword updated');
      } else {
        const res = await AlertService.addKeyword(payload);
        const reset = res.data?.rescan?.reset || 0;
        if (res.data?.already_exists) {
          toast.success(
            reset > 0
              ? `Keyword already saved · re-queued ${reset} post(s)`
              : 'Keyword already saved'
          );
        } else {
          toast.success(
            reset > 0
              ? `Keyword added · re-queued ${reset} post(s)`
              : 'Keyword added'
          );
        }
      }
      setKeywordText('');
      setEditingId(null);
      await fetchKeywords();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save keyword');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (kw) => {
    setEditingId(kw.id);
    setKeywordText(kw.keyword || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setKeywordText('');
  };

  const handleDelete = async (kw) => {
    if (!window.confirm(`Delete keyword "${kw.keyword}"?`)) return;
    setBusyId(kw.id);
    try {
      await AlertService.deleteKeyword(kw.id);
      toast.success('Keyword deleted');
      if (editingId === kw.id) {
        setEditingId(null);
        setKeywordText('');
      }
      await fetchKeywords();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to delete keyword');
    } finally {
      setBusyId(null);
    }
  };

  const filtered = keywords.filter((k) =>
    (k.keyword || '').toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Tag className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold leading-none">Alert Keywords</h2>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-medium">
                {keywords.length} total
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Keywords monitored across catalog profiles to trigger risk alerts.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <Input
            value={keywordText}
            onChange={(e) => setKeywordText(e.target.value)}
            placeholder={editingId ? 'Edit keyword…' : 'Add new keyword (e.g. extortion, riot, threat)…'}
            className="h-8 text-xs flex-1 min-w-[200px]"
            autoComplete="off"
          />
          <Button type="submit" size="sm" className="h-8 text-xs gap-1.5" disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : editingId ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {editingId ? 'Save' : 'Add Keyword'}
          </Button>
          {editingId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={handleCancelEdit}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
        </form>

        {keywords.length > 5 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search keywords…"
              className="h-8 pl-8 text-xs bg-muted/30"
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading keywords…</span>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
            {search ? 'No keywords match your search.' : 'No keywords configured yet. Add keywords above to start monitoring.'}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-60 overflow-y-auto pr-1">
            {filtered.map((kw) => (
              <Badge
                key={kw.id}
                variant="outline"
                className="gap-1.5 text-xs py-1 px-2.5 bg-background hover:bg-muted/40 transition-colors"
              >
                <span className="font-medium text-foreground">{kw.keyword}</span>
                <button
                  type="button"
                  onClick={() => handleEdit(kw)}
                  className="text-muted-foreground hover:text-foreground ml-0.5 p-0.5 rounded transition-colors"
                  title="Edit keyword"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={busyId === kw.id}
                  onClick={() => handleDelete(kw)}
                  className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
                  title="Delete keyword"
                >
                  {busyId === kw.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default AlertKeywordsSection;
