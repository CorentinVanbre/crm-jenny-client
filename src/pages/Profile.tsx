import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { User } from '@supabase/supabase-js';

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Email
  const [emailForm, setEmailForm] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ text: string; isSuccess: boolean } | null>(null);

  // Mot de passe
  const [passwordForm, setPasswordForm] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; isSuccess: boolean } | null>(null);

  // Langue
  const [langue, setLangue] = useState<string>('fr');
  const [langueMsg, setLangueMsg] = useState<{ text: string; isSuccess: boolean } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
  }, []);

  // Pré-remplir quand l'utilisateur est chargé
  useEffect(() => {
    if (user) {
      setEmailForm(user.email ?? '');
      setLangue((user.user_metadata?.langue as string) || 'fr');
    }
  }, [user]);

  // Mettre à jour l'email
  const handleUpdateEmail = async () => {
    setEmailMsg(null);
    if (!emailForm.trim()) {
      setEmailMsg({ text: 'Veuillez saisir un email.', isSuccess: false });
      return;
    }
    if (emailForm.trim() === user?.email) {
      setEmailMsg({ text: "C'est déjà votre email actuel.", isSuccess: false });
      return;
    }

    const { error } = await supabase.auth.updateUser({ email: emailForm.trim() });
    if (error) {
      setEmailMsg({ text: `Erreur: ${error.message}`, isSuccess: false });
    } else {
      setEmailMsg({
        text: 'Email mis à jour. Un email de confirmation a été envoyé pour valider le changement.',
        isSuccess: true,
      });
    }
  };

  // Mettre à jour le mot de passe
  const handleUpdatePassword = async () => {
    setPasswordMsg(null);
    if (passwordForm.length < 6) {
      setPasswordMsg({ text: 'Le mot de passe doit contenir au moins 6 caractères.', isSuccess: false });
      return;
    }
    if (passwordForm !== passwordConfirm) {
      setPasswordMsg({ text: 'Les mots de passe ne correspondent pas.', isSuccess: false });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: passwordForm });
    if (error) {
      setPasswordMsg({ text: `Erreur: ${error.message}`, isSuccess: false });
    } else {
      setPasswordMsg({ text: 'Mot de passe mis à jour avec succès.', isSuccess: true });
      setPasswordForm('');
      setPasswordConfirm('');
    }
  };

  // Enregistrer la langue préférée
  const handleSaveLangue = async () => {
    setLangueMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { langue } });
    if (error) {
      setLangueMsg({ text: `Erreur: ${error.message}`, isSuccess: false });
    } else {
      setLangueMsg({ text: 'Langue enregistrée.', isSuccess: true });
    }
  };

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Chargement...</div>;
  if (!user) return <div style={{ padding: '20px', textAlign: 'center' }}>Non connecté</div>;

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Mon Compte</h1>

      {/* Informations personnelles */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Informations personnelles</h2>
        <p style={textStyle}><strong>Email :</strong> {user.email}</p>
        <p style={textStyle}><strong>ID :</strong> {user.id}</p>
        <p style={textStyle}><small>Créé le : {new Date(user.created_at).toLocaleDateString()}</small></p>
      </div>

      {/* Modification email */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Modifier mon email</h2>
        {emailMsg && <div style={messageStyle(emailMsg.isSuccess)}>{emailMsg.text}</div>}
        <div style={formFieldStyle}>
          <label style={labelStyle}>Nouvel email</label>
          <input
            type="email"
            value={emailForm}
            onChange={e => setEmailForm(e.target.value)}
            style={inputStyle}
            placeholder="nouvel@email.com"
          />
        </div>
        <button onClick={handleUpdateEmail} style={buttonStyle}>
          Mettre à jour l'email
        </button>
      </div>

      {/* Modification mot de passe */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Modifier mon mot de passe</h2>
        {passwordMsg && <div style={messageStyle(passwordMsg.isSuccess)}>{passwordMsg.text}</div>}
        <div style={formFieldStyle}>
          <label style={labelStyle}>Nouveau mot de passe</label>
          <input
            type="password"
            value={passwordForm}
            onChange={e => setPasswordForm(e.target.value)}
            style={inputStyle}
            placeholder="Au moins 6 caractères"
          />
        </div>
        <div style={formFieldStyle}>
          <label style={labelStyle}>Confirmer le mot de passe</label>
          <input
            type="password"
            value={passwordConfirm}
            onChange={e => setPasswordConfirm(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button onClick={handleUpdatePassword} style={buttonStyle}>
          Mettre à jour le mot de passe
        </button>
      </div>

      {/* Langue préférée */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Langue préférée</h2>
        {langueMsg && <div style={messageStyle(langueMsg.isSuccess)}>{langueMsg.text}</div>}
        <div style={formFieldStyle}>
          <label style={labelStyle}>Langue</label>
          <select
            value={langue}
            onChange={e => setLangue(e.target.value)}
            style={inputStyle}
          >
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </div>
        <button onClick={handleSaveLangue} style={buttonStyle}>
          Enregistrer la langue
        </button>
      </div>
    </div>
  );
}

// Styles
const containerStyle: React.CSSProperties = {
  padding: '20px',
  maxWidth: '600px',
  margin: '0 auto',
  fontFamily: 'Barlow, sans-serif',
};

const titleStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: '24px',
  marginBottom: '20px',
  textAlign: 'center',
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#fff',
  border: '1px solid #ddd',
  borderRadius: '8px',
  padding: '20px',
  marginBottom: '20px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: '18px',
  marginBottom: '15px',
};

const textStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 200,
  margin: '5px 0',
};

const formFieldStyle: React.CSSProperties = {
  marginBottom: '15px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '14px',
  marginBottom: '5px',
};

const inputStyle: React.CSSProperties = {
  padding: '10px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '14px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  width: '100%',
  boxSizing: 'border-box',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 20px',
  border: '1px solid black',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '14px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  backgroundColor: '#E5E5E4',
  color: 'black',
};

const messageStyle = (isSuccess: boolean): React.CSSProperties => ({
  padding: '10px',
  marginBottom: '15px',
  borderRadius: '4px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  fontSize: '14px',
  backgroundColor: isSuccess ? '#d4edda' : '#f8d7da',
  color: isSuccess ? '#155724' : '#721c24',
  border: `1px solid ${isSuccess ? '#c3e6cb' : '#f5c6cb'}`,
  textAlign: 'center',
});