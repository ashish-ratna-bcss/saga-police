import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { BookUser, Plus, Trash2, Pencil, Loader2, Search, Phone } from 'lucide-react';
import api from '../../lib/api';
import { toast } from 'sonner';

const emptyForm = { name: '', phone: '', department: '', designation: '' };

export function GrievanceContactsSection() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [removingId, setRemovingId] = useState(null);

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

  const startAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const startEdit = (contact) => {
    setEditingId(contact.id);
    setForm({
      name: contact.name || '',
      phone: contact.phone || '',
      department: contact.department || '',
      designation: contact.designation || '',
    });
    setOpen(true);
  };

  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next) {
      setEditingId(null);
      setForm(emptyForm);
    }
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
      handleOpenChange(false);
      await fetchContacts();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact) => {
    if (!window.confirm(`Remove ${contact.name}?`)) return;
    setRemovingId(contact.id);
    try {
      await api.delete(`/grievance-workflow/contacts/${contact.id}`);
      toast.success('Contact removed');
      await fetchContacts();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to remove contact');
    } finally {
      setRemovingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.name, c.phone, c.department, c.designation].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [contacts, search]);

  const field = (key) => ({
    value: form[key],
    onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden w-full shadow-sm">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <BookUser className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold leading-none text-foreground">Contacts</h3>
            <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
              {contacts.length}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Officers and department staff that grievance reports can be routed or forwarded to on WhatsApp.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={startAdd}>
          <Plus className="h-3.5 w-3.5" />
          Add contact
        </Button>
      </div>

      {contacts.length > 4 && (
        <div className="border-b border-border px-4 py-2.5">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or department…" className="h-8 pl-8 text-xs" />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-xs">Loading contacts…</span>
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
          <BookUser className="h-6 w-6 text-primary/60" />
          <p className="text-sm font-semibold">No contacts yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Add the officers who should receive forwarded grievance reports. You can pick them when you send a report.
          </p>
          <Button size="sm" className="mt-1 h-8 gap-1.5 text-xs" onClick={startAdd}>
            <Plus className="h-3.5 w-3.5" /> Add contact
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="text-[11px]">
              <TableHead className="h-9 pl-4">Name</TableHead>
              <TableHead className="h-9">Phone</TableHead>
              <TableHead className="h-9">Department</TableHead>
              <TableHead className="h-9 pr-4 w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-xs text-muted-foreground">
                  No contacts match your search.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((c) => (
              <TableRow key={c.id} className="text-xs">
                <TableCell className="py-2.5 pl-4">
                  <p className="text-sm font-semibold text-foreground">{c.name}</p>
                  {c.designation && <p className="text-[11px] text-muted-foreground">{c.designation}</p>}
                </TableCell>
                <TableCell className="py-2.5">
                  <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground">
                    <Phone className="h-3 w-3 text-primary/70" />
                    {c.phone}
                  </span>
                </TableCell>
                <TableCell className="py-2.5 text-muted-foreground">{c.department || '—'}</TableCell>
                <TableCell className="py-2.5 pr-4">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(c)} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground" title="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c)} disabled={removingId === c.id}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" title="Remove">
                      {removingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit contact' : 'Add contact'}</DialogTitle>
            <DialogDescription>Name and phone are required. The phone number is used to forward reports on WhatsApp.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="gc_name">Name</Label>
              <Input id="gc_name" placeholder="Officer name" required {...field('name')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gc_phone">Phone</Label>
              <Input id="gc_phone" placeholder="+91 98765 43210" required {...field('phone')} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="gc_dept">Department <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="gc_dept" placeholder="e.g. Traffic" {...field('department')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gc_desig">Designation <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="gc_desig" placeholder="e.g. Inspector" {...field('designation')} />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? 'Save changes' : 'Add contact'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default GrievanceContactsSection;
