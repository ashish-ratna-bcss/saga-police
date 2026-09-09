import React from 'react';
import { LogOut, Menu } from 'lucide-react';
import { Button } from '../components/ui/button';

const Header = ({ user, sidebarOpen, onToggleSidebar, onLogout }) => (
  <header
    className="sticky top-0 z-50 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 shadow-md px-3 sm:px-5 text-white transition-all duration-300"
    style={{ background: 'var(--primary-gradient)' }}
  >
    <div className="flex min-w-0 items-center gap-2 sm:gap-3">
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        className="h-10 w-10 shrink-0 text-white hover:bg-white/10"
        aria-label={sidebarOpen ? 'Hide menu' : 'Show menu'}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <img
        src={user?.blurasagalogo || user?.theme_logo || '/blura_saga_logo.jpg'}
        alt={user?.blurasagatitle || user?.theme_name || 'Blura Saga'}
        className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-cyan-500/50"
      />
      <div className="min-w-0 leading-tight">
        <h1 className="truncate font-heading text-base font-bold tracking-[0.12em] text-white sm:text-xl">
          {user?.blurasagatitle || user?.theme_name || 'BLURA SAGA'}
        </h1>
        <p className="hidden truncate text-[10px] font-semibold uppercase tracking-widest text-white/90 sm:block">
          {user?.blurasagadescription || user?.theme_description || 'Cyber Intelligence Platform'}
        </p>
      </div>
    </div>

    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
      <img
        src="/Logo.png"
        alt="Blue Cloud Softtech"
        className="h-8 w-auto object-contain opacity-95 md:h-9"
      />
      <div className="mx-1 hidden h-8 w-px bg-white/25 sm:block" aria-hidden />
      <div className="hidden text-right sm:block">
        <div className="max-w-[140px] truncate text-sm font-bold text-white">
          {user?.name}
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-white/90">
          {user?.role}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onLogout}
        className="h-9 w-9 text-white hover:bg-red-500/20 hover:text-red-200"
        aria-label="Logout"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  </header>
);

export default Header;
