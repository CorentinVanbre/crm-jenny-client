import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useState, useEffect, useRef } from 'react';

const MOBILE_BREAKPOINT = 900;

export default function Header() {
  const [user, setUser] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  );
  const profileMenuRef = useRef(null);
  const mobileMenuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Suivi de la largeur de fenêtre
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) {
        setShowMobileMenu(false);
        setShowProfileMenu(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fermer les menus si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setShowMobileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setShowMobileMenu(false);
    setShowProfileMenu(false);
    navigate('/');
  };

  const toggleProfileMenu = () => {
    setShowProfileMenu(!showProfileMenu);
  };

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
    setShowProfileMenu(false);
  };

  const closeMobileMenu = () => {
    setShowMobileMenu(false);
    setShowProfileMenu(false);
  };

  // Liens communs (réutilisables en desktop et mobile)
  const navLinks = (
    <>
      {user?.user_metadata?.role === 'admin' && (
        <Link
          to="/admin/zones"
          style={isMobile ? mobileLinkStyle : linkStyle}
          onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
          onClick={closeMobileMenu}
        >
          Gestion des zones
        </Link>
      )}
      {user && (
        <>
          <Link
            to="/sites"
            style={isMobile ? mobileLinkStyle : linkStyle}
            onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
            onClick={closeMobileMenu}
          >
            Sites
          </Link>
          <Link
            to="/contacts"
            style={isMobile ? mobileLinkStyle : linkStyle}
            onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
            onClick={closeMobileMenu}
          >
            Contacts
          </Link>
          <Link
            to="/emails"
            style={isMobile ? mobileLinkStyle : linkStyle}
            onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
            onClick={closeMobileMenu}
          >
            Emails
          </Link>
        </>
      )}
      {!user && (
        <Link
          to="/login"
          style={isMobile ? { ...mobileLinkStyle, fontWeight: 'bold' } : { ...linkStyle, fontWeight: 'bold' }}
          onMouseEnter={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1.05)'; }}
          onMouseLeave={(e) => { if (!isMobile) e.currentTarget.style.transform = 'scale(1)'; }}
          onClick={closeMobileMenu}
        >
          Connexion
        </Link>
      )}
    </>
  );

  return (
    <header style={headerStyle}>
      {/* Logo JENNY centré verticalement */}
      <Link to="/" style={isMobile ? { ...logoStyle, left: '20px' } : logoStyle}>JENNY</Link>

      {isMobile ? (
        /* ===== MENU MOBILE ===== */
        <div ref={mobileMenuRef} style={mobileNavStyle}>
          <button
            onClick={toggleMobileMenu}
            style={hamburgerStyle}
            aria-label="Menu"
          >
            ☰ Menu
          </button>
          {showMobileMenu && (
            <div style={mobileDropdownStyle}>
              {navLinks}
              {user && (
                <div ref={profileMenuRef} style={{ borderTop: '1px solid #000', marginTop: '5px', paddingTop: '5px' }}>
                  <Link
                    to="/profile"
                    style={mobileLinkStyle}
                    onClick={closeMobileMenu}
                  >
                    Modifier mon profil
                  </Link>
                  <button onClick={handleLogout} style={mobileLogoutStyle}>
                    Se déconnecter
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ===== NAVIGATION DESKTOP ===== */
        <nav style={navStyle}>
          {navLinks}
          {user && (
            <div ref={profileMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={toggleProfileMenu}
                style={accountButtonStyle}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Mon compte
              </button>
              {showProfileMenu && (
                <div style={dropdownStyle}>
                  <Link to="/profile" style={dropdownLinkStyle} onClick={() => setShowProfileMenu(false)}>
                    Modifier mon profil
                  </Link>
                  <button onClick={handleLogout} style={dropdownLogoutStyle}>
                    Se déconnecter
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      )}
    </header>
  );
}

// ===== Styles existants (desktop) =====
const headerStyle = {
  position: 'relative',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: '#A6A6A6',
  color: '#000',
  width: '100%',
  height: '90px',
  padding: '0 30px',
  boxSizing: 'border-box',
  borderBottom: '1px solid #000',
};

const logoStyle = {
  position: 'absolute',
  top: '50%',
  left: '80px',
  transform: 'translateY(-50%)',
  fontSize: '30px',
  fontWeight: 'bold',
  fontStyle: 'italic',
  color: '#000',
  textDecoration: 'none',
  cursor: 'pointer',
};

const navStyle = {
  position: 'absolute',
  bottom: '22.5px',
  right: '100px',
  display: 'flex',
  alignItems: 'center',
  gap: '20px',
};

const linkStyle = {
  color: '#000',
  textDecoration: 'none',
  fontSize: '20px',
  transition: 'transform 0.2s ease, color 0.3s',
  fontWeight: 'normal',
  transform: 'scale(1)',
  display: 'inline-block'
};

const accountButtonStyle = {
  background: 'none',
  border: 'none',
  color: '#000',
  cursor: 'pointer',
  fontSize: '20px',
  padding: '5px 0',
  transition: 'transform 0.2s ease',
  transform: 'scale(1)',
  display: 'inline-block',
  fontWeight: 'normal'
};

const dropdownStyle = {
  position: 'absolute',
  right: 0,
  top: '100%',
  backgroundColor: '#A6A6A6',
  border: '1px solid #000',
  borderRadius: '4px',
  padding: '5px 0',
  minWidth: '200px',
  zIndex: 1000,
  boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
};

const dropdownLinkStyle = {
  display: 'block',
  color: '#000',
  textDecoration: 'none',
  padding: '0 15px',
  textAlign: 'left',
  width: '100%',
  height: '20px',
  lineHeight: '20px',
};

const dropdownLogoutStyle = {
  display: 'block',
  background: 'none',
  border: 'none',
  color: '#000',
  cursor: 'pointer',
  padding: '0 15px',
  textAlign: 'left',
  width: '100%',
  height: '20px',
  lineHeight: '20px',
};

// ===== Styles mobile =====
const mobileNavStyle = {
  position: 'absolute',
  right: '20px',
  top: '50%',
  transform: 'translateY(-50%)',
};

const hamburgerStyle = {
  background: 'none',
  border: '1px solid #000',
  borderRadius: '4px',
  color: '#000',
  cursor: 'pointer',
  fontSize: '18px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  padding: '8px 14px',
};

const mobileDropdownStyle = {
  position: 'absolute',
  right: 0,
  top: '100%',
  marginTop: '8px',
  backgroundColor: '#A6A6A6',
  border: '1px solid #000',
  borderRadius: '4px',
  padding: '8px 0',
  minWidth: '220px',
  zIndex: 1000,
  boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
  display: 'flex',
  flexDirection: 'column' as const,
};

const mobileLinkStyle: React.CSSProperties = {
  color: '#000',
  textDecoration: 'none',
  fontSize: '18px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  padding: '10px 20px',
  width: '100%',
  boxSizing: 'border-box',
  display: 'block',
};

const mobileLogoutStyle: React.CSSProperties = {
  display: 'block',
  background: 'none',
  border: 'none',
  color: '#000',
  cursor: 'pointer',
  fontSize: '18px',
  fontFamily: 'Barlow, sans-serif',
  fontWeight: 200,
  padding: '10px 20px',
  textAlign: 'left',
  width: '100%',
  boxSizing: 'border-box',
};