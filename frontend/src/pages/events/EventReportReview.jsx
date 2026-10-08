import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, AlertTriangle, RotateCcw, Save, Trash2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { ScrollArea } from '../../components/ui/scroll-area';

const blank = { bottomLine: '', issueLink: '', strands: [], known: [], notKnown: [], actions: [] };
const fromServer = (c) => ({
  bottomLine: c?.bottomLine || '',
  issueLink: c?.issueLink || '',
  strands: (c?.strands || []).map((x) => ({ title: x.title || '', who: x.who || '', demand: x.demand || '', status: x.status || '', posts: x.posts || [] })),
  known: (c?.known || []).map((x) => ({ text: x.text || '', posts: x.posts || [] })),
  notKnown: (c?.notKnown || []).map((x) => (typeof x === 'string' ? x : x.text || '')),
  actions: (c?.actions || []).map((x) => ({ action: x.action || '', detail: x.detail || '', posts: x.posts || [] })),
});

const Field = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-3">
      <label className="text-xs font-semibold text-foreground">{label}</label>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
    {children}
  </div>
);

/**
 * Review and approval of a generated report. A person edits the opening text, the issue strands, what is known and not known,
 * and the actions; the automatic checks are listed; approving stamps who approved and when. Edits are saved with the report
 * and printed on top of the generated text. Regenerating the report starts a new draft.
 */
