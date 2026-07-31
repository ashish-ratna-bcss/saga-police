import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userData = await login(email, password);
      if (userData?.role === 'dial100') {
        navigate('/dial-100-incident-reporting');
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      // Error is handled by AuthContext
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(217,71%,18%)] via-[hsl(217,71%,22%)] to-[hsl(217,71%,18%)] p-4 sm:p-6 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 35px, rgba(255,255,255,.1) 35px, rgba(255,255,255,.1) 70px)' }}></div>
      </div>

      {/* Decorative Elements - Hidden on small mobile */}
      <div className="absolute top-0 left-0 w-48 sm:w-72 lg:w-96 h-48 sm:h-72 lg:h-96 bg-[hsl(43,96%,50%)] rounded-full filter blur-[100px] lg:blur-[150px] opacity-15"></div>
      <div className="absolute bottom-0 right-0 w-48 sm:w-72 lg:w-96 h-48 sm:h-72 lg:h-96 bg-[hsl(217,71%,25%)] rounded-full filter blur-[100px] lg:blur-[150px] opacity-30"></div>

      <div className="w-full max-w-sm sm:max-w-md relative z-10">
        {/* Header Section */}
        <div className="text-center mb-6 lg:mb-8">
          <div className="flex flex-col items-center gap-3 lg:gap-4 mb-4 lg:mb-6">
            <div className="relative">
              <div className="absolute -inset-1.5 lg:-inset-2 bg-gradient-to-r from-[hsl(43,96%,50%)] to-[hsl(43,96%,60%)] rounded-full opacity-75 blur-sm animate-pulse"></div>
              <img
                src="/policelogo.jpg"
                alt="Logo"
                className="relative h-20 w-20 sm:h-24 sm:w-24 lg:h-28 lg:w-28 rounded-full object-cover border-3 lg:border-4 border-[hsl(43,96%,50%)] shadow-2xl"
              />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-heading font-bold text-white tracking-wider uppercase">SOC - EYE</h1>
              <div className="flex items-center justify-center gap-2 mt-1.5 lg:mt-2">
                <div className="h-px w-6 lg:w-8 bg-gradient-to-r from-transparent to-[hsl(43,96%,50%)]"></div>
                <Shield className="h-3 w-3 lg:h-4 lg:w-4 text-[hsl(43,96%,50%)]" />
                <div className="h-px w-6 lg:w-8 bg-gradient-to-l from-transparent to-[hsl(43,96%,50%)]"></div>
              </div>
            </div>
          </div>
          <p className="text-[hsl(210,20%,75%)] text-xs sm:text-sm tracking-wide uppercase">Social media Observation & Cyber intelligence</p>
        </div>

        {/* Login Card */}
        <div className="bg-white/95 backdrop-blur-xl border-2 border-[hsl(43,96%,50%)]/30 rounded-xl p-5 sm:p-6 lg:p-8 shadow-2xl shadow-black/20">
          <div className="flex items-center gap-3 mb-5 lg:mb-6 pb-3 lg:pb-4 border-b border-border">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Shield className="h-5 w-5 lg:h-6 lg:w-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-heading font-bold text-slate-900">Secure Access</h2>
              <p className="text-[10px] lg:text-xs text-slate-500">Authorized Personnel Only</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 lg:space-y-5" data-testid="login-form">
            <div className="space-y-1.5 lg:space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@SOC - EYEhub.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="email-input"
                className="h-11 lg:h-12 border-2 focus:border-amber-500 focus:ring-amber-500/20 text-base"
              />
            </div>
            <div className="space-y-1.5 lg:space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
                <Link to="/forgot-password" className="text-xs text-amber-600 hover:text-amber-700 font-medium">
                  Forgot Password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="password-input"
                className="h-11 lg:h-12 border-2 focus:border-amber-500 focus:ring-amber-500/20 text-base"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-11 lg:h-12 text-sm lg:text-base font-bold text-slate-900 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 shadow-lg shadow-amber-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-amber-500/30 active:scale-[0.98]"
              disabled={loading}
              data-testid="login-submit-btn"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 lg:w-5 lg:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Authenticating...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4 lg:h-5 lg:w-5" />
                  Access System
                </span>
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-4 lg:mt-6 text-center">
          <p className="text-[hsl(210,20%,60%)] text-[10px] lg:text-xs">© 2026 SOC - EYE • Secure Connection</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
