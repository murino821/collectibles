import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import './CollectorsPage.css';
import { t, getCurrentLanguage } from './translations';

/**
 * CollectorsPage - Public page showing list of all collectors
 * Displays user stats (collection count, total value)
 */
function CollectorsPage({ onBackToHome }) {
  const [collectors, setCollectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const lang = getCurrentLanguage();

  useEffect(() => {
    const fetchCollectors = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch all users
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);

        // Fetch all cards to calculate stats per user
        const cardsRef = collection(db, 'cards');
        const cardsSnapshot = await getDocs(cardsRef);

        // Group cards by userId
        const userCards = {};
        cardsSnapshot.docs.forEach(doc => {
          const card = doc.data();
          if (card.userId && card.status === 'zbierka') {
            if (!userCards[card.userId]) {
              userCards[card.userId] = {
                count: 0,
                totalValue: 0,
                withImages: 0
              };
            }
            userCards[card.userId].count++;
            userCards[card.userId].totalValue += card.current || 0;
            if (card.imageUrl) userCards[card.userId].withImages++;
          }
        });

        // Build collectors list
        const collectorsList = usersSnapshot.docs
          .map(doc => {
            const user = doc.data();
            const stats = userCards[doc.id] || { count: 0, totalValue: 0, withImages: 0 };

            return {
              id: doc.id,
              displayName: user.displayName || 'Anonym',
              photoURL: user.photoURL || null,
              email: user.email || '',
              itemCount: stats.count,
              totalValue: stats.totalValue,
              withImages: stats.withImages,
              createdAt: user.createdAt || null
            };
          })
          .filter(c => c.itemCount > 0) // Only users with items
          .sort((a, b) => b.totalValue - a.totalValue); // Sort by total value

        console.log('Collectors loaded:', collectorsList.length);
        setCollectors(collectorsList);
      } catch (err) {
        console.error('Error loading collectors:', err);
        setError(t('collectors.error', lang));
      } finally {
        setLoading(false);
      }
    };

    fetchCollectors();
  }, []);

  const formatPrice = (price) => {
    if (price == null) return '€0';
    return new Intl.NumberFormat('sk-SK', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  if (loading) {
    return (
      <div className="collectors-page">
        <div className="collectors-header">
          <button onClick={onBackToHome} className="back-button">
            {t('collectors.back', lang)}
          </button>
          <h1>🎯 {t('collectors.title', lang)}</h1>
        </div>
        <div className="loading-container">
          <div className="spinner"></div>
          <p>{t('collectors.loading', lang)}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="collectors-page">
        <div className="collectors-header">
          <button onClick={onBackToHome} className="back-button">
            {t('collectors.back', lang)}
          </button>
          <h1>🎯 {t('collectors.title', lang)}</h1>
        </div>
        <div className="error-container">
          <p className="error-text">❌ {error}</p>
        </div>
      </div>
    );
  }

  if (collectors.length === 0) {
    return (
      <div className="collectors-page">
        <div className="collectors-header">
          <button onClick={onBackToHome} className="back-button">
            {t('collectors.back', lang)}
          </button>
          <h1>🎯 {t('collectors.title', lang)}</h1>
        </div>
        <div className="empty-container">
          <div className="empty-icon">🎯</div>
          <p className="empty-text">{t('collectors.empty', lang)}</p>
          <p className="empty-subtext">{t('collectors.empty.cta', lang)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="collectors-page">
      <div className="collectors-header">
        <button onClick={onBackToHome} className="back-button">
          {t('collectors.back', lang)}
        </button>
        <h1>🎯 {t('collectors.title', lang)}</h1>
        <p className="collectors-subtitle">
          {t('collectors.subtitle', lang)} • {lang === 'en' ? 'Total' : lang === 'cz' ? 'Celkem' : 'Celkom'} {collectors.length} {t('collectors.count', lang)}
        </p>
      </div>

      <div className="collectors-stats">
        <div className="stat-card">
          <div className="stat-value">
            {collectors.reduce((sum, c) => sum + c.itemCount, 0)}
          </div>
          <div className="stat-label">{t('collectors.stats.total', lang)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {formatPrice(collectors.reduce((sum, c) => sum + c.totalValue, 0))}
          </div>
          <div className="stat-label">{t('collectors.stats.value', lang)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{collectors.length}</div>
          <div className="stat-label">{t('collectors.stats.active', lang)}</div>
        </div>
      </div>

      <div className="collectors-list">
        {collectors.map((collector, index) => (
          <div key={collector.id} className="collector-card">
            <div className="collector-rank">#{index + 1}</div>

            <div className="collector-avatar">
              {collector.photoURL ? (
                <img src={collector.photoURL} alt={collector.displayName} />
              ) : (
                <div className="avatar-placeholder">
                  {collector.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="collector-info">
              <h3 className="collector-name">{collector.displayName}</h3>
              <div className="collector-stats-row">
                <span className="stat-item">
                  📦 {collector.itemCount} {t('collectors.items', lang)}
                </span>
                {collector.withImages > 0 && (
                  <span className="stat-item">
                    📸 {collector.withImages} {t('collectors.photos', lang)}
                  </span>
                )}
              </div>
            </div>

            <div className="collector-value">
              <div className="value-label">{t('collectors.value', lang)}</div>
              <div className="value-amount">{formatPrice(collector.totalValue)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Donate Section */}
      <div className="donate-section">
        <div className="donate-content">
          <div className="donate-icon">💝</div>
          <h2 className="donate-title">{t('collectors.donate.title', lang)}</h2>
          <p className="donate-text">
            {t('collectors.donate.text', lang)}
          </p>
          <a
            href="https://paypal.me/murino821"
            target="_blank"
            rel="noopener noreferrer"
            className="donate-button"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.067 8.478c.492.88.556 2.014.3 3.327-.74 3.806-3.276 5.12-6.514 5.12h-.5a.805.805 0 00-.794.68l-.04.22-.63 3.993-.028.15a.806.806 0 01-.795.68H7.723c-.3 0-.544-.24-.505-.54l.015-.087.81-5.143c.048-.306.295-.54.605-.54h1.334c2.731 0 4.867-.989 5.514-3.851.295-1.305.11-2.387-.555-3.217-.203-.254-.45-.478-.737-.671.18-.036.368-.058.563-.058h.5c1.653 0 3.042.388 3.901 1.318zm-3.567-6.478c.84 0 1.538.298 2.07.861.562.594.818 1.468.76 2.596-.006.13-.014.263-.024.399l-.051.664c-.049.634-.194 1.155-.437 1.562-.242.407-.635.729-1.175.96-.51.218-1.147.327-1.898.327h-.5c-.37 0-.697.267-.772.63l-.022.12-.86 5.448-.028.151c-.048.255-.272.453-.531.453H9.677c-.3 0-.544-.24-.505-.54l.015-.087.81-5.143c.048-.306.295-.54.605-.54h1.334c2.731 0 4.867-.989 5.514-3.851.273-1.208.125-2.216-.395-3.006-.277-.42-.643-.757-1.09-1.004H16.5z"/>
            </svg>
            {t('collectors.donate.button', lang)}
          </a>
          <p className="donate-note">{t('collectors.donate.note', lang)}</p>
        </div>
      </div>
    </div>
  );
}

export default CollectorsPage;
