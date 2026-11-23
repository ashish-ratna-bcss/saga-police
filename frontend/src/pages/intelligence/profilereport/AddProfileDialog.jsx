import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { profileReportApi } from '../../../api/profileReport.api';
import ProfileAccountsEditor from '../../../components/ProfileAccountsEditor';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { publicText } from '../../../lib/publicError';
import { formatCount } from './reportFormat';

const POLL_MS = 3000;
const normalise = (slug) => (String(slug || '').toLowerCase() === 'twitter' ? 'x' : String(slug || '').toLowerCase());
const WORKING = ['pending', 'running'];

const errText = (err, fallback) => publicText(err?.response?.data?.message || err?.response?.data?.error || fallback, err?.response?.status);

const blankSlot = (platform) => ({
  key: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  profileId: null,
  accountId: null,
  isDraft: false,
  locked: false,
  platform: platform?.slug || '',
  data: Object.fromEntries((platform?.fields || []).map((f) => [f.key, ''])),
  preview: null,
  preview_data: null,
  fetching: false,
  fetchStatus: null,
  postsFetched: 0,
  pages: 0,
  fetchError: null,
});

/** A saved account of the profile being edited: shown as verified, read-only. */
const savedSlot = (account, platforms) => {
  const plat = platforms.find((p) => p.slug === account.platform) || platforms.find((p) => normalise(p.slug) === normalise(account.platform));
  return {
    ...blankSlot(plat),
    key: `acc-${account.id}`,
    accountId: account.id,
    isDraft: false,
    locked: true,
    platform: plat?.slug || account.platform,
    data: account.data || {},
    preview: account.preview || { name: account.handle },
    preview_data: { fetched_at: 'saved', summary: account.preview || null },
    fetchStatus: account.fetch_status,
    postsFetched: account.posts_fetched,
    pages: account.fetch_pages,
    fetchError: account.fetch_error,
  };
};

/** What a card says about the collection of its account's posts. */
const CollectionStatus = ({ account }) => {
  if (!account.accountId || !account.fetchStatus) return null;
  const n = formatCount(account.postsFetched);
  if (WORKING.includes(account.fetchStatus)) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-sky-700">
        <Loader2 className="h-3 w-3 animate-spin" />
        Collecting every post… <b className="tabular-nums">{n}</b> so far{account.pages ? ` · ${formatCount(account.pages)} pages` : ''}
      </p>
    );
  }
  if (account.fetchStatus === 'failed') {
    return (
      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-rose-700">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        <span>{account.fetchError || 'Collection stopped.'} {account.locked ? '' : 'Press Fetch to continue.'}</span>
      </p>
    );
  }
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700">
      <CheckCircle2 className="h-3 w-3" /> <b className="tabular-nums">{n}</b> posts collected
    </p>
  );
};

/**
 * Tools → Profile Report → Add profile (and Edit). The same form as Profiles → Add profile (shared editor), without a poll
 * interval: nothing here is monitored. Fetch resolves the account AND starts collecting all of its posts into the tenant's
 * own table; Save names the profile and keeps it; closing without Save throws the fetched accounts away again.
 *
 * @param {object[]} props.platforms  platforms that can be collected
 * @param {object|null} props.subject  the profile being edited (with its accounts), or null to add one
 * @param {(subject: object) => void} props.onSaved
 */
