import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  UserPlus, Search, Pencil, Trash2, Loader2, Shield, Mail, AtSign, KeyRound, Users,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
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

const roleBadgeClass = (role) => {
  const r = String(role || '').toLowerCase();
  if (r === 'superadmin') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  if (r === 'admin') return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
  return 'bg-muted text-muted-foreground border-border';
};

const emptyForm = () => ({
  full_name: '',
  username: '',
  email: '',
  password: '',
  role: 'user',
});

const PAGE_SIZE_OPTIONS = [8, 10, 20];

const UsersManagement = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const canManage = Boolean(user?.can_manage_users);

  // Server-filtered: only roles this actor's own role is allowed to hand out
  // (see roles.assignable_by — set per-role in Roles Management → "Visible to").
  const assignableRoles = useMemo(() => (Array.isArray(roles) ? roles : []), [roles]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes, rolesRes] = await Promise.all([
        api.get('/users'),
        api.get('/roles/assignable').catch(() => ({ data: [] })),
      ]);
      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.name, u.username, u.email, u.role, u.role_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [users, query]);

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
    setForm({ ...emptyForm(), role: assignableRoles[0]?.slug || 'user' });
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setForm({
      full_name: row.name || '',
      username: row.username || '',
      email: row.email || '',
      password: '',
      role: row.role || 'user',
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const payload = {
          full_name: form.full_name,
          username: form.username,
          email: form.email,
          role: form.role,
        };
        if (form.password.trim()) payload.password = form.password;
        await api.put(`/users/${editing.id}`, payload);
        toast.success('User updated');
      } else {
        await api.post('/users', form);
        toast.success('User created');
      }
      setModalOpen(false);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete user "${row.name || row.username}"?`)) return;
    setDeletingId(row.id);
    try {
      await api.delete(`/users/${row.id}`);
      toast.success('User deleted');
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
          <h1 className="font-heading text-xl font-bold tracking-wide sm:text-2xl">Users</h1>
          <p className="text-sm text-muted-foreground">
            {users.length} accounts · {filtered.length} matching
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <Button onClick={openCreate} size="sm" className="h-9 shrink-0 gap-1.5">
            <UserPlus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 z-10 border-b bg-muted/95 text-left text-[11px] uppercase tracking-wider text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2.5 font-medium">User</th>
                <th className="px-3 py-2.5 font-medium">Username</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="hidden px-3 py-2.5 font-medium md:table-cell">Created</th>
                <th className="px-3 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-16 text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Loading…
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-16 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              ) : (
                paged.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 last:border-0 hover:bg-muted/25">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                          {(row.name || row.username || '?')
                            .split(/\s+/)
                            .map((p) => p[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{row.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">@{row.username}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={`h-5 gap-1 px-1.5 text-[10px] ${roleBadgeClass(row.role)}`}>
                        <Shield className="h-3 w-3" />
                        {row.role_name || row.role}
                      </Badge>
                    </td>
                    <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">
                      {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600 hover:bg-red-500/10"
                          disabled={deletingId === row.id || row.id === user.id}
                          onClick={() => handleDelete(row)}
                          aria-label="Delete user"
                        >
                          {deletingId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit user' : 'Create user'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Update account details and role.'
                : 'Password must be at least 8 characters.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <div className="relative">
                <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="full_name"
                  className="pl-9"
                  placeholder="e.g. Ravi Kumar"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  className="pl-9"
                  placeholder="e.g. ravikumar"
                  autoComplete="username"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  className="pl-9"
                  placeholder="name@example.com"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">
                Password {editing ? <span className="text-muted-foreground">(optional)</span> : null}
              </Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  className="pl-9"
                  placeholder={editing ? 'Leave blank to keep current' : 'At least 8 characters'}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required={!editing}
                  minLength={editing && !form.password ? undefined : 8}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(value) => setForm((f) => ({ ...f, role: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r.id || r.slug} value={r.slug}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

export default UsersManagement;
