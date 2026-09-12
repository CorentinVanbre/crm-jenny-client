import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import PrivateRoute from './components/PrivateRoute';
import Home from './pages/Home';
import Sites from './pages/Sites';
import SiteDetail from './pages/SiteDetail';
import Contacts from './pages/Contacts';
import Emails from './pages/Emails';
import Profile from './pages/Profile';
import Login from './pages/Login';
import { GoogleMapsWrapper } from './components/GoogleMapsWrapper';
import { UserZonesProvider } from './lib/userZones';
import AdminRoute from './components/AdminRoute';
import AdminZones from './pages/AdminZones';
import LanguageSync from './components/LanguageSync';

export default function App() {
  return (
    <LanguageSync>
      <UserZonesProvider>
        <Router>
          <GoogleMapsWrapper>
            <div style={appContainerStyle}>
              <Header />
              <main style={mainStyle}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/sites" element={<PrivateRoute><Sites /></PrivateRoute>} />
                  <Route path="/sites/:id" element={<PrivateRoute><SiteDetail /></PrivateRoute>} />
                  <Route path="/contacts" element={<PrivateRoute><Contacts /></PrivateRoute>} />
                  <Route path="/emails" element={<PrivateRoute><Emails /></PrivateRoute>} />
                  <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
                  <Route path="/admin/zones" element={<AdminRoute><AdminZones /></AdminRoute>} />
                </Routes>
              </main>
              <Footer />
            </div>
          </GoogleMapsWrapper>
        </Router>
      </UserZonesProvider>
    </LanguageSync>
  );
}

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