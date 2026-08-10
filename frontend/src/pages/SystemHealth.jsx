import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Activity, Server, Database, Brain, RefreshCw, ShieldAlert } from 'lucide-react';
import api from '../lib/api';

const SystemHealth = () => {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const healthDataRef = useRef(healthData);
  healthDataRef.current = healthData;

  const fetchHealth = useCallback(async (manual = false) => {
    try {
      if (manual) setIsRefreshing(true);
      else if (!healthDataRef.current) setLoading(true);
      
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
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => fetchHealth(false), 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const StatusCard = ({ title, statusObj, icon: Icon, latency }) => {
    const { status, message } = statusObj || { status: 'offline', message: 'Unknown state' };
    let label = 'Offline';
    let colorClasses = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    
    if (status === 'online' || status === 'active') {
      label = status === 'active' ? 'Active' : 'Operational';
      colorClasses = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    } else if (status === 'quota_completed') {
      label = 'Quota Completed';
      colorClasses = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-500';
    }

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="p-2 bg-gray-100 dark:bg-gray-900 rounded-md">
            <Icon className="w-4 h-4 text-gray-700 dark:text-gray-300" />
          </div>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold tracking-wide ${colorClasses}`}>
            {label}
          </span>
        </div>
        
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 leading-tight">{message}</p>
        
        {latency && (status === 'online' || status === 'active') ? (
          <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">
            Latency: {latency}ms
          </span>
        ) : <div className="h-4"></div>}
      </div>
    );
  };

  const getApiStatus = (quotaData) => {
    if (!quotaData) return { status: 'offline', message: 'No data from backend.' };
    if (quotaData.available === false) return { status: 'offline', message: 'API keys exhausted or invalid.' };
    if (quotaData.remaining !== undefined && quotaData.remaining !== 'Unknown' && Number(quotaData.remaining) <= 0) {
      return { status: 'quota_completed', message: 'Rate limit / quota exceeded.' };
    }
    return { status: 'active', message: 'Operational and within limits.' };
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
                icon={Server}
                statusObj={{ status: healthData.database.status, message: 'Primary datastore for content and alerts.' }}
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
                icon={Brain}
                statusObj={{ status: healthData.services.ollama.status, message: 'Local Language Model (Risk Scoring)' }}
                latency={healthData.services.ollama.latency}
              />
              <StatusCard
                title="Custom Sentiment"
                icon={Activity}
                statusObj={{ status: healthData.services.sentiment.status, message: 'Multi-lingual emotion detection.' }}
                latency={healthData.services.sentiment.latency}
              />
              <StatusCard 
                title="Media Analyzer"
                icon={Database}
                statusObj={{ status: healthData.services.mediaAnalyzer.status, message: 'Image & Video OCR pipeline.' }}
                latency={healthData.services.mediaAnalyzer.latency}
              />
              <StatusCard 
                title="RAG API"
                icon={Database}
                statusObj={{ status: healthData.services.ragApi.status, message: 'Vector database retrieval.' }}
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
                icon={Activity}
                statusObj={getApiStatus(healthData.quotas.instagram)}
              />
              <StatusCard 
                title="BCSS Facebook"
                icon={Activity}
                statusObj={getApiStatus(healthData.quotas.facebook)}
              />
              <StatusCard 
                title="BCSS X (Twitter)"
                icon={Activity}
                statusObj={getApiStatus(healthData.quotas.x)}
              />
              <StatusCard 
                title="Google YouTube"
                icon={Activity}
                statusObj={getApiStatus(healthData.quotas.youtube)}
              />
            </div>
          </section>

        </div>
      ) : null}
    </div>
  );
};

export default SystemHealth;
