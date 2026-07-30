import { useState, useEffect, useCallback } from 'react';
import { Globe, Loader2, Search, CheckSquare, Square, ArrowRight, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ScrapedProduct {
  title: string;
  description: string;
  price: number | null;
  currency: string;
  images: string[];
  brand: string;
  sku: string;
  category: string;
  tags: string[];
  sourceUrl: string;
}

interface WebImportTabProps {
  onJobCreated?: (jobId: string) => void;
  onParsedRows?: (rows: Record<string, string>[], fileName: string, context: string) => void;
}

type Step = 'input' | 'discovering' | 'select-urls' | 'importing' | 'review';

const WebImportTab = ({ onJobCreated, onParsedRows }: WebImportTabProps) => {
  const { user } = useAuth();
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<Step>('input');

  // Store map results
  const [discoveredUrls, setDiscoveredUrls] = useState<string[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [totalSiteUrls, setTotalSiteUrls] = useState(0);

  // Import progress
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, currentUrl: '' });
  const [importedProducts, setImportedProducts] = useState<ScrapedProduct[]>([]);
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [importCancelled, setImportCancelled] = useState(false);

  // Single product edit
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ScrapedProduct | null>(null);

  // URL list collapsed

  // URL list collapsed
  const [urlListCollapsed, setUrlListCollapsed] = useState(false);

  const handleDiscover = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    setStep('discovering');
    setDiscoveredUrls([]);
    setSelectedUrls(new Set());

    try {
      const { data, error } = await supabase.functions.invoke('scrape-store-map', {
        body: { url: url.trim() },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to discover products');

      const urls: string[] = data.productUrls || [];
      setTotalSiteUrls(data.totalUrls || 0);

      if (urls.length === 0) {
        toast.error('No product URLs found on this site');
        setStep('input');
        return;
      }

      setDiscoveredUrls(urls);
      setSelectedUrls(new Set(urls));
      setStep('select-urls');
      toast.success(`Found ${urls.length} potential product URLs`);
    } catch (err) {
      console.error('Discover error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to discover products');
      setStep('input');
    }
  };

  const toggleUrl = (u: string) => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedUrls.size === discoveredUrls.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(discoveredUrls));
    }
  };

  const handleImportSelected = async () => {
    const urls = Array.from(selectedUrls);
    if (urls.length === 0) {
      toast.error('Select at least one URL');
      return;
    }

    setStep('importing');
    setImportedProducts([]);
    setFailedUrls([]);
    setImportCancelled(false);
    setImportProgress({ current: 0, total: urls.length, currentUrl: '' });

    for (let i = 0; i < urls.length; i++) {
      if (importCancelled) break;

      const productUrl = urls[i];
      setImportProgress({ current: i + 1, total: urls.length, currentUrl: productUrl });

      try {
        const { data, error } = await supabase.functions.invoke('scrape-product-url', {
          body: { url: productUrl },
        });

        if (error || !data?.success) {
          console.warn('Failed to scrape:', productUrl, data?.error || error?.message);
          setFailedUrls(prev => [...prev, productUrl]);
          continue;
        }

        const p = data.product as ScrapedProduct;
        if (p.title) {
          setImportedProducts(prev => [...prev, p]);
        } else {
          setFailedUrls(prev => [...prev, productUrl]);
        }
      } catch (err) {
        console.warn('Scrape error for:', productUrl, err);
        setFailedUrls(prev => [...prev, productUrl]);
      }
    }

    setStep('review');
  };

  const removeProduct = (idx: number) => {
    setImportedProducts(prev => prev.filter((_, i) => i !== idx));
  };

  const startEdit = (idx: number) => {
    setEditingIndex(idx);
    setEditForm({ ...importedProducts[idx] });
  };

  const saveEdit = () => {
    if (editingIndex !== null && editForm) {
      setImportedProducts(prev => prev.map((p, i) => i === editingIndex ? editForm : p));
      setEditingIndex(null);
      setEditForm(null);
    }
  };

  // Convert scraped products to CSV-like rows and pass to parent for AI reorganization
  const handleContinueToAI = () => {
    if (importedProducts.length === 0) return;

    // Extract domain for file name
    let jobName = url.trim();
    try {
      jobName = new URL(url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`).hostname;
    } catch {}

    // Convert scraped products into CSV-like row format (Record<string, string>[])
    const rows: Record<string, string>[] = importedProducts.map(p => ({
      Title: p.title || '',
      Description: (p.description || '').slice(0, 500),
      Price: p.price?.toString() || '',
      Currency: p.currency || '',
      Brand: p.brand || '',
      SKU: p.sku || '',
      Category: p.category || '',
      Tags: (p.tags || []).join(', '),
      Images: (p.images || []).join('|'),
      SourceUrl: p.sourceUrl || '',
    }));

    if (onParsedRows) {
      onParsedRows(rows, `Web: ${jobName}`, `Scraped from ${url.trim()}`);
    }
  };

  const resetAll = () => {
    setStep('input');
    setUrl('');
    setDiscoveredUrls([]);
    setSelectedUrls(new Set());
    setImportedProducts([]);
    setFailedUrls([]);
    setEditingIndex(null);
    setEditForm(null);
  };

  return (
    <div className="space-y-6">
      {/* URL Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-primary" />
            Import from Website
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.example.com or a direct product URL"
              className="flex-1"
              disabled={step !== 'input'}
              onKeyDown={(e) => e.key === 'Enter' && step === 'input' && handleDiscover()}
            />
            {step === 'input' ? (
              <Button onClick={handleDiscover} disabled={!url.trim()}>
                <Search className="h-4 w-4 mr-1" />
                Fetch Products
              </Button>
            ) : (
              <Button variant="outline" onClick={resetAll}>
                Start Over
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Paste a store URL to discover all products, or a single product URL.
          </p>
        </CardContent>
      </Card>

      {/* Discovering */}
      {step === 'discovering' && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Discovering product pages...</p>
          </CardContent>
        </Card>
      )}

      {/* URL Selection */}
      {step === 'select-urls' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Found {discoveredUrls.length} product URLs
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({totalSiteUrls} total pages scanned)
                </span>
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {selectedUrls.size === discoveredUrls.length ? (
                    <><Square className="h-4 w-4 mr-1" /> Deselect All</>
                  ) : (
                    <><CheckSquare className="h-4 w-4 mr-1" /> Select All</>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setUrlListCollapsed(!urlListCollapsed)}
                >
                  {urlListCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          {!urlListCollapsed && (
            <CardContent>
              <ScrollArea className="h-[300px] rounded-md border p-2">
                <div className="space-y-1">
                  {discoveredUrls.map((u) => {
                    let shortUrl = u;
                    try { shortUrl = new URL(u).pathname; } catch {}
                    return (
                      <label
                        key={u}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={selectedUrls.has(u)}
                          onCheckedChange={() => toggleUrl(u)}
                        />
                        <span className="truncate flex-1 text-muted-foreground">{shortUrl}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          )}
          <CardContent className="pt-0">
            <Button
              onClick={handleImportSelected}
              disabled={selectedUrls.size === 0}
              className="w-full"
            >
              <ArrowRight className="h-4 w-4 mr-1" />
              Import {selectedUrls.size} Selected
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Importing Progress */}
      {step === 'importing' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Importing Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress: {importProgress.current} / {importProgress.total}</span>
                <span>{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
              </div>
              <Progress value={(importProgress.current / importProgress.total) * 100} />
            </div>
            <p className="text-xs text-muted-foreground truncate">
              Scraping: {importProgress.currentUrl}
            </p>
            <div className="flex gap-2 text-sm">
              <span className="text-green-600">✓ {importedProducts.length} imported</span>
              {failedUrls.length > 0 && (
                <span className="text-destructive">✗ {failedUrls.length} failed</span>
              )}
            </div>
            <Button variant="outline" onClick={() => setImportCancelled(true)}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Review imported products */}
      {step === 'review' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Imported Products ({importedProducts.length})
                {failedUrls.length > 0 && (
                  <span className="text-sm font-normal text-destructive ml-2">
                    ({failedUrls.length} failed)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {importedProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No products were successfully imported. Try different URLs.
                </p>
              ) : (
                <div className="space-y-3">
                  {importedProducts.map((p, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg">
                      {p.images[0] && (
                        <img
                          src={p.images[0]}
                          alt={p.title}
                          className="w-16 h-16 object-cover rounded"
                          loading="lazy"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        {editingIndex === idx && editForm ? (
                          <div className="space-y-2">
                            <Input
                              value={editForm.title}
                              onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                              placeholder="Title"
                            />
                            <Textarea
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              rows={3}
                              placeholder="Description"
                            />
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                step="0.01"
                                value={editForm.price?.toString() || ''}
                                onChange={(e) => setEditForm({ ...editForm, price: e.target.value ? parseFloat(e.target.value) : null })}
                                placeholder="Price"
                                className="w-28"
                              />
                              <Button size="sm" onClick={saveEdit}>Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setEditingIndex(null); setEditForm(null); }}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="font-medium text-sm truncate">{p.title || 'Untitled'}</p>
                            <p className="text-xs text-muted-foreground truncate">{p.description?.slice(0, 100)}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {p.price && (
                                <span className="text-sm font-semibold">
                                  {p.currency === 'EUR' ? '€' : p.currency === 'USD' ? '$' : p.currency === 'GBP' ? '£' : p.currency} {p.price}
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">{p.images.length} images</span>
                            </div>
                          </>
                        )}
                      </div>
                      {editingIndex !== idx && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(idx)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => removeProduct(idx)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Continue to AI Processing */}
          {importedProducts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Continue to AI Processing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Continue with {importedProducts.length} products. AI will organize them into families, products, and variants — then generate optimized titles, descriptions, and tags.
                </p>
                <Button
                  onClick={handleContinueToAI}
                  className="w-full"
                >
                  <ArrowRight className="h-4 w-4 mr-1" /> Continue to AI Organize
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default WebImportTab;
