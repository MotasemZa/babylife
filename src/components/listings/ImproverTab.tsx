import { useState, useEffect } from 'react';
import { 
  Sparkles, Edit3, Download, Loader2, AlertCircle, Check, 
  Send, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Listing {
  id: string;
  ebay_item_id: string;
  title: string;
  description: string | null;
  price: number | null;
  quantity: number | null;
  sku: string | null;
  image_url: string | null;
}

interface Suggestions {
  improvedTitle: string;
  improvedDescription: string;
  suggestedKeywords: string[];
  priceSuggestion: string;
  tips: string[];
}

interface ImprovedListing {
  original: Listing;
  suggestions: Suggestions;
  edited?: Suggestions;
  selected?: boolean;
  pushed?: boolean;
  pushError?: string;
}

const ImproverTab = () => {
  const { user } = useAuth();
  const [step, setStep] = useState<'select' | 'review' | 'push'>('select');
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedListings, setSelectedListings] = useState<Set<string>>(new Set());
  const [improvedListings, setImprovedListings] = useState<ImprovedListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [selectedListingIndex, setSelectedListingIndex] = useState<number | null>(null);

  // Load listings from database
  useEffect(() => {
    const loadListings = async () => {
      if (!user) return;
      setIsLoading(true);
      
      const { data, error } = await supabase
        .from('listings')
        .select('id, ebay_item_id, title, description, price, quantity, sku, image_url')
        .eq('user_id', user.id)
        .order('title');

      if (!error && data) {
        setListings(data);
      }
      setIsLoading(false);
    };

    loadListings();
  }, [user]);

  const toggleListingSelection = (id: string) => {
    setSelectedListings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const selectAllListings = () => {
    if (selectedListings.size === listings.length) {
      setSelectedListings(new Set());
    } else {
      setSelectedListings(new Set(listings.map(l => l.id)));
    }
  };

  const runImprovements = async () => {
    const selected = listings.filter(l => selectedListings.has(l.id));
    
    if (selected.length === 0) {
      toast.error('Please select at least one listing to improve');
      return;
    }

    setIsProcessing(true);
    toast.info(`Analyzing ${selected.length} listings with AI...`);

    try {
      const listingsForAI = selected.map(l => ({
        sku: l.sku || l.ebay_item_id,
        title: l.title,
        description: l.description || '',
        price: l.price?.toString() || '',
        quantity: l.quantity || 1,
      }));

      const { data, error } = await supabase.functions.invoke('improve-listing', {
        body: { listings: listingsForAI }
      });

      if (error) throw new Error(error.message || 'Failed to get AI suggestions');
      if (data?.error) throw new Error(data.error);

      if (data?.improvedListings) {
        const improved = data.improvedListings.map((item: any) => {
          const originalListing = selected.find(l => 
            (l.sku || l.ebay_item_id) === item.original.sku
          );
          return {
            original: originalListing || item.original,
            suggestions: item.suggestions,
            selected: true,
            pushed: false,
          };
        });
        
        setImprovedListings(improved);
        setStep('review');
        toast.success(`Generated improvements for ${improved.length} listings`);
      }
    } catch (error) {
      console.error('Error running improvements:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate improvements');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateEditedSuggestion = (index: number, field: keyof Suggestions, value: string | string[]) => {
    setImprovedListings(prev => {
      const updated = [...prev];
      const current = updated[index];
      const edited = current.edited || { ...current.suggestions };
      (edited as any)[field] = value;
      updated[index] = { ...current, edited };
      return updated;
    });
  };

  const togglePushSelection = (index: number) => {
    setImprovedListings(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], selected: !updated[index].selected };
      return updated;
    });
  };

  const pushToEbay = async () => {
    const toPush = improvedListings.filter(l => l.selected && !l.pushed);
    
    if (toPush.length === 0) {
      toast.error('No listings selected for push');
      return;
    }

    setIsPushing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Session expired. Please sign in again.');
        return;
      }

      const updates = toPush.map(item => {
        const suggestions = item.edited || item.suggestions;
        return {
          sku: item.original.sku || item.original.ebay_item_id,
          title: suggestions.improvedTitle,
          description: suggestions.improvedDescription,
        };
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ebay-update-listing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ updates }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to push updates: ${response.status}`);
      }

      const data = await response.json();

      setImprovedListings(prev => {
        return prev.map(item => {
          const sku = item.original.sku || item.original.ebay_item_id;
          const result = data.results?.find((r: any) => r.sku === sku);
          if (result) {
            return {
              ...item,
              pushed: result.success,
              pushError: result.error,
            };
          }
          return item;
        });
      });

      const successCount = data.summary?.success || 0;
      const failCount = data.summary?.failed || 0;

      if (successCount > 0) toast.success(`Successfully updated ${successCount} listings on eBay`);
      if (failCount > 0) toast.error(`Failed to update ${failCount} listings`);

      setStep('push');

    } catch (error) {
      console.error('Error pushing to eBay:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to push updates');
    } finally {
      setIsPushing(false);
    }
  };

  const exportResults = () => {
    if (improvedListings.length === 0) {
      toast.error('No results to export');
      return;
    }

    const headers = ['SKU', 'Original Title', 'Improved Title', 'Status', 'Error'];
    const rows = improvedListings.map(item => {
      const suggestions = item.edited || item.suggestions;
      return [
        item.original.sku || item.original.ebay_item_id,
        item.original.title,
        suggestions.improvedTitle,
        item.pushed ? 'Pushed' : (item.pushError ? 'Failed' : 'Pending'),
        item.pushError || '',
      ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `listing-improvements-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported results');
  };

  if (!user) {
    return (
      <Card className="mt-6">
        <CardContent className="py-12">
          <div className="bg-destructive/10 text-destructive rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5" />
            <span>Please sign in to use the Listing Improver</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 mt-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="py-12 text-center">
          <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold mb-2">No Listings Found</h3>
          <p className="text-muted-foreground">
            Sync your listings from eBay first using the Listings tab.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 mt-6">
      {/* Step: Select */}
      {step === 'select' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Select Listings to Improve
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={selectAllListings}>
                  {selectedListings.size === listings.length ? 'Deselect All' : 'Select All'}
                </Button>
                <Badge variant="secondary">{selectedListings.size} selected</Badge>
              </div>
            </CardTitle>
            <CardDescription>
              Choose which listings you want to analyze and improve with AI
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {listings.map((listing) => (
                <div 
                  key={listing.id} 
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedListings.has(listing.id) 
                      ? 'bg-primary/10 border border-primary/30' 
                      : 'bg-muted/30 hover:bg-muted/50'
                  }`}
                  onClick={() => toggleListingSelection(listing.id)}
                >
                  <Checkbox 
                    checked={selectedListings.has(listing.id)}
                    onCheckedChange={() => toggleListingSelection(listing.id)}
                  />
                  {listing.image_url && (
                    <img 
                      src={listing.image_url} 
                      alt="" 
                      className="w-10 h-10 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{listing.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {listing.description?.slice(0, 100) || 'No description'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <Button 
              onClick={runImprovements} 
              disabled={isProcessing || selectedListings.size === 0}
              size="lg"
              className="w-full"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Analyzing with AI...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  Analyze {selectedListings.size} Listing{selectedListings.size !== 1 ? 's' : ''} with AI
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step: Review */}
      {step === 'review' && (
        <>
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep('select')}>
              ← Back to Selection
            </Button>
            <Button onClick={() => setStep('push')}>
              Continue to Push
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Improved Listings ({improvedListings.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {improvedListings.map((item, idx) => (
                    <button
                      key={item.original.id}
                      onClick={() => setSelectedListingIndex(idx)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedListingIndex === idx
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/50 hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {item.edited && <Check className="h-4 w-4 shrink-0" />}
                        <span className="truncate text-sm">{item.original.title}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              {selectedListingIndex !== null && improvedListings[selectedListingIndex] ? (
                <>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Edit Suggestions</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => togglePushSelection(selectedListingIndex)}
                      >
                        {improvedListings[selectedListingIndex].selected ? (
                          <><Check className="h-4 w-4 mr-1" /> Selected</>
                        ) : (
                          'Select for Push'
                        )}
                      </Button>
                    </CardTitle>
                    <CardDescription>
                      Original: {improvedListings[selectedListingIndex].original.title}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(() => {
                      const item = improvedListings[selectedListingIndex];
                      const suggestions = item.edited || item.suggestions;
                      return (
                        <>
                          <div>
                            <Label>Improved Title</Label>
                            <Input
                              value={suggestions.improvedTitle}
                              onChange={e => updateEditedSuggestion(selectedListingIndex, 'improvedTitle', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Improved Description</Label>
                            <Textarea
                              rows={8}
                              value={suggestions.improvedDescription}
                              onChange={e => updateEditedSuggestion(selectedListingIndex, 'improvedDescription', e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Suggested Keywords</Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {suggestions.suggestedKeywords.map((kw, i) => (
                                <Badge key={i} variant="secondary">{kw}</Badge>
                              ))}
                            </div>
                          </div>
                          {suggestions.tips.length > 0 && (
                            <div>
                              <Label>Tips</Label>
                              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground mt-2">
                                {suggestions.tips.map((tip, i) => (
                                  <li key={i}>{tip}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </CardContent>
                </>
              ) : (
                <CardContent className="py-12 text-center">
                  <Edit3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Select a listing to view and edit suggestions</p>
                </CardContent>
              )}
            </Card>
          </div>
        </>
      )}

      {/* Step: Push */}
      {step === 'push' && (
        <>
          <Button variant="ghost" onClick={() => setStep('review')}>
            ← Back to Review
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Push Updates to eBay
              </CardTitle>
              <CardDescription>
                Apply your improved listings directly to your eBay account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{improvedListings.filter(l => l.selected).length}</p>
                    <p className="text-sm text-muted-foreground">Selected</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-500">{improvedListings.filter(l => l.pushed).length}</p>
                    <p className="text-sm text-muted-foreground">Pushed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-500">{improvedListings.filter(l => l.pushError).length}</p>
                    <p className="text-sm text-muted-foreground">Failed</p>
                  </div>
                </div>
              </div>

              <Button 
                onClick={pushToEbay} 
                disabled={isPushing || improvedListings.filter(l => l.selected && !l.pushed).length === 0}
                size="lg" 
                className="w-full"
              >
                {isPushing ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Pushing to eBay...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5 mr-2" />
                    Push {improvedListings.filter(l => l.selected && !l.pushed).length} Updates
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Results</span>
                <Button variant="outline" onClick={exportResults}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {improvedListings.map((item) => (
                  <div 
                    key={item.original.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      item.pushed 
                        ? 'bg-green-500/10' 
                        : item.pushError 
                          ? 'bg-red-500/10' 
                          : 'bg-muted/30'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.original.title}</p>
                      {item.pushError && (
                        <p className="text-sm text-red-500">{item.pushError}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {item.pushed && <Badge className="bg-green-500">Pushed</Badge>}
                      {item.pushError && <Badge variant="destructive">Failed</Badge>}
                      {!item.pushed && !item.pushError && item.selected && (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default ImproverTab;
