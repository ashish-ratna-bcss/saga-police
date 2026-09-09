import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  UserPlus, Search, Pencil, Trash2, Loader2, Shield, Mail, AtSign, KeyRound, Users,
  ChevronLeft, ChevronRight, Upload, Wand2, Eye, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/api';
import { useAuth } from '../../context/auth.context';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';


const generateRandomPassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let pass = '';
  for (let i = 0; i < 12; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
};

const roleBadgeClass = (role) => {
  const r = String(role || '').toLowerCase();
  if (r === 'superadmin') return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
  if (r === 'admin') return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
  return 'bg-muted text-muted-foreground border-border';
};

const emptyForm = (currentUser) => ({
  full_name: '',
  username: '',
  email: '',
  password: '',
  role: 'user',
  blurasagatitle: currentUser?.blurasagatitle || 'BLURA SAGA',
  blurasagadescription: currentUser?.blurasagadescription || 'Cyber Intelligence Platform',
  blurasagalogo: currentUser?.blurasagalogo || '/blura_saga_logo.jpg',
  theme_color: currentUser?.theme_color || 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)',
});

const PAGE_SIZE_OPTIONS = [8, 10, 20];

const UsersManagement = () => {
  const { user, fetchMe } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm(user));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showPassword, setShowPassword] = useState(true);

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
    let list = users;
    // For admin, filter list to show ONLY standard users created by this admin
    if (user?.role === 'admin') {
      list = list.filter(
        (u) => u.role !== 'superadmin' && u.role !== 'admin' && (u.created_by === user.id || u.created_by == null)
      );
    }
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) =>
      [u.name, u.username, u.email, u.role, u.role_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [users, query, user?.role, user?.id]);

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
    setForm({
      ...emptyForm(user),
      role: assignableRoles[0]?.slug || 'user',
      password: generateRandomPassword(),
    });
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
      blurasagatitle: row.blurasagatitle || user?.blurasagatitle || 'BLURA SAGA',
      blurasagadescription: row.blurasagadescription || user?.blurasagadescription || 'Cyber Intelligence Platform',
      blurasagalogo: row.blurasagalogo || user?.blurasagalogo || '/blura_saga_logo.jpg',
      theme_color: row.theme_color || user?.theme_color || 'linear-gradient(135deg, #0f172a 0%, #38bdf8 100%)',
    });
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name,
        username: form.username,
        email: form.email,
        role: form.role,
        blurasagatitle: form.blurasagatitle,
        blurasagadescription: form.blurasagadescription,
        blurasagalogo: form.blurasagalogo,
        theme_color: form.theme_color,
      };
      if (form.password.trim()) payload.password = form.password;

      if (editing) {
        await api.put(`/users/${editing.id}`, payload);
        toast.success('User updated');
        if (user && editing.id === user.id && typeof fetchMe === 'function') {
          await fetchMe({ bypassCache: true });
        }
      } else {
        await api.post('/users', payload);
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

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    const formData = new FormData();
    formData.append('files', file);

    try {
      setUploadingLogo(true);
      const res = await api.post('/uploads/s3', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.uploads?.length > 0) {
        const uploadedUrl = res.data.uploads[0].url;
        setForm((f) => ({ ...f, blurasagalogo: uploadedUrl }));
        toast.success('Logo uploaded successfully');
      }
    } catch (error) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((f) => ({ ...f, blurasagalogo: reader.result }));
        toast.success('Logo uploaded');
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingLogo(false);
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
        <DialogContent className="sm:max-w-md max-h-[88vh] overflow-y-auto custom-scrollbar">
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
            {!editing && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, password: generateRandomPassword() }))}
                    className="flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                  >
                    <Wand2 className="h-3 w-3" />
                    Auto-generate
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="pl-9 pr-9 font-mono text-xs"
                    placeholder="Auto-generated password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
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

            {(form.role === 'superadmin' || form.role === 'admin') && (
              <div className="pt-3 border-t space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Blura Saga Branding</span>
                  <span className="text-[10px] font-semibold text-primary">Custom Title & Logo</span>
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="blurasagatitle">Blura Saga Title</Label>
                  <Input
                    id="blurasagatitle"
                    placeholder="e.g. BLURA SAGA"
                    value={form.blurasagatitle}
                    onChange={(e) => setForm((f) => ({ ...f, blurasagatitle: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="blurasagadescription">Blura Saga Description</Label>
                  <Input
                    id="blurasagadescription"
                    placeholder="e.g. Cyber Intelligence Platform"
                    value={form.blurasagadescription}
                    onChange={(e) => setForm((f) => ({ ...f, blurasagadescription: e.target.value }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="blurasagalogo">Blura Saga Logo Upload / Path</Label>
                  <div className="flex items-center gap-2">
                    {form.blurasagalogo && (
                      <img
                        src={form.blurasagalogo}
                        alt="Logo preview"
                        className="h-9 w-9 rounded-lg border border-border object-cover shrink-0 bg-muted/30"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <Input
                      id="blurasagalogo"
                      placeholder="e.g. /blura_saga_logo.jpg or upload"
                      value={form.blurasagalogo}
                      onChange={(e) => setForm((f) => ({ ...f, blurasagalogo: e.target.value }))}
                      className="flex-1"
                    />
                    <Label
                      htmlFor="logo-file-upload"
                      className="cursor-pointer inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground shrink-0 gap-1.5"
                    >
                      {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Upload
                    </Label>
                    <input
                      id="logo-file-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                    />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0 pt-2">
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
