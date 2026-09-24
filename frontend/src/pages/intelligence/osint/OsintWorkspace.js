import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../components/ui/tabs';
import { Badge } from '../../../components/ui/badge';
import { Search, Loader2, Phone, Mail, User, ShieldAlert, Activity, FileText, Database, Network, MapPin, CheckCircle, XCircle, Info, Clock, Smartphone } from 'lucide-react';
import { osintApi } from '../../../api';
import { toast } from 'sonner';

const LookupTab = () => {
  const [lookupType, setLookupType] = useState('phone');
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleLookup = async () => {
    if (!target) {
      toast.error('Please enter a target identifier');
      return;
    }
    setLoading(true);
    setResults(null);
    try {
      let res;
      if (lookupType === 'phone') res = await osintApi.lookupPhone(target);
      else if (lookupType === 'email') res = await osintApi.lookupEmail(target);
      else if (lookupType === 'username') res = await osintApi.lookupUsername(target);
      setResults(res);
      toast.success('Lookup complete');
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error?.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const renderPhoneDetails = (metadata) => {
    if (!metadata) return null;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {metadata.carrier && (
          <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
            <div className="bg-blue-100 dark:bg-blue-900/50 p-2 rounded-md"><Phone className="h-4 w-4 text-blue-600 dark:text-blue-400" /></div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Carrier</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{metadata.carrier}</p>
            </div>
          </div>
        )}
        {metadata.location && (
          <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
            <div className="bg-green-100 dark:bg-green-900/50 p-2 rounded-md"><MapPin className="h-4 w-4 text-green-600 dark:text-green-400" /></div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Location</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{metadata.location} {metadata.region_code ? `(${metadata.region_code})` : ''}</p>
            </div>
          </div>
        )}
        {metadata.line_type && (
          <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
            <div className="bg-purple-100 dark:bg-purple-900/50 p-2 rounded-md"><Smartphone className="h-4 w-4 text-purple-600 dark:text-purple-400" /></div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Line Type</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{metadata.line_type}</p>
            </div>
          </div>
        )}
        {metadata.timezones && metadata.timezones.length > 0 && (
          <div className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
            <div className="bg-orange-100 dark:bg-orange-900/50 p-2 rounded-md"><Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" /></div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Timezone</p>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{metadata.timezones.join(', ')}</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGenericMetadata = (metadata) => {
    if (!metadata || typeof metadata !== 'object') return null;
    const entries = Object.entries(metadata).filter(([k, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
    if (entries.length === 0) return null;
    
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-col p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider mb-1">{key.replace(/_/g, ' ')}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}
            </p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="w-full lg:w-1/3 space-y-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Lookup Type</label>
          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant={lookupType === 'phone' ? 'default' : 'outline'} onClick={() => setLookupType('phone')} className="flex-1">
              <Phone className="h-4 w-4 mr-2" /> Phone
            </Button>
            <Button variant={lookupType === 'email' ? 'default' : 'outline'} onClick={() => setLookupType('email')} className="flex-1">
              <Mail className="h-4 w-4 mr-2" /> Email
            </Button>
            <Button variant={lookupType === 'username' ? 'default' : 'outline'} onClick={() => setLookupType('username')} className="flex-1">
              <User className="h-4 w-4 mr-2" /> Username
            </Button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Target Identifier</label>
          <Input 
            placeholder={`Enter ${lookupType}...`} 
            value={target} 
            onChange={e => setTarget(e.target.value)}
            className="w-full"
          />
        </div>
        
        <Button onClick={handleLookup} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
          Run Lookup
        </Button>
      </div>

      <div className="w-full lg:w-2/3">
        {results ? (
          <div className="space-y-4">
            <Card className="border-t-4 border-t-emerald-500 shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl flex items-center">
                      {results.normalized_identifier || target}
                      {results.evidence?.[0]?.raw_metadata?.is_valid ? (
                        <CheckCircle className="h-5 w-5 text-green-500 ml-2" />
                      ) : results.evidence?.[0]?.raw_metadata?.is_valid === false ? (
                        <XCircle className="h-5 w-5 text-red-500 ml-2" />
                      ) : null}
                    </CardTitle>
                    <CardDescription className="mt-1 flex items-center">
                      <Badge variant="outline" className="mr-2">{results.identifier_type || lookupType.toUpperCase()}</Badge>
                      <span className="text-xs text-gray-500">
                        ID: {results.investigation_id || 'N/A'}
                      </span>
                    </CardDescription>
                  </div>
                  <Badge variant={results.status === 'completed' ? 'success' : 'secondary'} className="capitalize">
                    {results.status || 'unknown'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {results.summary && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-3 rounded-md text-sm mb-4 flex items-start">
                    <Info className="h-5 w-5 mr-2 shrink-0 mt-0.5" />
                    <p>{results.summary}</p>
                  </div>
                )}
                
                {results.evidence && results.evidence.length > 0 ? (
                  results.evidence.map((ev, idx) => (
                    <div key={idx} className="mb-4 last:mb-0">
                      <div className="flex items-center justify-between border-b dark:border-gray-800 pb-2 mb-2">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center">
                          <Database className="h-4 w-4 mr-1.5 text-gray-400" /> 
                          Source: <span className="capitalize ml-1 text-gray-900 dark:text-white">{ev.source_name || 'Analysis Engine'}</span>
                        </h4>
                      </div>
                      {lookupType === 'phone' && ev.source_name === 'phonenumbers' 
                        ? renderPhoneDetails(ev.raw_metadata) 
                        : renderGenericMetadata(ev.raw_metadata)}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">No detailed evidence structured data available.</p>
                )}

                <details className="mt-6 cursor-pointer text-xs text-gray-500 border-t dark:border-gray-800 pt-4">
                  <summary className="hover:text-gray-700 dark:hover:text-gray-300 font-medium">View Raw Developer Data</summary>
                  <pre className="mt-3 bg-gray-950 p-4 rounded-lg overflow-x-auto text-gray-300 font-mono text-[11px] leading-relaxed shadow-inner">
                    {JSON.stringify(results, null, 2)}
                  </pre>
                </details>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="h-full min-h-[200px] flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg p-12 text-gray-500 text-sm">
            Enter target details and run a lookup to view intelligence.
          </div>
        )}
      </div>
    </div>
  );
};

const InvestigationTab = () => {
  const [form, setForm] = useState({ target: '', type: 'general' });
  const [loading, setLoading] = useState(false);
  const [investigationId, setInvestigationId] = useState(null);
  const [status, setStatus] = useState(null);
  const [details, setDetails] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    let interval;
    if (polling && investigationId) {
      interval = setInterval(async () => {
        try {
          const res = await osintApi.getInvestigationStatus(investigationId);
          setStatus(res);
          if (res.status === 'completed' || res.status === 'failed') {
            setPolling(false);
            if (res.status === 'completed') {
              toast.success('Investigation completed!');
              fetchDetails(investigationId);
            }
            if (res.status === 'failed') toast.error('Investigation failed.');
          }
        } catch (err) {
          console.error(err);
          setPolling(false);
        }
      }, 5000); // Poll every 5s for heavy investigations
    }
    return () => clearInterval(interval);
  }, [polling, investigationId]);

  const fetchDetails = async (id) => {
    try {
      const res = await osintApi.getInvestigation(id);
      setDetails(res);
    } catch (err) {
      toast.error('Failed to load investigation details');
    }
  };

  const handleCreate = async () => {
    if (!form.target) {
      toast.error('Please enter a target');
      return;
    }
    setLoading(true);
    setStatus(null);
    setDetails(null);
    setInvestigationId(null);
    try {
      const res = await osintApi.createInvestigation({ target: form.target, investigation_type: form.type });
      setInvestigationId(res.investigation_id || res.id);
      setPolling(true);
      toast.success('Investigation started');
    } catch (err) {
      toast.error(err.response?.data?.detail || err.response?.data?.error?.message || 'Failed to start investigation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="w-full lg:w-1/3 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-sm font-medium mb-1 block">Investigation Target</label>
            <Input 
              placeholder="Target subject, domain, or identifier" 
              value={form.target} 
              onChange={e => setForm({...form, target: e.target.value})}
            />
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium mb-1 block">Investigation Type</label>
            <select 
              value={form.type} 
              onChange={e => setForm({...form, type: e.target.value})}
              className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:ring-offset-gray-950 dark:placeholder:text-gray-400 dark:focus-visible:ring-gray-300"
            >
              <option value="general">General</option>
              <option value="deep">Deep Analysis</option>
            </select>
          </div>
        </div>
        
        <Button onClick={handleCreate} disabled={loading || polling} className="w-full">
          {(loading || polling) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldAlert className="h-4 w-4 mr-2" />}
          {polling ? 'Investigation in progress...' : 'Start Investigation'}
        </Button>
      </div>

      <div className="w-full lg:w-2/3">
        {investigationId ? (
        <Card className="mt-6 border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-900/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center justify-between">
              Investigation Status
              {status?.status && (
                <Badge variant={status.status === 'completed' ? 'success' : status.status === 'failed' ? 'destructive' : 'default'}>
                  {status.status.toUpperCase()}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>ID: {investigationId}</CardDescription>
          </CardHeader>
          <CardContent>
            {status ? (
              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Progress:</span>
                  <span className="font-medium">{status.progress || 0}%</span>
                </div>
                {polling && (
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div className="bg-emerald-600 h-2.5 rounded-full" style={{ width: `${status.progress || 10}%` }}></div>
                  </div>
                )}
                {details && (
                  <div className="space-y-6 pt-4 border-t border-emerald-100 dark:border-emerald-800">
                    <h3 className="font-semibold text-lg flex items-center">
                      <FileText className="w-5 h-5 mr-2" /> Final Results
                    </h3>
                    
                    {details.entities && details.entities.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm text-gray-500 flex items-center"><Database className="w-4 h-4 mr-1"/> Entities</h4>
                        <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
                          {details.entities.map((e, i) => (
                            <li key={i}>{e.name || e.id || JSON.stringify(e)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {details.relationships && details.relationships.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm text-gray-500 flex items-center"><Network className="w-4 h-4 mr-1"/> Relationships</h4>
                        <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
                          {details.relationships.map((r, i) => (
                            <li key={i}>{r.source} {'->'} {r.target} ({r.type})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {details.evidence && details.evidence.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm text-gray-500 flex items-center"><ShieldAlert className="w-4 h-4 mr-1"/> Evidence</h4>
                        <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
                          {details.evidence.map((ev, i) => (
                            <li key={i}>{ev.description || JSON.stringify(ev)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <details className="mt-4 cursor-pointer text-xs text-gray-400">
                  <summary>View Raw Technical Data</summary>
                  <pre className="mt-2 bg-gray-100 dark:bg-gray-800 p-2 rounded text-gray-800 dark:text-gray-200 overflow-x-auto">
                    {JSON.stringify(details || status, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <div className="flex items-center text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Initializing...
              </div>
            )}
          </CardContent>
        </Card>
        ) : (
          <div className="h-full min-h-[200px] flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg p-12 text-gray-500 text-sm">
            Provide a target to create a new investigation.
          </div>
        )}
      </div>
    </div>
  );
};


const OsintWorkspace = () => {
  return (
    <div className="p-4 w-full space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center">
          <Search className="h-5 w-5 mr-2 text-emerald-500" />
          OSINT Workspace
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Open Source Intelligence gathering and analysis</p>
      </div>

      <Tabs defaultValue="investigation" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4 h-auto p-1">
          <TabsTrigger value="investigation" className="py-2"><Activity className="h-4 w-4 mr-2 hidden sm:block" /> Investigation</TabsTrigger>
          <TabsTrigger value="lookup" className="py-2"><Search className="h-4 w-4 mr-2 hidden sm:block" /> Identifier Lookup</TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="pt-6">
            <TabsContent value="investigation" className="mt-0">
              <InvestigationTab />
            </TabsContent>
            
            <TabsContent value="lookup" className="mt-0">
              <LookupTab />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
};

export default OsintWorkspace;
