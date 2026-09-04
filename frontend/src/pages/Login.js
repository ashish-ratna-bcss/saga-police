import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Shield, Eye, EyeOff, Lock, User, ArrowRight, Loader2,
  Radio, BarChart3, Bell, Search, Activity, MapPin,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const CAPABILITIES = [
  { icon: Radio, title: 'Live Monitoring', desc: 'Track social platforms in real time' },
  { icon: Bell, title: 'Smart Alerts', desc: 'Risk-scored threat notifications' },
  { icon: BarChart3, title: 'Intelligence', desc: 'Dashboards & daily briefings' },
  { icon: Search, title: 'OSINT Tools', desc: 'Profile & content investigation' },
  { icon: MapPin, title: 'Events Map', desc: 'Geo-tagged situational awareness' },
  { icon: Activity, title: 'System Health', desc: 'Always-on operational status' },
];

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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
    } catch (error) {
      // AuthContext handles toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-ap relative min-h-screen w-full overflow-hidden bg-[#071428] text-white">
      <style>{`
        @keyframes login-rise {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes login-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        .login-ap .rise { animation: login-rise 0.7s ease-out both; }
        .login-ap .rise-delay { animation: login-rise 0.75s ease-out 0.1s both; }
        .login-ap .glow { animation: login-glow 5s ease-in-out infinite; }
      `}</style>

      {/* Atmosphere — full bleed */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_10%,hsl(217,72%,28%)_0%,transparent_50%),radial-gradient(ellipse_at_90%_80%,hsla(43,80%,40%,0.16)_0%,transparent_42%),linear-gradient(155deg,#06101f_0%,#0a1f3d_50%,#071428_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
        />
        <div className="glow absolute -top-28 -left-20 h-[32rem] w-[32rem] rounded-full bg-[hsl(43,96%,50%)] blur-[130px]" />
        <div className="absolute -bottom-40 -right-24 h-[36rem] w-[36rem] rounded-full bg-[hsl(217,80%,38%)] blur-[140px] opacity-45" />
      </div>

      {/* Full-width shell — no side gutters */}
      <div className="relative z-10 grid min-h-screen w-full lg:grid-cols-[1.15fr_0.85fr]">
        {/* LEFT — brand + filled content */}
        <section className="rise flex flex-col px-8 py-8 sm:px-12 lg:px-14 xl:px-16 lg:py-10">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/appolicelogo.png"
                alt="Andhra Pradesh Police"
                className="h-12 w-12 rounded-full object-contain bg-white p-0.5 ring-2 ring-[hsl(43,96%,55%)]/70 shadow-[0_0_24px_rgba(245,178,22,0.3)] sm:h-14 sm:w-14"
              />
              <div className="leading-tight">
                <p className="font-heading text-sm font-semibold uppercase tracking-[0.16em] text-white sm:text-base">
                  Andhra Pradesh Police
                </p>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[hsl(43,90%,68%)] sm:text-[11px]">
                  Cyber Cell
                </p>
              </div>
            </div>
            <img src="/Logo.png" alt="BCSS" className="hidden h-9 w-auto object-contain opacity-90 md:block" />
          </div>

          <div className="mt-10 flex flex-1 flex-col justify-center lg:mt-0">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.28em] text-[hsl(43,90%,68%)]">
              Andhra Pradesh Police · Cyber Cell
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-3 sm:gap-4">
              <h1 className="font-heading text-5xl font-bold uppercase leading-none tracking-[0.12em] text-white sm:text-6xl xl:text-7xl">
                SOCEYE
              </h1>
              <img src="/EYE-01.png" alt="" className="h-12 w-auto object-contain sm:h-14 xl:h-16" />
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
              Social Media Observation &amp; Cyber Intelligence — secure access for authorized personnel.
            </p>

            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {CAPABILITIES.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/[0.07]"
                >
                  <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(43,96%,50%)]/15 text-[hsl(43,96%,62%)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-white/45">{desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-6 border-t border-white/10 pt-6 text-[11px] uppercase tracking-wider text-white/40">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Encrypted session
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(43,96%,55%)]" /> Role-based access
              </span>
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Audit logged
              </span>
            </div>
          </div>

          <p className="mt-8 hidden text-xs text-white/30 lg:block">
            © 2026 SOCEYE · Andhra Pradesh Police · Authorized use only
          </p>
        </section>

        {/* RIGHT — full-height auth dock (no empty bands) */}
        <section className="rise-delay relative flex min-h-[70vh] flex-col border-t border-white/10 lg:min-h-0 lg:border-l lg:border-t-0 lg:bg-[#0a1830]/90 lg:backdrop-blur-md">
          {/* Top strip */}
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-6 py-4 sm:px-8 lg:px-10">
            <div className="flex items-center gap-3">
              <img
                src="/appolicelogo.png"
                alt=""
                className="h-9 w-9 rounded-full object-contain bg-white p-0.5"
              />
              <div className="leading-tight">
                <p className="text-sm font-semibold text-white">Officer Login</p>
                <p className="text-[10px] uppercase tracking-wider text-white/45">SOCEYE Secure Portal</p>
              </div>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
              Online
            </span>
          </div>

          {/* Form fills the middle */}
          <div className="flex flex-1 flex-col justify-center px-6 py-8 sm:px-8 lg:px-10 xl:px-12">
            <div className="mb-7">
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[hsl(43,96%,50%)]/15 ring-1 ring-[hsl(43,96%,50%)]/35">
                <Shield className="h-5 w-5 text-[hsl(43,96%,62%)]" />
              </div>
              <h2 className="font-heading text-3xl font-semibold tracking-wide text-white">Sign in</h2>
              <p className="mt-1.5 text-sm text-white/50">
                Use your Andhra Pradesh Police credentials
              </p>
            </div>

            <form onSubmit={handleSubmit} className="w-full space-y-5" data-testid="login-form">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-xs font-medium uppercase tracking-wider text-white/70">
                  Username
                </Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Enter username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    data-testid="username-input"
                    className="h-12 border-white/15 bg-white/5 pl-10 text-white placeholder:text-white/30 focus-visible:border-[hsl(43,96%,55%)] focus-visible:ring-[hsl(43,96%,55%)]/25"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-white/70">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="password-input"
                    className="h-12 border-white/15 bg-white/5 pl-10 pr-11 text-white placeholder:text-white/30 focus-visible:border-[hsl(43,96%,55%)] focus-visible:ring-[hsl(43,96%,55%)]/25"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/40 transition hover:text-white/80"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                data-testid="login-submit-btn"
                className="group h-12 w-full border-0 bg-[hsl(43,96%,52%)] text-base font-semibold text-[#1a1205] shadow-[0_10px_30px_rgba(245,178,22,0.28)] transition hover:bg-[hsl(43,96%,58%)] hover:shadow-[0_14px_36px_rgba(245,178,22,0.38)] active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Authenticating…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Access System
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-8 grid grid-cols-3 gap-2.5">
              {[
                { n: '24/7', l: 'Watch' },
                { n: 'RBAC', l: 'Access' },
                { n: 'TLS', l: 'Secure' },
              ].map((item) => (
                <div
                  key={item.l}
                  className="rounded-xl border border-white/10 bg-white/[0.05] px-2 py-3 text-center"
                >
                  <p className="text-sm font-bold text-[hsl(43,96%,62%)]">{item.n}</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">{item.l}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom notice fills remaining foot */}
          <div className="mt-auto border-t border-white/10 px-6 py-4 sm:px-8 lg:px-10">
            <p className="text-[11px] leading-relaxed text-white/40">
              Access is restricted to authorized Andhra Pradesh Police personnel.
              All login attempts are audited.
            </p>
            <p className="mt-2 text-[10px] tracking-wide text-white/25 lg:hidden">
              © 2026 SOCEYE · Andhra Pradesh Police
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
