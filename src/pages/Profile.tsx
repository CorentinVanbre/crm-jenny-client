import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import type { User } from '@supabase/supabase-js';
import ZonesMap from '../components/ZonesMap';
import i18n from '../i18n';

export default function Profile() {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userZones, setUserZones] = useState<string[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);

  const [emailForm, setEmailForm] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ text: string; isSuccess: boolean } | null>(null);
  const [passwordForm, setPasswordForm] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ text: string; isSuccess: boolean } | null>(null);
  const [langue, setLangue] = useState<string>('fr');
  const [langueMsg, setLangueMsg] = useState<{ text: string; isSuccess: boolean } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (user) {
      setEmailForm(user.email ?? '');
      setLangue((user.user_metadata?.langue as string) || 'fr');
      const admin = (user.user_metadata as Record<string, unknown>)?.role === 'admin';
      setIsAdmin(admin);
      if (!admin) {
        (async () => {
          const { data, error } = await supabase.from('user_zones').select('pays').eq('user_id', user.id).order('pays', { ascending: true });
          if (!error) setUserZones((data || []).map(r => r.pays));
          setLoadingZones(false);
        })();
      } else {
        setLoadingZones(false);
      }
    }
  }, [user]);

  const handleUpdateEmail = async () => {
    setEmailMsg(null);
    if (!emailForm.trim()) { setEmailMsg({ text: t('profile.enterEmail'), isSuccess: false }); return; }
    if (emailForm.trim() === user?.email) { setEmailMsg({ text: t('profile.sameEmail'), isSuccess: false }); return; }
    const { error } = await supabase.auth.updateUser({ email: emailForm.trim() });
    if (error) { setEmailMsg({ text: `${t('common.error')}: ${error.message}`, isSuccess: false }); }
    else { setEmailMsg({ text: t('profile.emailUpdated'), isSuccess: true }); }
  };

  const handleUpdatePassword = async () => {
    setPasswordMsg(null);
    if (passwordForm.length < 6) { setPasswordMsg({ text: t('profile.passwordTooShort'), isSuccess: false }); return; }
    if (passwordForm !== passwordConfirm) { setPasswordMsg({ text: t('profile.passwordMismatch'), isSuccess: false }); return; }
    const { error } = await supabase.auth.updateUser({ password: passwordForm });
    if (error) { setPasswordMsg({ text: `${t('common.error')}: ${error.message}`, isSuccess: false }); }
    else { setPasswordMsg({ text: t('profile.passwordUpdated'), isSuccess: true }); setPasswordForm(''); setPasswordConfirm(''); }
  };

  const handleSaveLangue = async () => {
    setLangueMsg(null);
    const { error } = await supabase.auth.updateUser({ data: { langue } });
    if (error) { setLangueMsg({ text: `${t('common.error')}: ${error.message}`, isSuccess: false }); }
    else {
      setLangueMsg({ text: t('profile.languageSaved'), isSuccess: true });
      i18n.changeLanguage(langue);
      localStorage.setItem('lang', langue);
    }
  };

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>{t('common.loading')}</div>;
  if (!user) return <div style={{ padding: '20px', textAlign: 'center' }}>{t('common.notConnected')}</div>;

  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>{t('profile.title')}</h1>

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>{t('profile.personalInfo')}</h2>
        <p style={textStyle}><strong>{t('profile.emailLabel')} :</strong> {user.email}</p>
        <p style={textStyle}><strong>{t('profile.idLabel')} :</strong> {user.id}</p>
        <p style={textStyle}><small>{t('profile.createdOn')} : {new Date(user.created_at).toLocaleDateString()}</small></p>
      </div>

      {!isAdmin && (
        <div style={cardStyle}>
          <h2 style={sectionTitleStyle}>{t('profile.assignedCountries')}</h2>
          {loadingZones ? (
            <p style={textStyle}>{t('profile.loadingZones')}</p>
          ) : userZones.length === 0 ? (
            <p style={textStyle}>{t('profile.noCountries')}</p>
          ) : (
            <>
              <div style={zonesListStyle}>
                {userZones.map(pays => <span key={pays} style={zoneChipStyle}>{pays}</span>)}
              </div>
              <div style={{ marginTop: '15px' }}><ZonesMap allowedCountries={userZones} /></div>
            </>
          )}
        </div>
      )}

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>{t('profile.editEmail')}</h2>
        {emailMsg && <div style={messageStyle(emailMsg.isSuccess)}>{emailMsg.text}</div>}
        <div style={formFieldStyle}>
          <label style={labelStyle}>{t('profile.newEmail')}</label>
          <input type="email" value={emailForm} onChange={e => setEmailForm(e.target.value)} style={inputStyle} placeholder={t('profile.newEmailPlaceholder')} />
        </div>
        <button onClick={handleUpdateEmail} style={buttonStyle}>{t('profile.updateEmail')}</button>
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>{t('profile.editPassword')}</h2>
        {passwordMsg && <div style={messageStyle(passwordMsg.isSuccess)}>{passwordMsg.text}</div>}
        <div style={formFieldStyle}>
          <label style={labelStyle}>{t('profile.newPassword')}</label>
          <input type="password" value={passwordForm} onChange={e => setPasswordForm(e.target.value)} style={inputStyle} placeholder={t('profile.passwordPlaceholder')} />
        </div>
        <div style={formFieldStyle}>
          <label style={labelStyle}>{t('profile.confirmPassword')}</label>
          <input type="password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={handleUpdatePassword} style={buttonStyle}>{t('profile.updatePassword')}</button>
      </div>

      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>{t('profile.preferredLanguage')}</h2>
        {langueMsg && <div style={messageStyle(langueMsg.isSuccess)}>{langueMsg.text}</div>}
        <div style={formFieldStyle}>
          <label style={labelStyle}>{t('profile.language')}</label>
          <select value={langue} onChange={e => setLangue(e.target.value)} style={inputStyle}>
            <option value="fr">{t('profile.french')}</option>
            <option value="en">{t('profile.english')}</option>
          </select>
        </div>
        <button onClick={handleSaveLangue} style={buttonStyle}>{t('profile.saveLanguage')}</button>
      </div>
    </div>
  );
}

