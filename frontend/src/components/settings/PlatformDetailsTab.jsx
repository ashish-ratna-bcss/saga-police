import React, { useEffect, useState } from 'react';
import { ImagePlus, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { useAuth } from '../../context/auth.context';
import { resolvePublicAssetUrl } from '../../lib/publicAssetUrl';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the logo file'));
    reader.readAsDataURL(file);
  });

const PlatformDetailsTab = () => {
  const { user, updateBranding } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [logoData, setLogoData] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(user?.blurasagatitle || 'Bengaluru Police');
    setDescription(user?.blurasagadescription || '');
    setLogoPreview(user?.blurasagalogo || '/blura_saga_logo.jpg');
    setLogoData(null);
  }, [user?.blurasagatitle, user?.blurasagadescription, user?.blurasagalogo]);

  const onLogoFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
      toast.error('Logo must be PNG, JPEG, WebP, or GIF');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('Logo must be less than 5MB');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setLogoData(dataUrl);
      setLogoPreview(dataUrl);
    } catch (error) {
      toast.error(error.message || 'Could not read the logo file');
    }
  };

  const save = async (event) => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      const payload = { title: nextTitle, description: description.trim() };
      if (logoData) payload.logo = logoData;
      await updateBranding(payload);
      toast.success('Platform details saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save platform details');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="rounded-xl border border-border bg-card overflow-hidden w-full shadow-sm">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/20">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <ImagePlus className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-none">Platform details</h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            Title, description, and logo shown on the login page and in the header
          </p>
        </div>
      </div>

      <div className="p-5 space-y-5 max-w-xl">
        <div className="flex items-center gap-4">
          <img
            src={resolvePublicAssetUrl(logoPreview)}
            alt=""
            className="h-16 w-16 rounded-lg object-cover ring-1 ring-border bg-muted"
          />
          <div>
            <Label htmlFor="platform-logo" className="text-xs">Logo</Label>
            <p className="text-[10px] text-muted-foreground mt-0.5 mb-2">PNG, JPEG, WebP, or GIF. Up to 5MB.</p>
            <Input
              id="platform-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="h-8 text-xs cursor-pointer"
              onChange={onLogoFile}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="platform-title" className="text-xs">Title</Label>
          <Input
            id="platform-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            className="h-8 text-xs mt-1"
            required
          />
        </div>

        <div>
          <Label htmlFor="platform-description" className="text-xs">Description</Label>
          <Textarea
            id="platform-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={400}
            rows={3}
            className="text-xs mt-1"
          />
        </div>

        <Button type="submit" size="sm" className="h-8 text-xs" disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
          {saving ? 'Saving…' : 'Save details'}
        </Button>
      </div>
    </form>
  );
};

export default PlatformDetailsTab;
