import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

type Lang = 'fr' | 'en';

const translations = {
  fr: {
    title: 'Réinitialiser le mot de passe',
    password: 'Nouveau mot de passe',
    confirmPassword: 'Confirmer le mot de passe',
    submit: 'Réinitialiser',
    submitting: 'Réinitialisation...',
    success: 'Votre mot de passe a été réinitialisé. Vous pouvez vous connecter.',
    verifying: 'Vérification du lien...',
    errors: {
      passwordTooShort: 'Minimum 10 caractères',
      passwordWeak: 'Le mot de passe doit contenir majuscules, minuscules, chiffres et caractères spéciaux',
      passwordMismatch: 'Les mots de passe ne correspondent pas',
      invalidLink: 'Le lien de réinitialisation est invalide ou expiré.',
    },
    passwordRules: 'Min. 10 caractères, avec majuscules, minuscules, chiffres et caractères spéciaux.',
    backToLogin: 'Retour à la connexion',
  },
  en: {
    title: 'Reset password',
    password: 'New password',
    confirmPassword: 'Confirm password',
    submit: 'Reset',
    submitting: 'Resetting...',
    success: 'Your password has been reset. You can now sign in.',
    verifying: 'Verifying link...',
    errors: {
      passwordTooShort: 'Minimum 10 characters',
      passwordWeak: 'Password must contain uppercase, lowercase, numbers and special characters',
      passwordMismatch: 'Passwords do not match',
      invalidLink: 'The reset link is invalid or expired.',
    },
    passwordRules: 'Min. 10 characters, with uppercase, lowercase, numbers and special characters.',
    backToLogin: 'Back to sign in',
  },
};

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/;

export default function ResetPassword() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('loginLang') as Lang) || 'fr');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);

  const navigate = useNavigate();
  const t = translations[lang];

  // Vérifier que la session de récupération est valide (issue du lien email)
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError(t.errors.invalidLink);
      }
      setVerifying(false);
    };
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchLang = (l: Lang) => {
    setLang(l);
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (password.length < 10) {
      setError(t.errors.passwordTooShort);
      setLoading(false);
      return;
    }
    if (!PASSWORD_REGEX.test(password)) {
      setError(t.errors.passwordWeak);
      setLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.errors.passwordMismatch);
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Déconnexion de la session de récupération
    await supabase.auth.signOut();

    setSuccess(t.success);
    setLoading(false);
  };

  const showForm = !success && !verifying && error !== t.errors.invalidLink;

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

      <h1 style={{ marginBottom: '20px' }}>{t.title}</h1>

      {error && <p style={{ color: 'red', marginBottom: '15px' }}>{error}</p>}
      {success && (
        <>
          <p style={{ color: 'green', marginBottom: '15px' }}>{success}</p>
          <button onClick={() => navigate('/login')} style={buttonStyle}>
            {t.backToLogin}
          </button>
        </>
      )}

      {verifying && <p style={mutedStyle}>{t.verifying}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} style={formStyle}>
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
            {loading ? t.submitting : t.submit}
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

const mutedStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#666',
};