export default function EventReportReview({ open, onOpenChange, eventId, tenantName, onChange }) {
  const [view, setView] = useState(null);
  const [form, setForm] = useState(blank);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(false);
  const [ack, setAck] = useState({});

  const apply = useCallback((data) => {
    setView(data);
    setForm(fromServer(data.current));
    setDirty(false);
    onChange?.(data.review);
  }, [onChange]);

  const load = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const res = await api.get(`/events/${eventId}/summary-llm/review`, { params: { tenant: tenantName } });
      apply(res.data);
      setAck({});
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not load the review');
    } finally {
      setLoading(false);
    }
  }, [eventId, tenantName, apply]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const setItem = (key, i, patch) => set({ [key]: form[key].map((x, j) => (j === i ? (typeof x === 'string' ? patch : { ...x, ...patch }) : x)) });
  const removeItem = (key, i) => set({ [key]: form[key].filter((_, j) => j !== i) });
  const addItem = (key, item) => set({ [key]: [...form[key], item] });

  const save = async () => {
    setBusy('save');
    try {
      const res = await api.put(`/events/${eventId}/summary-llm/review`, { edits: form }, { params: { tenant: tenantName } });
      apply(res.data);
      toast.success('Saved as draft');
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not save');
      return false;
    } finally {
      setBusy('');
    }
  };

  const approve = async () => {
    if (dirty && !(await save())) return;
    setBusy('approve');
    try {
      const acknowledge = Object.keys(ack).filter((k) => ack[k]);
      const res = await api.post(`/events/${eventId}/summary-llm/review/approve`, { acknowledge }, { params: { tenant: tenantName } });
      apply(res.data);
      toast.success('Report approved');
    } catch (err) {
      const issues = err?.response?.data?.issues;
      toast.error(issues?.length ? 'Fix or tick the problems marked "Fix" first' : (err?.response?.data?.message || 'Could not approve'));
    } finally {
      setBusy('');
    }
  };

  const reopen = async () => {
    setBusy('reopen');
    try {
      const res = await api.post(`/events/${eventId}/summary-llm/review/reopen`, {}, { params: { tenant: tenantName } });
      apply(res.data);
      toast.success('Back to draft');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not reopen');
    } finally {
      setBusy('');
    }
  };

  const review = view?.review;
  const approved = review?.status === 'approved';
  const issues = view?.quality?.issues || [];
  const errors = useMemo(() => issues.filter((i) => i.level === 'error'), [issues]);
  const canApprove = !approved && !busy && errors.every((e) => ack[e.code]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle className="text-base">Review and approve report</DialogTitle>
            {review ? (
              <Badge variant="outline" className={approved ? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300' : 'border-amber-500/40 text-amber-700 dark:text-amber-300'}>
                {approved ? 'Approved' : 'Draft'} · v{review.version}
              </Badge>
            ) : null}
          </div>
          <DialogDescription className="text-xs">
            Edit the text people read first. Your changes are printed on top of the generated text. {approved
              ? `Approved by ${review.approvedBy || '—'}${review.approvedAt ? ` on ${new Date(review.approvedAt).toLocaleString()}` : ''}. Editing returns it to draft.`
              : 'The PDF carries a DRAFT mark until you approve.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[68vh]">
          <div className="px-6 py-4 space-y-5">
            {loading && !view ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : null}

            {issues.length ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle className="h-3.5 w-3.5" /> Automatic checks ({issues.length})</div>
                {issues.map((i, idx) => (
                  <div key={`${i.code}-${idx}`} className="flex items-start gap-2 text-xs">
                    {i.level === 'error' ? (
                      <Checkbox checked={Boolean(ack[i.code])} onCheckedChange={(v) => setAck((a) => ({ ...a, [i.code]: Boolean(v) }))} className="mt-0.5" title="I have checked this" />
                    ) : <span className="w-4" />}
                    <span><b className={i.level === 'error' ? 'text-red-600' : 'text-amber-700 dark:text-amber-300'}>{i.level === 'error' ? 'Fix' : 'Check'}</b> {i.where ? `${i.where}: ` : ''}{i.message}</span>
                  </div>
                ))}
                {errors.length ? <p className="text-[11px] text-muted-foreground pt-1">Tick a problem only after you have checked it. Approval needs each one fixed or ticked.</p> : null}
              </div>
            ) : view ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /> The automatic checks found nothing to fix.</div>
            ) : null}

            <Field label="Bottom line" hint="2–3 sentences: what is happening, where, who is behind it, what to do">
              <Textarea value={form.bottomLine} onChange={(e) => set({ bottomLine: e.target.value })} rows={4} />
            </Field>

            <Field label="What the issue is" hint="Separate stories that overlap in these posts">
              <div className="space-y-2">
                {form.strands.map((x, i) => (
                  <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-2 rounded-md border p-2">
                    <Input placeholder="Strand" value={x.title} onChange={(e) => setItem('strands', i, { title: e.target.value })} />
                    <Input placeholder="Who" value={x.who} onChange={(e) => setItem('strands', i, { who: e.target.value })} />
                    <Input placeholder="What they ask or do" value={x.demand} onChange={(e) => setItem('strands', i, { demand: e.target.value })} />
                    <div className="flex gap-1.5">
                      <Input placeholder="Where it stands" value={x.status} onChange={(e) => setItem('strands', i, { status: e.target.value })} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem('strands', i)} title="Remove"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
                {form.strands.length < 4 ? (
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addItem('strands', { title: '', who: '', demand: '', status: '', posts: [] })}><Plus className="h-3 w-3" /> Add strand</Button>
                ) : null}
                <Input placeholder="One sentence on what connects them (optional)" value={form.issueLink} onChange={(e) => set({ issueLink: e.target.value })} />
              </div>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="What we know" hint="Only what the posts confirm">
                <div className="space-y-1.5">
                  {form.known.map((x, i) => (
                    <div key={i} className="flex gap-1.5">
                      <Input value={x.text} onChange={(e) => setItem('known', i, { text: e.target.value })} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem('known', i)} title="Remove"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addItem('known', { text: '', posts: [] })}><Plus className="h-3 w-3" /> Add</Button>
                </div>
              </Field>
              <Field label="What we do not know yet" hint="Open questions">
                <div className="space-y-1.5">
                  {form.notKnown.map((x, i) => (
                    <div key={i} className="flex gap-1.5">
                      <Input value={x} onChange={(e) => setItem('notKnown', i, e.target.value)} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem('notKnown', i)} title="Remove"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addItem('notKnown', '')}><Plus className="h-3 w-3" /> Add</Button>
                </div>
              </Field>
            </div>

            <Field label="Recommended actions" hint="Who does what, where, and the trigger to escalate">
              <div className="space-y-2">
                {form.actions.map((x, i) => (
                  <div key={i} className="rounded-md border p-2 space-y-1.5">
                    <div className="flex gap-1.5">
                      <Input placeholder="Action and unit" value={x.action} onChange={(e) => setItem('actions', i, { action: e.target.value })} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeItem('actions', i)} title="Remove"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <Textarea rows={2} placeholder="What exactly is done, and 'Escalate if …'" value={x.detail} onChange={(e) => setItem('actions', i, { detail: e.target.value })} />
                  </div>
                ))}
                {form.actions.length < 8 ? (
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addItem('actions', { action: '', detail: '', posts: [] })}><Plus className="h-3 w-3" /> Add action</Button>
                ) : null}
              </div>
            </Field>

            {review?.history?.length ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer font-semibold">History ({review.history.length})</summary>
                <ul className="mt-1.5 space-y-0.5">
                  {[...review.history].reverse().slice(0, 8).map((h, i) => (
                    <li key={i}>{new Date(h.at).toLocaleString()} · {h.by} · {h.event}{h.note ? ` · ${h.note}` : ''}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 px-6 py-3 border-t bg-muted/30">
          <span className="text-[11px] text-muted-foreground">{dirty ? 'Unsaved changes' : 'Saved'}</span>
          <div className="flex items-center gap-2">
            {approved ? (
              <Button variant="outline" size="sm" onClick={reopen} disabled={Boolean(busy)} className="gap-1.5">
                {busy === 'reopen' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Reopen as draft
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={save} disabled={!dirty || Boolean(busy)} className="gap-1.5">
              {busy === 'save' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save draft
            </Button>
            <Button size="sm" onClick={approve} disabled={!canApprove} className="gap-1.5">
              {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
