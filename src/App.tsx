import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import PrivateRoute from './components/PrivateRoute';
import RequireAuth from './components/RequireAuth';
import Home from './pages/Home';
import Sites from './pages/Sites';
import SiteDetail from './pages/SiteDetail';
import Contacts from './pages/Contacts';
import Emails from './pages/Emails';
import Profile from './pages/Profile';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
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
                  <Route path="/login" element={<Login />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/" element={<Home />} />
                  <Route path="/login" element={<Login />} />
                  <Route
                    path="/sites"
                    element={
                      <RequireAuth>
                        <PrivateRoute>
                          <Sites />
                        </PrivateRoute>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/sites/:id"
                    element={
                      <RequireAuth>
                        <PrivateRoute>
                          <SiteDetail />
                        </PrivateRoute>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/contacts"
                    element={
                      <RequireAuth>
                        <PrivateRoute>
                          <Contacts />
                        </PrivateRoute>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/emails"
                    element={
                      <RequireAuth>
                        <PrivateRoute>
                          <Emails />
                        </PrivateRoute>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/profile"
                    element={
                      <RequireAuth>
                        <PrivateRoute>
                          <Profile />
                        </PrivateRoute>
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="/admin/zones"
                    element={
                      <RequireAuth>
                        <AdminRoute>
                          <AdminZones />
                        </AdminRoute>
                      </RequireAuth>
                    }
                  />
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