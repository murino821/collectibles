import { useState } from 'react';
import { signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth, googleProvider, ensureAuthPersistence } from './firebase';
import './LoginModal.css';

const isInAppBrowser = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line|Twitter|LinkedIn|Snapchat|Pinterest|TikTok/i.test(ua);
};

const isIOS = () => {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
};

const isAndroid = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
};

const isMobile = () => {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android/i.test(navigator.userAgent || '');
};

function Login({ isOpen, onClose }) {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const inApp = isInAppBrowser();

  const loginUrl = 'https://assetide.com/?startLogin=1';
  const intentUrl = `intent://assetide.com/?startLogin=1#Intent;scheme=https;package=com.android.chrome;end`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(loginUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = loginUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await ensureAuthPersistence();
      await signInWithPopup(auth, googleProvider);
      setError('');
      if (onClose) onClose();
    } catch (err) {
      if (err?.code === 'auth/popup-blocked' || err?.code === 'auth/popup-closed-by-user') {
        try {
          setError('');
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          setError('Chyba pri prihlásení: ' + redirectErr.message);
        }
      } else {
        setError('Chyba pri prihlásení: ' + err.message);
      }
      console.error('Chyba:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  return (
    <div className="login-modal-overlay" onClick={handleBackdropClick}>
      <div className="login-modal">
        <button className="login-modal-close" onClick={onClose} aria-label="Zavrieť">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="login-modal-content">
          {inApp ? (
            <div className="inapp-browser-banner">
              <div className="inapp-icon">🌐</div>
              <h3>Otvor v prehliadači</h3>
              <p>
                Google prihlásenie nefunguje v tomto prehliadači.
                {isAndroid()
                  ? ' Otvor stránku v Chrome.'
                  : ' Otvor stránku v Safari.'}
              </p>

              {isAndroid() && (
                <a href={intentUrl} className="open-browser-button">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Otvoriť v Chrome
                </a>
              )}

              <button
                className={`copy-link-button${copied ? ' copied' : ''}`}
                onClick={handleCopyLink}
              >
                {copied ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Link skopírovaný!
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Kopírovať link
                  </>
                )}
              </button>

              {isIOS() && (
                <p className="inapp-instruction">
                  Alebo klikni na menu (⋯) a vyber &quot;Open in Safari&quot;
                </p>
              )}

              <div className="login-modal-footer">
                <p>Po otvorení v prehliadači sa budeš môcť prihlásiť cez Google.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="login-modal-icon">🎯</div>
              <h2 className="login-modal-title">Prihlásenie</h2>
              <p className="login-modal-subtitle">
                Prihlás sa pomocou Google účtu a začni spravovať svoju zbierku
              </p>

              <button
                className="login-google-button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="spinner"></div>
                    <span>Prihlasujem...</span>
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>Prihlásiť sa cez Google</span>
                  </>
                )}
              </button>

              {error && (
                <div className="login-error">
                  {error}
                </div>
              )}

              <div className="login-modal-footer">
                <p>Prihlásením súhlasíš s našimi podmienkami použitia a ochranou súkromia.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
