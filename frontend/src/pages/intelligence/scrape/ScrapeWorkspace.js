import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Checkbox } from '../../../components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import { Badge } from '../../../components/ui/badge';
import { Globe, Search, ArrowRight, Play, Loader2, FileText, Database, Activity, Map } from 'lucide-react';
import { scrapeApi } from '../../../api';
import { toast } from 'sonner';

const PreflightTab = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handlePreflight = async () => {
    if (!url) {
      toast.error('Please enter a URL');
      return;
    }
    setLoading(true);
    try {
      const res = await scrapeApi.preflight(url);
      setResult(res);
      toast.success('Preflight complete');
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error?.message || 'Preflight failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="w-full lg:w-1/3 space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Target URL</label>
          <Input 
            placeholder="https://example.com" 
            value={url} 
            onChange={e => setUrl(e.target.value)}
            className="w-full"
          />
        </div>
        <Button onClick={handlePreflight} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          Run Preflight
        </Button>
      </div>
      <div className="w-full lg:w-2/3">
        {result ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Preflight Results</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto text-xs">
                {JSON.stringify(result, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ) : (
          <div className="h-full min-h-[200px] flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg p-12 text-gray-500 text-sm">
            Run a preflight check to see results here.
          </div>
        )}
      </div>
    </div>
  );
};

const CrawlTab = () => {
  const [form, setForm] = useState({ url: '', max_pages: 10, max_depth: 2, same_domain_only: true });
  const [loading, setLoading] = useState(false);
  const [crawlId, setCrawlId] = useState(null);
  const [status, setStatus] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    let interval;
    if (polling && crawlId) {
      interval = setInterval(async () => {
        try {
          const res = await scrapeApi.getCrawlStatus(crawlId);
          setStatus(res);
          if (res.status === 'completed' || res.status === 'failed') {
            setPolling(false);
            if (res.status === 'completed') toast.success('Crawl completed!');
            if (res.status === 'failed') toast.error('Crawl failed.');
          }
        } catch (err) {
          console.error(err);
          setPolling(false);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [polling, crawlId]);

  const handleCrawl = async () => {
    if (!form.url) {
      toast.error('Please enter a URL');
      return;
    }
    setLoading(true);
    setStatus(null);
    setCrawlId(null);
    try {
      const res = await scrapeApi.createCrawl(form);
      setCrawlId(res.crawl_id || res.id);
      setPolling(true);
      toast.success('Crawl initiated');
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error?.message || 'Failed to start crawl');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="w-full lg:w-1/3 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-sm font-medium mb-1 block">Target URL</label>
            <Input 
              placeholder="https://example.com" 
              value={form.url} 
              onChange={e => setForm({...form, url: e.target.value})}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Max Pages</label>
            <Input 
              type="number" 
              value={form.max_pages} 
              onChange={e => setForm({...form, max_pages: parseInt(e.target.value) || 1})}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Max Depth</label>
            <Input 
              type="number" 
              value={form.max_depth} 
              onChange={e => setForm({...form, max_depth: parseInt(e.target.value) || 1})}
            />
          </div>
          <div className="col-span-2 flex items-center space-x-2 mt-2">
            <Checkbox 
              id="same-domain" 
              checked={form.same_domain_only} 
              onCheckedChange={(checked) => setForm({...form, same_domain_only: checked})}
            />
            <label htmlFor="same-domain" className="text-sm font-medium leading-none cursor-pointer">
              Restrict crawl to same domain only
            </label>
          </div>
        </div>
        
        <Button onClick={handleCrawl} disabled={loading || polling} className="w-full">
          {(loading || polling) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Globe className="h-4 w-4 mr-2" />}
          {polling ? 'Crawling in progress...' : 'Start Crawl'}
        </Button>
      </div>

      <div className="w-full lg:w-2/3">
        {crawlId ? (
          <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-900/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center justify-between">
                Crawl Status
                {status?.status && (
                  <Badge variant={status.status === 'completed' ? 'success' : status.status === 'failed' ? 'destructive' : 'default'}>
                    {status.status.toUpperCase()}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>ID: {crawlId}</CardDescription>
            </CardHeader>
            <CardContent>
              {status ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Pages Crawled:</span>
                    <span className="font-medium">{status.pages_crawled || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Errors:</span>
                    <span className="font-medium text-red-500">{status.error_count || 0}</span>
                  </div>
                  <details className="mt-4 cursor-pointer text-xs text-gray-400">
                    <summary>View Raw Technical Data</summary>
                    <pre className="mt-2 bg-gray-100 dark:bg-gray-800 p-2 rounded text-gray-800 dark:text-gray-200 overflow-x-auto">
                      {JSON.stringify(status, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                <div className="flex items-center text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Fetching status...
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="h-full min-h-[200px] flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg p-12 text-gray-500 text-sm">
            Configure and start a crawl to view progress and status here.
          </div>
        )}
      </div>
    </div>
  );
};

const InstantSearchTab = () => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleSearch = async () => {
    if (!query) {
      toast.error('Please enter a query');
      return;
    }
    setLoading(true);
    try {
      const res = await scrapeApi.instantSearch(query);
      setResults(res.results || res.data || res);
      toast.success('Search complete');
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error?.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="w-full lg:w-1/3 space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Search Query</label>
          <Input 
            placeholder="Enter search query..." 
            value={query} 
            onChange={e => setQuery(e.target.value)}
            className="w-full"
          />
        </div>
        <Button onClick={handleSearch} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
          Search
        </Button>
      </div>
      <div className="w-full lg:w-2/3">
        {results ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Results ({Array.isArray(results) ? results.length : 0})</CardTitle>
            </CardHeader>
            <CardContent>
              {Array.isArray(results) && results.length > 0 ? (
                <div className="space-y-4">
                  {results.map((r, i) => (
                    <div key={i} className="border-b dark:border-gray-800 pb-4 last:border-0">
                      <a href={r.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 font-medium hover:underline flex items-center">
                        {r.title || r.url}
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </a>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{r.snippet || r.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md overflow-x-auto text-xs">
                  {JSON.stringify(results, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="h-full min-h-[200px] flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg p-12 text-gray-500 text-sm">
            Search to see results here.
          </div>
        )}
      </div>
    </div>
  );
};


const ScrapeWorkspace = () => {
  return (
    <div className="p-4 w-full space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
          <Globe className="h-5 w-5 mr-2 text-sky-500" />
          Scrape Workspace
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Unified web crawling and data extraction</p>
      </div>

      <Tabs defaultValue="crawl" className="w-full">
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 mb-4 h-auto p-1">
          <TabsTrigger value="crawl" className="py-2"><Activity className="h-4 w-4 mr-2 hidden sm:block" /> Crawl</TabsTrigger>
          <TabsTrigger value="preflight" className="py-2"><Map className="h-4 w-4 mr-2 hidden sm:block" /> Preflight</TabsTrigger>
          <TabsTrigger value="search" className="py-2"><Search className="h-4 w-4 mr-2 hidden sm:block" /> Search</TabsTrigger>
          <TabsTrigger value="documents" className="py-2"><FileText className="h-4 w-4 mr-2 hidden sm:block" /> Docs</TabsTrigger>
          <TabsTrigger value="entities" className="py-2"><Database className="h-4 w-4 mr-2 hidden sm:block" /> Entities</TabsTrigger>
          <TabsTrigger value="sources" className="py-2"><Globe className="h-4 w-4 mr-2 hidden sm:block" /> Sources</TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="pt-6">
            <TabsContent value="crawl" className="mt-0">
              <CrawlTab />
            </TabsContent>
            
            <TabsContent value="preflight" className="mt-0">
              <PreflightTab />
            </TabsContent>
            
            <TabsContent value="search" className="mt-0">
              <InstantSearchTab />
            </TabsContent>

            <TabsContent value="documents" className="mt-0">
              <div className="text-center py-10 text-gray-500">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>Documents viewer is under construction.</p>
              </div>
            </TabsContent>

            <TabsContent value="entities" className="mt-0">
              <div className="text-center py-10 text-gray-500">
                <Database className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>Entities explorer is under construction.</p>
              </div>
            </TabsContent>

            <TabsContent value="sources" className="mt-0">
              <div className="text-center py-10 text-gray-500">
                <Globe className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>Sources management is under construction.</p>
              </div>
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
};

export default ScrapeWorkspace;
