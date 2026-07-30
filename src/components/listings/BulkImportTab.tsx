import React, { useState, useEffect, useRef, useCallback } from 'react';
import { reorganizeRunner, type RunnerState } from '@/lib/reorganize-runner';
import { Upload, FileSpreadsheet, Loader2, Sparkles, Store, ChevronDown, ChevronRight, ImageOff, X, SkipForward, Rocket, ArrowLeft, Trash2, Clock, CheckCircle2, AlertCircle, FolderOpen, AlertTriangle, CheckCheck, XCircle, Wand2, CornerDownRight, Plus, Pencil, FolderPlus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────
interface BulkImportJob {
  id: string;
  file_name: string | null;
  context: string | null;
  status: string;
  total_rows: number;
  processed_rows: number;
  search_images: boolean;
  created_at: string;
  updated_at: string;
}

interface BulkImportItem {
  id: string;
  job_id: string;
  group_key: string | null;
  raw_data: any;
  title: string | null;
  description: string | null;
  price: string | null;
  tags: string | null;
  product_type: string | null;
  image_urls: string[];
  image_search_note: string | null;
  status: string;
  published_stores: string[];
  variant_label: string | null;
  is_parent: boolean;
  skip_reason: string | null;
  ai_group_key: string | null;
  family_key: string | null;
}

interface ShopifyStore {
  id: string;
  shopDomain: string;
  label?: string;
}

interface ShopifyCollection {
  id: number;
  title: string;
  type: string;
}

type FilterTab = 'all' | 'pending' | 'flagged' | 'ready' | 'published' | 'skipped';
type View = 'jobs' | 'upload' | 'reorganize-review' | 'items';

// ─── Variant grouping helpers ─────────────────────
const EDITION_SUFFIXES = /\s*[-–—:]\s*(standard|deluxe|gold|ultimate|premium|platinum|collector['']?s?|limited|digital|physical|base|complete|goty|game of the year|bundle|pack|edition|perpetual|subscription|annual|monthly|lifetime|yearly)\s*(edition|version|pack|bundle)?\s*$/i;

function normalizeForGrouping(title: string): string {
  let t = title;
  // 1. Strip all trailing parenthetical content: "(Perpetual / 1 Device)", "(Unlimited)", etc.
  t = t.replace(/\s*\(.*\)\s*$/g, '');
  // 2. Strip trailing dash/slash + device/user/license counts: "- 1 PC", "/ 5 Users"
  t = t.replace(/\s*[-–—/]\s*\d+\s*(devices?|users?|seats?|pcs?|macs?|licenses?|keys?)\s*$/i, '');
  // 3. Strip trailing "unlimited", "perpetual" etc. as standalone
  t = t.replace(/\s*[-–—/]?\s*(unlimited|perpetual|subscription|annual|lifetime|monthly|yearly)\s*$/i, '');
  // 4. Strip trailing quantity like "x2", "x 5"
  t = t.replace(/\s*x\s*\d+\s*$/i, '');
  // 5. Strip edition suffixes
  t = t.replace(EDITION_SUFFIXES, '');
  // 6. Normalize whitespace and lowercase
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

function detectTitleColumn(row: Record<string, string>): string {
  const keys = Object.keys(row);
  const titleLike = keys.find(k => /^(name|title|product|game|item)/i.test(k));
  return titleLike || keys[0] || 'col0';
}

// ─── Junk detection ───────────────────────────────
const JUNK_STOP_WORDS = /^(n\/?a|tbd|test|null|none|empty|undefined|-|—|\.+|#)$/i;
const JUNK_PATTERNS = /^(https?:\/\/|www\.|qty|stock|sku only|barcode|image|sheet|page|total|subtotal|sum|header|footer|column|row \d|#\d)/i;

function isJunkRow(row: Record<string, string>, titleCol: string): boolean {
  const title = (row[titleCol] || '').trim();
  // Empty or very short
  if (title.length < 3) return true;
  // Stop words
  if (JUNK_STOP_WORDS.test(title)) return true;
  // Junk patterns
  if (JUNK_PATTERNS.test(title)) return true;
  // All values in row are empty
  const allEmpty = Object.values(row).every(v => !v || !v.trim());
  if (allEmpty) return true;
  // Title is only numbers (like row numbers or IDs)
  if (/^\d+$/.test(title)) return true;
  // Section header detection (narrow — only flag obvious headers)
  const otherCols = Object.entries(row).filter(([k]) => k !== titleCol);
  const otherAllEmpty = otherCols.every(([, v]) => !v || !v.trim());
  if (otherAllEmpty) {
    const wordCount = title.split(/\s+/).length;
    const isAllCapsShort = title === title.toUpperCase() && /[A-Z]/.test(title) && wordCount <= 3;
    const isGenericHeader = /^(products?|software|licenses?|subscriptions?|category|brand|vendor|items?|games?|antivirus|tools?|utilities?)$/i.test(title);
    if (isGenericHeader || isAllCapsShort) return true;
  }
  return false;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-muted text-muted-foreground' },
  flagged: { label: 'Flagged', color: 'bg-orange-500/20 text-orange-700 dark:text-orange-400' },
  processing: { label: 'Processing', color: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' },
  ready: { label: 'Ready', color: 'bg-blue-500/20 text-blue-700 dark:text-blue-400' },
  published: { label: 'Published', color: 'bg-green-500/20 text-green-700 dark:text-green-400' },
  skipped: { label: 'Skipped', color: 'bg-muted text-muted-foreground' },
  failed: { label: 'Failed', color: 'bg-destructive/20 text-destructive' },
};

const jobStatusConfig: Record<string, { label: string; icon: any; color: string }> = {
  parsed: { label: 'Awaiting AI', icon: Clock, color: 'text-muted-foreground' },
  processing: { label: 'Processing', icon: Loader2, color: 'text-yellow-600 dark:text-yellow-400' },
  ready: { label: 'Ready', icon: CheckCircle2, color: 'text-blue-600 dark:text-blue-400' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-green-600 dark:text-green-400' },
};

// ─── Main Component ───────────────────────────────
interface BulkImportTabProps {
  initialJobId?: string | null;
  initialParsedRows?: Record<string, string>[];
  initialFileName?: string;
  initialContext?: string;
  onJobCreated?: (jobId: string) => void;
  onBackToJobs?: () => void;
  metafieldDefs?: { key: string; namespace: string; name: string; type: string; description?: string }[];
}

const BulkImportTab = ({ initialJobId, initialParsedRows, initialFileName, initialContext, onJobCreated, onBackToJobs, metafieldDefs: propMetafieldDefs }: BulkImportTabProps) => {
  const { user } = useAuth();
  const [view, setView] = useState<View>(initialJobId ? 'items' : 'jobs');
  const [jobs, setJobs] = useState<BulkImportJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(initialJobId || null);
  const [items, setItems] = useState<BulkImportItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [context, setContext] = useState('');
  const [searchImages, setSearchImages] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [reorganizeProgress, setReorganizeProgress] = useState<{
    current: number; total: number; status: string; familiesFound: number;
  } | null>(null);

  // AI processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedRows, setProcessedRows] = useState(0);
  const [processingLabel, setProcessingLabel] = useState('');
  const cancelRef = useRef(false);

  // Item list state
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<BulkImportItem | null>(null);
  const [editSheetOpen, setEditSheetOpen] = useState(false);
  const [publishingItemId, setPublishingItemId] = useState<string | null>(null);
  const [selectedFlaggedIds, setSelectedFlaggedIds] = useState<Set<string>>(new Set());

  // Stores
  const [stores, setStores] = useState<ShopifyStore[]>([]);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  // Listing options
  const [listingStatus, setListingStatus] = useState('active');
  const [includeTags, setIncludeTags] = useState(true);
  const [inventoryTracked, setInventoryTracked] = useState(true);
  const [physicalProduct, setPhysicalProduct] = useState(false);
  const [collections, setCollections] = useState<ShopifyCollection[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [loadingCollections, setLoadingCollections] = useState(false);

  // Metafield definitions (prefer parent prop, fallback to internal fetch)
  const [metafieldDefs, setMetafieldDefs] = useState<{ key: string; namespace: string; name: string; type: string; description: string }[]>(
    (propMetafieldDefs as any) || []
  );

  // AI Reorganize state (pre-DB)
  const [isReorganizing, setIsReorganizing] = useState(false);
  const [parsedCsvRows, setParsedCsvRows] = useState<Record<string, string>[]>([]);
  const [parsedFileName, setParsedFileName] = useState('');
  const [reorganizeResults, setReorganizeResults] = useState<any[] | null>(null);
  const [reorganizeExpandedGroups, setReorganizeExpandedGroups] = useState<Set<string>>(new Set());
  const [isApprovingReorganize, setIsApprovingReorganize] = useState(false);

  // Collection management state
  const [customCollections, setCustomCollections] = useState<string[]>([]);
  const [newCollectionDialogOpen, setNewCollectionDialogOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [renamingFamily, setRenamingFamily] = useState<string | null>(null);
  const [familyCollectionMap, setFamilyCollectionMap] = useState<Record<string, number>>({});
  const [renameValue, setRenameValue] = useState('');

  // Per-family sync state
  const [syncingFamilyKey, setSyncingFamilyKey] = useState<string | null>(null);

  // Rehydrate familyCollectionMap from Shopify collections matched by family_key title
  useEffect(() => {
    if (view !== 'items' || !collections.length || !items.length) return;
    const next = Object.fromEntries(
      [...new Set(items.map(i => i.family_key).filter(Boolean))]
        .map(fk => {
          const c = collections.find(x => x.title.trim().toLowerCase() === String(fk).trim().toLowerCase());
          return c ? [String(fk), c.id] : null;
        })
        .filter(Boolean) as [string, number][]
    );
    if (Object.keys(next).length) setFamilyCollectionMap(prev => ({ ...next, ...prev }));
  }, [view, collections, items]);

  // Sync metafieldDefs from parent prop
  useEffect(() => {
    if (propMetafieldDefs && propMetafieldDefs.length > 0) {
      setMetafieldDefs(propMetafieldDefs as any);
    }
  }, [propMetafieldDefs]);

  useEffect(() => {
    if (user) {
      loadJobs();
      loadStores().then(() => loadMetafieldDefs());
      if (initialJobId) {
        openJob(initialJobId);
      }
    }
  }, [user, initialJobId]);

  // When web-imported parsed rows are passed in, trigger the reorganize flow automatically
  useEffect(() => {
    if (!initialParsedRows || initialParsedRows.length === 0 || !user || view === 'items') return;

    const rows = initialParsedRows;
    const fileName = initialFileName || 'Web Import';
    const contextText = initialContext || '';

    setParsedCsvRows(rows);
    setParsedFileName(fileName);
    setContext(contextText);
    // Always enable image search — the backend will use direct URL scraping
    // when SourceUrl is available, falling back to search for rows without URLs
    setSearchImages(true);
    setIsReorganizing(true);
    setView('reorganize-review');

    const titleCol = detectTitleColumn(rows[0]);

    // Extract brand hints client-side (same as CSV flow)
    const wordCounts = new Map<string, number>();
    for (const row of rows) {
      const title = (row[titleCol] || Object.values(row)[0] || '').toString();
      const words = title.split(/\s+/);
      for (const len of [2, 1]) {
        if (words.length >= len) {
          const prefix = words.slice(0, len).join(' ');
          if (prefix.length >= 3) {
            wordCounts.set(prefix, (wordCounts.get(prefix) || 0) + 1);
          }
        }
      }
    }
    const brandHints = Array.from(wordCounts.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([word, count]) => `${word} (${count}x)`);

    reorganizeRunner.start(rows, titleCol, contextText, brandHints, fileName);
  }, [initialParsedRows, user]);

  // Subscribe to module-level reorganize runner (survives tab switches)
  useEffect(() => {
    // On mount, check if runner is already running/done
    const initial = reorganizeRunner.getState();
    if (initial.status === 'running') {
      setIsReorganizing(true);
      setView('reorganize-review');
      setReorganizeProgress({
        current: initial.batch,
        total: initial.total,
        status: initial.message,
        familiesFound: initial.familiesFound,
      });
      if (initial.parsedRows) setParsedCsvRows(initial.parsedRows);
      if (initial.fileName) setParsedFileName(initial.fileName);
      if (initial.context) setContext(initial.context);
    } else if (initial.status === 'done' && initial.results.length > 0) {
      // Runner finished while we were unmounted
      setIsReorganizing(false);
      setReorganizeProgress(null);
      setReorganizeResults(initial.results);
      if (initial.parsedRows) setParsedCsvRows(initial.parsedRows);
      if (initial.fileName) setParsedFileName(initial.fileName);
      if (initial.context) setContext(initial.context);
      setView('reorganize-review');
      // Auto-expand
      const expandKeys = new Set<string>();
      initial.results.filter((r: any) => r.status === 'process').forEach((r: any) => {
        if (r.familyKey) expandKeys.add(`family:${r.familyKey}`);
        if (r.groupKey) expandKeys.add(`product:${r.groupKey}`);
      });
      setReorganizeExpandedGroups(expandKeys);
      toast({ title: 'AI reorganization complete', description: `${initial.results.length} items analyzed.` });
      reorganizeRunner.reset();
    }

    const unsub = reorganizeRunner.subscribe((s: RunnerState) => {
      if (s.status === 'running') {
        setIsReorganizing(true);
        setIsParsing(true);
        setReorganizeProgress({
          current: s.batch,
          total: s.total,
          status: s.message,
          familiesFound: s.familiesFound,
        });
      } else if (s.status === 'done') {
        setIsReorganizing(false);
        setIsParsing(false);
        setReorganizeProgress(null);
        setReorganizeResults(s.results);
        if (s.parsedRows) setParsedCsvRows(s.parsedRows);
        if (s.fileName) setParsedFileName(s.fileName);
        if (s.context) setContext(s.context);
        // Auto-expand
        const expandKeys = new Set<string>();
        s.results.filter((r: any) => r.status === 'process').forEach((r: any) => {
          if (r.familyKey) expandKeys.add(`family:${r.familyKey}`);
          if (r.groupKey) expandKeys.add(`product:${r.groupKey}`);
        });
        setReorganizeExpandedGroups(expandKeys);
        toast({ title: 'AI reorganization complete', description: `${s.results.length} items analyzed across ${s.familiesFound} brand families.` });
        reorganizeRunner.reset();
      } else if (s.status === 'error') {
        setIsReorganizing(false);
        setIsParsing(false);
        setReorganizeProgress(null);
        toast({ title: 'Processing failed', description: s.error || 'Unknown error', variant: 'destructive' });
        setView('upload');
        reorganizeRunner.reset();
      } else if (s.status === 'cancelled') {
        setIsReorganizing(false);
        setIsParsing(false);
        setReorganizeProgress(null);
        toast({ title: 'Cancelled', description: 'Reorganization was cancelled.' });
        setView('upload');
        reorganizeRunner.reset();
      }
    });

    return unsub;
  }, []);

  const fetchCollections = async () => {
    setLoadingCollections(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-fetch-collections', { body: {} });
      if (!error && data?.collections) setCollections(data.collections);
    } catch { /* ignore */ }
    setLoadingCollections(false);
  };

  useEffect(() => {
    if (stores.length > 0 && collections.length === 0) fetchCollections();
  }, [stores]);

  const loadJobs = async () => {
    setLoadingJobs(true);
    const { data, error } = await supabase
      .from('bulk_import_jobs')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setJobs(data as any[]);
    setLoadingJobs(false);
  };

  const loadStores = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/shopify-auth?action=check-status`,
        { headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.stores?.length > 0) {
          setStores(data.stores);
          setSelectedStoreIds(data.stores.map((s: ShopifyStore) => s.id));
        }
      }
    } catch (err) { console.error('Error loading stores:', err); }
  };

  const loadMetafieldDefs = async () => {
    if (propMetafieldDefs && propMetafieldDefs.length > 0) {
      setMetafieldDefs(propMetafieldDefs as any);
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('shopify-fetch-metafields', { body: {} });
      if (!error && data?.definitions) {
        setMetafieldDefs(data.definitions);
      }
    } catch (err) { console.error('Error loading metafield definitions:', err); }
  };

  // ─── Open a job → load its items ─────────────
  const openJob = async (jobId: string) => {
    setActiveJobId(jobId);
    setView('items');
    setLoadingItems(true);
    setFilterTab('all');
    setExpandedGroups(new Set());

    const { data, error } = await supabase
      .from('bulk_import_items')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setItems(data.map((d: any) => ({
        ...d,
        image_urls: Array.isArray(d.image_urls) ? d.image_urls : [],
        published_stores: Array.isArray(d.published_stores) ? d.published_stores : [],
        variant_label: d.variant_label || null,
        is_parent: d.is_parent || false,
        skip_reason: d.skip_reason || null,
        ai_group_key: d.ai_group_key || null,
        family_key: d.family_key || null,
      })));
    }
    setLoadingItems(false);
    setReorganizeResults(null);
  };

  const deleteJob = async (jobId: string) => {
    await supabase.from('bulk_import_jobs').delete().eq('id', jobId);
    setJobs(prev => prev.filter(j => j.id !== jobId));
    toast({ title: 'Job deleted' });
  };

  // ─── Parse file & create job ──────────────────
  const parseFile = async (f: File): Promise<Record<string, string>[]> => {
    const text = await f.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(delimiter).map(h => h.replace(/^"|"$/g, '').trim());
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map(v => v.replace(/^"|"$/g, '').trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
      rows.push(row);
    }
    return rows;
  };

  const handleUploadAndParse = async () => {
    if (!file) { toast({ title: 'No file', description: 'Please select a file.', variant: 'destructive' }); return; }
    if (!context.trim()) { toast({ title: 'Context required', description: "Please describe what you're uploading.", variant: 'destructive' }); return; }
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      toast({ title: 'Excel files', description: 'Please save as CSV and re-upload.', variant: 'destructive' });
      return;
    }

    setIsParsing(true);
    try {
      const rows = await parseFile(file);
      if (rows.length === 0) {
        toast({ title: 'Empty file', description: 'No data rows found.', variant: 'destructive' });
        setIsParsing(false);
        return;
      }

      setParsedCsvRows(rows);
      setParsedFileName(file.name);
      setIsReorganizing(true);
      setView('reorganize-review');

      const titleCol = detectTitleColumn(rows[0]);

      // Extract brand hints client-side
      const wordCounts = new Map<string, number>();
      for (const row of rows) {
        const title = (row[titleCol] || Object.values(row)[0] || '').toString();
        const words = title.split(/\s+/);
        for (const len of [2, 1]) {
          if (words.length >= len) {
            const prefix = words.slice(0, len).join(' ');
            if (prefix.length >= 3) {
              wordCounts.set(prefix, (wordCounts.get(prefix) || 0) + 1);
            }
          }
        }
      }
      const brandHints = Array.from(wordCounts.entries())
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([word, count]) => `${word} (${count}x)`);

      // Delegate to the module-level runner (survives tab switches)
      reorganizeRunner.start(rows, titleCol, context.trim(), brandHints, file.name);
      // The useEffect subscription handles state updates from here
    } catch (err: any) {
      toast({ title: 'Processing failed', description: err.message, variant: 'destructive' });
      setIsParsing(false);
      setIsReorganizing(false);
      setView('upload');
    }
  };

  // ─── Approve reorganization → write to DB ─────
  const approveReorganization = async () => {
    if (!reorganizeResults || parsedCsvRows.length === 0) return;

    setIsApprovingReorganize(true);
    try {
      const titleCol = detectTitleColumn(parsedCsvRows[0]);

      // Create job
      const { data: job, error: jobErr } = await supabase
        .from('bulk_import_jobs')
        .insert({
          user_id: user!.id,
          file_name: parsedFileName,
          context: context.trim(),
          status: 'parsed',
          total_rows: parsedCsvRows.length,
          processed_rows: 0,
          search_images: searchImages,
        })
        .select()
        .single();

      if (jobErr || !job) throw jobErr || new Error('Failed to create job');

      // Build items from reorganize results, with AI grouping pre-applied
      const itemsToInsert = reorganizeResults.map((entry: any) => {
        const row = parsedCsvRows[entry.originalIndex];
        const isSkip = entry.status === 'skip';
        return {
          job_id: job.id,
          user_id: user!.id,
          group_key: normalizeForGrouping(entry.groupKey || row?.[titleCol] || ''),
          ai_group_key: entry.groupKey || null,
          family_key: entry.familyKey || null,
          variant_label: entry.variantLabel || null,
          is_parent: entry.isParent || false,
          skip_reason: isSkip ? (entry.skipReason || 'Flagged by AI') : null,
          raw_data: row,
          title: row?.[titleCol] || null,
          status: isSkip ? 'flagged' : 'pending',
        };
      });

      // Also add any rows not covered by AI results
      const coveredIndices = new Set(reorganizeResults.map((r: any) => r.originalIndex));
      for (let i = 0; i < parsedCsvRows.length; i++) {
        if (!coveredIndices.has(i)) {
          const row = parsedCsvRows[i];
          const junk = isJunkRow(row, titleCol);
          itemsToInsert.push({
            job_id: job.id,
            user_id: user!.id,
            group_key: normalizeForGrouping(row[titleCol] || ''),
            ai_group_key: null,
            family_key: null,
            variant_label: null,
            is_parent: false,
            skip_reason: junk ? 'Junk row detected' : null,
            raw_data: row,
            title: row[titleCol] || null,
            status: junk ? 'flagged' : 'pending',
          });
        }
      }

      // Insert in batches of 100
      for (let i = 0; i < itemsToInsert.length; i += 100) {
        const batch = itemsToInsert.slice(i, i + 100);
        const { error: itemErr } = await supabase.from('bulk_import_items').insert(batch);
        if (itemErr) throw itemErr;
      }

      toast({ title: 'Import created', description: `${itemsToInsert.length} products organized. Process with AI to generate listings.` });

      // Clean up and open the job
      setParsedCsvRows([]);
      setParsedFileName('');
      setReorganizeResults(null);
      setFile(null);
      setContext('');

      await loadJobs();
      if (onJobCreated) {
        onJobCreated(job.id);
      } else {
        await openJob(job.id);
      }
    } catch (err: any) {
      toast({ title: 'Error creating import', description: err.message, variant: 'destructive' });
    } finally {
      setIsApprovingReorganize(false);
    }
  };

  // ─── AI Processing ────────────────────────────
  const processWithAI = async () => {
    const job = jobs.find(j => j.id === activeJobId);
    if (!job) return;

    const pendingItems = items.filter(i => i.status === 'pending');
    if (pendingItems.length === 0) {
      toast({ title: 'Nothing to process', description: 'All items are already processed.' });
      return;
    }

    cancelRef.current = false;
    setIsProcessing(true);
    setProcessedRows(0);
    setProcessingLabel(`Starting AI processing...`);

    // Update job status
    await supabase.from('bulk_import_jobs').update({ status: 'processing' }).eq('id', job.id);

    try {

    const BATCH_SIZE = 10;
    let totalProcessed = 0;

    for (let i = 0; i < pendingItems.length; i += BATCH_SIZE) {
      if (cancelRef.current) break;

      const batch = pendingItems.slice(i, i + BATCH_SIZE);
      const batchEnd = Math.min(i + BATCH_SIZE, pendingItems.length);
      setProcessingLabel(`Preparing products ${i + 1}–${batchEnd} of ${pendingItems.length}...`);

      // Mark batch items as processing in local state
      const batchIds = new Set(batch.map(b => b.id));
      setItems(prev => prev.map(item => batchIds.has(item.id) ? { ...item, status: 'processing' } : item));

      try {
        const rows = batch.map(b => b.raw_data);
        const { data, error } = await supabase.functions.invoke('bulk-listing-prepare', {
          body: {
            rows,
            context: job.context,
            searchImages: job.search_images,
            metafieldDefinitions: metafieldDefs.length > 0 ? metafieldDefs : undefined,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const prepared = data.listings || [];

        // Update each item in DB and local state
        for (let j = 0; j < batch.length; j++) {
          const item = batch[j];
          const ai = prepared[j] || {};

          // Determine image URLs: use AI results, fall back to original row images
          let finalImageUrls = ai.imageUrls || [];
          if ((!finalImageUrls || finalImageUrls.length === 0) && item.raw_data) {
            const rawImgs = (item.raw_data as any)?.images || (item.raw_data as any)?.Images || (item.raw_data as any)?.image || '';
            const imgStr = rawImgs.toString().trim();
            if (imgStr) {
              const isJunk = (url: string) => {
                const l = url.toLowerCase();
                return l.includes('logo') || l.includes('favicon') || l.includes('icon') || l.endsWith('.svg') || l.includes('maxlength=70') || l.includes('plogos');
              };
              finalImageUrls = imgStr.split('|').map((u: string) => u.trim()).filter((u: string) => u && u.startsWith('http') && !isJunk(u)).slice(0, 5);
            }
          }

          const updates: any = {
            title: ai.title || item.title,
            description: ai.description || null,
            price: ai.price || null,
            tags: ai.tags || null,
            product_type: ai.productType || null,
            image_urls: finalImageUrls,
            image_search_note: ai.imageSearchNote || null,
            status: 'ready',
            group_key: normalizeForGrouping(ai.title || item.title || ''),
          };

          // Store AI-generated metafields in raw_data
          if (ai.metafields) {
            updates.raw_data = { ...(item.raw_data || {}), metafields: ai.metafields };
          }

          await supabase.from('bulk_import_items').update(updates).eq('id', item.id);

          setItems(prev => prev.map(it => it.id === item.id ? {
            ...it,
            ...updates,
            image_urls: updates.image_urls as string[],
          } : it));
        }

        totalProcessed += batch.length;
        setProcessedRows(totalProcessed);

        // Update job progress
        await supabase.from('bulk_import_jobs').update({
          processed_rows: (job.processed_rows || 0) + totalProcessed,
        }).eq('id', job.id);

      } catch (batchErr: any) {
        console.error(`Batch failed:`, batchErr);
        // Mark failed
        for (const item of batch) {
          await supabase.from('bulk_import_items').update({ status: 'failed' }).eq('id', item.id);
          setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'failed' } : it));
        }
        toast({ title: `Batch failed`, description: batchErr.message, variant: 'destructive' });
        totalProcessed += batch.length;
        setProcessedRows(totalProcessed);
      }

      await new Promise(r => setTimeout(r, 50));
    }

    // Update job status
    const finalStatus = cancelRef.current ? 'parsed' : 'ready';
    await supabase.from('bulk_import_jobs').update({
      status: finalStatus,
      processed_rows: totalProcessed,
    }).eq('id', job.id);

    // Collection creation is now manual via "Sync Collections to Shopify" button in the ready tab

    setIsProcessing(false);
    setProcessingLabel(cancelRef.current ? 'Processing cancelled' : `All ${totalProcessed} products processed`);
    await loadJobs();

    } catch (outerErr: any) {
      console.error('AI processing crashed:', outerErr);
      // Reset job status so user can retry
      await supabase.from('bulk_import_jobs').update({ status: 'parsed' }).eq('id', job.id);
      setIsProcessing(false);
      setProcessingLabel('Processing failed — you can retry');
      toast({ title: 'Processing failed', description: outerErr.message, variant: 'destructive' });
      await loadJobs();
    }
  };

  // ─── Sync Single Collection to Shopify ─────
  const handleSyncSingleCollection = async (familyKey: string) => {
    if (selectedStoreIds.length === 0) {
      toast({ title: 'No store selected', variant: 'destructive' });
      return;
    }
    setSyncingFamilyKey(familyKey);
    const colMap: Record<string, number> = { ...familyCollectionMap };

    for (const storeId of selectedStoreIds) {
      try {
        const { data: colData } = await supabase.functions.invoke('shopify-create-collection', {
          body: { title: familyKey, shopifyCredentialId: storeId },
        });
        if (colData?.collectionId) {
          colMap[familyKey] = colData.collectionId;
        }
      } catch (colErr) {
        console.warn(`Collection creation failed for "${familyKey}":`, colErr);
      }
    }

    setFamilyCollectionMap(colMap);
    setSyncingFamilyKey(null);
    await fetchCollections();
    toast({ title: `Collection "${familyKey}" synced to Shopify` });
  };

  // ─── Publish / Skip ───────────────────────────
  const publishItem = async (item: BulkImportItem) => {
    if (selectedStoreIds.length === 0) {
      toast({ title: 'No store selected', variant: 'destructive' });
      return;
    }

    setPublishingItemId(item.id);
    try {
      const storeNames: string[] = [];
      const familyKey = item.family_key || null;

      for (const storeId of selectedStoreIds) {
        // Use cached collection ID or fall back to API call
        let collectionIdForPublish = selectedCollectionId ? parseInt(selectedCollectionId) : null;
        if (familyKey && !collectionIdForPublish) {
          if (familyCollectionMap[familyKey]) {
            collectionIdForPublish = familyCollectionMap[familyKey];
          } else {
            try {
              const { data: colData } = await supabase.functions.invoke('shopify-create-collection', {
                body: { title: familyKey, shopifyCredentialId: storeId },
              });
              if (colData?.collectionId) {
                collectionIdForPublish = colData.collectionId;
                setFamilyCollectionMap(prev => ({ ...prev, [familyKey]: colData.collectionId }));
              }
            } catch (colErr) {
              console.warn('Auto-create collection failed, continuing without:', colErr);
            }
          }
        }

        // Build metafields array from raw_data
        const itemMetafields = item.raw_data?.metafields ? Object.entries(item.raw_data.metafields as Record<string, string>).map(([nsKey, value]) => {
          const [namespace, ...keyParts] = nsKey.split('.');
          const key = keyParts.join('.');
          const def = metafieldDefs.find(d => d.namespace === namespace && d.key === key);
          return { namespace, key, value, type: def?.type || 'single_line_text_field' };
        }).filter(mf => mf.value) : [];

        const { data, error } = await supabase.functions.invoke('shopify-create-listing', {
          body: {
            title: item.title,
            description: item.description,
            price: item.price,
            quantity: 1,
            tags: includeTags ? item.tags : '',
            productType: item.product_type,
            imageUrls: item.image_urls || [],
            shopifyCredentialId: storeId,
            status: listingStatus,
            inventoryTracked,
            physicalProduct,
            collectionId: collectionIdForPublish,
            metafields: itemMetafields.length > 0 ? itemMetafields : undefined,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const store = stores.find(s => s.id === storeId);
        if (store) storeNames.push(store.label || store.shopDomain);
      }

      await supabase.from('bulk_import_items').update({
        status: 'published',
        published_stores: storeNames,
      }).eq('id', item.id);

      setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'published', published_stores: storeNames } : it));
      toast({ title: 'Published!', description: `Listed on: ${storeNames.join(', ')}` });
    } catch (err: any) {
      toast({ title: 'Publish failed', description: err.message, variant: 'destructive' });
      await supabase.from('bulk_import_items').update({ status: 'failed' }).eq('id', item.id);
      setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'failed' } : it));
    } finally {
      setPublishingItemId(null);
    }
  };

  // Publish an entire group as a single Shopify product with variants
  const publishGroup = async (group: { key: string; items: BulkImportItem[]; parentTitle: string }) => {
    if (selectedStoreIds.length === 0) {
      toast({ title: 'No store selected', variant: 'destructive' });
      return;
    }

    const variantItems = group.items.filter(i => i.status === 'ready');
    if (variantItems.length === 0) {
      toast({ title: 'No ready items in group', variant: 'destructive' });
      return;
    }

    // If only 1 variant, use single-item publish
    if (variantItems.length === 1) {
      return publishItem(variantItems[0]);
    }

    setPublishingItemId(group.items[0].id);
    try {
      const storeNames: string[] = [];
      // Determine family_key for auto-collection
      const familyKey = variantItems[0]?.family_key || null;

      for (const storeId of selectedStoreIds) {
        // Use cached collection ID or fall back to API call
        let collectionIdForPublish = selectedCollectionId ? parseInt(selectedCollectionId) : null;
        if (familyKey && !collectionIdForPublish) {
          if (familyCollectionMap[familyKey]) {
            collectionIdForPublish = familyCollectionMap[familyKey];
          } else {
            try {
              const { data: colData } = await supabase.functions.invoke('shopify-create-collection', {
                body: { title: familyKey, shopifyCredentialId: storeId },
              });
              if (colData?.collectionId) {
                collectionIdForPublish = colData.collectionId;
                setFamilyCollectionMap(prev => ({ ...prev, [familyKey]: colData.collectionId }));
              }
            } catch (colErr) {
              console.warn('Auto-create collection failed, continuing without:', colErr);
            }
          }
        }

        // Derive variant labels from the difference between full title and group parent title
        const variants = variantItems.map(item => {
          const fullTitle = item.title || '';
          const parentNorm = group.parentTitle;
          const parenMatch = fullTitle.match(/\(([^)]+)\)\s*$/);
          const label = parenMatch ? parenMatch[1] : fullTitle.replace(new RegExp('^' + parentNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').replace(/^\s*[-–—:/]\s*/, '').trim() || fullTitle;
          return {
            label: label || `Variant`,
            price: item.price || '0',
            quantity: 1,
          };
        });

        // Collect all unique images from variants
        const allImages = variantItems.flatMap(i => i.image_urls || []);
        const uniqueImages = [...new Set(allImages)];

        // Build metafields from the parent item
        const parentItem = variantItems[0];
        const groupMetafields = parentItem.raw_data?.metafields ? Object.entries(parentItem.raw_data.metafields as Record<string, string>).map(([nsKey, value]) => {
          const [namespace, ...keyParts] = nsKey.split('.');
          const key = keyParts.join('.');
          const def = metafieldDefs.find(d => d.namespace === namespace && d.key === key);
          return { namespace, key, value, type: def?.type || 'single_line_text_field' };
        }).filter(mf => mf.value) : [];

        const { data, error } = await supabase.functions.invoke('shopify-create-product-with-variants', {
          body: {
            title: group.parentTitle,
            description: variantItems[0].description,
            productType: variantItems[0].product_type,
            tags: includeTags ? variantItems[0].tags : '',
            imageUrls: uniqueImages,
            variants,
            shopifyCredentialId: storeId,
            status: listingStatus,
            inventoryTracked,
            physicalProduct,
            collectionId: collectionIdForPublish,
            metafields: groupMetafields.length > 0 ? groupMetafields : undefined,
          },
        });
        if (error) {
          console.error('Edge function invoke error:', error);
          throw new Error(`Could not reach the publishing service. Please try again in a moment.`);
        }
        if (data?.error) throw new Error(data.error);
        const store = stores.find(s => s.id === storeId);
        if (store) storeNames.push(store.label || store.shopDomain);
      }

      // Mark all variant items as published
      const ids = variantItems.map(i => i.id);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        await supabase.from('bulk_import_items').update({
          status: 'published',
          published_stores: storeNames,
        }).in('id', batch);
      }

      setItems(prev => prev.map(it => ids.includes(it.id) ? { ...it, status: 'published', published_stores: storeNames } : it));
      toast({ title: 'Group published!', description: `${variantItems.length} variants listed on: ${storeNames.join(', ')}` });
    } catch (err: any) {
      toast({ title: 'Group publish failed', description: err.message, variant: 'destructive' });
    } finally {
      setPublishingItemId(null);
    }
  };

  const skipItem = async (itemId: string) => {
    await supabase.from('bulk_import_items').update({ status: 'skipped' }).eq('id', itemId);
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, status: 'skipped' } : it));
  };

  const publishAllReady = async () => {
    const readyGroups = groupedItems.filter(g => g.items.some(i => i.status === 'ready'));
    let published = 0;
    let failed = 0;
    for (let idx = 0; idx < readyGroups.length; idx++) {
      const group = readyGroups[idx];
      const readyInGroup = group.items.filter(i => i.status === 'ready');
      if (readyInGroup.length === 0) continue;
      toast({ title: `Publishing ${idx + 1}/${readyGroups.length}...`, description: group.parentTitle });
      try {
        if (readyInGroup.length > 1) {
          await publishGroup(group);
        } else {
          await publishItem(readyInGroup[0]);
        }
        published++;
      } catch (err: any) {
        failed++;
        console.error(`Failed to publish group "${group.parentTitle}":`, err);
      }
    }
    if (failed > 0) {
      toast({ title: `Published ${published}, failed ${failed}`, variant: 'destructive' });
    } else if (published > 0) {
      toast({ title: `All ${published} groups published!` });
    }
  };

  // ─── Edit ─────────────────────────────────────
  const openEditPanel = (item: BulkImportItem) => {
    setEditItem({ ...item });
    setEditSheetOpen(true);
  };

  const saveEdit = async () => {
    if (!editItem) return;
    const updates: any = {
      title: editItem.title,
      description: editItem.description,
      price: editItem.price,
      tags: editItem.tags,
      product_type: editItem.product_type,
      image_urls: editItem.image_urls,
      raw_data: editItem.raw_data,
    };
    await supabase.from('bulk_import_items').update(updates).eq('id', editItem.id);
    setItems(prev => prev.map(it => it.id === editItem.id ? { ...it, ...updates } : it));
    setEditSheetOpen(false);
    setEditItem(null);
  };

  // ─── Grouping for display (2-tier: family → product groups) ─────
  type ProductGroup = { key: string; items: BulkImportItem[]; parentTitle: string; familyKey: string | null };
  type FamilyGroup = { familyKey: string; label: string; productGroups: ProductGroup[] };

  const { familyGroups, flatGroups: groupedItems } = (() => {
    const displayItems = items.filter(i => i.status !== 'flagged');
    // Build product groups first
    const groups: Map<string, BulkImportItem[]> = new Map();
    const order: string[] = [];
    for (const item of displayItems) {
      const key = item.ai_group_key || item.group_key || item.id;
      if (!groups.has(key)) {
        groups.set(key, []);
        order.push(key);
      }
      groups.get(key)!.push(item);
    }
    const allProductGroups = order.map(key => {
      const gItems = groups.get(key)!;
      const parentItem = gItems.find(i => i.is_parent) || gItems[0];
      const parentTitle = parentItem.ai_group_key || parentItem.title || Object.values(parentItem.raw_data || {})[0] as string || 'Untitled';
      const familyKey = parentItem.family_key || null;
      return { key, items: gItems, parentTitle, familyKey };
    });

    // Group product groups by family_key
    const familyMap = new Map<string, ProductGroup[]>();
    const familyOrder: string[] = [];
    const noFamily: ProductGroup[] = [];
    for (const pg of allProductGroups) {
      if (pg.familyKey) {
        if (!familyMap.has(pg.familyKey)) {
          familyMap.set(pg.familyKey, []);
          familyOrder.push(pg.familyKey);
        }
        familyMap.get(pg.familyKey)!.push(pg);
      } else {
        noFamily.push(pg);
      }
    }

    const familyGroups: FamilyGroup[] = familyOrder.map(fk => ({
      familyKey: fk,
      label: fk,
      productGroups: familyMap.get(fk)!,
    }));
    // Add empty custom collections that have no items yet
    for (const cc of customCollections) {
      if (!familyMap.has(cc)) {
        familyGroups.push({ familyKey: cc, label: cc, productGroups: [] });
      }
    }
    if (noFamily.length > 0) {
      familyGroups.push({ familyKey: '_other', label: 'Other', productGroups: noFamily });
    }

    return { familyGroups, flatGroups: allProductGroups };
  })();

  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());

  const toggleFamilyExpand = (fk: string) => {
    setExpandedFamilies(prev => {
      const next = new Set(prev);
      next.has(fk) ? next.delete(fk) : next.add(fk);
      return next;
    });
  };

  const toggleStore = (storeId: string) => {
    setSelectedStoreIds(prev => prev.includes(storeId) ? prev.filter(id => id !== storeId) : [...prev, storeId]);
  };

  const toggleGroupExpand = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const filteredGroups = groupedItems.filter(g => {
    if (filterTab === 'all') return true;
    return g.items.some(i => i.status === filterTab);
  });

  const filteredFamilyGroups = familyGroups.map(fg => ({
    ...fg,
    productGroups: fg.productGroups.filter(g => {
      if (filterTab === 'all') return true;
      return g.items.some(i => i.status === filterTab);
    }),
  })).filter(fg => fg.productGroups.length > 0);

  const counts = {
    all: items.length,
    pending: items.filter(i => i.status === 'pending').length,
    flagged: items.filter(i => i.status === 'flagged').length,
    ready: items.filter(i => i.status === 'ready').length,
    published: items.filter(i => i.status === 'published').length,
    skipped: items.filter(i => i.status === 'skipped').length,
  };

  const flaggedItems = items.filter(i => i.status === 'flagged');

  const removeFlaggedSelected = async () => {
    const ids = Array.from(selectedFlaggedIds);
    if (ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await supabase.from('bulk_import_items').delete().in('id', batch);
    }
    setItems(prev => prev.filter(it => !selectedFlaggedIds.has(it.id)));
    setSelectedFlaggedIds(new Set());
    // Update job total
    if (activeJobId) {
      const remaining = items.length - ids.length;
      await supabase.from('bulk_import_jobs').update({ total_rows: remaining }).eq('id', activeJobId);
    }
    toast({ title: `Removed ${ids.length} items` });
  };

  const removeAllFlagged = async () => {
    const ids = flaggedItems.map(i => i.id);
    if (ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await supabase.from('bulk_import_items').delete().in('id', batch);
    }
    setItems(prev => prev.filter(it => it.status !== 'flagged'));
    setSelectedFlaggedIds(new Set());
    if (activeJobId) {
      const remaining = items.length - ids.length;
      await supabase.from('bulk_import_jobs').update({ total_rows: remaining }).eq('id', activeJobId);
    }
    toast({ title: `Removed ${ids.length} flagged items` });
  };

  const keepAllFlagged = async () => {
    const ids = flaggedItems.map(i => i.id);
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await supabase.from('bulk_import_items').update({ status: 'pending' }).in('id', batch);
    }
    setItems(prev => prev.map(it => it.status === 'flagged' ? { ...it, status: 'pending' } : it));
    setSelectedFlaggedIds(new Set());
    toast({ title: `Kept ${ids.length} items as products` });
  };

  // ─── Collection management ─────────────────────
  const createCollection = async () => {
    const name = newCollectionName.trim();
    if (!name) return;
    setCustomCollections(prev => [...new Set([...prev, name])]);
    setNewCollectionDialogOpen(false);
    setNewCollectionName('');
    toast({ title: `Collection "${name}" created`, description: 'Reassign product groups to this collection using the dropdown.' });
  };

  const renameFamily = async (oldKey: string, newKey: string) => {
    if (!newKey.trim() || newKey.trim() === oldKey) {
      setRenamingFamily(null);
      return;
    }
    const affectedItems = items.filter(i => i.family_key === oldKey);
    const ids = affectedItems.map(i => i.id);
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await supabase.from('bulk_import_items').update({ family_key: newKey.trim() }).in('id', batch);
    }
    setItems(prev => prev.map(it => it.family_key === oldKey ? { ...it, family_key: newKey.trim() } : it));
    setRenamingFamily(null);
    toast({ title: `Renamed "${oldKey}" → "${newKey.trim()}"` });
  };

  const deleteFamily = async (familyKey: string) => {
    const affectedItems = items.filter(i => i.family_key === familyKey);
    const ids = affectedItems.map(i => i.id);
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await supabase.from('bulk_import_items').update({ family_key: null }).in('id', batch);
    }
    setItems(prev => prev.map(it => it.family_key === familyKey ? { ...it, family_key: null } : it));
    toast({ title: `Dissolved "${familyKey}"`, description: `${ids.length} items moved to Other.` });
  };

  const reassignFamily = async (groupKey: string, newFamilyKey: string | null) => {
    const affectedItems = items.filter(i => (i.ai_group_key || i.group_key || i.id) === groupKey);
    const ids = affectedItems.map(i => i.id);
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await supabase.from('bulk_import_items').update({ family_key: newFamilyKey }).in('id', batch);
    }
    setItems(prev => prev.map(it => ids.includes(it.id) ? { ...it, family_key: newFamilyKey } : it));
    toast({ title: `Moved to ${newFamilyKey || 'Other'}` });
  };

  // Get all unique family keys for reassignment dropdown (include custom collections)
  const allFamilyKeys = Array.from(new Set([
    ...customCollections,
    ...items.filter(i => i.family_key).map(i => i.family_key!)
  ])).sort();

  const activeJob = jobs.find(j => j.id === activeJobId);

  // ═══════════════════════════════════════════════
  //  JOB LIST VIEW
  // ═══════════════════════════════════════════════
  if (view === 'jobs') {
    // If onBackToJobs is provided, the parent (CreateImport) manages the job list.
    // Skip rendering our own job list and show only the upload view trigger.
    if (onBackToJobs) {
      // Go straight to upload mode since the parent shows the job list
      return (
        <div className="space-y-4">
          <Card>
            <CardContent className="py-12 text-center">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">Upload a CSV file</p>
              <p className="text-sm text-muted-foreground mt-1">Click below to upload a spreadsheet for AI processing.</p>
              <Button type="button" onClick={() => { setFile(null); setContext(''); setParsedCsvRows([]); setReorganizeResults(null); setCustomCollections([]); setView('upload'); }} className="mt-4 gap-2">
                <Upload className="h-4 w-4" /> New Import
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Bulk Imports</h2>
            <p className="text-sm text-muted-foreground">Your import jobs persist — resume any time.</p>
          </div>
          <Button type="button" onClick={() => { setFile(null); setContext(''); setParsedCsvRows([]); setReorganizeResults(null); setCustomCollections([]); const el = document.getElementById('bulk-file-input') as HTMLInputElement; if (el) el.value = ''; setView('upload'); }} className="gap-2">
            <Upload className="h-4 w-4" />
            New Import
          </Button>
        </div>

        {loadingJobs ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-medium">No import jobs yet</p>
              <p className="text-sm text-muted-foreground mt-1">Upload a CSV file to get started.</p>
              <Button type="button" onClick={() => { setFile(null); setContext(''); setParsedCsvRows([]); setReorganizeResults(null); setCustomCollections([]); setView('upload'); }} className="mt-4 gap-2">
                <Upload className="h-4 w-4" /> New Import
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {jobs.map(job => {
              const cfg = jobStatusConfig[job.status] || jobStatusConfig.parsed;
              const Icon = cfg.icon;
              return (
                <Card
                  key={job.id}
                  className="cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => openJob(job.id)}
                >
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`${cfg.color}`}>
                        <Icon className={`h-5 w-5 ${job.status === 'processing' ? 'animate-spin' : ''}`} />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{job.file_name || 'Untitled import'}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.total_rows} products · {new Date(job.created_at).toLocaleDateString()}
                          {job.processed_rows > 0 && ` · ${job.processed_rows} processed`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${statusConfig[job.status]?.color || statusConfig.pending.color} text-xs`}>
                        {cfg.label}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  //  UPLOAD VIEW
  // ═══════════════════════════════════════════════
  if (view === 'upload') {
    return (
      <div className="space-y-4">
        <Button type="button" variant="ghost" size="sm" onClick={() => onBackToJobs ? onBackToJobs() : setView('jobs')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Jobs
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              New Bulk Import
            </CardTitle>
            <CardDescription>
              Upload a spreadsheet. Products will be organized and grouped before AI processing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Product File (.csv)</Label>
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => document.getElementById('bulk-file-input')?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                {file ? (
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to select a CSV file</p>
                )}
              </div>
              <input id="bulk-file-input" type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>

            <div className="space-y-2">
              <Label>Describe what you're uploading</Label>
              <Textarea
                placeholder="E.g., 'These are Steam game keys. The Name column has the game title, Price has the retail price in USD.'"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                The AI will use your description to understand the columns and generate optimized listings.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="search-images" checked={searchImages} onCheckedChange={(c) => setSearchImages(!!c)} />
              <Label htmlFor="search-images" className="cursor-pointer">Search for product images automatically</Label>
            </div>

            {/* Listing Options */}
            <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
              <Label className="text-sm font-semibold">Listing Options</Label>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Default Status</Label>
                  <Select value={listingStatus} onValueChange={setListingStatus}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="unlisted">Unlisted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {collections.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Collection</Label>
                    <Select value={selectedCollectionId || 'none'} onValueChange={(v) => setSelectedCollectionId(v === 'none' ? '' : v)}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {collections.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={includeTags} onCheckedChange={(c) => setIncludeTags(!!c)} />
                  <span className="text-sm">Include Tags</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={inventoryTracked} onCheckedChange={(c) => setInventoryTracked(!!c)} />
                  <span className="text-sm">Inventory Tracked</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={physicalProduct} onCheckedChange={(c) => setPhysicalProduct(!!c)} />
                  <span className="text-sm">Physical Product</span>
                </label>
              </div>
            </div>

            {stores.length > 0 && (
              <div className="space-y-2">
                <Label>Publish to Shopify stores</Label>
                <div className="space-y-2">
                  {stores.map((store) => (
                    <div key={store.id} className="flex items-center gap-2">
                      <Checkbox id={`store-${store.id}`} checked={selectedStoreIds.includes(store.id)} onCheckedChange={() => toggleStore(store.id)} />
                      <Label htmlFor={`store-${store.id}`} className="cursor-pointer flex items-center gap-1.5">
                        <Store className="h-3.5 w-3.5" />
                        {store.label || store.shopDomain}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stores.length === 0 && (
              <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                No Shopify stores connected. Go to <span className="font-medium">Connections</span> to add one.
              </p>
            )}

            <Button type="button" onClick={handleUploadAndParse} disabled={!file || !context.trim() || isParsing || isReorganizing} className="w-full gap-2">
              {isParsing || isReorganizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isParsing ? 'Parsing...' : isReorganizing ? 'Organizing with AI...' : 'Upload & Organize with AI'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  //  REORGANIZE REVIEW VIEW
  // ═══════════════════════════════════════════════
  if (view === 'reorganize-review') {
    const processCount = reorganizeResults?.filter((r: any) => r.status === 'process').length || 0;
    const skipCount = reorganizeResults?.filter((r: any) => r.status === 'skip').length || 0;
    const familyCount = new Set(reorganizeResults?.filter((r: any) => r.familyKey).map((r: any) => r.familyKey) || []).size;
    const productCount = new Set(reorganizeResults?.filter((r: any) => r.status === 'process').map((r: any) => r.groupKey) || []).size;

    // Build 3-level tree: Family → Product (groupKey) → Variants
    const families = new Map<string, Map<string, any[]>>();
    const familyOrder: string[] = [];
    const ungrouped: any[] = [];
    for (const entry of (reorganizeResults || [])) {
      if (entry.status === 'skip') continue;
      const fk = entry.familyKey || '_ungrouped';
      if (!families.has(fk)) {
        families.set(fk, new Map());
        familyOrder.push(fk);
      }
      const products = families.get(fk)!;
      const gk = entry.groupKey || entry.originalTitle;
      if (!products.has(gk)) products.set(gk, []);
      products.get(gk)!.push(entry);
    }
    const skipped = (reorganizeResults || []).filter((r: any) => r.status === 'skip');

    // Toggle helpers for families and products
    const toggleReorgExpand = (key: string) => {
      setReorganizeExpandedGroups(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
      });
    };

    return (
      <div className="space-y-4">
        <Button type="button" variant="ghost" size="sm" onClick={() => { setFile(null); setContext(''); setParsedCsvRows([]); setReorganizeResults(null); setCustomCollections([]); const el = document.getElementById('bulk-file-input') as HTMLInputElement; if (el) el.value = ''; setView('upload'); }} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Upload
        </Button>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">AI Reorganization Review</CardTitle>
                  <CardDescription>
                    {isReorganizing ? 'Analyzing your products...' : `${familyCount} families, ${productCount} products, ${processCount} items to process, ${skipCount} flagged`}
                  </CardDescription>
                </div>
              </div>
              {!isReorganizing && reorganizeResults && (
                <div className="flex gap-2">
                   <Button type="button" size="sm" variant="outline" onClick={() => { setFile(null); setContext(''); setParsedCsvRows([]); setReorganizeResults(null); setCustomCollections([]); const el = document.getElementById('bulk-file-input') as HTMLInputElement; if (el) el.value = ''; setView('upload'); }} className="gap-1">
                     <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                  <Button size="sm" onClick={approveReorganization} disabled={isApprovingReorganize} className="gap-1">
                    {isApprovingReorganize ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                    {isApprovingReorganize ? 'Creating...' : 'Approve & Create Job'}
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isReorganizing ? (
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                {reorganizeProgress ? (
                  <>
                    <p className="text-sm font-medium">{reorganizeProgress.status}</p>
                    <div className="w-64">
                      <Progress value={reorganizeProgress.total > 0 ? (reorganizeProgress.current / reorganizeProgress.total) * 100 : 0} className="h-3" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {reorganizeProgress.familiesFound > 0 && `Found ${reorganizeProgress.familiesFound} brand families so far • `}
                      {parsedCsvRows.length} products total
                    </p>
                    <Button type="button" size="sm" variant="outline" onClick={() => { reorganizeRunner.cancel(); }} className="gap-1">
                      <X className="h-3 w-3" /> Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">AI is analyzing {parsedCsvRows.length} products...</p>
                    <p className="text-xs text-muted-foreground">Identifying families, grouping variants, detecting junk rows</p>
                  </>
                )}
              </div>
            ) : reorganizeResults ? (
              <div className="max-h-[500px] overflow-y-auto border rounded-md bg-background p-3 space-y-1">
                {familyOrder.map(fk => {
                  const products = families.get(fk)!;
                  const productKeys = Array.from(products.keys());
                  const isFamilyExpanded = reorganizeExpandedGroups.has(`family:${fk}`);
                  const totalItems = Array.from(products.values()).reduce((sum, arr) => sum + arr.length, 0);

                  if (fk === '_ungrouped') {
                    // Render ungrouped items flat
                    return productKeys.map(gk => {
                      const gItems = products.get(gk)!;
                      return (
                        <div key={gk} className="flex items-center gap-2 py-1 px-2 text-sm">
                          <span className="truncate">{gItems[0]?.originalTitle || gk}</span>
                        </div>
                      );
                    });
                  }

                  return (
                    <div key={fk} className="border rounded-md mb-2">
                      {/* Family header */}
                      <div
                        className="flex items-center gap-2 py-2 px-3 bg-muted/40 rounded-t-md cursor-pointer hover:bg-muted/60"
                        onClick={() => toggleReorgExpand(`family:${fk}`)}
                      >
                        {isFamilyExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        <FolderOpen className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">{fk}</span>
                        <Badge variant="secondary" className="text-xs">{productKeys.length} products · {totalItems} items</Badge>
                      </div>

                      {isFamilyExpanded && (
                        <div className="px-2 py-1">
                          {productKeys.map(gk => {
                            const gItems = products.get(gk)!;
                            const isProductExpanded = reorganizeExpandedGroups.has(`product:${gk}`);
                            return (
                              <div key={gk} className="ml-3">
                                <div
                                  className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/30 cursor-pointer"
                                  onClick={() => toggleReorgExpand(`product:${gk}`)}
                                >
                                  {gItems.length > 1 ? (
                                    isProductExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : <div className="w-3.5" />}
                                  <span className="text-sm font-medium">{gk}</span>
                                  {gItems.length > 1 && (
                                    <Badge variant="secondary" className="text-xs">{gItems.length} variants</Badge>
                                  )}
                                </div>
                                {isProductExpanded && gItems.map((entry: any) => (
                                  <div key={entry.originalIndex} className="flex items-center gap-2 py-1 px-2 pl-10 text-sm text-muted-foreground">
                                    <CornerDownRight className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[300px]">{entry.originalTitle}</span>
                                    {entry.variantLabel && (
                                      <Badge variant="outline" className="text-xs shrink-0">{entry.variantLabel}</Badge>
                                    )}
                                    {entry.isParent && (
                                      <Badge className="text-xs bg-primary/20 text-primary shrink-0">Parent</Badge>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {skipped.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Flagged for removal ({skipped.length})
                    </p>
                    {skipped.map((entry: any) => (
                      <div key={entry.originalIndex} className="flex items-center gap-2 py-1 px-2 text-sm line-through text-muted-foreground">
                        <XCircle className="h-3 w-3 text-destructive shrink-0" />
                        <span className="truncate max-w-[300px]">{entry.originalTitle}</span>
                        {entry.skipReason && (
                          <span className="text-xs text-destructive/70 shrink-0">— {entry.skipReason}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">Something went wrong. Please try again.</div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  //  ITEMS VIEW (pre-AI and post-AI)
  // ═══════════════════════════════════════════════
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => { if (onBackToJobs) { onBackToJobs(); } else { setView('jobs'); setActiveJobId(null); } }} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Jobs
          </Button>
          <span className="text-sm text-muted-foreground">
            {activeJob?.file_name || 'Import'}
          </span>
        </div>
        {(activeJob?.status === 'parsed' || activeJob?.status === 'processing' || (activeJob?.status === 'ready' && counts.pending > 0)) && counts.pending > 0 && counts.flagged === 0 && (
          <Button type="button" onClick={processWithAI} disabled={isProcessing} className="gap-2">
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {activeJob?.status === 'ready' ? `Resume Processing (${counts.pending})` : `Process with AI (${counts.pending})`}
          </Button>
        )}
        {(activeJob?.status === 'parsed' || activeJob?.status === 'processing') && counts.pending > 0 && counts.flagged > 0 && (
          <Button disabled className="gap-2 opacity-50">
            <Sparkles className="h-4 w-4" />
            Resolve flagged items first
          </Button>
        )}
      </div>

      {/* Processing banner */}
      {isProcessing && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">{processingLabel}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { cancelRef.current = true; }}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
            <Progress value={counts.pending > 0 ? (processedRows / (processedRows + counts.pending)) * 100 : 100} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">{processedRows} processed</p>
          </CardContent>
        </Card>
      )}

      {/* Reorganize review is now a separate view */}

      {/* Flagged items review banner */}
      {counts.flagged > 0 && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                <div>
                  <p className="text-sm font-medium">{counts.flagged} items need review</p>
                  <p className="text-xs text-muted-foreground">These look like junk, metadata, or empty rows. Remove or keep them as products.</p>
                </div>
              </div>
              <div className="flex gap-2">
                {selectedFlaggedIds.size > 0 && (
                  <Button size="sm" variant="destructive" onClick={removeFlaggedSelected} className="gap-1">
                    <XCircle className="h-3.5 w-3.5" /> Remove Selected ({selectedFlaggedIds.size})
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={removeAllFlagged} className="gap-1">
                  <Trash2 className="h-3.5 w-3.5" /> Remove All Flagged
                </Button>
                <Button size="sm" variant="outline" onClick={keepAllFlagged} className="gap-1">
                  <CheckCheck className="h-3.5 w-3.5" /> Keep All as Products
                </Button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md bg-background p-2">
              {flaggedItems.map(item => {
                const rawTitle = item.title || Object.values(item.raw_data || {})[0] as string || '(empty)';
                return (
                  <div key={item.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 text-sm">
                    <Checkbox
                      checked={selectedFlaggedIds.has(item.id)}
                      onCheckedChange={(c) => {
                        setSelectedFlaggedIds(prev => {
                          const next = new Set(prev);
                          c ? next.add(item.id) : next.delete(item.id);
                          return next;
                        });
                      }}
                    />
                    <span className="truncate max-w-[350px] text-muted-foreground">{rawTitle}</span>
                    {item.skip_reason && (
                      <span className="text-xs text-destructive/70 shrink-0">— {item.skip_reason}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto shrink-0">
                      {Object.values(item.raw_data || {}).filter(Boolean).length} fields
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter tabs + bulk actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as FilterTab)}>
          <TabsList>
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
            <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
            {counts.flagged > 0 && <TabsTrigger value="flagged">Flagged ({counts.flagged})</TabsTrigger>}
            <TabsTrigger value="ready">Ready ({counts.ready})</TabsTrigger>
            <TabsTrigger value="published">Published ({counts.published})</TabsTrigger>
            <TabsTrigger value="skipped">Skipped ({counts.skipped})</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2">
          {stores.length > 1 && (
            <div className="flex items-center gap-1">
              {stores.map(s => (
                <Badge
                  key={s.id}
                  variant={selectedStoreIds.includes(s.id) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => toggleStore(s.id)}
                >
                  {s.label || s.shopDomain}
                </Badge>
              ))}
            </div>
          )}
          {counts.ready > 0 && (
            <Button size="sm" onClick={publishAllReady} disabled={stores.length === 0} className="gap-1">
              <Rocket className="h-3.5 w-3.5" />
              Publish All Ready ({counts.ready})
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setNewCollectionDialogOpen(true)} className="gap-1">
            <FolderPlus className="h-3.5 w-3.5" />
            New Collection
          </Button>
        </div>
      </div>

      {/* Product table */}
      {loadingItems ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-14">Image</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-24">Price</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFamilyGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {loadingItems ? 'Loading...' : 'No products match this filter.'}
                  </TableCell>
                </TableRow>
              )}
              {filteredFamilyGroups.map((family) => {
                const isFamilyOpen = expandedFamilies.has(family.familyKey);
                const hasManyFamilies = filteredFamilyGroups.length > 1 || (filteredFamilyGroups.length === 1 && filteredFamilyGroups[0].familyKey !== '_other');
                const totalFamilyItems = family.productGroups.reduce((s, g) => s + g.items.length, 0);

                return (
                  <React.Fragment key={family.familyKey}>
                    {/* Family header row — only show if there are multiple families or it's a real family */}
                    {hasManyFamilies && (
                      <TableRow
                        className="bg-muted/40 hover:bg-muted/60 cursor-pointer border-t-2"
                        onClick={() => toggleFamilyExpand(family.familyKey)}
                      >
                        <TableCell>
                          {isFamilyOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          <FolderOpen className="h-5 w-5 text-primary" />
                        </TableCell>
                        <TableCell colSpan={3}>
                          <div className="flex items-center gap-2">
                            {renamingFamily === family.familyKey ? (
                              <Input
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') renameFamily(family.familyKey, renameValue);
                                  if (e.key === 'Escape') setRenamingFamily(null);
                                }}
                                onBlur={() => renameFamily(family.familyKey, renameValue)}
                                autoFocus
                                className="h-7 w-48 text-sm"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <span className="font-semibold text-sm">{family.label}</span>
                            )}
                            <Badge variant="secondary" className="text-xs">
                              {family.productGroups.length} products · {totalFamilyItems} items
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          {family.familyKey !== '_other' && (
                            <div className="flex justify-end gap-1">
                              {familyCollectionMap[family.familyKey] ? (
                                <Button variant="ghost" size="sm" className="gap-1 text-green-600 dark:text-green-400 pointer-events-none" title="Synced to Shopify">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span className="text-xs">Synced</span>
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1"
                                  onClick={() => handleSyncSingleCollection(family.familyKey)}
                                  disabled={syncingFamilyKey === family.familyKey || stores.length === 0}
                                  title="Sync collection to Shopify"
                                >
                                  {syncingFamilyKey === family.familyKey ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Store className="h-3.5 w-3.5" />
                                  )}
                                  <span className="text-xs">Sync</span>
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" onClick={() => { setRenamingFamily(family.familyKey); setRenameValue(family.label); }} title="Rename">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => deleteFamily(family.familyKey)} title="Dissolve collection">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}

                    {/* Product groups within the family — show if family is expanded or only one family */}
                    {(!hasManyFamilies || isFamilyOpen) && family.productGroups.map((group) => {
                      const hasVariants = group.items.length > 1;
                      const isExpanded = expandedGroups.has(group.key);
                      const first = group.items[0];
                      const firstImage = first.image_urls?.[0];
                      const isPending = first.status === 'pending';
                      const cfg = statusConfig[first.status] || statusConfig.pending;

                      return (
                        <GroupRowBlock
                          key={group.key}
                          group={group}
                          hasVariants={hasVariants}
                          isExpanded={isExpanded}
                          firstImage={firstImage}
                          isPending={isPending}
                          cfg={cfg}
                          onToggleExpand={() => toggleGroupExpand(group.key)}
                          onEdit={openEditPanel}
                          onPublish={publishItem}
                          onPublishGroup={publishGroup}
                          onSkip={skipItem}
                          publishingItemId={publishingItemId}
                          storesAvailable={stores.length > 0}
                          allFamilyKeys={allFamilyKeys}
                          onReassignFamily={reassignFamily}
                          currentFamilyKey={group.familyKey}
                        />
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Edit Sheet */}
      <Sheet open={editSheetOpen} onOpenChange={(open) => { if (!open) saveEdit(); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Product</SheetTitle>
          </SheetHeader>
          {editItem && (
            <div className="space-y-4 mt-4">
              {/* Images */}
              <div className="space-y-2">
                <Label>Images</Label>
                {editItem.image_urls && editItem.image_urls.length > 0 ? (
                  <div className="flex gap-2 flex-wrap">
                    {editItem.image_urls.map((url, imgI) => (
                      <div key={imgI} className="relative group">
                        <img src={url} alt="" className="w-16 h-16 object-cover rounded-md border" />
                        <button
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            const newUrls = [...editItem.image_urls];
                            newUrls.splice(imgI, 1);
                            setEditItem({ ...editItem, image_urls: newUrls });
                          }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                    <ImageOff className="h-3.5 w-3.5" />
                    {editItem.image_search_note || 'No images found'}
                  </div>
                )}
                <Input
                  placeholder="Paste image URL + Enter"
                  className="text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val) {
                        setEditItem({ ...editItem, image_urls: [...(editItem.image_urls || []), val] });
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
              </div>

              <div className="space-y-1">
                <Label>Title</Label>
                <Input value={editItem.title || ''} onChange={(e) => setEditItem({ ...editItem, title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea value={editItem.description || ''} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Price</Label>
                  <Input value={editItem.price || ''} onChange={(e) => setEditItem({ ...editItem, price: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Product Type</Label>
                  <Input value={editItem.product_type || ''} onChange={(e) => setEditItem({ ...editItem, product_type: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Tags</Label>
                <Input value={editItem.tags || ''} onChange={(e) => setEditItem({ ...editItem, tags: e.target.value })} />
              </div>

              {/* Metafields */}
              {metafieldDefs.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Metafields</Label>
                  {metafieldDefs.map((mf) => {
                    const mfKey = `${mf.namespace}.${mf.key}`;
                    const metafields = editItem.raw_data?.metafields || {};
                    const value = metafields[mfKey] || '';
                    return (
                      <div key={mfKey} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">{mf.name}</Label>
                        <Input
                          value={value}
                          placeholder={mf.description || mfKey}
                          onChange={(e) => {
                            const updated = { ...(editItem.raw_data || {}), metafields: { ...metafields, [mfKey]: e.target.value } };
                            setEditItem({ ...editItem, raw_data: updated });
                          }}
                          className="text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Original Data</Label>
                <pre className="text-xs bg-muted/50 rounded p-2 overflow-auto max-h-32">
                  {JSON.stringify(editItem.raw_data, null, 2)}
                </pre>
              </div>

              <div className="flex gap-2 pt-2">
                <Button className="flex-1 gap-1" onClick={() => { saveEdit(); publishItem(editItem); }} disabled={stores.length === 0 || editItem.status === 'published'}>
                  <Store className="h-4 w-4" /> Publish
                </Button>
                <Button variant="outline" onClick={saveEdit}>Close</Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* New Collection Dialog */}
      <Dialog open={newCollectionDialogOpen} onOpenChange={setNewCollectionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Collection / Brand Name</Label>
            <Input
              placeholder="e.g., Adobe, VMware, Klevgrand..."
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') createCollection(); }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              After creating, use the dropdown on each product group to reassign items to this collection.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCollectionDialogOpen(false)}>Cancel</Button>
            <Button onClick={createCollection} disabled={!newCollectionName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

// ─── GroupRowBlock sub-component ────────────────
interface GroupRowBlockProps {
  group: { key: string; items: BulkImportItem[]; parentTitle: string };
  hasVariants: boolean;
  isExpanded: boolean;
  firstImage: string | undefined;
  isPending: boolean;
  cfg: { label: string; color: string };
  onToggleExpand: () => void;
  onEdit: (item: BulkImportItem) => void;
  onPublish: (item: BulkImportItem) => void;
  onPublishGroup: (group: { key: string; items: BulkImportItem[]; parentTitle: string }) => void;
  onSkip: (itemId: string) => void;
  publishingItemId: string | null;
  storesAvailable: boolean;
  allFamilyKeys: string[];
  onReassignFamily: (groupKey: string, newFamilyKey: string | null) => void;
  currentFamilyKey: string | null;
}

const GroupRowBlock = ({ group, hasVariants, isExpanded, firstImage, isPending, cfg, onToggleExpand, onEdit, onPublish, onPublishGroup, onSkip, publishingItemId, storesAvailable, allFamilyKeys, onReassignFamily, currentFamilyKey }: GroupRowBlockProps) => {
  const first = group.items[0];

  return (
    <>
      <TableRow
        className={`cursor-pointer hover:bg-muted/50 ${isPending ? 'opacity-50' : ''}`}
        onClick={() => !isPending && onEdit(first)}
      >
        <TableCell onClick={(e) => { e.stopPropagation(); if (hasVariants) onToggleExpand(); }}>
          {hasVariants ? (
            isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : <div className="w-4" />}
        </TableCell>
        <TableCell>
          {firstImage ? (
            <img src={firstImage} alt="" className="w-10 h-10 object-cover rounded border" />
          ) : (
            <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center">
              <ImageOff className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate max-w-[300px]">{group.parentTitle}</span>
            {hasVariants && <Badge variant="secondary" className="text-xs">{group.items.length} variants</Badge>}
          </div>
          {first.product_type && <p className="text-xs text-muted-foreground">{first.product_type}</p>}
        </TableCell>
        <TableCell className="text-sm">
          {first.price ? `$${first.price}` : '—'}
          {hasVariants && group.items.length > 1 && (
            <span className="text-xs text-muted-foreground block">+{group.items.length - 1} more</span>
          )}
        </TableCell>
        <TableCell>
          <Badge className={`${cfg.color} text-xs`}>{cfg.label}</Badge>
          {first.published_stores && first.published_stores.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{first.published_stores.join(', ')}</p>
          )}
        </TableCell>
        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-end gap-1">
            {/* Reassign family dropdown */}
            {allFamilyKeys.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" title="Move to collection">
                    <FolderOpen className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs">Move to collection</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {allFamilyKeys.map(fk => (
                    <DropdownMenuItem
                      key={fk}
                      onClick={() => onReassignFamily(group.key, fk)}
                      className={fk === currentFamilyKey ? 'bg-accent' : ''}
                    >
                      {fk}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onReassignFamily(group.key, null)}>
                    Other (no collection)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {!isPending && first.status !== 'published' && first.status !== 'skipped' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => onSkip(first.id)} title="Skip">
                  <SkipForward className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => hasVariants ? onPublishGroup(group) : onPublish(first)}
                  disabled={publishingItemId === first.id || !storesAvailable}
                  className="gap-1"
                >
                  {publishingItemId === first.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Store className="h-3.5 w-3.5" />}
                  {hasVariants ? `List All` : 'List'}
                </Button>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded variants */}
      {hasVariants && isExpanded && group.items.map((item, vi) => {
        const itemCfg = statusConfig[item.status] || statusConfig.pending;
        return (
          <TableRow key={item.id} className="bg-muted/30 cursor-pointer" onClick={() => onEdit(item)}>
            <TableCell></TableCell>
            <TableCell>
              {item.image_urls?.[0] ? (
                <img src={item.image_urls[0]} alt="" className="w-8 h-8 object-cover rounded border" />
              ) : <div className="w-8 h-8" />}
            </TableCell>
            <TableCell className="text-sm pl-6">
              <span>{item.variant_label || item.title || `Variant ${vi + 1}`}</span>
              {item.variant_label && item.title && item.title !== item.variant_label && (
                <p className="text-xs text-muted-foreground truncate max-w-[250px]">{item.title}</p>
              )}
            </TableCell>
            <TableCell className="text-sm">{item.price ? `$${item.price}` : '—'}</TableCell>
            <TableCell>
              <Badge className={`${itemCfg.color} text-xs`}>{itemCfg.label}</Badge>
            </TableCell>
            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
              {item.status === 'ready' && (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => onSkip(item.id)}>
                    <SkipForward className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" onClick={() => onPublish(item)} disabled={publishingItemId === item.id || !storesAvailable} className="gap-1">
                    {publishingItemId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Store className="h-3.5 w-3.5" />}
                    List
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
};

export default BulkImportTab;
