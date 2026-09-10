import React, { useState } from 'react';
import { Key, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import api from '../../lib/api';

const ChangePasswordModal = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (formData.new_password !== formData.confirm_password) {
      setError('New passwords do not match');
      return;
    }

    if (formData.new_password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    try {
      await api.patch('/auth/me/password', {
        current_password: formData.current_password,
        new_password: formData.new_password,
      });
      toast.success('Password updated successfully');
      setFormData({ current_password: '', new_password: '', confirm_password: '' });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update password');
      toast.error('Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Key className="h-5 w-5 text-primary" />
            Change Password
          </DialogTitle>
          <DialogDescription>
            Update your account password. We recommend using a strong password.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Current Password</label>
            <Input
              type="password"
              value={formData.current_password}
              onChange={(e) => setFormData({ ...formData, current_password: e.target.value })}
              className="h-9 text-sm"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">New Password</label>
            <Input
              type="password"
              value={formData.new_password}
              onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
              className="h-9 text-sm"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Confirm New Password</label>
            <Input
              type="password"
              value={formData.confirm_password}
              onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
              className="h-9 text-sm"
              required
            />
          </div>

          <div className="pt-4 flex justify-end gap-2 border-t border-border mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-9" disabled={loading}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              {loading ? 'Saving...' : 'Save Password'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ChangePasswordModal;
