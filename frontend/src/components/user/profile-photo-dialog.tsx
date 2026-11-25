'use client';

import * as React from 'react';
import {
  IconCamera,
  IconCheck,
  IconLoader2,
  IconPhoto,
  IconSparkles,
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
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';

interface ProfilePhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhotoUrl: string | null;
  displayName: string;
  onPhotoUpdated: (newPhotoUrl: string | null) => void;
}

interface PresetAvatar {
  id: string;
  name: string;
  category: 'heroes' | 'animals' | 'fun';
  icon: string;
  bgGradient: [string, string];
}

const PRESET_AVATARS: PresetAvatar[] = [
  // Heroes & Tech
  { id: 'ninja', name: 'Ninja', category: 'heroes', icon: '🥷', bgGradient: ['#4c1d95', '#1e1b4b'] },
  { id: 'dev', name: 'Dev Ops', category: 'heroes', icon: '💻', bgGradient: ['#047857', '#064e3b'] },
  { id: 'wizard', name: 'Tech Wizard', category: 'heroes', icon: '🧙', bgGradient: ['#3730a3', '#1e1b4b'] },
  { id: 'robot', name: 'Cyber Bot', category: 'heroes', icon: '🤖', bgGradient: ['#0284c7', '#0f172a'] },
  { id: 'alien', name: 'Alien', category: 'heroes', icon: '👽', bgGradient: ['#15803d', '#052e16'] },
  { id: 'superhero', name: 'Hero', category: 'heroes', icon: '🦸', bgGradient: ['#1d4ed8', '#1e3a8a'] },
  { id: 'gamer', name: 'Gamer', category: 'heroes', icon: '👾', bgGradient: ['#7c3aed', '#4c1d95'] },
  { id: 'batman', name: 'Batman', category: 'heroes', icon: '🦇', bgGradient: ['#334155', '#0f172a'] },

  // Animals
  { id: 'lion', name: 'Lion', category: 'animals', icon: '🦁', bgGradient: ['#b45309', '#78350f'] },
  { id: 'tiger', name: 'Tiger', category: 'animals', icon: '🐯', bgGradient: ['#c2410c', '#7c2d12'] },
  { id: 'fox', name: 'Fox', category: 'animals', icon: '🦊', bgGradient: ['#ea580c', '#9a3412'] },
  { id: 'wolf', name: 'Wolf', category: 'animals', icon: '🐺', bgGradient: ['#475569', '#1e293b'] },
  { id: 'panda', name: 'Panda', category: 'animals', icon: '🐼', bgGradient: ['#0f766e', '#134e4a'] },
  { id: 'owl', name: 'Wise Owl', category: 'animals', icon: '🦉', bgGradient: ['#312e81', '#0f172a'] },
  { id: 'eagle', name: 'Eagle', category: 'animals', icon: '🦅', bgGradient: ['#0284c7', '#0369a1'] },
  { id: 'dolphin', name: 'Dolphin', category: 'animals', icon: '🐬', bgGradient: ['#0891b2', '#164e63'] },
  { id: 'cat', name: 'Cat', category: 'animals', icon: '🐱', bgGradient: ['#db2777', '#9d174d'] },
  { id: 'dog', name: 'Dog', category: 'animals', icon: '🐶', bgGradient: ['#92400e', '#713f12'] },
  { id: 'dragon', name: 'Dragon', category: 'animals', icon: '🐲', bgGradient: ['#b91c1c', '#7f1d1d'] },

  // Fun & Power
  { id: 'rocket', name: 'Rocket', category: 'fun', icon: '🚀', bgGradient: ['#4338ca', '#312e81'] },
  { id: 'lightning', name: 'Flash', category: 'fun', icon: '⚡', bgGradient: ['#ca8a04', '#854d0e'] },
  { id: 'fire', name: 'Fire', category: 'fun', icon: '🔥', bgGradient: ['#dc2626', '#991b1b'] },
  { id: 'crown', name: 'Crown', category: 'fun', icon: '👑', bgGradient: ['#d97706', '#92400e'] },
  { id: 'coffee', name: 'Coffee', category: 'fun', icon: '☕', bgGradient: ['#78350f', '#451a03'] },
  { id: 'shield', name: 'Guardian', category: 'fun', icon: '🛡️', bgGradient: ['#2563eb', '#1d4ed8'] },
  { id: 'target', name: 'Target', category: 'fun', icon: '🎯', bgGradient: ['#e11d48', '#9f1239'] },
  { id: 'pizza', name: 'Pizza', category: 'fun', icon: '🍕', bgGradient: ['#ea580c', '#c2410c'] },
];

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
  const [selectedPresetId, setSelectedPresetId] = React.useState<string | null>(null);
  const [activeCategory, setActiveCategory] = React.useState<'all' | 'heroes' | 'animals' | 'fun'>('all');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setPreview(currentPhotoUrl);
      setSelectedFile(null);
      setSelectedPresetId(null);
    }
  }, [open, currentPhotoUrl]);

  // Generates a crisp, high-resolution 128x128 PNG data URL for preset avatars
  const createPresetDataUrl = (preset: PresetAvatar): string => {
    if (typeof window === 'undefined') return '';
    const canvas = document.createElement('canvas');
    const size = 128;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Circular background gradient
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, preset.bgGradient[0]);
    grad.addColorStop(1, preset.bgGradient[1]);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw centered crisp Emoji
    ctx.font = '54px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(preset.icon, size / 2, size / 2 + 4);

    return canvas.toDataURL('image/png');
  };

  // Resize and compress uploaded photo to 256x256
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
      setSelectedPresetId(null);
    } catch {
      toast.error('Failed to process image file.');
    }
  };

  const handleSelectPreset = (preset: PresetAvatar) => {
    try {
      const dataUrl = createPresetDataUrl(preset);
      setPreview(dataUrl);
      setSelectedPresetId(preset.id);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch {
      toast.error('Failed to select avatar.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalPhotoUrl = preview;

      // If a file from disk was selected, attempt to upload to Supabase Storage
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
          // If storage fails, dataUrl is the bulletproof fallback
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

      // Live real-time event across the window
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('profile-photo-updated', { detail: { photoUrl: finalPhotoUrl } }),
        );
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
    setSelectedPresetId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const filteredPresets = React.useMemo(() => {
    if (activeCategory === 'all') return PRESET_AVATARS;
    return PRESET_AVATARS.filter((p) => p.category === activeCategory);
  }, [activeCategory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col p-5">
        <DialogHeader className="pb-2 border-b">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <IconCamera className="h-5 w-5 text-primary" />
            Profile Picture &amp; Avatars
          </DialogTitle>
          <DialogDescription className="text-xs">
            Upload your own photo or pick a fun avatar. This will be shown across playbooks, team lists, and active presence.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
          {/* Top Avatar Preview & Upload Controls */}
          <div className="flex flex-col sm:flex-row items-center gap-4 bg-muted/20 p-3.5 rounded-xl border border-border/60">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center rounded-full bg-card ring-2 ring-primary/30 shadow-md transition-all hover:ring-primary/60 overflow-hidden"
              style={{ width: '80px', height: '80px' }}
              title="Click to upload your photo"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Profile Preview"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  style={{ width: '80px', height: '80px' }}
                />
              ) : (
                <span className="text-xl font-bold text-primary">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
              )}

              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <IconPhoto className="h-5 w-5" />
                <span className="text-[9px] font-medium mt-0.5">Upload</span>
              </div>
            </div>

            <div className="flex-1 text-center sm:text-left space-y-1.5">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7.5 text-xs gap-1.5 font-medium"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <IconUpload className="h-3.5 w-3.5 text-primary" />
                  Upload Photo
                </Button>

                {preview && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7.5 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                    onClick={handleRemove}
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                    Reset
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Upload any JPG, PNG, WEBP, or GIF (max 5MB).
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Preset Avatars & Fun Icons Section */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <IconSparkles className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold text-foreground">
                  Or Pick a Fun Avatar
                </span>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border text-2xs">
                {(['all', 'heroes', 'animals', 'fun'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      'px-2 py-0.5 rounded-md capitalize font-medium transition-colors cursor-pointer',
                      activeCategory === cat
                        ? 'bg-background text-foreground shadow-2xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {cat === 'heroes' ? 'Heroes' : cat === 'animals' ? 'Animals' : cat === 'fun' ? 'Icons' : 'All'}
                  </button>
                ))}
              </div>
            </div>

            {/* Avatars Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2.5 max-h-52 overflow-y-auto p-1.5 rounded-lg border bg-card/40">
              {filteredPresets.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={cn(
                      'group relative flex flex-col items-center justify-center p-1.5 rounded-xl border transition-all cursor-pointer hover:scale-105 active:scale-95',
                      isSelected
                        ? 'border-primary ring-2 ring-primary/40 bg-primary/10 shadow-xs'
                        : 'border-border/60 hover:border-primary/50 hover:bg-muted/40 bg-card/60',
                    )}
                    title={preset.name}
                  >
                    {/* Circular Avatar Badge */}
                    <div
                      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-xs transition-transform group-hover:shadow-md"
                      style={{
                        background: `linear-gradient(135deg, ${preset.bgGradient[0]}, ${preset.bgGradient[1]})`,
                        width: '40px',
                        height: '40px',
                      }}
                    >
                      <span className="text-lg leading-none select-none">{preset.icon}</span>

                      {isSelected && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
                          <IconCheck className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] text-muted-foreground group-hover:text-foreground truncate w-full text-center mt-1 font-medium">
                      {preset.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-2 sm:justify-end pt-2 border-t">
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
