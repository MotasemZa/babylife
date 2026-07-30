import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Sparkles, Upload, Globe, FolderOpen, Loader2, Trash2, Clock, CheckCircle2, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import OneClickListerTab from '@/components/listings/OneClickListerTab';
import BulkImportTab from '@/components/listings/BulkImportTab';
import WebImportTab from '@/components/listings/WebImportTab';
import { toast } from '@/hooks/use-toast';

export interface MetafieldDef {
  namespace: string;
  key: string;
  name: string;
  type: string;
  description?: string;
}

type ActiveTool = 'smart' | 'bulk' | 'web' | null;

// State for passing web-imported rows to BulkImportTab
interface PendingParsedRows {
  rows: Record<string, string>[];
  fileName: string;
  context: string;
}

interface Job {
  id: string;
  file_name: string | null;
  context: string | null;
  status: string;
  total_rows: number;
  processed_rows: number;
  created_at: string;
}

const jobStatusConfig: Record<string, { label: string; icon: any; color: string }> = {
  parsed: { label: 'Awaiting AI', icon: Clock, color: 'text-muted-foreground' },
  processing: { label: 'Processing', icon: Loader2, color: 'text-yellow-600 dark:text-yellow-400' },
  ready: { label: 'Ready', icon: CheckCircle2, color: 'text-blue-600 dark:text-blue-400' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-green-600 dark:text-green-400' },
};

const statusBadgeConfig: Record<string, { label: string; color: string }> = {
  parsed: { label: 'Awaiting AI', color: 'bg-muted text-muted-foreground' },
  processing: { label: 'Processing', color: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' },
  ready: { label: 'Ready', color: 'bg-blue-500/20 text-blue-700 dark:text-blue-400' },
  completed: { label: 'Completed', color: 'bg-green-500/20 text-green-700 dark:text-green-400' },
};

const tools = [
  {
    id: 'smart' as const,
    icon: Sparkles,
    title: 'Smart Listing Creator',
    description: 'Paste product images and let AI generate optimized listings for eBay & Shopify.',
  },
  {
    id: 'bulk' as const,
    icon: Upload,
    title: 'Bulk Import',
    description: 'Upload a CSV or spreadsheet and let AI organize, group, and prepare your products.',
  },
  {
    id: 'web' as const,
    icon: Globe,
    title: 'Import from Website',
    description: 'Paste a product URL from any website to auto-fill listing details and images.',
  },
];

const CreateImport = () => {
  const { user } = useAuth();
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [pendingParsedRows, setPendingParsedRows] = useState<PendingParsedRows | null>(null);
  const [metafieldDefs, setMetafieldDefs] = useState<MetafieldDef[]>([]);
  const [fillMetafields, setFillMetafields] = useState(true);
  const [loadingMetafields, setLoadingMetafields] = useState(false);

  // Fetch metafield definitions once on mount
  useEffect(() => {
    const fetchMetafields = async () => {
      if (!user) return;
      setLoadingMetafields(true);
      try {
        const { data, error } = await supabase.functions.invoke('shopify-fetch-metafields', { body: {} });
        if (!error && data?.definitions) {
          setMetafieldDefs(data.definitions);
        }
      } catch { /* ignore - no Shopify connected */ }
      setLoadingMetafields(false);
    };
    fetchMetafields();
  }, [user]);

  const loadJobs = useCallback(async () => {
    if (!user) return;
    setLoadingJobs(true);
    const { data, error } = await supabase
      .from('bulk_import_jobs')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setJobs(data as Job[]);
    setLoadingJobs(false);
  }, [user]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const deleteJob = async (jobId: string) => {
    await supabase.from('bulk_import_items').delete().eq('job_id', jobId);
    await supabase.from('bulk_import_jobs').delete().eq('id', jobId);
    setJobs(prev => prev.filter(j => j.id !== jobId));
    toast({ title: 'Job deleted' });
  };

  const openJob = (jobId: string) => {
    setActiveJobId(jobId);
    setActiveTool('bulk');
  };

  const handleJobCreated = (jobId: string) => {
    loadJobs();
    setPendingParsedRows(null);
    setActiveJobId(jobId);
    setActiveTool('bulk');
  };

  const handleBack = () => {
    setActiveTool(null);
    setActiveJobId(null);
    setPendingParsedRows(null);
    loadJobs();
  };

  const handleWebParsedRows = (rows: Record<string, string>[], fileName: string, context: string) => {
    setPendingParsedRows({ rows, fileName, context });
    setActiveJobId(null);
    setActiveTool('bulk');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {activeTool && (
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Create Listing</h1>
          <p className="text-muted-foreground mt-1">
            {activeTool ? tools.find(t => t.id === activeTool)?.description : 'Choose a tool to create your listings'}
          </p>
        </div>
      </div>

      {!activeTool && (
        <>
          {/* Tool Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {tools.map((tool) => (
              <Card
                key={tool.id}
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all duration-200 group"
                onClick={() => { setActiveJobId(null); setActiveTool(tool.id); }}
              >
                <CardContent className="flex flex-col items-center text-center p-8 gap-4">
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <tool.icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">{tool.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{tool.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Metafields Banner */}
          {metafieldDefs.length > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Tags className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Shopify Metafields Detected</p>
                      <p className="text-xs text-muted-foreground">
                        {metafieldDefs.map(mf => mf.name || mf.key).join(', ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="fill-metafields" className="text-sm text-muted-foreground">Auto-fill with AI</Label>
                    <Switch
                      id="fill-metafields"
                      checked={fillMetafields}
                      onCheckedChange={setFillMetafields}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {loadingMetafields && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking for Shopify metafields…
            </div>
          )}

          {/* Shared Job List */}
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">My Listing Jobs</h2>
              <p className="text-sm text-muted-foreground">All your import jobs from any tool — resume any time.</p>
            </div>

            {loadingJobs ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : jobs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="font-medium">No listing jobs yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Use any tool above to create your first listing job.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {jobs.map(job => {
                  const cfg = jobStatusConfig[job.status] || jobStatusConfig.parsed;
                  const badgeCfg = statusBadgeConfig[job.status] || statusBadgeConfig.parsed;
                  const Icon = cfg.icon;
                  return (
                    <Card
                      key={job.id}
                      className="cursor-pointer hover:border-primary/40 transition-colors"
                      onClick={() => openJob(job.id)}
                    >
                      <CardContent className="py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cfg.color}>
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
                          <Badge className={`${badgeCfg.color} text-xs`}>
                            {badgeCfg.label}
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
        </>
      )}

      {activeTool === 'smart' && (
        <OneClickListerTab
          metafieldDefs={fillMetafields ? metafieldDefs : []}
        />
      )}
      {activeTool === 'bulk' && (
        <BulkImportTab
          initialJobId={activeJobId}
          initialParsedRows={pendingParsedRows?.rows}
          initialFileName={pendingParsedRows?.fileName}
          initialContext={pendingParsedRows?.context}
          onJobCreated={handleJobCreated}
          onBackToJobs={handleBack}
          metafieldDefs={fillMetafields ? metafieldDefs : []}
        />
      )}
      {activeTool === 'web' && (
        <WebImportTab onParsedRows={handleWebParsedRows} />
      )}
    </div>
  );
};

export default CreateImport;
