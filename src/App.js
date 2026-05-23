import './App.css';
import './index.css'
import { Navigate } from 'react-router-dom'
import LandingPageSimple from './pages/LandingPageSimple';

// When the site is launched from a home-screen icon (iOS/Android PWA),
// skip the marketing landing page and go straight to the right entry point:
//   1. team-member session → /team-member/field-app
//   2. owner/admin session → /dashboard (ProtectedRoute redirects to /signin if expired)
//   3. nothing signed in → /signin
//
// In a regular browser tab, we still render the landing page.
function isStandalonePWA() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari "Add to Home Screen"
  if (window.navigator.standalone === true) return true
  return false
}

function pwaEntryRoute() {
  try {
    if (localStorage.getItem('teamMemberToken')) return '/team-member/field-app'
    if (localStorage.getItem('authToken')) return '/dashboard'
  } catch (_) {}
  return '/signin'
}

function App() {
  if (isStandalonePWA()) {
    return <Navigate to={pwaEntryRoute()} replace />
  }
  return <LandingPageSimple />;
}

export default App;
