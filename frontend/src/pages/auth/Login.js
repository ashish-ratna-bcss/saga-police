import React, { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth.context';
import {
  Eye,
  EyeOff,
  Lock,
  User,
  ArrowRight,
  Loader2,
  Radio,
  Bell,
  BarChart3,
  Search,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  fetchTenantBranding,
  getLogoUrl,
} from '../../lib/tenantBranding';

const CAPABILITIES = [
  {
    icon: Radio,
    title: 'Live monitoring',
    desc: 'Track X, Facebook, Instagram, YouTube and Telegram in real time.',
  },
  {
    icon: Bell,
    title: 'Risk alerts',
    desc: 'Keyword and AI-scored threats with virality thresholds.',
  },
  {
    icon: BarChart3,
    title: 'Intelligence briefs',
    desc: 'Dashboards, daily reports and operational summaries.',
  },
  {
    icon: Search,
    title: 'OSINT tools',
    desc: 'Profile lookup, content search and source investigation.',
  },
  {
    icon: MapPin,
    title: 'Events & map',
    desc: 'Geo-tagged occasions and situational awareness.',
  },
  {
    icon: ShieldCheck,
    title: 'Controlled access',
    desc: 'Role-based pages, audited logins and encrypted credentials.',
  },
];

const fieldClass =
  'h-12 w-full rounded-lg border border-white/15 bg-[#07111f] pl-10 text-[15px] text-white placeholder:text-white/35 shadow-none transition focus-visible:border-cyan-400/70 focus-visible:ring-1 focus-visible:ring-cyan-400/40';

const Login = () => {
  const [branding, setBranding] = useState(null);
  const [brandingLoading, setBrandingLoading] = useState(true);
  const logoUrl = getLogoUrl(branding?.logo);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    setBrandingLoading(true);
    fetchTenantBranding()
      .then((data) => {
        if (!isMounted || !data) return;
        setBranding({
          title: data.title,
          description: data.description,
          logo: data.logo,
          port: data.port,
        });
      })
      .finally(() => {
        if (isMounted) setBrandingLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!branding?.title) return;

    document.title = branding.description
      ? `${branding.title} — ${branding.description}`
      : branding.title;

    if (logoUrl) {
      document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon']").forEach((el) => {
        el.setAttribute('href', logoUrl);
      });
      let link = document.getElementById('app-favicon');
      if (!link) {
        link = document.createElement('link');
        link.id = 'app-favicon';
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = logoUrl;

      let appleLink = document.getElementById('app-apple-icon');
      if (!appleLink) {
        appleLink = document.createElement('link');
        appleLink.id = 'app-apple-icon';
        appleLink.rel = 'apple-touch-icon';
        document.head.appendChild(appleLink);
      }
      appleLink.href = logoUrl;

      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && branding.description) {
        metaDesc.setAttribute('content', branding.description);
      }
    }
  }, [branding?.title, branding?.description, logoUrl]);

  if (authLoading || brandingLoading || !branding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#060d1a]">
        <Loader2 className="h-7 w-7 animate-spin text-cyan-400/80" />
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
      // AuthContext handles toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen relative min-h-screen w-full overflow-hidden bg-[#060d1a] text-white">
      <style>{`
        @keyframes login-fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes login-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(2%, -1%) scale(1.04); }
        }
        .login-screen .anim-brand {
          animation: login-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .login-screen .anim-form {
          animation: login-fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.12s both;
        }
        .login-screen .anim-drift {
          animation: login-drift 18s ease-in-out infinite;
        }
        @keyframes login-sticker-float {
          0%, 100% { transform: translate(-50%, -50%) rotate(-6deg) scale(1); }
          50% { transform: translate(-50%, calc(-50% - 10px)) rotate(-4deg) scale(1.03); }
        }
        .login-screen .login-logo-sticker {
          animation: login-sticker-float 16s ease-in-out infinite;
        }
        .login-screen input:-webkit-autofill,
        .login-screen input:-webkit-autofill:hover,
        .login-screen input:-webkit-autofill:focus {
          -webkit-text-fill-color: #f8fafc !important;
          caret-color: #f8fafc;
          box-shadow: 0 0 0 1000px #07111f inset !important;
          transition: background-color 99999s ease-in-out 0s;
        }
      `}</style>

      {/* Atmosphere — desktop left plane only */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block lg:right-[26rem] xl:right-[28rem]" aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#030812_0%,#0a1a32_42%,#071525_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
            maskImage: 'radial-gradient(ellipse at 40% 45%, black 20%, transparent 75%)',
          }}
        />
        <div className="anim-drift absolute -left-[10%] top-[-20%] h-[70vmin] w-[70vmin] rounded-full bg-[radial-gradient(circle,rgba(14,116,144,0.35)_0%,transparent_68%)] blur-2xl" />
        <div className="anim-drift absolute bottom-[-15%] right-[-5%] h-[55vmin] w-[55vmin] rounded-full bg-[radial-gradient(circle,rgba(180,83,9,0.22)_0%,transparent_70%)] blur-2xl" style={{ animationDelay: '-6s' }} />
      </div>

      {/* Mobile atmosphere */}
      <div className="pointer-events-none absolute inset-0 lg:hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(165deg,#030812_0%,#0a1a32_50%,#060d1a_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative z-10 flex min-h-screen w-full flex-col lg:grid lg:grid-cols-[1fr_26rem] xl:grid-cols-[1fr_28rem]">
        {/* Compact brand — mobile top / desktop left */}
        <section className="anim-brand relative flex flex-col overflow-hidden px-5 pt-6 pb-2 sm:px-8 lg:min-h-screen lg:justify-between lg:px-16 lg:py-12 xl:px-20">
          {/* Logo sticker — large faint mark behind capabilities */}
          <div
            className="pointer-events-none absolute inset-0 z-0 hidden lg:block"
            aria-hidden="true"
          >
            <img
              key={`sticker-${logoUrl}`}
              src={logoUrl}
              alt=""
              className="login-logo-sticker absolute left-[52%] top-[54%] h-[min(58vmin,520px)] w-auto max-w-[70%] -translate-x-1/2 -translate-y-1/2 rotate-[-6deg] object-contain opacity-[0.11] select-none"
              style={{
                filter: 'drop-shadow(0 0 40px rgba(56,189,248,0.12))',
                maskImage:
                  'radial-gradient(ellipse at center, black 35%, transparent 78%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse at center, black 35%, transparent 78%)',
              }}
            />
          </div>

          <div className="relative z-10 lg:flex lg:flex-1 lg:flex-col lg:justify-center">
            <div className="flex items-center gap-3 lg:block">
              <div className="shrink-0 rounded-md bg-white p-1.5 shadow-sm shadow-black/20 sm:p-2 lg:mb-8 lg:inline-block lg:p-2.5">
                <img
                  key={logoUrl}
                  src={logoUrl}
                  alt=""
                  className="h-10 w-auto max-w-[100px] object-contain sm:h-12 sm:max-w-[120px] lg:h-16 lg:max-w-[220px] xl:h-20 xl:max-w-[240px]"
                />
              </div>
              <div className="min-w-0 lg:contents">
                <h1 className="font-heading text-2xl font-bold uppercase leading-none tracking-[0.1em] text-white sm:text-3xl lg:text-5xl xl:text-6xl 2xl:text-7xl lg:leading-[0.95] lg:tracking-[0.12em]">
                  {branding.title}
                </h1>
                {branding.description ? (
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/60 sm:text-xs lg:mt-4 lg:line-clamp-none lg:max-w-2xl lg:text-base lg:leading-relaxed lg:text-white/70 xl:text-lg">
                    {branding.description}
                  </p>
                ) : null}
              </div>
            </div>

            {/* Capabilities — desktop only here; mobile below form */}
            <div className="relative mt-10 hidden max-w-3xl lg:block">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
                What you can do
              </p>
              <ul className="relative z-10 grid grid-cols-2 gap-x-10 gap-y-5">
                {CAPABILITIES.map(({ icon: Icon, title, desc }) => (
                  <li key={title} className="flex gap-3.5">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-cyan-300/90 ring-1 ring-white/10">
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="mt-0.5 text-[13px] leading-snug text-white/50">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="relative z-10 mt-auto hidden flex-wrap items-end justify-between gap-6 border-t border-white/10 pt-6 lg:flex">
            <div className="flex flex-wrap items-center gap-10">
              {branding.port != null && (
                <div className="flex items-center gap-3.5">
                  <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">
                    Platform
                  </span>
                  <span className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 shadow-sm shadow-black/20">
                    <img
                      src="/blura_saga_logo.jpg"
                      alt="Blura Saga"
                      className="h-11 w-auto max-w-[160px] object-contain"
                      onError={(e) => {
                        e.currentTarget.closest('span')?.remove();
                      }}
                    />
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/45">
                  Powered by
                </span>
                <span className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 shadow-sm shadow-black/20">
                  <img
                    src="/Logo.png"
                    alt="Blue Cloud Softech Solutions Limited"
                    className="h-12 w-auto max-w-[200px] object-contain"
                  />
                </span>
              </div>
            </div>
            <p className="text-xs text-white/45">© 2026 {branding.title}</p>
          </div>
        </section>

        {/* Form — immediately under brand on mobile */}
        <section className="anim-form relative flex flex-col justify-center bg-[#050b16]/90 px-5 py-6 sm:px-8 lg:min-h-screen lg:border-l lg:border-white/10 lg:bg-[#050b16] lg:px-10 lg:py-12">
          <div
            className="pointer-events-none absolute inset-0 hidden opacity-40 lg:block"
            aria-hidden="true"
            style={{
              background:
                'radial-gradient(ellipse at 50% 0%, rgba(8,47,73,0.55) 0%, transparent 55%)',
            }}
          />
          <div className="relative z-10 mx-auto w-full max-w-sm">
            <form onSubmit={handleSubmit} className="w-full space-y-5" data-testid="login-form">
              <div>
                <h2 className="font-heading text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Sign in
                </h2>
                <p className="mt-1.5 text-sm text-white/50">
                  Authorized credentials only.
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="username"
                  className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55"
                >
                  Username
                </Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    data-testid="username-input"
                    className={fieldClass}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/55"
                >
                  Password
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="password-input"
                    className={`${fieldClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-white/40 transition hover:text-white/80"
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
                className="group h-12 w-full rounded-lg border-0 bg-amber-500 text-[15px] font-semibold text-[#0a0f18] shadow-none transition hover:bg-amber-400"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Continue
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                )}
              </Button>
            </form>

            <p className="mt-6 text-[11px] leading-relaxed text-white/35 lg:mt-10">
              Restricted system. Access is audited.
            </p>
          </div>
        </section>

        {/* Mobile capabilities + partners (after sign-in) */}
        <section className="anim-brand border-t border-white/10 px-5 py-8 sm:px-8 lg:hidden">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">
            What you can do
          </p>
          <ul className="space-y-4">
            {CAPABILITIES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-cyan-300/90 ring-1 ring-white/10">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-xs leading-snug text-white/50">{desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-6 border-t border-white/10 pt-6">
            {branding.port != null && (
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">
                  Platform
                </span>
                <span className="inline-flex items-center rounded-md bg-white px-2 py-1 shadow-sm shadow-black/20">
                  <img
                    src="/blura_saga_logo.jpg"
                    alt="Blura Saga"
                    className="h-8 w-auto max-w-[120px] object-contain"
                    onError={(e) => {
                      e.currentTarget.closest('span')?.remove();
                    }}
                  />
                </span>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">
                Powered by
              </span>
              <span className="inline-flex items-center rounded-md bg-white px-2 py-1 shadow-sm shadow-black/20">
                <img
                  src="/Logo.png"
                  alt="Blue Cloud Softech Solutions Limited"
                  className="h-9 w-auto max-w-[150px] object-contain"
                />
              </span>
            </div>
            <p className="w-full text-xs text-white/45">© 2026 {branding.title}</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