export default function AddProfileDialog({ open, onOpenChange, platforms, subject, onSaved }) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [draftId, setDraftId] = useState(null);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);
  const draftRef = useRef(null);
  draftRef.current = draftId;

  // Fresh form each time the dialog opens, and only then: the list behind it refreshes every few seconds,
  // and that must never wipe what someone is typing.
  const inputsRef = useRef({ subject, platforms });
  inputsRef.current = { subject, platforms };
  useEffect(() => {
    if (!open) return;
    const { subject: s, platforms: list } = inputsRef.current;
    savedRef.current = false;
    setSaving(false);
    if (s) {
      setName(s.display_name || '');
      setNotes(s.notes || '');
      setDraftId(s.id);
      setAccounts((s.accounts || []).filter((a) => !a.is_draft).map((a) => savedSlot(a, list)));
    } else {
      setName('');
      setNotes('');
      setDraftId(null);
      setAccounts([blankSlot(list[0])]);
    }
  }, [open]);

  // Live progress of the collections that are under way.
  const working = useMemo(() => accounts.some((a) => a.accountId && WORKING.includes(a.fetchStatus)), [accounts]);
  useEffect(() => {
    if (!open || !draftId || !working) return undefined;
    let alive = true;
    const tick = async () => {
      try {
        const res = await profileReportApi.get(draftId);
        if (!alive) return;
        const byId = new Map((res.data?.accounts || []).map((a) => [a.id, a]));
        setAccounts((prev) => prev.map((s) => {
          const live = s.accountId ? byId.get(s.accountId) : null;
          return live ? { ...s, fetchStatus: live.fetch_status, postsFetched: live.posts_fetched, pages: live.fetch_pages, fetchError: live.fetch_error } : s;
        }));
      } catch (e) { /* a missed tick is fine */ }
    };
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [open, draftId, working]);

  const update = useCallback((key, patch) => setAccounts((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a))), []);

  const addSlot = () => {
    const used = new Set(accounts.map((a) => normalise(a.platform)));
    setAccounts((prev) => [...prev, blankSlot(platforms.find((p) => !used.has(normalise(p.slug))) || platforms[0])]);
  };

  const removeSlot = async (key) => {
    const slot = accounts.find((a) => a.key === key);
    setAccounts((prev) => (prev.length <= 1 ? prev : prev.filter((a) => a.key !== key)));
    // A fetched but unsaved account stops collecting and its posts are deleted straight away.
    if (slot?.accountId && slot.isDraft) profileReportApi.removeDraftAccount(slot.accountId).catch(() => {});
  };

  const changePlatform = (key, slug) => {
    const slot = accounts.find((a) => a.key === key);
    if (slot?.locked) return;
    const plat = platforms.find((p) => p.slug === slug);
    update(key, { platform: slug, data: Object.fromEntries((plat?.fields || []).map((f) => [f.key, ''])), preview: null, preview_data: null });
  };

  const fetchAccount = async (key) => {
    const slot = accounts.find((a) => a.key === key);
    if (!slot?.platform) { toast.error('Select a platform'); return; }
    update(key, { fetching: true });
    try {
      // The identity was edited after an earlier Fetch: that earlier account is replaced, so stop collecting it.
      if (slot.accountId && slot.isDraft && !slot.preview_data) await profileReportApi.removeDraftAccount(slot.accountId).catch(() => {});
      const res = await profileReportApi.fetchAccount({ subject_id: draftRef.current || undefined, platform: slot.platform, data: slot.data });
      const d = res.data || {};
      setDraftId(d.subject_id);
      update(key, {
        fetching: false,
        data: { ...slot.data, ...(d.data_patch || {}) },
        preview: d.preview || null,
        preview_data: d.preview_data || null,
        accountId: d.account_id,
        isDraft: true,
        fetchStatus: d.fetch_status || 'pending',
        postsFetched: 0,
        pages: 0,
        fetchError: null,
      });
      setName((n) => n || d.preview?.name || '');
      toast.success('Details fetched', { description: 'Collecting every post of this account now.' });
    } catch (err) {
      update(key, { fetching: false, preview: null, preview_data: null });
      toast.error(errText(err, 'Fetch failed'));
    }
  };

  const everyFetched = accounts.length > 0 && accounts.every((a) => a.accountId && a.preview_data?.fetched_at);

  const save = async (e) => {
    e.preventDefault();
    if (!everyFetched) { toast.error('Fetch every platform before saving'); return; }
    setSaving(true);
    try {
      const res = await profileReportApi.save(draftId, {
        display_name: name,
        notes,
        account_ids: accounts.map((a) => a.accountId),
      });
      savedRef.current = true;
      toast.success(subject ? 'Profile updated' : 'Profile saved', { description: 'Posts are analysed in the background.' });
      onSaved?.(res.data);
      onOpenChange(false);
    } catch (err) {
      toast.error(errText(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  // Closing without Save: whatever was fetched in this dialog is removed again (a saved profile keeps its saved accounts).
  const close = (next) => {
    if (!next && !savedRef.current && draftRef.current) profileReportApi.discard(draftRef.current).catch(() => {});
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-3.5 text-left">
          <DialogTitle className="text-base">{subject ? 'Edit profile' : 'Add profile'}</DialogTitle>
          <DialogDescription className="text-xs">
            Fetch every platform, then Save. Fetch collects all posts of the account; nothing here is monitored.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Babulal Marandi" />
            </div>

            <ProfileAccountsEditor
              platforms={platforms}
              accounts={accounts}
              onAdd={addSlot}
              onRemove={removeSlot}
              onPlatformChange={changePlatform}
              onChange={update}
              onFetch={fetchAccount}
              renderExtra={(account) => <CollectionStatus account={account} />}
            />

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea rows={2} className="min-h-[52px] resize-none text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t bg-muted/30 px-5 py-3 sm:space-x-2">
            {!everyFetched ? (
              <p className="mr-auto hidden text-[11px] text-amber-700 sm:block">Fetch all platforms to enable Save</p>
            ) : (
              <span className="mr-auto" />
            )}
            <Button type="button" variant="outline" className="h-9" onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" className="h-9 min-w-[96px]" disabled={saving || !everyFetched}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
