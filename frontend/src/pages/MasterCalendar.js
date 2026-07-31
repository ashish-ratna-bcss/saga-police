import React, { useEffect, useMemo, useState, useCallback } from 'react';
import api from '../lib/api';
import { toast } from 'sonner';
import {
  CalendarDays, Plus, Pencil, Trash2, Search, Loader2, X
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';

const EMPTY_FORM = {
  occasion: '',
  date: '',
  monitoringRange: '',
  keywords: '',
  remarks: ''
};

export default function MasterCalendar() {
  // ── state ───────────────────────────────────────────────
  const [tab, setTab] = useState('recurring');          // 'recurring' | 'nonRecurring'
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── fetch ───────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/master-calendar', {
        params: { recurring: tab === 'recurring' ? 'true' : 'false' }
      });
      setEvents(res.data || []);
    } catch {
      toast.error('Failed to load calendar events');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ── filter ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.toLowerCase();
    return events.filter(e =>
      e.occasion?.toLowerCase().includes(q) ||
      e.keywords?.toLowerCase().includes(q) ||
      e.date?.toLowerCase().includes(q)
    );
  }, [events, search]);

  // ── form helpers ────────────────────────────────────────
  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (evt) => {
    setEditId(evt.id);
    setForm({
      occasion: evt.occasion || '',
      date: evt.date || '',
      monitoringRange: evt.monitoringRange || '',
      keywords: evt.keywords || '',
      remarks: evt.remarks || ''
    });
    setFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.occasion || !form.date) {
      toast.error('Occasion and Date are required');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/master-calendar/${editId}`, form);
        toast.success('Event updated');
      } else {
        await api.post('/master-calendar', {
          ...form,
          isRecurring: tab === 'recurring'
        });
        toast.success('Event created');
      }
      setFormOpen(false);
      setForm(EMPTY_FORM);
      setEditId(null);
      await fetchEvents();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this event?')) return;
    try {
      await api.delete(`/master-calendar/${id}`);
      toast.success('Event deleted');
      await fetchEvents();
    } catch {
      toast.error('Delete failed');
    }
  };

  // ── render ──────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold">HCP Master Calendar</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search occasions, keywords…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 w-60"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Add Event
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-3 flex gap-2">
        <button
          onClick={() => setTab('recurring')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            tab === 'recurring'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          Recurring Events
        </button>
        <button
          onClick={() => setTab('nonRecurring')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            tab === 'nonRecurring'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          Non-Recurring Events
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {search ? 'No matching events found' : 'No events yet — click "Add Event" to create one'}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-16 text-center">SL.NO</TableHead>
                  <TableHead>OCCASIONS</TableHead>
                  <TableHead className="w-36">DATE</TableHead>
                  <TableHead className="w-48">MONITORING RANGE</TableHead>
                  <TableHead>KEYWORDS</TableHead>
                  <TableHead>REMARKS</TableHead>
                  <TableHead className="w-24 text-center">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((evt) => (
                  <TableRow key={evt.id || evt._id}>
                    <TableCell className="text-center font-medium">{evt.slNo}</TableCell>
                    <TableCell className="font-medium">{evt.occasion}</TableCell>
                    <TableCell>{evt.date}</TableCell>
                    <TableCell>{evt.monitoringRange || '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {evt.keywords
                          ? evt.keywords.split(',').map((kw, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {kw.trim()}
                              </Badge>
                            ))
                          : '—'}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {evt.remarks || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEdit(evt)}
                          className="p-1 rounded hover:bg-muted"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleDelete(evt.id)}
                          className="p-1 rounded hover:bg-destructive/10"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Event' : 'Add Event'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="occasion">Occasion *</Label>
                <Input
                  id="occasion"
                  placeholder="e.g. Republic Day"
                  value={form.occasion}
                  onChange={(e) => setForm({ ...form, occasion: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  placeholder="e.g. 26 January"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="monitoringRange">Monitoring Range</Label>
                <Input
                  id="monitoringRange"
                  placeholder="e.g. 24 Jan – 28 Jan"
                  value={form.monitoringRange}
                  onChange={(e) => setForm({ ...form, monitoringRange: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                <Textarea
                  id="keywords"
                  placeholder="Republic Day, 26 January, parade"
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="remarks">Remarks</Label>
                <Input
                  id="remarks"
                  placeholder="Optional notes"
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editId ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
