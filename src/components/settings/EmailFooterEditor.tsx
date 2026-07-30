import { useState, useRef, useCallback, useEffect } from 'react';
import { Bold, Italic, Underline, Link as LinkIcon, Palette, Type, FileText, Eye, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface EmailFooterEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const TEMPLATES = [
  {
    key: 'simple',
    name: 'Simple',
    description: 'Clean name and email signature',
    html: `<p style="color:#666;font-size:13px;font-family:Arial,sans-serif;">
  Best regards,<br/>
  <strong>{SELLER_NAME}</strong><br/>
  {SELLER_EMAIL}
</p>`,
  },
  {
    key: 'professional',
    name: 'Professional',
    description: 'Bordered layout with contact details',
    html: `<table style="font-family:Arial,sans-serif;font-size:13px;color:#333;">
  <tr>
    <td style="padding-right:16px;border-right:2px solid #0066cc;">
      <strong style="font-size:14px;">{SELLER_NAME}</strong><br/>
      <span style="color:#666;">{SELLER_EMAIL}</span><br/>
      <span style="color:#666;">{SELLER_PHONE}</span>
    </td>
    <td style="padding-left:16px;">
      <em style="color:#999;">Thank you for your business!</em>
    </td>
  </tr>
</table>`,
  },
  {
    key: 'minimal',
    name: 'Minimal',
    description: 'Short thank-you message',
    html: `<p style="color:#888;font-size:12px;">Thank you for your purchase!</p>`,
  },
  {
    key: 'modern',
    name: 'Modern',
    description: 'Centered layout with gradient divider',
    html: `<div style="text-align:center;font-family:Arial,sans-serif;padding:16px 0;">
  <div style="height:2px;background:linear-gradient(90deg,transparent,#0066cc,transparent);margin-bottom:16px;"></div>
  <strong style="font-size:14px;color:#222;">{SELLER_NAME}</strong><br/>
  <span style="font-size:12px;color:#666;">{SELLER_EMAIL}</span><br/>
  <div style="margin-top:12px;">
    <span style="display:inline-block;margin:0 6px;font-size:11px;color:#0066cc;">Website</span>
    <span style="color:#ccc;">|</span>
    <span style="display:inline-block;margin:0 6px;font-size:11px;color:#0066cc;">Twitter</span>
    <span style="color:#ccc;">|</span>
    <span style="display:inline-block;margin:0 6px;font-size:11px;color:#0066cc;">Instagram</span>
  </div>
  <p style="font-size:11px;color:#999;margin-top:12px;">Sent with care ✨</p>
</div>`,
  },
  {
    key: 'branded',
    name: 'Branded',
    description: 'Bold accent bar with company branding',
    html: `<div style="font-family:Arial,sans-serif;">
  <div style="height:4px;background:#0066cc;border-radius:2px;margin-bottom:12px;"></div>
  <strong style="font-size:16px;color:#0066cc;">{SELLER_NAME}</strong><br/>
  <span style="font-size:13px;color:#444;">{SELLER_EMAIL}</span><br/>
  <span style="font-size:13px;color:#444;">{SELLER_PHONE}</span>
  <p style="font-size:11px;color:#999;margin-top:12px;border-top:1px solid #eee;padding-top:8px;">
    Trusted seller · Fast shipping · 100% satisfaction guaranteed
  </p>
</div>`,
  },
  {
    key: 'classic',
    name: 'Classic',
    description: 'Traditional letter-style with full address',
    html: `<div style="font-family:'Times New Roman',serif;font-size:13px;color:#333;border-top:1px solid #ccc;padding-top:12px;margin-top:16px;">
  <strong>{SELLER_NAME}</strong><br/>
  <span style="color:#555;">123 Business Street</span><br/>
  <span style="color:#555;">City, State 12345</span><br/>
  <span style="color:#555;">Phone: {SELLER_PHONE}</span><br/>
  <span style="color:#555;">Email: {SELLER_EMAIL}</span><br/>
  <em style="font-size:12px;color:#888;display:block;margin-top:8px;">
    "Quality products, exceptional service."
  </em>
</div>`,
  },
];

const VARIABLES = [
  { label: 'Seller Name', value: '{SELLER_NAME}' },
  { label: 'Seller Email', value: '{SELLER_EMAIL}' },
  { label: 'Seller Phone', value: '{SELLER_PHONE}' },
];

const COLORS = [
  '#000000', '#333333', '#666666', '#888888', '#999999',
  '#0066cc', '#0099ff', '#00cc66', '#ff6600', '#cc0000',
];

const FONT_SIZES = [
  { label: 'Small', value: '1' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' },
  { label: 'X-Large', value: '7' },
];

export function EmailFooterEditor({ value, onChange, disabled }: EmailFooterEditorProps) {
  const [mode, setMode] = useState<'edit' | 'preview' | 'html'>('edit');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && mode === 'edit') {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
  }, [value, mode]);

  const handleCommand = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const insertLink = useCallback(() => {
    if (linkUrl.trim()) {
      handleCommand('createLink', linkUrl.trim());
      setLinkUrl('');
      setLinkPopoverOpen(false);
    }
  }, [linkUrl, handleCommand]);

  const insertVariable = useCallback((variable: string) => {
    handleCommand('insertText', variable);
  }, [handleCommand]);

  const applyTemplate = useCallback((html: string) => {
    onChange(html);
    if (editorRef.current) {
      editorRef.current.innerHTML = html;
    }
    setTemplateDialogOpen(false);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          handleCommand('bold');
          break;
        case 'i':
          e.preventDefault();
          handleCommand('italic');
          break;
        case 'u':
          e.preventDefault();
          handleCommand('underline');
          break;
      }
    }
  }, [handleCommand]);

  const normalizeHtml = (html: string) => html.replace(/\s+/g, ' ').trim();

  if (disabled) {
    return (
      <div className="rounded-md border border-input bg-muted/50 p-4 min-h-32 text-sm text-muted-foreground">
        Enable custom SMTP to edit the email footer
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-1">
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleCommand('bold')} aria-label="Bold" disabled={mode !== 'edit'}>
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleCommand('italic')} aria-label="Italic" disabled={mode !== 'edit'}>
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleCommand('underline')} aria-label="Underline" disabled={mode !== 'edit'}>
          <Underline className="h-4 w-4" />
        </Button>

        <div className="h-6 w-px bg-border mx-1" />

        {/* Link */}
        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Insert link" disabled={mode !== 'edit'}>
              <LinkIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 z-50 bg-popover" align="start">
            <div className="space-y-3">
              <Label htmlFor="link-url">Link URL</Label>
              <Input id="link-url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com" onKeyDown={(e) => e.key === 'Enter' && insertLink()} />
              <Button size="sm" onClick={insertLink} className="w-full">Insert Link</Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Color */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Text color" disabled={mode !== 'edit'}>
              <Palette className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="z-50 bg-popover" align="start">
            <DropdownMenuLabel>Text Color</DropdownMenuLabel>
            <div className="grid grid-cols-5 gap-1 p-2">
              {COLORS.map((color) => (
                <button key={color} type="button" className="h-6 w-6 rounded border border-border hover:scale-110 transition-transform" style={{ backgroundColor: color }} onClick={() => handleCommand('foreColor', color)} aria-label={`Color ${color}`} />
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Font Size */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 gap-1" aria-label="Font size" disabled={mode !== 'edit'}>
              <Type className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="z-50 bg-popover" align="start">
            {FONT_SIZES.map((size) => (
              <DropdownMenuItem key={size.value} onClick={() => handleCommand('fontSize', size.value)}>{size.label}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-6 w-px bg-border mx-1" />

        {/* Variables */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 gap-1 text-xs" disabled={mode !== 'edit'}>
              {'{}'} Variables
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="z-50 bg-popover" align="start">
            <DropdownMenuLabel>Insert Variable</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {VARIABLES.map((variable) => (
              <DropdownMenuItem key={variable.value} onClick={() => insertVariable(variable.value)}>
                <code className="text-xs bg-muted px-1 py-0.5 rounded mr-2">{variable.value}</code>
                {variable.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {/* Templates - Dialog */}
        <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 gap-1">
              <FileText className="h-4 w-4" />
              Templates
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Choose a Footer Design</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
              {TEMPLATES.map((tpl) => {
                const isActive = normalizeHtml(value) === normalizeHtml(tpl.html);
                return (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => applyTemplate(tpl.html)}
                    className={cn(
                      "rounded-lg border-2 p-2 text-left transition-all hover:shadow-md hover:border-primary/50",
                      isActive ? "border-primary bg-primary/5" : "border-border bg-background"
                    )}
                  >
                    <div className="text-xs font-semibold mb-0.5">{tpl.name}</div>
                    <div className="text-[10px] text-muted-foreground mb-2 leading-tight">{tpl.description}</div>
                    <div className="relative h-24 overflow-hidden rounded border bg-white">
                      <div
                        className="absolute top-0 left-0 origin-top-left pointer-events-none"
                        style={{ transform: 'scale(0.42)', width: '238%' }}
                        dangerouslySetInnerHTML={{ __html: tpl.html }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>

        {/* View modes */}
        <div className="flex rounded-md border bg-background">
          <Button type="button" variant={mode === 'edit' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2 rounded-r-none" onClick={() => setMode('edit')}>Edit</Button>
          <Button type="button" variant={mode === 'preview' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2 rounded-none border-x" onClick={() => setMode('preview')}>
            <Eye className="h-3 w-3 mr-1" />Preview
          </Button>
          <Button type="button" variant={mode === 'html' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2 rounded-l-none" onClick={() => setMode('html')}>
            <Code className="h-3 w-3 mr-1" />HTML
          </Button>
        </div>
      </div>

      {/* Editor / Preview / HTML */}
      {mode === 'edit' && (
        <div
          ref={editorRef}
          contentEditable
          className={cn(
            "min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "prose prose-sm max-w-none",
            "[&_a]:text-primary [&_a]:underline"
          )}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          dangerouslySetInnerHTML={{ __html: value }}
          aria-label="Email footer editor"
        />
      )}

      {mode === 'preview' && (
        <div className="min-h-32 rounded-md border border-input bg-muted/30 px-3 py-2" dangerouslySetInnerHTML={{ __html: value }} />
      )}

      {mode === 'html' && (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} className="min-h-32 font-mono text-sm" placeholder="<p>Your HTML footer here...</p>" />
      )}

      <p className="text-xs text-muted-foreground">
        HTML footer appended to all delivery emails. Use variables like <code className="bg-muted px-1 rounded">{'{SELLER_NAME}'}</code> for dynamic content.
      </p>
    </div>
  );
}
