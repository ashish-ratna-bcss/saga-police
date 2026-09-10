import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth.context';
import {
  Shield, Eye, EyeOff, Lock, User, ArrowRight, Loader2,
  Radio, BarChart3, Bell, Search, Activity, MapPin, CheckCircle2,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

const CAPABILITIES = [
  { icon: Radio, title: 'Live Monitoring', desc: 'Track social platforms in real time', color: 'from-cyan-500/20 to-blue-500/10 text-cyan-400' },
  { icon: Bell, title: 'Smart Alerts', desc: 'Risk-scored threat notifications', color: 'from-amber-500/20 to-orange-500/10 text-amber-400' },
  { icon: BarChart3, title: 'Intelligence', desc: 'Dashboards & daily briefings', color: 'from-emerald-500/20 to-teal-500/10 text-emerald-400' },
  { icon: Search, title: 'OSINT Tools', desc: 'Profile & content investigation', color: 'from-purple-500/20 to-indigo-500/10 text-purple-400' },
  { icon: MapPin, title: 'Events Map', desc: 'Geo-tagged situational awareness', color: 'from-rose-500/20 to-pink-500/10 text-rose-400' },
  { icon: Activity, title: 'System Health', desc: 'Always-on operational status', color: 'from-sky-500/20 to-blue-500/10 text-sky-400' },
];

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060d1a]">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userData = await login(username, password);
      if (userData?.role === 'dial100') {
        navigate('/dial-100-incident-reporting');
      } else {
        navigate('/dashboard');
      }
    } catch {
      // AuthContext handles toast notification
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-blura relative min-h-screen w-full overflow-hidden bg-[#060d1a] text-white selection:bg-cyan-500/30 selection:text-cyan-200">
      <style>{`
        @keyframes blura-rise {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blura-pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.08); opacity: 0.8; }
        }
        .login-blura .rise { animation: blura-rise 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .login-blura .rise-delay { animation: blura-rise 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.12s both; }
        .login-blura .pulse-glow { animation: blura-pulse 6s ease-in-out infinite; }
      `}</style>

      {/* Futuristic Glowing Atmosphere */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Background Mesh Gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(6,182,212,0.18)_0%,transparent_50%),radial-gradient(ellipse_at_80%_80%,rgba(245,158,11,0.14)_0%,transparent_50%),linear-gradient(160deg,#040914_0%,#09152b_50%,#050b18_100%)]" />
        
        {/* Tech Grid Pattern */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        {/* Floating Glowing Orbs */}
        <div className="pulse-glow absolute -top-32 -left-20 h-[36rem] w-[36rem] rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/20 blur-[140px]" />
        <div className="pulse-glow absolute -bottom-40 -right-20 h-[40rem] w-[40rem] rounded-full bg-gradient-to-tl from-amber-500/25 to-orange-600/15 blur-[150px]" />
      </div>

      {/* Main Responsive Grid Layout */}
      <div className="relative z-10 grid min-h-screen w-full lg:grid-cols-[1.15fr_0.85fr]">
        
        {/* LEFT COLUMN — Brand Showcase & Platform Info */}
        <section className="rise flex flex-col justify-between px-6 py-8 sm:px-10 lg:px-14 xl:px-16 lg:py-10">
          
          {/* Top Brand Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="relative group">
                <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-500 to-amber-500 opacity-60 blur transition group-hover:opacity-100" />
                <img
                  src="/blura_saga_logo.jpg"
                  alt="Blura Saga Logo"
                  className="relative h-12 w-auto max-w-[180px] object-contain sm:h-14 sm:max-w-[280px]"
                />
              </div>
              <div className="hidden leading-tight min-[480px]:block">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading text-lg font-bold tracking-[0.16em] text-white sm:text-xl">
                    BLURA SAGA
                  </span>
                  <span className="inline-flex items-center rounded-full bg-cyan-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-300 ring-1 ring-cyan-500/30">
                    Enterprise v2.0
                  </span>
                </div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-400/90 sm:text-[11px]">
                  Cyber Intelligence & Observability
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5 sm:gap-2.5 sm:px-3 sm:py-2">
              <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.14em] text-white/55 sm:text-[10px]">
                Powered by
              </span>
              <img
                src="/Logo.png"
                alt="Blue Cloud Softech Solutions Limited"
                className="h-8 w-auto max-w-[110px] object-contain opacity-95 sm:h-10 sm:max-w-[180px]"
              />
            </div>
          </div>

          {/* Center Content Section */}
          <div className="my-10 flex flex-1 flex-col justify-center lg:my-0">
            
            {/* Tagline Badge */}
            <div className="mb-4 inline-flex items-center gap-2.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1.5 backdrop-blur-md self-start">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
                BLURA SAGA · CYBER INTELLIGENCE
              </span>
            </div>

            {/* Giant Title */}
            <h1 className="mb-4 font-heading text-5xl font-black uppercase leading-none tracking-[0.1em] sm:text-6xl xl:text-7xl">
              <span className="bg-gradient-to-r from-white via-cyan-100 to-amber-200 bg-clip-text text-transparent drop-shadow-sm">
                BLURA SAGA
              </span>
            </h1>

            {/* Description */}
            <p className="max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              Next-generation Social Media Observation, Threat Monitoring &amp; Cyber Intelligence Platform — built for real-time situational awareness and rapid investigation.
            </p>

            {/* Capability Cards Grid */}
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {CAPABILITIES.map(({ icon: Icon, title, desc, color }) => (
                <div
                  key={title}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/40 hover:bg-white/[0.07] hover:shadow-[0_8px_30px_rgba(6,182,212,0.15)]"
                >
                  <div className={`mb-2.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${color} ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-110`}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <p className="text-sm font-bold text-white group-hover:text-cyan-200">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-white/50">{desc}</p>
                </div>
              ))}
            </div>

            {/* Trust Badges */}
            <div className="mt-8 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-[11px] font-medium uppercase tracking-wider text-white/50">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" /> End-to-end Encrypted
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-amber-400" /> Fine-Grained RBAC
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-cyan-400" /> Immutable Audit Logs
              </span>
            </div>
          </div>

          {/* Footer Copyright */}
          <p className="hidden text-xs font-medium text-white/35 lg:block">
            © 2026 BLURA SAGA · Cyber Intelligence Platform · All Rights Reserved
          </p>
        </section>

        {/* RIGHT COLUMN — Floating Glass Auth Card & Dock */}
        <section className="rise-delay relative flex min-h-[75vh] flex-col justify-between p-6 sm:p-10 lg:p-12 lg:bg-white/[0.015] lg:backdrop-blur-2xl">
          
          {/* Subtle Ambient Behind Right Side */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[28rem] w-[28rem] rounded-full bg-cyan-500/10 blur-[120px]" />
          </div>

          {/* Dock Top Header Strip */}
          <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/10 pb-4.5">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute -inset-0.5 rounded-xl bg-cyan-500/40 blur-sm" />
                <img
                  src="/blura_saga_logo.jpg"
                  alt="Blura Saga Emblem"
                  className="relative h-9 w-auto max-w-[160px] object-contain"
                />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold text-white">System Portal</p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">BLURA SAGA SECURE ACCESS</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.2)]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Online
            </span>
          </div>

          {/* Form Floating Glass Container */}
          <div className="relative z-10 mx-auto my-auto w-full max-w-md rounded-3xl border border-white/12 bg-white/[0.04] p-7 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-9">
            
            {/* Header Lock Icon & Titles */}
            <div className="mb-7 text-center sm:text-left">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 via-cyan-500/10 to-amber-500/10 ring-1 ring-cyan-400/40 shadow-[0_0_20px_rgba(6,182,212,0.25)]">
                <Shield className="h-6 w-6 text-cyan-400" />
              </div>
              <h2 className="font-heading text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Sign in
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                Enter your authorized system credentials to proceed.
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="w-full space-y-5" data-testid="login-form">
              
              {/* Username Input */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  Username
                </Label>
                <div className="relative group">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400/70 transition-colors group-focus-within:text-cyan-300" />
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Enter username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    data-testid="username-input"
                    className="h-12 rounded-xl border-white/15 bg-black/25 pl-10 text-white placeholder:text-white/35 backdrop-blur-md transition hover:border-white/25 focus-visible:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400/30"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-white/80">
                  Password
                </Label>
                <div className="relative group">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-400/70 transition-colors group-focus-within:text-cyan-300" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="password-input"
                    className="h-12 rounded-xl border-white/15 bg-black/25 pl-10 pr-11 text-white placeholder:text-white/35 backdrop-blur-md transition hover:border-white/25 focus-visible:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-400/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Action Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                data-testid="login-submit-btn"
                className="group relative h-12 w-full overflow-hidden rounded-xl border-0 bg-amber-500 text-base font-bold text-gray-950 shadow-[0_0_25px_rgba(245,158,11,0.4)] transition-all duration-300 hover:bg-amber-400 hover:shadow-[0_0_35px_rgba(245,158,11,0.6)] hover:scale-[1.01] active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Authenticating credentials…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Access System
                    <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                )}
              </Button>
            </form>

            {/* Quick Metrics Bar */}
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                { n: '24/7', l: 'Live Watch' },
                { n: 'RBAC', l: 'Strict Control' },
                { n: 'TLS', l: 'Encrypted' },
              ].map((item) => (
                <div
                  key={item.l}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3 text-center backdrop-blur-md transition hover:border-cyan-500/40"
                >
                  <p className="text-sm font-bold text-cyan-300">{item.n}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{item.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Dock Bottom Notice */}
          <div className="relative z-10 border-t border-white/10 pt-4.5">
            <p className="text-[11px] leading-relaxed text-white/45 text-center sm:text-left">
              Restricted system — authorized personnel only. All access events are recorded and audited.
            </p>
            <p className="mt-2 text-[10px] font-medium tracking-wide text-white/30 text-center lg:hidden">
              © 2026 BLURA SAGA · Cyber Intelligence
            </p>
          </div>
        </section>

      </div>
    </div>
  );
};

export default Login;
