import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  User as UserIcon,
  Crown
} from 'lucide-react';
import { motion } from 'motion/react';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

interface LoginPortalProps {
  onLoginSuccess: (user: AuthUser, token: string) => void;
}

export const LoginPortal: React.FC<LoginPortalProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('vortexailabs@gmail.com');
  const [password, setPassword] = useState('AdminPassword2025!');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectPreset = (type: 'admin' | 'user') => {
    setError(null);
    if (type === 'admin') {
      setEmail('vortexailabs@gmail.com');
      setPassword('AdminPassword2025!');
    } else {
      setEmail('team@theearacademy.com');
      setPassword('UserPassword2025!');
    }
  };

  const handleCredentialsSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Please provide both email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
          rememberMe
        })
      });
      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          res.ok
            ? 'Received an unexpected non-JSON response from the server.'
            : `Server returned an error (${res.status}): ${rawText.slice(0, 120)}`
        );
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid email or password.');
      }

      onLoginSuccess(data.user, data.sessionToken);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col justify-center items-center px-4 py-10 relative overflow-hidden select-none">
      {/* Subtle ambient glow matching the app palette */}
      <div className="absolute top-[-15%] left-[-10%] w-[520px] h-[520px] bg-primary/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[560px] h-[560px] bg-secondary-fixed/5 rounded-full blur-[160px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-xl z-10 flex flex-col items-center">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-28 h-14 mb-2 flex items-center justify-center">
            <svg viewBox="0 0 400 200" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
              <text x="145" y="60" className="font-sans font-normal" fontSize="24" fill="#a68a4c">the</text>
              <text x="60" y="140" className="font-sans font-black" fontSize="120" fill="#a68a4c" letterSpacing="-4">ear</text>
              <text x="120" y="185" className="font-sans font-bold" fontSize="32" fill="#a68a4c" letterSpacing="12">ACADEMY</text>
            </svg>
          </div>
          <h1 className="text-2xl font-headline font-black text-on-surface tracking-tight">
            Intelligence &amp; Quality Analytics
          </h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-headline font-bold bg-primary/10 text-primary border border-primary/25 uppercase tracking-widest">
              <ShieldCheck size={12} className="text-primary" />
              Role-Based Access Portal
            </span>
          </div>
        </div>

        {/* Glass Card matching dashboard cards */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full glass rounded-3xl shadow-2xl p-6 sm:p-8 border border-outline-variant/20"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-5 mb-6 border-b border-outline-variant/15">
            <div>
              <h2 className="text-base font-headline font-black text-on-surface uppercase tracking-wider">Sign In</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">Enter your account credentials to continue</p>
            </div>
            <span className="text-[10px] font-headline font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container-high px-3 py-1.5 rounded-lg border border-outline-variant/15">
              Role-Based Security
            </span>
          </div>

          {/* Preset Role Quick-Select buttons */}
          <div className="mb-6">
            <label className="text-[10px] font-headline font-bold text-on-surface-variant uppercase tracking-widest block mb-3">
              Select Account Role
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => selectPreset('admin')}
                className={`text-left p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                  email === 'vortexailabs@gmail.com'
                    ? 'bg-primary/10 border-primary/60 shadow-lg shadow-primary/10'
                    : 'bg-surface-container-low border-outline-variant/15 hover:border-outline-variant/40 hover:bg-surface-container'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-headline font-bold text-on-surface flex items-center gap-1.5">
                    <Crown size={14} className="text-primary" />
                    Admin Account
                  </span>
                  <span className="text-[9px] font-headline font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-primary/20 text-primary border border-primary/25 whitespace-nowrap">
                    All Pages
                  </span>
                </div>
                <div className="text-[11px] text-on-surface font-mono truncate">vortexailabs@gmail.com</div>
                <div className="text-[11px] text-on-surface-variant/75 mt-1">Full administrative control &amp; settings</div>
              </button>

              <button
                type="button"
                onClick={() => selectPreset('user')}
                className={`text-left p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                  email === 'team@theearacademy.com'
                    ? 'bg-secondary-fixed/10 border-secondary-fixed/50 shadow-lg shadow-secondary-fixed/5'
                    : 'bg-surface-container-low border-outline-variant/15 hover:border-outline-variant/40 hover:bg-surface-container'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-headline font-bold text-on-surface flex items-center gap-1.5">
                    <UserIcon size={14} className="text-secondary-fixed" />
                    Normal User
                  </span>
                  <span className="text-[9px] font-headline font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-secondary-fixed/15 text-secondary-fixed border border-secondary-fixed/25 whitespace-nowrap">
                    Settings Hidden
                  </span>
                </div>
                <div className="text-[11px] text-on-surface font-mono truncate">team@theearacademy.com</div>
                <div className="text-[11px] text-on-surface-variant/75 mt-1">Overview, Sentiment &amp; Logs only</div>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleCredentialsSubmit} className="space-y-4">
            <div>
              <label className="text-[11px] font-headline font-bold uppercase tracking-wider text-on-surface-variant block mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/60" size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your-email@example.com"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-low border border-outline-variant/20 focus:border-primary/70 rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-headline font-bold uppercase tracking-wider text-on-surface-variant">
                  Password
                </label>
                <span className="text-[10px] text-on-surface-variant/60">
                  Pre-configured for demonstration
                </span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/60" size={16} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-10 pr-10 py-3 bg-surface-container-low border border-outline-variant/20 focus:border-primary/70 rounded-xl text-sm text-on-surface placeholder-on-surface-variant/40 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-on-surface-variant pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-outline-variant/40 text-primary focus:ring-primary accent-primary"
                />
                <span>Keep me signed in on this device</span>
              </label>
            </div>

            {error && (
              <div className="p-3 bg-tertiary-container/10 border border-tertiary-container/30 rounded-xl flex items-start gap-2 text-xs text-tertiary-container">
                <AlertCircle size={16} className="text-tertiary-container shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-br from-primary to-primary-container text-on-primary font-headline font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-primary/20 hover:opacity-95 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </form>
        </motion.div>

        {/* Footer notice */}
        <div className="mt-6 text-center text-xs text-on-surface-variant/60 max-w-md">
          <p>
            The Ear Academy Operational Portal &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
};
export default LoginPortal;
