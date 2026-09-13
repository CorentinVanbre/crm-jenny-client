import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

type Lang = 'fr' | 'en';

const translations = {
  fr: {
    title: 'Connexion',
    email: 'Email',
    password: 'Mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    login: 'Se connecter',
    loggingIn: 'Connexion...',
    register: "S'inscrire",
    registering: 'Inscription...',
    forgotPassword: 'Mot de passe oublié ?',
    sendReset: 'Envoyer le lien de réinitialisation',
    sending: 'Envoi...',
    backToLogin: 'Retour à la connexion',
    noAccount: "Pas encore de compte ?",
    haveAccount: 'Déjà un compte ?',
    forgotLink: 'Mot de passe oublié ?',
    registerLink: "S'inscrire",
    loginLink: 'Se connecter',
    errors: {
      emailRequired: 'Email requis',
      invalidEmail: 'Email invalide',
      passwordRequired: 'Mot de passe requis',
      passwordTooShort: 'Minimum 10 caractères',
      passwordWeak: 'Le mot de passe doit contenir majuscules, minuscules, chiffres et caractères spéciaux',
      passwordMismatch: 'Les mots de passe ne correspondent pas',
      accountPending: 'Votre compte est en attente de validation par un administrateur.',
      generic: 'Une erreur est survenue',
    },
    success: {
      resetSent: 'Si le compte existe, un email de réinitialisation a été envoyé.',
      registered: 'Inscription envoyée. Un administrateur doit valider votre compte avant que vous puissiez vous connecter.',
    },
    passwordRules: 'Min. 10 caractères, avec majuscules, minuscules, chiffres et caractères spéciaux.',
  },
  en: {
    title: 'Sign in',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm password',
    login: 'Sign in',
    loggingIn: 'Signing in...',
    register: 'Register',
    registering: 'Registering...',
    forgotPassword: 'Forgot password?',
    sendReset: 'Send reset link',
    sending: 'Sending...',
    backToLogin: 'Back to sign in',
    noAccount: "Don't have an account?",
    haveAccount: 'Already have an account?',
    forgotLink: 'Forgot password?',
    registerLink: 'Register',
    loginLink: 'Sign in',
    errors: {
      emailRequired: 'Email is required',
      invalidEmail: 'Invalid email',
      passwordRequired: 'Password is required',
      passwordTooShort: 'Minimum 10 characters',
      passwordWeak: 'Password must contain uppercase, lowercase, numbers and special characters',
      passwordMismatch: 'Passwords do not match',
      accountPending: 'Your account is pending validation by an administrator.',
      generic: 'An error occurred',
    },
    success: {
      resetSent: 'If the account exists, a reset email has been sent.',
      registered: 'Registration submitted. An administrator must validate your account before you can sign in.',
    },
    passwordRules: 'Min. 10 characters, with uppercase, lowercase, numbers and special characters.',
  },
};

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type View = 'login' | 'register' | 'forgot';

