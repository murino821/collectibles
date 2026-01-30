import { useState, useEffect, lazy, Suspense } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import LandingPage from './LandingPage';
import Login from './Login';

// Lazy load heavy components for better initial load performance
const CardManager = lazy(() => import('./CardManager'));
const CollectorsPage = lazy(() => import('./CollectorsPage'));

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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentPage, setCurrentPage] = useState('home'); // 'home' or 'collectors'

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      if (currentUser) {
        setShowLoginModal(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <LoadingFallback />;
  }

  // Show collectors page if requested
  if (currentPage === 'collectors') {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <CollectorsPage onBackToHome={() => setCurrentPage('home')} />
      </Suspense>
    );
  }

  return (
    <div>
      {!user ? (
        <>
          <LandingPage
            onLoginClick={() => setShowLoginModal(true)}
            onCollectorsClick={() => setCurrentPage('collectors')}
          />
          <Login isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
        </>
      ) : (
        <Suspense fallback={<LoadingFallback />}>
          <CardManager user={user} />
        </Suspense>
      )}
    </div>
  );
}

export default App;
