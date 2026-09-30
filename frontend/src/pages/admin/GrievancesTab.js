import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/table';
import { PlatformBrandIcon } from '../../components/PlatformBrandIcon';
import { Loader2, Plus, Trash2, ShieldAlert, Pencil, Search } from 'lucide-react';
import { socialProfilesApi } from '../../api/socialProfiles.api';
import AddSocialProfileDialog from '../../components/AddSocialProfileDialog';
import GrievanceContactsSection from '../../components/settings/GrievanceContactsSection';
import { toast } from 'sonner';

const platformSlug = (p) => {
  const raw = String(p.platform || p.platform_slug || p.platform_name || '').toLowerCase();
  if (raw.includes('twitter') || raw === 'x' || raw.startsWith('x (')) return 'x';
  return raw.split(/[\s(]/)[0];
};

const labelFor = (p) => p.display_name || p.handle || p.data?.username || p.data?.url || 'Unnamed profile';
const detailFor = (p) => {
  const value = p.data?.url || p.data?.channel_url || p.handle || p.data?.username || '';
  return p.display_name && value ? value : '';
};
const initials = (text) =>
  String(text || '?').replace(/^https?:\/\/(www\.)?/i, '').replace(/^@/, '').trim().slice(0, 1).toUpperCase() || '?';

export default function GrievancesTab() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [query, setQuery] = useState('');
  const [removingId, setRemovingId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await socialProfilesApi.list({ type: 'grievance' });
      setProfiles(Array.isArray(res.data?.profiles) ? res.data.profiles : []);
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Failed to load grievance profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditingProfile(null);
    setDialogOpen(true);
  };

  const openEdit = (profile) => {
    setEditingProfile(profile);
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) setEditingProfile(null);
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Stop watching ${labelFor(p)}?`)) return;
    setRemovingId(p.id);
    try {
      await socialProfilesApi.remove(p.id);
      toast.success('Removed grievance profile');
      load();
    } catch (_) {
      toast.error('Failed to remove');
    } finally {
      setRemovingId(null);
    }
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? profiles.filter((p) =>
          [labelFor(p), detailFor(p), p.platform_name, p.platform].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)))
      : profiles;
    return [...list].sort(
      (a, b) => platformSlug(a).localeCompare(platformSlug(b)) || labelFor(a).localeCompare(labelFor(b))
    );
  }, [profiles, query]);

  const byPlatform = useMemo(() => {
    const m = new Map();
    for (const p of profiles) {
      const key = platformSlug(p);
      const cur = m.get(key) || { slug: key, name: p.platform_name || p.platform || key, n: 0 };
      cur.n += 1;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [profiles]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card overflow-hidden w-full shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-none text-foreground">Watched accounts</h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Official accounts whose mentions feed the Grievances page. These are separate from Social Profiles.
            </p>
          </div>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" />
            Add account
          </Button>
        </div>

        {profiles.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border">
            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
              <span className="inline-flex items-baseline gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
                <span className="tabular-nums font-semibold text-foreground">{profiles.length}</span> total
              </span>
              {byPlatform.map((g) => (
                <span key={g.slug} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
                  <PlatformBrandIcon platform={g.slug} className="h-3 w-3" />
                  <span className="tabular-nums font-semibold text-foreground">{g.n}</span>
                </span>
              ))}
            </div>
            {profiles.length > 4 && (
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search accounts…" className="h-8 pl-8 text-xs" />
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <ShieldAlert className="h-6 w-6 text-primary/60" />
            <p className="text-sm font-semibold">No accounts watched yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Add the official handles or pages you want to track. Posts that tag or reply to them appear on the Grievances page.
            </p>
            <Button size="sm" className="mt-1 h-8 gap-1.5 text-xs" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" /> Add account
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="text-[11px]">
                <TableHead className="h-9 pl-4">Account</TableHead>
                <TableHead className="h-9">Platform</TableHead>
                <TableHead className="h-9 pr-4 w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-xs text-muted-foreground">
                    No accounts match &ldquo;{query}&rdquo;.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((p) => (
                <TableRow key={p.id} className="text-xs">
                  <TableCell className="py-2.5 pl-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {initials(labelFor(p))}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{labelFor(p)}</p>
                        {detailFor(p) && <p className="truncate text-[11px] text-muted-foreground">{detailFor(p)}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <PlatformBrandIcon platform={platformSlug(p)} className="h-3.5 w-3.5" />
                      {p.platform_name || p.platform || '—'}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 pr-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(p)} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(p)} disabled={removingId === p.id}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" title="Remove">
                        {removingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <AddSocialProfileDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        editingProfile={editingProfile}
        accountType="grievance"
        title={editingProfile ? 'Edit grievance account' : 'Add grievance account'}
        description={
          editingProfile
            ? 'Update this grievance account here: name, poll, notes, and platform fields.'
            : 'Add a handle or URL. This account is only used for Grievances monitoring.'
        }
        onSuccess={load}
      />

      <GrievanceContactsSection />
    </div>
  );
}
