import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import PrivateRoute from './components/PrivateRoute';
import Home from './pages/Home';
import Sites from './pages/Sites';
import SiteDetail from './pages/SiteDetail'; // ✅ Ajout de l'import
import Contacts from './pages/Contacts';
import Emails from './pages/Emails';
import Profile from './pages/Profile';
import Login from './pages/Login';
import { GoogleMapsWrapper } from './components/GoogleMapsWrapper';

export default function App() {
  return (
    <Router>
      <GoogleMapsWrapper>
        <div style={appContainerStyle}>
          <Header />
          <main style={mainStyle}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/sites"
                element={
                  <PrivateRoute>
                    <Sites />
                  </PrivateRoute>
                }
              />
              {/* ✅ NOUVELLE ROUTE POUR LES DÉTAILS DES SITES */}
              <Route
                path="/sites/:id"
                element={
                  <PrivateRoute>
                    <SiteDetail />
                  </PrivateRoute>
                }
              />
              <Route
                path="/contacts"
                element={
                  <PrivateRoute>
                    <Contacts />
                  </PrivateRoute>
                }
              />
              <Route
                path="/emails"
                element={
                  <PrivateRoute>
                    <Emails />
                  </PrivateRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <PrivateRoute>
                    <Profile />
                  </PrivateRoute>
                }
              />
            </Routes>
          </main>
          <Footer />
        </div>
      </GoogleMapsWrapper>
    </Router>
  );
}

// Styles pour pleine largeur
const appContainerStyle = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  width: '100vw',
  margin: 0,
  padding: 0,
  backgroundColor: '#E5E5E4',
};

const mainStyle = {
  flex: 1,
  width: '100%',
  padding: '0',
};