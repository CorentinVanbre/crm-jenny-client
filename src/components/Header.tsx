import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useState, useEffect, useRef } from 'react';

export default function Header() {
  const [user, setUser] = useState(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileMenuRef = useRef(null);
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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const toggleProfileMenu = () => {
    setShowProfileMenu(!showProfileMenu);
  };

  return (
    <header style={headerStyle}>
      {/* Logo JENNY centré verticalement */}
      <Link to="/" style={logoStyle}>JENNY</Link>

      {/* Navigation positionnée aux 3/4 de la hauteur (67.5px du haut) */}
      <nav style={navStyle}>
        {user && (
          <>
            <Link
              to="/sites"
              style={linkStyle}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              Sites
            </Link>
            <Link
              to="/contacts"
              style={linkStyle}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              Contacts
            </Link>
            <Link
              to="/emails"
              style={linkStyle}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              Emails
            </Link>
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
          </>
        )}
        {!user && (
          <Link
            to="/login"
            style={{...linkStyle, fontWeight: 'bold'}}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            Connexion
          </Link>
        )}
      </nav>
    </header>
  );
}

// Styles modifiés
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