'use client';

import * as React from 'react';
import {
  IconCamera,
  IconLoader2,
  IconPhoto,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface ProfilePhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhotoUrl: string | null;
  displayName: string;
  onPhotoUpdated: (newPhotoUrl: string | null) => void;
}

export function ProfilePhotoDialog({
  open,
  onOpenChange,
  currentPhotoUrl,
  displayName,
  onPhotoUpdated,
}: ProfilePhotoDialogProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(currentPhotoUrl);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setPreview(currentPhotoUrl);
      setSelectedFile(null);
    }
  }, [open, currentPhotoUrl]);

  // Resize and compress image to a crisp 256x256 webp/jpeg to keep it lightweight and fast
  const processImageToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const size = 256;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }

          // Crop to square centered
          const minDim = Math.min(img.width, img.height);
          const startX = (img.width - minDim) / 2;
          const startY = (img.height - minDim) / 2;

          ctx.drawImage(img, startX, startY, minDim, minDim, 0, 0, size, size);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          resolve(dataUrl);
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (PNG, JPG, WEBP, or GIF).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be 5MB or smaller.');
      return;
    }

    try {
      const optimized = await processImageToDataUrl(file);
      setPreview(optimized);
      setSelectedFile(file);
    } catch {
      toast.error('Failed to process image file.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalPhotoUrl = preview;

      // If a new file was chosen, also attempt to upload to Supabase Storage as primary URL
      if (selectedFile) {
        try {
          const supabase = createClient();
          const ext = selectedFile.name.split('.').pop() || 'jpg';
          const filePath = `avatars/user-${Date.now()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from('scenario-attachments')
            .upload(filePath, selectedFile, {
              cacheControl: '3600',
              upsert: true,
            });

          if (!uploadError) {
            const { data: publicUrlData } = supabase.storage
              .from('scenario-attachments')
              .getPublicUrl(filePath);

            if (publicUrlData?.publicUrl) {
              finalPhotoUrl = publicUrlData.publicUrl;
            }
          }
        } catch {
          // If storage upload fails, preview data URL is already an ultra-reliable fallback
        }
      }

      if (!finalPhotoUrl) {
        // Remove photo
        const res = await fetch('/api/user/profile-picture', { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to remove profile picture');
        onPhotoUpdated(null);
        toast.success('Profile picture removed');
      } else {
        // Save photo
        const res = await fetch('/api/user/profile-picture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoUrl: finalPhotoUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update profile picture');

        onPhotoUpdated(finalPhotoUrl);
        toast.success('Profile picture updated successfully!');
      }

      // Trigger custom event so any other components update live
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('profile-photo-updated', { detail: { photoUrl: finalPhotoUrl } }));
      }

      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || 'Error updating profile picture');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <IconCamera className="h-5 w-5 text-primary" />
            Upload Profile Picture
          </DialogTitle>
          <DialogDescription className="text-xs">
            Add an optional photo of yourself. Your profile picture will be shown across the platform, in playbooks you create, and in team activity.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center py-4 space-y-4">
          {/* Avatar Preview */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="group relative flex h-28 w-28 shrink-0 cursor-pointer items-center justify-center rounded-full bg-muted/60 ring-4 ring-primary/20 shadow-md transition-all hover:ring-primary/40 overflow-hidden"
            title="Click to choose a photo"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="Profile Preview"
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <span className="text-2xl font-bold text-primary">
                {displayName.slice(0, 2).toUpperCase()}
              </span>
            )}

            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <IconPhoto className="h-6 w-6" />
              <span className="text-[10px] font-medium mt-1">Change</span>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconUpload className="h-3.5 w-3.5 text-primary" />
              {preview ? 'Choose Different Photo' : 'Choose Photo'}
            </Button>

            {preview && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                onClick={handleRemove}
              >
                <IconTrash className="h-3.5 w-3.5" />
                Remove
              </Button>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground text-center max-w-xs">
            Supports JPG, PNG, WEBP, or GIF up to 5MB. Square images work best.
          </p>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-[#233B74] hover:bg-[#1b2e5c] text-white gap-1.5 text-xs font-semibold"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Picture'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

