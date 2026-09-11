import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Loader2, Plus, Trash2, ShieldAlert, Pencil } from 'lucide-react';
import { socialProfilesApi } from '../../api/socialProfiles.api';
import AddSocialProfileDialog from '../../components/AddSocialProfileDialog';
import GrievanceContactsSection from '../../components/settings/GrievanceContactsSection';
import { toast } from 'sonner';

export default function GrievancesTab() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);

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

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this grievance profile?')) return;
    try {
      await socialProfilesApi.remove(id);
      toast.success('Removed grievance profile');
      load();
    } catch (_) {
      toast.error('Failed to remove');
    }
  };

  const labelFor = (p) =>
    p.display_name || p.handle || p.data?.username || p.data?.url || 'Unnamed profile';

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden w-full shadow-sm">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/20">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <ShieldAlert className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-none text-foreground">Grievance Profiles</h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Profiles monitored specifically for the Grievances page (separate from Social Profiles).
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add profile
        </Button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : profiles.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No grievance profiles yet. Add a handle or URL to start monitoring.
          </p>
        ) : (
          <div className="space-y-2">
            {profiles.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 bg-background/40"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <p className="text-sm font-semibold truncate text-foreground">{labelFor(p)}</p>
                  {p.handle && p.display_name ? (
                    <span className="text-xs text-muted-foreground truncate">{p.handle}</span>
                  ) : null}
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {p.platform_name || p.platform || '—'}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(p)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(p.id)}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddSocialProfileDialog
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        editingProfile={editingProfile}
        accountType="grievance"
        title={editingProfile ? 'Edit grievance profile' : 'Add grievance profile'}
        description={
          editingProfile
            ? 'Update this grievance account here — name, poll, notes, and platform fields.'
            : 'Add a handle or URL. This account is only used for Grievances monitoring.'
        }
        onSuccess={load}
      />

      {/* Grievance Contacts */}
      <GrievanceContactsSection />
    </div>
  );
}
