'use client';

import * as React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { toast } from 'sonner';
import {
  IconBold,
  IconCode,
  IconH2,
  IconH3,
  IconItalic,
  IconLink,
  IconLinkOff,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconQuote,
  IconStrikethrough,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** Bucket used for pasted / uploaded images. */
  bucket?: string;
  className?: string;
}

/**
 * The rich text editor used for symptoms, causes, resolutions and so on.
 *
 * Images are pasted, dragged in or uploaded; they go to a private Storage
 * bucket and are referenced by their signed-URL path.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write here…',
  minHeight = 160,
  bucket = 'scenario-attachments',
  className,
}: RichTextEditorProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        codeBlock: { HTMLAttributes: { class: 'code-block' } },
      }),
      Image.configure({
        HTMLAttributes: { class: 'rounded-md border' },
        inline: false,
        allowBase64: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class:
          'prose-scenario focus:outline-none min-h-[160px] px-3 py-2.5 text-sm leading-relaxed',
        'aria-label': 'Rich text content',
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
  });

  // Push external value changes (template prefill, version restore) into
  // the editor without clobbering what the user is typing.
  React.useEffect(() => {
    if (!editor) return;
    if (value === editor.getHTML()) return;
    if (editor.isFocused) return;
    editor.commands.setContent(value || '', false);
  }, [value, editor]);

  const uploadImage = React.useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.error('Only image files can be inserted here.');
        return;
      }

      setUploading(true);
      try {
        const supabase = createClient();
        const ext = file.name.split('.').pop() ?? 'png';
        const path = `editor-images/${crypto.randomUUID()}.${ext}`;

        const { error } = await supabase.storage
          .from(bucket)
          .upload(path, file, { cacheControl: '3600', upsert: false });
        if (error) throw error;

        // Generate signed URL for private bucket access
        const { data: signedData } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, 60 * 60 * 24 * 365);

        const imageUrl =
          signedData?.signedUrl || supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

        editor?.chain().focus().setImage({ src: imageUrl }).run();
        toast.success('Image uploaded');
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Could not upload the image.',
        );
      } finally {
        setUploading(false);
      }
    },
    [editor, bucket],
  );

  // Paste and drop handlers for images.
  React.useEffect(() => {
    if (!editor) return;
    const view = editor.view;

    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            event.preventDefault();
            void uploadImage(file);
            return;
          }
        }
      }
    };

    const handleDrop = (event: DragEvent) => {
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const file = Array.from(files).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      void uploadImage(file);
    };

    view.dom.addEventListener('paste', handlePaste);
    view.dom.addEventListener('drop', handleDrop);
    return () => {
      view.dom.removeEventListener('paste', handlePaste);
      view.dom.removeEventListener('drop', handleDrop);
    };
  }, [editor, uploadImage]);

  if (!editor) {
    return <div className="skeleton h-40 w-full" />;
  }

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previous ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div
      className={cn(
        'rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
        <ToolButton
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <IconBold className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <IconItalic className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <IconStrikethrough className="h-3.5 w-3.5" />
        </ToolButton>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolButton
          label="Heading 2"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <IconH2 className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Heading 3"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <IconH3 className="h-3.5 w-3.5" />
        </ToolButton>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolButton
          label="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <IconList className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <IconListNumbers className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Quote"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <IconQuote className="h-3.5 w-3.5" />
        </ToolButton>
        <ToolButton
          label="Code block"
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <IconCode className="h-3.5 w-3.5" />
        </ToolButton>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolButton label="Add link" active={editor.isActive('link')} onClick={setLink}>
          <IconLink className="h-3.5 w-3.5" />
        </ToolButton>
        {editor.isActive('link') && (
          <ToolButton
            label="Remove link"
            onClick={() => editor.chain().focus().unsetLink().run()}
          >
            <IconLinkOff className="h-3.5 w-3.5" />
          </ToolButton>
        )}

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolButton
          label="Insert image"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <IconPhoto className="h-3.5 w-3.5" />
        </ToolButton>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadImage(file);
            e.target.value = '';
          }}
        />
      </div>

      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon"
      className="h-7 w-7"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
}