export default function Login() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('loginLang') as Lang) || 'fr');
  const [view, setView] = useState<View>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const t = translations[lang];

  useEffect(() => {
    localStorage.setItem('loginLang', lang);
  }, [lang]);

  const switchLang = (l: Lang) => {
    setLang(l);
    setError('');
    setSuccess('');
  };

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 10) return t.errors.passwordTooShort;
    if (!PASSWORD_REGEX.test(pwd)) return t.errors.passwordWeak;
    return null;
  };

  // ---------- LOGIN ----------
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!EMAIL_REGEX.test(email)) {
      setError(t.errors.invalidEmail);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Vérifier que le compte a été validé par un admin
    const userId = data.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('approved')
        .eq('id', userId)
        .maybeSingle();

      if (!profile?.approved) {
        await supabase.auth.signOut();
        setError(t.errors.accountPending);
        setLoading(false);
        return;
      }
    }

    navigate('/sites');
  };

  // ---------- REGISTER ----------
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!EMAIL_REGEX.test(email)) {
      setError(t.errors.invalidEmail);
      setLoading(false);
      return;
    }
    const pwdError = validatePassword(password);
    if (pwdError) {
      setError(pwdError);
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.errors.passwordMismatch);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(t.success.registered);
    setLoading(false);
    // Rester sur la vue, l'utilisateur attend la validation
  };

  // ---------- FORGOT PASSWORD ----------
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (!EMAIL_REGEX.test(email)) {
      setError(t.errors.invalidEmail);
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Message générique volontairement (ne pas révéler si l'email existe)
    setSuccess(t.success.resetSent);
    setLoading(false);
  };

  return (
    <div style={{ padding: '40px', maxWidth: '420px', margin: '0 auto', position: 'relative' }}>
      {/* Sélecteur de langue */}
      <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '6px' }}>
        <button
          onClick={() => switchLang('fr')}
          style={lang === 'fr' ? langButtonActiveStyle : langButtonStyle}
        >
          FR
        </button>
        <button
          onClick={() => switchLang('en')}
          style={lang === 'en' ? langButtonActiveStyle : langButtonStyle}
        >
          EN
        </button>
      </div>

      <h1 style={{ marginBottom: '20px' }}>
        {view === 'login' && t.title}
        {view === 'register' && t.register}
        {view === 'forgot' && t.forgotPassword}
      </h1>

      {error && <p style={{ color: 'red', marginBottom: '15px' }}>{error}</p>}
      {success && <p style={{ color: 'green', marginBottom: '15px' }}>{success}</p>}

      {/* LOGIN */}
      {view === 'login' && (
        <form onSubmit={handleLogin} style={formStyle}>
          <input
            type="email"
            placeholder={t.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            type="password"
            placeholder={t.password}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
          />
          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? t.loggingIn : t.login}
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
            <button type="button" onClick={() => { setView('forgot'); setError(''); setSuccess(''); }} style={linkButtonStyle}>
              {t.forgotLink}
            </button>
            <button type="button" onClick={() => { setView('register'); setError(''); setSuccess(''); }} style={linkButtonStyle}>
              {t.registerLink}
            </button>
          </div>
        </form>
      )}

      {/* REGISTER */}
      {view === 'register' && (
        <form onSubmit={handleRegister} style={formStyle}>
          <input
            type="email"
            placeholder={t.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            type="password"
            placeholder={t.password}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            required
          />
          <input
            type="password"
            placeholder={t.confirmPassword}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
            required
          />
          <p style={passwordRulesStyle}>{t.passwordRules}</p>
          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? t.registering : t.register}
          </button>
          <button type="button" onClick={() => { setView('login'); setError(''); setSuccess(''); }} style={linkButtonStyle}>
            {t.backToLogin}
          </button>
        </form>
      )}

      {/* FORGOT PASSWORD */}
      {view === 'forgot' && (
        <form onSubmit={handleForgot} style={formStyle}>
          <input
            type="email"
            placeholder={t.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            required
          />
          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? t.sending : t.sendReset}
          </button>
          <button type="button" onClick={() => { setView('login'); setError(''); setSuccess(''); }} style={linkButtonStyle}>
            {t.backToLogin}
          </button>
        </form>
      )}
    </div>
  );
}

// Styles
const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '15px',
};

const inputStyle: React.CSSProperties = {
  padding: '10px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '16px',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 15px',
  backgroundColor: '#000',
  color: '#fff',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '16px',
};

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#000',
  cursor: 'pointer',
  fontSize: '14px',
  textDecoration: 'underline',
  padding: 0,
};

const langButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  backgroundColor: '#fff',
  cursor: 'pointer',
  fontSize: '13px',
};

const langButtonActiveStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #000',
  borderRadius: '4px',
  backgroundColor: '#000',
  color: '#fff',
  cursor: 'pointer',
  fontSize: '13px',
};

const passwordRulesStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666',
  margin: '-5px 0 0 0',
};