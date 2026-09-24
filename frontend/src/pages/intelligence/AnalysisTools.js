import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Globe, Radar } from 'lucide-react';

// Add a module here and a matching <Route> in App.js to extend the workbench.
export const ANALYSIS_MODULES = [
  { to: '/analysis-tools/scrape', label: 'Scrape', desc: 'Crawl and extract web content', icon: Globe },
  { to: '/analysis-tools/osint', label: 'OSINT', desc: 'Investigations and identifier lookups', icon: Radar },
];

const AnalysisTools = () => (
  <div className="flex h-full min-h-[calc(100dvh-4rem)] flex-col md:flex-row bg-background">
    <aside className="shrink-0 md:w-56 border-b md:border-b-0 md:border-r border-border bg-card">
      <div className="hidden md:block px-3 pt-3 pb-2">
        <h1 className="text-base font-heading font-bold tracking-tight leading-none">Analysis Tools</h1>
        <p className="text-[11px] text-muted-foreground mt-1">Module tools · Scrape / OSINT / Web / Alerts · Events</p>
      </div>
      <nav className="flex md:flex-col gap-1 p-2 overflow-x-auto no-scrollbar">
        {ANALYSIS_MODULES.map(({ to, label, desc, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors md:w-full whitespace-nowrap ${isActive
                ? 'bg-primary/10 text-foreground ring-1 ring-primary/30'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`h-7 w-7 shrink-0 rounded-md flex items-center justify-center ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold leading-none">{label}</span>
                  <span className="hidden md:block text-[10px] text-muted-foreground mt-1 truncate">{desc}</span>
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>

    <main className="flex-1 min-w-0 overflow-auto">
      <Outlet />
    </main>
  </div>
);

export default AnalysisTools;
