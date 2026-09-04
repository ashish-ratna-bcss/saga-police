import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  ShieldCheck, Plus, Search, Pencil, Trash2, Loader2, Lock, Check, Crown,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Switch } from '../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

const emptyForm = () => ({
  name: '',
  slug: '',
  allowed_pages: [],
  can_manage_users: false,
  assignable_by: ['superadmin'],
});

const PAGE_SIZE_OPTIONS = [8, 10, 20];

const RolesManagement = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [catalogPages, setCatalogPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const canManage = Boolean(user?.can_manage_roles);

  const pageNameByPath = useMemo(() => {
    const map = {};
    for (const p of catalogPages) {
      map[p.path] = p.name || p.label || p.path;
    }
    return map;
  }, [catalogPages]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [rolesRes, pagesRes] = await Promise.all([
        api.get('/roles'),
        api.get('/pages').catch(() => ({ data: [] })),
      ]);
      setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
      setCatalogPages(Array.isArray(pagesRes.data) ? pagesRes.data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) =>
      [r.name, r.slug].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [roles, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage(1);
  }, [query, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, filtered.length);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (role) => {
    setEditing(role);
    setForm({
      name: role.name || '',
      slug: role.slug || '',
      allowed_pages: Array.isArray(role.allowed_pages) ? [...role.allowed_pages] : [],
      can_manage_users: Boolean(role.can_manage_users),
      assignable_by: Array.isArray(role.assignable_by) && role.assignable_by.length
        ? [...role.assignable_by]
        : ['superadmin'],
    });
    setModalOpen(true);
  };

  // Roles that can hand out other roles at all — these are the only ones
  // whose "Add user" form the new/edited role's visibility could matter to.
  const managerRoles = useMemo(
    () => roles.filter((r) => r.can_manage_users),
    [roles]
  );

  const toggleAssignableBy = (slug) => {
    if (slug === 'superadmin') return; // superadmin can always assign every role
    setForm((prev) => {
      const has = prev.assignable_by.includes(slug);
      return {
        ...prev,
        assignable_by: has
          ? prev.assignable_by.filter((s) => s !== slug)
          : [...prev.assignable_by, slug],
      };
    });
  };

  const togglePage = (path) => {
    setForm((prev) => {
      const has = prev.allowed_pages.includes(path);
      return {
        ...prev,
        allowed_pages: has
          ? prev.allowed_pages.filter((p) => p !== path)
          : [...prev.allowed_pages, path],
      };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const payload = {
          name: form.name,
          allowed_pages: form.allowed_pages,
          assignable_by: form.assignable_by,
        };
        if (!editing.is_system) {
          payload.slug = form.slug;
          payload.can_manage_users = form.can_manage_users;
        }
        await api.put(`/roles/${editing.id}`, payload);
        toast.success('Role updated');
      } else {
        await api.post('/roles', {
          name: form.name,
          slug: form.slug || form.name,
          allowed_pages: form.allowed_pages,
          can_manage_users: form.can_manage_users,
          assignable_by: form.assignable_by,
        });
        toast.success('Role created');
      }
      setModalOpen(false);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role) => {
    if (role.is_system) {
      toast.error('System roles cannot be deleted');
      return;
    }
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    setDeletingId(role.id);
    try {
      await api.delete(`/roles/${role.id}`);
      toast.success('Role deleted');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) return null;
  if (!canManage) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[420px] flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-bold tracking-wide sm:text-2xl">Roles</h1>
          <p className="text-sm text-muted-foreground">
            {roles.length} roles · {roles.filter((r) => r.is_system).length} system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-52">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <Button onClick={openCreate} size="sm" className="h-9 shrink-0 gap-1.5">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 border-b bg-muted/95 text-left text-[11px] uppercase tracking-wider text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Access</th>
                <th className="px-3 py-2.5 font-medium">Pages</th>
                <th className="px-3 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-16 text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Loading…
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-16 text-center text-muted-foreground">
                    No roles found
                  </td>
                </tr>
              ) : (
                paged.map((role) => {
                  const pageLabels = (role.allowed_pages || []).map(
                    (path) => pageNameByPath[path] || path.replace(/^\//, '')
                  );
                  return (
                    <tr key={role.id} className="border-b border-border/60 last:border-0 hover:bg-muted/25">
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            {role.is_system ? (
                              <Crown className="h-3.5 w-3.5" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium">{role.name}</span>
                              {role.is_system && (
                                <Badge
                                  variant="outline"
                                  className="h-5 border-amber-500/25 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300"
                                >
                                  System
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">{role.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2.5 align-middle sm:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {role.can_manage_users && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              Users
                            </span>
                          )}
                          {role.can_manage_roles && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              Roles
                            </span>
                          )}
                          {!role.can_manage_users && !role.can_manage_roles && (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <p className="max-w-[280px] text-xs text-muted-foreground line-clamp-2">
                          <span className="font-medium text-foreground">
                            {(role.allowed_pages || []).length}
                          </span>
                          {' · '}
                          {pageLabels.slice(0, 4).join(', ')}
                          {pageLabels.length > 4 ? ` +${pageLabels.length - 4}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 px-2.5"
                            onClick={() => openEdit(role)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:bg-red-500/10"
                            disabled={role.is_system || deletingId === role.id}
                            onClick={() => handleDelete(role)}
                            aria-label="Delete role"
                          >
                            {deletingId === role.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t bg-muted/30 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Showing {rangeStart}–{rangeEnd} of {filtered.length}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Rows</span>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => setPageSize(Number(v))}
              >
                <SelectTrigger className="h-8 w-[72px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[4.5rem] text-center text-xs tabular-nums text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit role' : 'Create role'}</DialogTitle>
            <DialogDescription>
              {editing?.is_system
                ? 'Update page access for this system role.'
                : 'Set name, slug, and module access.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="role_name">Name</Label>
                <Input
                  id="role_name"
                  placeholder="e.g. Analyst"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role_slug">Slug</Label>
                <div className="relative">
                  {editing?.is_system && (
                    <Lock className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  )}
                  <Input
                    id="role_slug"
                    value={form.slug}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        slug: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                      }))
                    }
                    disabled={Boolean(editing?.is_system)}
                    required={!editing}
                    placeholder="analyst"
                  />
                </div>
              </div>
            </div>

            {!editing?.is_system && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">Can manage users</p>
                  <p className="text-[11px] text-muted-foreground">Create and edit accounts</p>
                </div>
                <Switch
                  checked={form.can_manage_users}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, can_manage_users: checked }))
                  }
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Visible to</Label>
              <p className="text-[11px] text-muted-foreground">
                Who can select this role when adding or editing a user.
              </p>
              <div className="space-y-1 rounded-md border p-1.5">
                <div className="flex items-center justify-between rounded px-2.5 py-1.5 text-sm">
                  <span className="font-medium text-foreground">Super Admin</span>
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                </div>
                {managerRoles
                  .filter((r) => r.slug !== 'superadmin')
                  .map((r) => {
                    const selected = form.assignable_by.includes(r.slug);
                    return (
                      <button
                        key={r.id || r.slug}
                        type="button"
                        onClick={() => toggleAssignableBy(r.slug)}
                        className={`flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-sm transition ${
                          selected
                            ? 'bg-primary/10 text-foreground'
                            : 'text-muted-foreground hover:bg-muted/70'
                        }`}
                      >
                        <span className="truncate font-medium text-foreground">{r.name}</span>
                        {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Allowed pages</Label>
                <span className="text-[11px] text-muted-foreground">
                  {form.allowed_pages.length} selected
                </span>
              </div>
              <div className="grid max-h-60 grid-cols-1 gap-1 overflow-y-auto rounded-md border p-1.5 sm:grid-cols-2">
                {catalogPages.length === 0 ? (
                  <p className="col-span-full px-2 py-6 text-center text-xs text-muted-foreground">
                    No pages catalog
                  </p>
                ) : (
                  catalogPages.map((pageItem) => {
                    const selected = form.allowed_pages.includes(pageItem.path);
                    return (
                      <button
                        key={pageItem.path}
                        type="button"
                        onClick={() => togglePage(pageItem.path)}
                        className={`flex items-center justify-between rounded px-2.5 py-2 text-left text-sm transition ${
                          selected
                            ? 'bg-primary/10 text-foreground'
                            : 'text-muted-foreground hover:bg-muted/70'
                        }`}
                      >
                        <span className="truncate font-medium text-foreground">
                          {pageItem.name || pageItem.label || pageItem.path}
                        </span>
                        {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editing ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RolesManagement;
