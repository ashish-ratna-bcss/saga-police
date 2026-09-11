import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import {
  BookUser,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Check,
  X,
  Search,
  Phone,
  Building,
} from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';

const emptyForm = { name: '', phone: '', department: '', designation: '' };

export function GrievanceContactsSection() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/grievance-workflow/contacts');
      setContacts(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleStartAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const handleStartEdit = (contact) => {
    setEditingId(contact.id);
    setForm({
      name: contact.name || '',
      phone: contact.phone || '',
      department: contact.department || '',
      designation: contact.designation || '',
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/grievance-workflow/contacts/${editingId}`, form);
        toast.success('Contact updated');
      } else {
        await api.post('/grievance-workflow/contacts', form);
        toast.success('Contact added');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await fetchContacts();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact) => {
    if (!window.confirm(`Remove ${contact.name}?`)) return;
    try {
      await api.delete(`/grievance-workflow/contacts/${contact.id}`);
      toast.success('Contact removed');
      await fetchContacts();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to remove contact');
    }
  };

  const filtered = contacts.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.phone, c.department, c.designation]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden w-full shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <BookUser className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold leading-none text-foreground">Grievance Contacts</h3>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-medium">
                {contacts.length} total
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Officers and departmental personnel for routing and forwarding WhatsApp grievance reports.
            </p>
          </div>
        </div>
        {!showForm && (
          <Button size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={handleStartAdd}>
            <Plus className="h-3.5 w-3.5" />
            Add Contact
          </Button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {showForm && (
          <form onSubmit={handleSave} className="p-3 border border-border rounded-lg bg-muted/10 space-y-3">
            <p className="text-xs font-semibold text-foreground">
              {editingId ? 'Edit Contact' : 'New Contact'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Name *</label>
                <Input
                  placeholder="Officer name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-8 text-xs mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Phone *</label>
                <Input
                  placeholder="+91 98765 43210"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="h-8 text-xs mt-1"
                  required
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Department</label>
                <Input
                  placeholder="e.g. Cyber Cell / Traffic"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground">Designation</label>
                <Input
                  placeholder="e.g. ACP / Inspector"
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="h-8 text-xs gap-1.5" disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {editingId ? 'Update Contact' : 'Save Contact'}
              </Button>
            </div>
          </form>
        )}

        {contacts.length > 3 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, phone, or department…"
              className="h-8 pl-8 text-xs bg-muted/30"
            />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs">Loading contacts…</span>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
            {search ? 'No contacts match your search.' : 'No grievance contacts added yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 bg-background hover:bg-muted/20 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
                    {c.designation && (
                      <span className="text-[10px] text-muted-foreground truncate">({c.designation})</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3 text-primary/70" />
                      {c.phone}
                    </span>
                    {c.department && (
                      <span className="inline-flex items-center gap-1">
                        <Building className="h-3 w-3 text-primary/70" />
                        {c.department}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleStartEdit(c)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(c)}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default GrievanceContactsSection;