// Styles (inchangés)
const containerStyle: React.CSSProperties = { padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'Barlow, sans-serif' };
const titleStyle: React.CSSProperties = { fontWeight: 'bold', fontSize: '24px', marginBottom: '20px', textAlign: 'center' };
const cardStyle: React.CSSProperties = { backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' };
const sectionTitleStyle: React.CSSProperties = { fontWeight: 'bold', fontSize: '18px', marginBottom: '15px' };
const textStyle: React.CSSProperties = { fontSize: '14px', fontWeight: 200, margin: '5px 0' };
const zonesListStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '8px' };
const zoneChipStyle: React.CSSProperties = { display: 'inline-block', padding: '6px 12px', borderRadius: '4px', border: '1px solid #ddd', backgroundColor: '#f0f0f0', fontFamily: 'Barlow, sans-serif', fontSize: '14px', fontWeight: 200 };
const formFieldStyle: React.CSSProperties = { marginBottom: '15px' };
const labelStyle: React.CSSProperties = { display: 'block', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', marginBottom: '5px' };
const inputStyle: React.CSSProperties = { padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, width: '100%', boxSizing: 'border-box' };
const buttonStyle: React.CSSProperties = { padding: '10px 20px', border: '1px solid black', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, backgroundColor: '#E5E5E4', color: 'black' };
const messageStyle = (isSuccess: boolean): React.CSSProperties => ({ padding: '10px', marginBottom: '15px', borderRadius: '4px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, fontSize: '14px', backgroundColor: isSuccess ? '#d4edda' : '#f8d7da', color: isSuccess ? '#155724' : '#721c24', border: `1px solid ${isSuccess ? '#c3e6cb' : '#f5c6cb'}`, textAlign: 'center' });