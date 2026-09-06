import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, Check, X, Search, UserPlus } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '../ui/dialog';
import { cn } from '../../lib/utils';

const emptyForm = { name: '', phone: '', department: '', designation: '' };

export function ManageContactsDialog({ open, onOpenChange }) {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/grievance-workflow/contacts');
      setContacts(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchContacts();
      setSearch('');
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    }
  }, [open, fetchContacts]);

  const filtered = contacts.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [c.name, c.phone, c.department, c.designation]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const startAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const startEdit = (contact) => {
    setEditingId(contact.id);
    setForm({
      name: contact.name || '',
      phone: contact.phone || '',
      department: contact.department || '',
      designation: contact.designation || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
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
      toast.error(err?.response?.data?.error || 'Failed to save contact');
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 py-3 border-b border-border shrink-0">
          <DialogTitle className="text-base">Manage contacts</DialogTitle>
          <DialogDescription className="text-xs">
            Officers and departments used when sharing G / S / C reports on WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, department…"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={startAdd}>
            <UserPlus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {showForm && (
          <div className="px-4 py-2.5 border-b border-border bg-muted/20 space-y-2 shrink-0">
            <p className="text-[11px] font-medium text-muted-foreground">
              {editingId ? 'Edit contact' : 'New contact'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Name *"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Phone *"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Department"
                value={form.department}
                onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
                className="h-8 text-xs"
              />
              <Input
                placeholder="Designation"
                value={form.designation}
                onChange={(e) => setForm((p) => ({ ...p, designation: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex justify-end gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setShowForm(false); setEditingId(null); }}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 px-4">
              <p className="text-sm font-medium">No contacts yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add officers so reports can be shared on WhatsApp.
              </p>
              <Button size="sm" variant="outline" className="mt-3 h-8 text-xs gap-1.5" onClick={startAdd}>
                <Plus className="h-3.5 w-3.5" />
                Add contact
              </Button>
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border border-border px-2.5 py-2',
                    editingId === c.id && 'border-primary bg-primary/5'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{c.name}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">{c.phone}</p>
                    {(c.department || c.designation) && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {[c.designation, c.department].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Edit"
                      onClick={() => startEdit(c)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-rose-600"
                      title="Remove"
                      onClick={() => handleDelete(c)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ManageContactsDialog;
