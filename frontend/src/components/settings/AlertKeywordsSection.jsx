import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tag, Plus, Trash2, Pencil, Loader2, Check, X, Search } from 'lucide-react';
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
    const raw = String(keywordText || '').trim();
    if (!raw) {
      toast.error('Enter a keyword');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await AlertService.updateKeyword(editingId, { keyword: raw, rescan_catalog: true });
        toast.success('Keyword updated');
      } else {
        // Several keywords can be added at once, separated by commas or new lines.
        const list = [...new Set(raw.split(/[,\n;]+/).map((k) => k.trim()).filter(Boolean))];
        let added = 0;
        let existing = 0;
        let requeued = 0;
        let failed = 0;
        for (const kw of list) {
          try {
            const res = await AlertService.addKeyword({ keyword: kw, rescan_catalog: true });
            if (res.data?.already_exists) existing += 1;
            else added += 1;
            requeued += res.data?.rescan?.reset || 0;
          } catch {
            failed += 1;
          }
        }
        if (failed === list.length) throw new Error('none saved');
        const parts = [
          added ? `${added} added` : null,
          existing ? `${existing} already saved` : null,
          failed ? `${failed} failed` : null,
          requeued ? `${requeued} post${requeued === 1 ? '' : 's'} re-queued` : null,
        ].filter(Boolean);
        toast.success(`Keywords: ${parts.join(', ')}`);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? keywords.filter((k) => (k.keyword || '').toLowerCase().includes(q)) : keywords;
  }, [keywords, search]);

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden w-full">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/20">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Tag className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold leading-none">Alert keywords</h2>
            <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {keywords.length}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Posts that contain one of these words raise a risk alert. New keywords are also checked against posts already collected.
          </p>
        </div>
      </div>

      <div className="p-4 space-y-3.5">
        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={keywordText}
              onChange={(e) => setKeywordText(e.target.value)}
              placeholder={editingId ? 'Edit keyword…' : 'Add keywords, separated by commas (e.g. extortion, riot, threat)'}
              className="h-9 pl-8 text-xs"
              autoComplete="off"
              aria-label="Keyword"
            />
          </div>
          <Button type="submit" size="sm" className="h-9 text-xs gap-1.5" disabled={saving || !keywordText.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editingId ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {editingId ? 'Save' : 'Add'}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" size="sm" className="h-9 text-xs gap-1" onClick={handleCancelEdit}>
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
        </form>

        {keywords.length > 8 && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search keywords…" className="h-8 pl-8 text-xs" />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading keywords…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
            <p className="text-sm font-semibold">{search ? 'No keywords match' : 'No keywords yet'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {search ? 'Try a different word.' : 'Add the words you want to watch for. You can paste several at once, separated by commas.'}
            </p>
          </div>
        ) : (
          <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto pr-1">
            {filtered.map((kw) => (
              <span
                key={kw.id}
                className={`group inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1.5 text-xs transition-colors ${
                  editingId === kw.id ? 'border-primary bg-primary/5' : 'border-border bg-background hover:bg-muted/40'
                }`}
              >
                <span className="font-medium text-foreground">{kw.keyword}</span>
                <button
                  type="button"
                  onClick={() => handleEdit(kw)}
                  className="rounded-full p-1 text-muted-foreground opacity-60 transition hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  title="Edit keyword"
                  aria-label={`Edit ${kw.keyword}`}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  disabled={busyId === kw.id}
                  onClick={() => handleDelete(kw)}
                  className="rounded-full p-1 text-muted-foreground opacity-60 transition hover:bg-red-500/10 hover:text-destructive group-hover:opacity-100"
                  title="Delete keyword"
                  aria-label={`Delete ${kw.keyword}`}
                >
                  {busyId === kw.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default AlertKeywordsSection;
