import { useState } from 'react';
import './LandingPage.css';
import TopCards from './assets/components/TopCards';
import GlobalCollectionStats from './assets/components/GlobalCollectionStats';
import LanguageSwitcher from './assets/components/LanguageSwitcher';
import { t, getCurrentLanguage } from './translations';

function LandingPage({ onLoginClick, onCollectorsClick, onHowtoClick, onTermsClick, onPrivacyClick }) {
  const [activeFeature, setActiveFeature] = useState(0);
  const lang = getCurrentLanguage();

  const features = [
    {
      icon: '📊',
      title: t('landing.feature1.title', lang),
      description: t('landing.feature1.desc', lang)
    },
    {
      icon: '💰',
      title: t('landing.feature2.title', lang),
      description: t('landing.feature2.desc', lang)
    },
    {
      icon: '📈',
      title: t('landing.feature3.title', lang),
      description: t('landing.feature3.desc', lang)
    }
  ];

  const steps = [
    {
      number: '1',
      title: t('landing.howto.step1', lang),
      description: t('landing.howto.step1.desc', lang)
    },
    {
      number: '2',
      title: t('landing.howto.step2', lang),
      description: t('landing.howto.step2.desc', lang)
    },
    {
      number: '3',
      title: t('landing.howto.step3', lang),
      description: t('landing.howto.step3.desc', lang)
    }
  ];

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-wrapper">
          <div className="hero-content">
            <div className="hero-badge">
              <img src="/logo.jpg" alt="AssetTide" className="hero-logo" />
              <span>{t('landing.badge', lang)}</span>
            </div>

            <h1 className="hero-title">
              {t('landing.title.1', lang)}<br />
              <span className="hero-title-highlight">{t('landing.title.2', lang)}</span>
            </h1>

            <p className="hero-subtitle">
              {t('landing.subtitle', lang)}
            </p>

            <div className="hero-cta">
              <button onClick={onLoginClick} className="btn-primary btn-large">
                <span>{t('landing.cta.start', lang)}</span>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M7.5 15L12.5 10L7.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <button className="btn-secondary btn-large" onClick={() => {
                document.getElementById('features').scrollIntoView({ behavior: 'smooth' });
              }}>
                {t('landing.cta.learn', lang)}
              </button>
            </div>

            <div className="hero-stats">
              <div className="stat">
                <div className="stat-value">1000+</div>
                <div className="stat-label">{t('landing.stats.items', lang)}</div>
              </div>
              <div className="stat-divider"></div>
              <div className="stat">
                <div className="stat-value">Real-time</div>
                <div className="stat-label">{t('landing.stats.sync', lang)}</div>
              </div>
              <div className="stat-divider"></div>
              <div className="stat">
                <div className="stat-value">Cloud</div>
                <div className="stat-label">{t('landing.stats.storage', lang)}</div>
              </div>
            </div>
          </div>

          <div className="hero-image">
            <img
              src="/sports.jpg"
              alt="Rôzne športové zbierky - basketbal, baseball, futbal, hokej, tenis"
              loading="eager"
              width="600"
              height="400"
            />
          </div>
        </div>

        <div className="scroll-indicator">
          <div className="scroll-mouse"></div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features" id="features">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">{t('landing.features.title', lang)}</h2>
            <p className="section-subtitle">
              {t('landing.features.subtitle', lang)}
            </p>
          </div>

          <div className="features-grid">
            {features.map((feature, index) => (
              <div
                key={index}
                className={`feature-card ${activeFeature === index ? 'active' : ''}`}
                onMouseEnter={() => setActiveFeature(index)}
              >
                <div className="feature-icon">{feature.icon}</div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </div>
            ))}
          </div>

          <div className="features-showcase">
            <div className="showcase-content">
              <div className="showcase-badge">✨ {lang === 'en' ? 'And that\'s not all' : lang === 'cz' ? 'A to není všechno' : 'A to nie je všetko'}</div>
              <h3>{lang === 'en' ? 'More Features' : lang === 'cz' ? 'Další funkce' : 'Ďalšie funkcie'}</h3>
              <ul className="features-list">
                <li>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  <span>{t('landing.features.list.photos', lang)}</span>
                </li>
                <li>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  <span>{t('landing.features.list.import', lang)}</span>
                </li>
                <li>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  <span>{lang === 'en' ? 'Dark mode for comfortable viewing' : lang === 'cz' ? 'Dark mode pro pohodlné prohlížení' : 'Dark mode pre pohodlné prezeranie'}</span>
                </li>
                <li>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  <span>{t('landing.features.list.mobile', lang)}</span>
                </li>
                <li>
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                  </svg>
                  <span>{t('landing.features.list.cloud', lang)}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Top Cards Section */}
      <GlobalCollectionStats />
      <TopCards />

      {/* How it Works Section */}
      <section className="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">{t('landing.howto.title', lang)}</h2>
            <p className="section-subtitle">
              {lang === 'en' ? 'Start collecting in 3 simple steps' : lang === 'cz' ? 'Začněte sbírat ve 3 jednoduchých krocích' : 'Začni zbierať za 3 jednoduché kroky'}
            </p>
          </div>

          <div className="steps">
            {steps.map((step, index) => (
              <div key={index} className="step">
                <div className="step-number">{step.number}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-description">{step.description}</p>
                {index < steps.length - 1 && (
                  <div className="step-connector">
                    <svg width="40" height="40" viewBox="0 0 40 40">
                      <path d="M10 20 L30 20" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4"/>
                      <path d="M25 15 L30 20 L25 25" stroke="currentColor" strokeWidth="2" fill="none"/>
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="cta-box">
            <h3>{lang === 'en' ? 'Ready to start?' : lang === 'cz' ? 'Připraveni začít?' : 'Pripravený začať?'}</h3>
            <p>{lang === 'en' ? 'Sign in with your Google account and start managing your collection right now.' : lang === 'cz' ? 'Přihlaste se pomocí Google účtu a začněte spravovat svou sbírku hned teraz.' : 'Prihlás sa pomocou Google účtu a začni spravovať svoju zbierku hneď teraz.'}</p>
            <button onClick={onLoginClick} className="btn-primary btn-large">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>{lang === 'en' ? 'Sign in with Google' : lang === 'cz' ? 'Přihlásit se přes Google' : 'Prihlásiť sa cez Google'}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <h3><img src="/logo.jpg" alt="AssetTide" className="footer-logo" /> {t('landing.footer.brand', lang)}</h3>
              <p>{t('landing.footer.tagline', lang)}</p>
            </div>
            <div className="footer-links">
              <div className="footer-section">
                <h4>{t('landing.footer.product', lang)}</h4>
                <ul>
                  <li><a href="#features">{t('landing.footer.features', lang)}</a></li>
                  <li><a href="#" onClick={(e) => { e.preventDefault(); onHowtoClick(); }}>{t('landing.footer.howto', lang)}</a></li>
                </ul>
              </div>
              <div className="footer-section">
                <h4>{t('landing.footer.community', lang)}</h4>
                <ul>
                  <li><a href="#" onClick={(e) => { e.preventDefault(); onCollectorsClick(); }}>{t('landing.footer.collectors', lang)}</a></li>
                </ul>
              </div>
              <div className="footer-section">
                <h4>{t('landing.footer.legal', lang)}</h4>
                <ul>
                  <li><a href="#" onClick={(e) => { e.preventDefault(); onTermsClick(); }}>{t('landing.footer.terms', lang)}</a></li>
                  <li><a href="#" onClick={(e) => { e.preventDefault(); onPrivacyClick(); }}>{t('landing.footer.privacy', lang)}</a></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2025 {t('landing.footer.brand', lang)}. {t('landing.footer.rights', lang)}</p>
            <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
              {t('landing.footer.exchangeSource', lang)}
            </p>
            <div style={{ marginTop: '16px' }}>
              <LanguageSwitcher darkMode={false} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
