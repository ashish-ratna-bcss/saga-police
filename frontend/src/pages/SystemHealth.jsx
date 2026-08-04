import React, { useState, useEffect } from 'react';
import { Activity, Server, Database, Brain, Zap, RefreshCw, ShieldAlert } from 'lucide-react';
import api from '../lib/api';

const SystemHealth = () => {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHealth = async (manual = false) => {
    try {
      if (manual) setIsRefreshing(true);
      else if (!healthData) setLoading(true);
      
      const res = await api.get('/health/status');
      setHealthData(res.data.data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch system health', err);
      setError('Could not connect to the backend server.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => fetchHealth(false), 15000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const StatusCard = ({ title, status, description, icon: Icon, latency }) => {
    const isOnline = status === 'online';
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="p-2 bg-gray-100 dark:bg-gray-900 rounded-md">
            <Icon className="w-4 h-4 text-gray-700 dark:text-gray-300" />
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold tracking-wide ${
            isOnline 
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {isOnline ? 'Operational' : 'Offline'}
          </span>
        </div>
        
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 leading-tight">{description}</p>
        
        {latency && isOnline ? (
          <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">
            Latency: {latency}ms
          </span>
        ) : <div className="h-4"></div>}
      </div>
    );
  };

  const QuotaCard = ({ title, data, icon: Icon, colorClass, bgClass, description }) => {
    const isKnown = data?.remaining !== undefined && data?.remaining !== 'Unknown';
    const isExceeded = isKnown && Number(data.remaining) <= 0;
    
    let percentage = null;
    let used = 0;
    if (isKnown && Number(data.limit) > 0) {
      used = Number(data.limit) - Number(data.remaining);
      percentage = Math.round((used / Number(data.limit)) * 100);
    }

    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border ${isExceeded ? 'border-red-400 dark:border-red-500/50' : 'border-gray-200 dark:border-gray-700'} p-4 transition-colors`}>
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-md ${isExceeded ? 'bg-red-50 dark:bg-red-900/30' : bgClass}`}>
              <Icon className={`w-4 h-4 ${isExceeded ? 'text-red-600 dark:text-red-400' : colorClass}`} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
          </div>
          {isExceeded && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 animate-pulse border border-red-200 dark:border-red-800/50">
              Overage
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-lg font-bold tracking-tight ${isExceeded ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
              {isKnown ? `${used.toLocaleString()}/${Number(data.limit).toLocaleString()}` : (data?.totalCalls || 0).toLocaleString()}
            </span>
            <span className={`text-[11px] font-medium whitespace-nowrap ${isExceeded ? 'text-red-500/80 dark:text-red-400/80' : 'text-gray-500 dark:text-gray-400'}`}>
              {isKnown ? 'used' : 'calls made'}
            </span>
          </div>
          {percentage !== null && (
            <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isExceeded ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
              {percentage}% used
            </span>
          )}
        </div>
        <div className={`flex justify-between items-end text-[10px] leading-tight ${isExceeded ? 'text-red-500 dark:text-red-400/80' : 'text-gray-400 dark:text-gray-500'}`}>
          <span>
            {isKnown ? (isExceeded ? '⚠️ Quota limit exceeded!' : 'Live BCSS quota.') : description}
          </span>
          <span className="font-mono bg-gray-50 dark:bg-gray-900 px-1.5 py-0.5 rounded border border-gray-100 dark:border-gray-800">
            {data?.totalCalls || 0} calls
          </span>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-5 flex flex-col items-center justify-center max-w-sm mx-auto mt-10">
          <ShieldAlert className="w-8 h-8 text-red-500 mb-2" />
          <h2 className="text-sm font-semibold mb-1">Connection Error</h2>
          <p className="text-xs text-center text-red-600 mb-4">{error}</p>
          <button 
            onClick={() => fetchHealth(true)} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 shadow-sm rounded-md hover:bg-red-50 text-xs font-medium transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            System Health & Quotas
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Real-time status of your internal microservices and external API limits.
          </p>
        </div>
        <button 
          onClick={() => fetchHealth(true)}
          disabled={loading || isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md text-xs font-medium text-gray-700 dark:text-gray-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${(loading || isRefreshing) ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {!healthData && loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse border border-gray-200 dark:border-gray-700"></div>
          ))}
        </div>
      ) : healthData ? (
        <div className="space-y-6">
          
          {/* Core Infrastructure */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-gray-500" /> 
              Core Infrastructure
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <StatusCard 
                title="MongoDB Database"
                description="Primary datastore for content and alerts."
                icon={Server}
                status={healthData.database.status}
              />
            </div>
          </section>

          {/* AI Microservices */}
          <section>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-gray-500" /> 
              AI Microservices
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <StatusCard 
                title="BCSS LLM"
                description="Local Language Model (Risk Scoring)"
                icon={Brain}
                status={healthData.services.ollama.status}
                latency={healthData.services.ollama.latency}
              />
              <StatusCard 
                title="Deepfake ML Engine"
                description="Forensic analysis of media."
                icon={Zap}
                status={healthData.services.deepfake.status}
                latency={healthData.services.deepfake.latency}
              />
              <StatusCard 
                title="Custom Sentiment"
                description="Regional sentiment classification."
                icon={Activity}
                status={healthData.services.sentiment.status}
                latency={healthData.services.sentiment.latency}
              />
              <StatusCard 
                title="Media Analyzer"
                description="Object and Face recognition."
                icon={Server}
                status={healthData.services.mediaAnalyzer.status}
                latency={healthData.services.mediaAnalyzer.latency}
              />
              <StatusCard 
                title="RAG API"
                description="Vector DB for semantic search."
                icon={Database}
                status={healthData.services.ragApi.status}
                latency={healthData.services.ragApi.latency}
              />
            </div>
          </section>

          {/* API Quotas */}
          <section className="mt-8">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                External Integrations
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <StatusCard 
                title="BCSS Instagram"
                description="Social media scraper API."
                icon={Activity}
                status="online"
              />
              <QuotaCard 
                title="BCSS Facebook"
                data={healthData.quotas.facebook}
                icon={Activity}
                colorClass="text-blue-600 dark:text-blue-400"
                bgClass="bg-blue-50 dark:bg-blue-900/30"
                description="Live BCSS quota."
              />
              <StatusCard 
                title="BCSS X (Twitter)"
                description="Social media scraper API."
                icon={Activity}
                status="online"
              />
              <StatusCard 
                title="Google YouTube"
                description="Data API service."
                icon={Activity}
                status="online"
              />
            </div>
          </section>

        </div>
      ) : null}
    </div>
  );
};

export default SystemHealth;
