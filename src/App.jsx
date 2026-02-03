import { useState, useEffect, lazy, Suspense } from 'react';
import { onAuthStateChanged, getRedirectResult, signInWithCustomToken } from 'firebase/auth';
import { auth, ensureAuthPersistence } from './firebase';
import LandingPage from './LandingPage';
import Login from './Login';
import { CurrencyProvider } from './CurrencyContext';

// Lazy load heavy components for better initial load performance
const CardManager = lazy(() => import('./CardManager'));
const CollectorsPage = lazy(() => import('./CollectorsPage'));
const HowItWorksPage = lazy(() => import('./HowItWorksPage'));
const TermsPage = lazy(() => import('./TermsPage'));
const PrivacyPage = lazy(() => import('./PrivacyPage'));

// Loading fallback component
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontFamily: 'system-ui, -apple-system, Arial',
    fontSize: '18px',
    padding: '20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white'
  }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '48px', marginBottom: '20px' }}>🎯</div>
      <div>Načítavam...</div>
    </div>
  </div>
);

function App() {
  const mockAuthQuery = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('mockAuth')
    : null;
  const isMockAuth = import.meta.env.DEV && (
    mockAuthQuery === '1' || (mockAuthQuery !== '0' && import.meta.env.VITE_MOCK_AUTH === '1')
  );
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentPage, setCurrentPage] = useState('home'); // 'home', 'collectors', 'howto', 'terms', 'privacy'

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent || '';
      const isInApp = /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line|Twitter|LinkedIn|Snapchat|Pinterest|TikTok/i.test(ua);
      if (isInApp && window.location.hostname === 'your-card-collection-2026.web.app') {
        const nextUrl = `https://your-card-collection-2026.firebaseapp.com${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(nextUrl);
        return;
      }
    }

    if (isMockAuth) {
      setUser({
        uid: 'mock-user',
        displayName: 'Mock User',
        email: 'mock@example.com',
        photoURL: null
      });
      setShowLoginModal(false);
      setLoading(false);
      return;
    }

    const handleRedirect = async () => {
      try {
        await ensureAuthPersistence();
        if (typeof window !== 'undefined' && import.meta.env.VITE_E2E_AUTH === '1') {
          const params = new URLSearchParams(window.location.search);
          const token = params.get('e2eToken');
          if (token) {
            await signInWithCustomToken(auth, token);
            params.delete('e2eToken');
            const nextQuery = params.toString();
            const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
            window.history.replaceState({}, '', nextUrl);
          }
        }
        await getRedirectResult(auth);
      } catch (err) {
        console.error('Redirect login error:', err);
      }
    };

    handleRedirect();

    let loadingTimeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
      }
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        setShowLoginModal(false);
      }
    });

    return () => {
      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
      }
      unsubscribe();
    };
  }, [isMockAuth]);

  if (loading) {
    return <LoadingFallback />;
  }

  // Show subpages if requested
  if (currentPage === 'collectors') {
    return (
      <CurrencyProvider user={user}>
        <Suspense fallback={<LoadingFallback />}>
          <CollectorsPage onBackToHome={() => setCurrentPage('home')} />
        </Suspense>
      </CurrencyProvider>
    );
  }

  if (currentPage === 'howto') {
    return (
      <CurrencyProvider user={user}>
        <Suspense fallback={<LoadingFallback />}>
          <HowItWorksPage onBack={() => setCurrentPage('home')} />
        </Suspense>
      </CurrencyProvider>
    );
  }

  if (currentPage === 'terms') {
    return (
      <CurrencyProvider user={user}>
        <Suspense fallback={<LoadingFallback />}>
          <TermsPage onBack={() => setCurrentPage('home')} />
        </Suspense>
      </CurrencyProvider>
    );
  }

  if (currentPage === 'privacy') {
    return (
      <CurrencyProvider user={user}>
        <Suspense fallback={<LoadingFallback />}>
          <PrivacyPage onBack={() => setCurrentPage('home')} />
        </Suspense>
      </CurrencyProvider>
    );
  }

  return (
    <CurrencyProvider user={user}>
      <div>
        {!user ? (
          <>
            <LandingPage
              onLoginClick={() => setShowLoginModal(true)}
              onCollectorsClick={() => setCurrentPage('collectors')}
              onHowtoClick={() => setCurrentPage('howto')}
              onTermsClick={() => setCurrentPage('terms')}
              onPrivacyClick={() => setCurrentPage('privacy')}
            />
            <Login isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
          </>
        ) : (
          <Suspense fallback={<LoadingFallback />}>
            <CardManager user={user} />
          </Suspense>
        )}
      </div>
    </CurrencyProvider>
  );
}

export default App;
