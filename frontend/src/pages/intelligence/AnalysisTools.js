import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Globe, Search, FileText, Hash, Calendar } from 'lucide-react';

const AnalysisTools = () => {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-sm">
      {/* Header Area */}
      <div className="bg-white dark:bg-gray-900 px-4 pt-3 pb-2 border-b border-gray-200 dark:border-gray-800">
        <div className="w-full mx-auto">
          {/* Title */}
          <div className="mb-3">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Analysis Tools</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Module tools - Scrape / OSINT / Web / Alerts - Events</p>
          </div>

          {/* Tabs Row */}
          <div className="flex space-x-2 overflow-x-auto">
            <NavLink
              to="/analysis-tools/scrape"
              className={({ isActive }) =>
                `flex items-center px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              <Globe className="h-3.5 w-3.5 mr-1.5 text-gray-500" />
              Scrape
              <span className="ml-2 px-1 bg-gray-200/60 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] rounded-[2px] tracking-widest leading-none pb-0.5">...</span>
            </NavLink>
            <NavLink
              to="/analysis-tools/osint"
              className={({ isActive }) =>
                `flex items-center px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                  isActive
                    ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              <Search className="h-3.5 w-3.5 mr-1.5 text-gray-500" />
              OSINT
              <span className="ml-2 px-1 bg-gray-200/60 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] rounded-[2px] tracking-widest leading-none pb-0.5">...</span>
            </NavLink>
          </div>
        </div>
      </div>

      {/* Main Content Area (Workspaces) */}
      <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950">
        <Outlet />
      </div>
    </div>
  );
};

export default AnalysisTools;

