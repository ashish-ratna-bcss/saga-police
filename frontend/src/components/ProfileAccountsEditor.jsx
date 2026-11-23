import React from 'react';
import { Download, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

/** Fields the platform fills in itself after Fetch; they are never typed. */
export const HIDDEN_FIELD_KEYS = new Set(['page_id', 'user_id', 'channel_id']);

/**
 * The "Platforms" part of the Add / Edit profile dialog: one card per platform account with its identity field(s),
 * a Fetch button and the fetched identity card. Shared by Profiles → Add profile and Tools → Profile Report, so the
 * two dialogs are the same form.
 *
 * An account is { key, profileId, platform, data, preview, preview_data, fetching, locked? }. The parent owns the list and
 * answers the callbacks; this component only draws it. A locked account (already saved) is shown but cannot be edited or re-fetched.
 *
 * @param {object[]} props.platforms      platforms the user may pick (slug, name, fields)
 * @param {object[]} props.accounts
 * @param {() => void} props.onAdd
 * @param {(key: string) => void} props.onRemove
 * @param {(key: string, slug: string) => void} props.onPlatformChange
 * @param {(key: string, patch: object) => void} props.onChange   a typed value changed: { data, preview: null, preview_data: null }
 * @param {(key: string) => void} props.onFetch
 * @param {(account: object) => React.ReactNode} [props.renderExtra]   extra content at the bottom of a card (collection progress)
 * @param {boolean} [props.canRemoveLast]  allow removing the only card (default false)
 */
export default function ProfileAccountsEditor({
  platforms,
  accounts,
  onAdd,
  onRemove,
  onPlatformChange,
  onChange,
  onFetch,
  renderExtra = null,
  canRemoveLast = false,
}) {
  const typed = (account, key, value) => onChange(account.key, {
    data: { ...account.data, [key]: value },
    preview: null,
    preview_data: null,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">
          Platforms
          <span className="ml-1.5 font-normal text-muted-foreground">({accounts.length})</span>
        </p>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={onAdd}>
          <Plus className="h-3.5 w-3.5" /> Add platform
        </Button>
      </div>

      <div className="space-y-2">
        {accounts.map((account) => {
          const plat = platforms.find((p) => p.slug === account.platform);
          const fields = (Array.isArray(plat?.fields) ? plat.fields : []).filter((f) => !HIDDEN_FIELD_KEYS.has(f.key));
          const fetched = Boolean(account.preview_data?.fetched_at);
          const primaryField = fields[0];
          const locked = Boolean(account.locked);
          return (
            <div
              key={account.key}
              className={`rounded-lg border p-3 ${fetched ? 'border-emerald-500/25 bg-emerald-500/[0.03]' : 'bg-card'}`}
            >
              <div className="mb-2 flex items-center gap-2">
                <Select
                  value={account.platform}
                  onValueChange={(v) => onPlatformChange(account.key, v)}
                  disabled={Boolean(account.profileId) || locked}
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder="Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fetched ? (
                  <Badge variant="outline" className="h-5 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700">
                    Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="h-5 text-[10px] text-amber-700">
                    Needs fetch
                  </Badge>
                )}
                <div className="flex-1" />
                {canRemoveLast || accounts.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-red-600"
                    onClick={() => onRemove(account.key)}
                    title="Remove platform"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>

              {primaryField ? (
                <div className="flex gap-2">
                  <Input
                    className="h-9 flex-1"
                    type={primaryField.type === 'url' ? 'url' : 'text'}
                    placeholder={primaryField.placeholder || primaryField.label}
                    required={primaryField.required}
                    value={account.data?.[primaryField.key] || ''}
                    disabled={locked}
                    onChange={(e) => typed(account, primaryField.key, e.target.value)}
                  />
                  <Button
                    type="button"
                    variant={fetched ? 'outline' : 'default'}
                    className="h-9 shrink-0 gap-1.5 px-3"
                    disabled={account.fetching || !fields.length || locked}
                    onClick={() => onFetch(account.key)}
                  >
                    {account.fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Fetch
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No fields for this platform.</p>
              )}

              {fields.slice(1).map((field) => (
                <Input
                  key={field.key}
                  className="mt-2 h-9"
                  type={field.type === 'url' ? 'url' : 'text'}
                  placeholder={field.placeholder || field.label}
                  required={field.required}
                  disabled={locked}
                  value={account.data?.[field.key] || ''}
                  onChange={(e) => typed(account, field.key, e.target.value)}
                />
              ))}

              {account.preview ? (
                <div className="mt-2 flex items-center gap-2.5 rounded-md border bg-background/80 px-2.5 py-2">
                  {account.preview.image ? (
                    <img
                      src={account.preview.image}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{account.preview.name || 'Unknown'}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {account.preview.followers != null
                        ? `${Number(account.preview.followers).toLocaleString()} followers`
                        : account.preview.url || ''}
                      {account.preview.page_id || account.preview.user_id || account.preview.channel_id
                        ? ` · ${account.preview.page_id || account.preview.user_id || account.preview.channel_id}`
                        : ''}
                    </p>
                  </div>
                </div>
              ) : null}

              {renderExtra ? renderExtra(account) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
