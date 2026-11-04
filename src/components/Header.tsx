import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { useState, useEffect, useRef } from 'react';

const MOBILE_BREAKPOINT = 900;

export default function Header() {
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  const mobileMenuRef = useRef(null);
  const hamburgerMenuRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const isPathActive = (path: string) => location.pathname === path;
  const activeFontWeight = (path: string) => isPathActive(path) ? 'bold' : 'normal';
  const activeMobileFontWeight = (path: string) => isPathActive(path) ? 'bold' : 200;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) { setShowMobileMenu(false); }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) setShowMobileMenu(false);
      if (hamburgerMenuRef.current && !hamburgerMenuRef.current.contains(event.target)) setShowHamburgerMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShowMobileMenu(false);
    setShowHamburgerMenu(false);
    navigate('/');
  };

  const handleHamburgerLogout = async () => {
    if (!window.confirm(t('header.confirmLogout'))) return;
    await handleLogout();
  };

  const closeMobileMenu = () => { setShowMobileMenu(false); setShowHamburgerMenu(false); };

  const navLinks = (
    <>
      {user && (
        <>
          <Link to="/sites" style={isMobile ? { ...mobileLinkStyle, fontWeight: activeMobileFontWeight('/sites') } : { ...linkStyle, fontWeight: activeFontWeight('/sites') }}
            onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
            onClick={closeMobileMenu}>
            {t('header.sites')}
          </Link>
          <Link to="/visite" style={isMobile ? { ...mobileLinkStyle, fontWeight: activeMobileFontWeight('/visite') } : { ...linkStyle, fontWeight: activeFontWeight('/visite') }}
            onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
            onClick={closeMobileMenu}>
            {t('header.visite')}
          </Link>
          <Link to="/contacts" style={isMobile ? { ...mobileLinkStyle, fontWeight: activeMobileFontWeight('/contacts') } : { ...linkStyle, fontWeight: activeFontWeight('/contacts') }}
            onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
            onClick={closeMobileMenu}>
            {t('header.contacts')}
          </Link>
          <Link to="/prospection" style={isMobile ? { ...mobileLinkStyle, fontWeight: activeMobileFontWeight('/prospection') } : { ...linkStyle, fontWeight: activeFontWeight('/prospection') }}
            onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
            onClick={closeMobileMenu}>
            {t('header.prospection')}
          </Link>
        </>
      )}
      {!user && (
        <Link to="/login" style={isMobile ? { ...mobileLinkStyle, fontWeight: activeMobileFontWeight('/login') } : { ...linkStyle, fontWeight: activeFontWeight('/login') }}
          onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
          onClick={closeMobileMenu}>
          {t('header.login')}
        </Link>
      )}
    </>
  );

  // Pages regroupées dans le menu hamburger
  const hamburgerLinks = (
    <>
      {user?.user_metadata?.role === 'admin' && (
        <Link to="/admin/zones" style={isMobile ? { ...mobileLinkStyle, fontWeight: activeMobileFontWeight('/admin/zones') } : { ...dropdownLinkStyle, fontWeight: activeFontWeight('/admin/zones') } as React.CSSProperties}
          onClick={closeMobileMenu}>
          {t('header.zones')}
        </Link>
      )}
      {user && (
        <Link to="/emails" style={isMobile ? { ...mobileLinkStyle, fontWeight: activeMobileFontWeight('/emails') } : { ...dropdownLinkStyle, fontWeight: activeFontWeight('/emails') } as React.CSSProperties}
          onClick={closeMobileMenu}>
          {t('header.emails')}
        </Link>
      )}
      {user && (
        <Link to="/help" style={isMobile ? { ...mobileLinkStyle, fontWeight: activeMobileFontWeight('/help') } : { ...dropdownLinkStyle, fontWeight: activeFontWeight('/help') } as React.CSSProperties}
          onClick={closeMobileMenu}>
          {t('header.help')}
        </Link>
      )}
      {user && (
        <Link to="/profile" style={isMobile ? { ...mobileLinkStyle, fontWeight: activeMobileFontWeight('/profile') } : { ...dropdownLinkStyle, fontWeight: activeFontWeight('/profile') } as React.CSSProperties}
          onClick={closeMobileMenu}>
          {t('header.account')}
        </Link>
      )}
      {user && (
        <button
          type="button"
          onClick={handleHamburgerLogout}
          style={(isMobile ? mobileLogoutStyle : dropdownLogoutStyle) as React.CSSProperties}
        >
          {t('header.logout')}
        </button>
      )}
    </>
  );

  return (
    <header style={headerStyle}>
      <Link to="/" style={isMobile ? { ...logoStyle, left: '20px' } : logoStyle}>JENNY</Link>
      {isMobile ? (
        <div ref={mobileMenuRef} style={mobileNavStyle}>
          <button onClick={() => setShowMobileMenu(!showMobileMenu)} style={hamburgerStyle} aria-label="Menu">
            {t('header.menu')}
          </button>
          {showMobileMenu && (
            <div style={mobileDropdownStyle}>
              {navLinks}
              {hamburgerLinks}
            </div>
          )}
        </div>
      ) : (
        <nav style={navStyle}>
          {navLinks}
          <div ref={hamburgerMenuRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowHamburgerMenu(!showHamburgerMenu)} style={accountButtonStyle} aria-label={t('header.menu')}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
              {t('header.menu')}
            </button>
            {showHamburgerMenu && (
              <div style={dropdownStyle}>
                {hamburgerLinks}
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

// Styles (inchangés)
const headerStyle: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 1100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-header)', color: 'var(--text-primary)', width: '100%', height: '90px', padding: '0 30px', boxSizing: 'border-box', borderBottom: '1px solid #000' } as React.CSSProperties;
const logoStyle = { position: 'absolute', top: '50%', left: '80px', transform: 'translateY(-50%)', fontSize: '30px', fontWeight: 'bold', fontStyle: 'italic', color: 'var(--text-primary)', textDecoration: 'none', cursor: 'pointer' };
const navStyle = { position: 'absolute', bottom: '22.5px', right: '100px', display: 'flex', alignItems: 'center', gap: '20px' };
const linkStyle = { color: 'var(--text-primary)', textDecoration: 'none', fontSize: '20px', transition: 'transform 0.2s ease, color 0.3s', fontWeight: 'normal', transform: 'scale(1)', display: 'inline-block' };
const accountButtonStyle = { background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '20px', padding: '5px 0', transition: 'transform 0.2s ease', transform: 'scale(1)', display: 'inline-block', fontWeight: 'normal' };
const dropdownStyle = { position: 'absolute', right: 0, top: '100%', backgroundColor: 'var(--bg-header)', border: '1px solid #000', borderRadius: '4px', padding: '5px 0', minWidth: '200px', zIndex: 1000, boxShadow: '0 2px 5px rgba(0,0,0,0.2)' };
const dropdownLinkStyle = { display: 'block', color: 'var(--text-primary)', textDecoration: 'none', padding: '0 15px', textAlign: 'left', width: '100%', height: '20px', lineHeight: '20px' };
const dropdownLogoutStyle = { display: 'block', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '0 15px', textAlign: 'left', width: '100%', height: '20px', lineHeight: '20px' };
const mobileNavStyle = { position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)' };
const hamburgerStyle = { background: 'none', border: '1px solid #000', borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '18px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, padding: '8px 14px' };
const mobileDropdownStyle: React.CSSProperties = { position: 'absolute', right: 0, top: '100%', marginTop: '8px', backgroundColor: 'var(--bg-header)', border: '1px solid #000', borderRadius: '4px', padding: '8px 0', minWidth: '220px', zIndex: 1200, boxShadow: '0 2px 5px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' as const };
const mobileLinkStyle: React.CSSProperties = { color: 'var(--text-primary)', textDecoration: 'none', fontSize: '18px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, padding: '10px 20px', width: '100%', boxSizing: 'border-box', display: 'block' };
const mobileLogoutStyle: React.CSSProperties = { display: 'block', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '18px', fontFamily: 'Barlow, sans-serif', fontWeight: 200, padding: '10px 20px', textAlign: 'left', width: '100%', boxSizing: 'border-box' };