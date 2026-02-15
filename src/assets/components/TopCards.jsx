import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { t, getCurrentLanguage } from '../../translations';

/**
 * TopCards - Displays top 10 most valuable cards from all collections
 * Public component for landing page
 */
function TopCards({ onLoginClick }) {
  const [topCards, setTopCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const lang = getCurrentLanguage();

  useEffect(() => {
    const fetchTopCards = async () => {
      setLoading(true);
      setError(null);

      try {
        // Query top 10 cards by current price
        // Filter only cards in collection (not sold)
        const cardsRef = collection(db, 'cards');
        const q = query(
          cardsRef,
          where('status', '==', 'zbierka'),
          where('isPublic', '==', true),
          orderBy('current', 'desc'),
          limit(100) // Get more to filter client-side
        );

        const snapshot = await getDocs(q);

        // Filter only cards with images and price > 0
        const cards = snapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          .filter(card =>
            card.current > 0 &&
            card.imageUrl &&
            card.imageUrl.trim() !== ''
          );

        const sorted = cards.sort((a, b) => {
          const aValue = (a.current || 0) * (a.quantity || 1);
          const bValue = (b.current || 0) * (b.quantity || 1);
          return bValue - aValue;
        });

        console.log('TopCards: Loaded', cards.length, 'cards with images');
        setTopCards(sorted.slice(0, 20)); // Top 20 on desktop
      } catch (err) {
        console.error('TopCards error:', err);
        console.error('Error code:', err.code);
        console.error('Error message:', err.message);

        // Check if it's an index error
        if (err.message && (err.message.includes('index') || err.message.includes('FAILED_PRECONDITION'))) {
          setError(lang === 'en' ? 'Database is preparing... Try again in a few minutes. 🔄' : lang === 'cz' ? 'Databáze se připravuje... Zkuste to znovu za pár minut. 🔄' : 'Databáza sa pripravuje... Skús to znova o pár minút. 🔄');
        } else if (err.code === 'permission-denied') {
          setError(lang === 'en' ? 'Access denied. Check Firestore rules.' : lang === 'cz' ? 'Přístup zamítnut. Zkontrolujte Firestore pravidla.' : 'Prístup zamietnutý. Skontroluj Firestore pravidlá.');
        } else {
          setError(`${lang === 'en' ? 'Failed to load top items' : lang === 'cz' ? 'Nepodařilo se načíst top položky' : 'Nepodarilo sa načítať top položky'}: ${err.message}`);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTopCards();
  }, []);

  const formatPrice = (price) => {
    if (price == null) return '—';
    const locale = lang === 'en' ? 'en-GB' : lang === 'cz' ? 'cs-CZ' : 'sk-SK';
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>🏆 {t('topcards.title', lang)}</h2>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}></div>
          <p style={styles.loadingText}>{t('topcards.loading', lang)}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>🏆 {t('topcards.title', lang)}</h2>
        <div style={styles.errorContainer}>
          <p style={styles.errorText}>❌ {error}</p>
        </div>
      </div>
    );
  }

  if (topCards.length === 0) {
    return (
      <div style={styles.container}>
        <h2 style={styles.title}>🏆 {t('topcards.title', lang)}</h2>
        <div style={styles.emptyContainer}>
          <div style={styles.emptyIcon}>🎯</div>
          <p style={styles.emptyText}>{t('topcards.empty', lang)}</p>
          <p style={styles.emptySubtext}>{t('topcards.empty.cta', lang)}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>🏆 {t('topcards.title', lang)}</h2>
        <p style={styles.subtitle}>
          {t('topcards.subtitle', lang)}
        </p>
      </div>

      <div style={styles.cardsGrid}>
        {topCards.map((card, index) => (
          <div
            key={card.id}
            style={{
              ...styles.card,
              animationDelay: `${index * 0.1}s`
            }}
          >
            {/* Rank Badge */}
            <div style={{
              ...styles.rankBadge,
              background: index === 0 ? 'linear-gradient(135deg, #ffd700 0%, #ffed4e 100%)' :
                         index === 1 ? 'linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 100%)' :
                         index === 2 ? 'linear-gradient(135deg, #cd7f32 0%, #e59c6f 100%)' :
                         'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: index < 3 ? '#000' : '#fff'
            }}>
              #{index + 1}
            </div>

            {/* Card Image */}
            {card.imageUrl ? (
              <div style={styles.imageContainer}>
                <img
                  src={card.imageUrl}
                  alt={card.item}
                  style={styles.cardImage}
                  loading="lazy"
                />
              </div>
            ) : (
              <div style={styles.placeholderImage}>
                <span style={styles.placeholderIcon}>🎯</span>
              </div>
            )}

            {/* Card Info */}
            <div style={styles.cardInfo}>
              <h3 style={styles.cardName}>{card.item}</h3>

              <div style={styles.priceContainer}>
                <div style={styles.priceLabel}>{t('topcards.value', lang)}</div>
                <div style={styles.priceValue}>
                  €{formatPrice((card.current || 0) * (card.quantity || 1))}
                </div>
                {card.quantity > 1 && (
                  <div style={styles.quantityBadge}>x{card.quantity}</div>
                )}
              </div>

              {/* Additional Stats */}
              {(card.buy != null || card.priceHistory) && (
                <div style={styles.statsRow}>
                  {card.buy != null && card.current != null && (
                    <div style={styles.statItem}>
                      <span style={styles.statLabel}>{t('topcards.roi', lang)}</span>
                      <span style={{
                        ...styles.statValue,
                        color: card.current >= card.buy ? '#10b981' : '#ef4444'
                      }}>
                        {card.buy > 0 ? `${(((card.current - card.buy) / card.buy) * 100).toFixed(0)}%` : '—'}
                      </span>
                    </div>
                  )}
                  {card.priceHistory && card.priceHistory.length > 1 && (
                    <div style={styles.statItem}>
                      <span style={styles.statLabel}>{t('topcards.updates', lang)}</span>
                      <span style={styles.statValue}>
                        {card.priceHistory.length}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Call to Action */}
      <div style={styles.ctaContainer}>
        <button style={styles.ctaButton} onClick={onLoginClick}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span>{t('topcards.cta', lang)}</span>
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '60px auto',
    padding: '0 20px'
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px'
  },
  title: {
    fontSize: '32px',
    fontWeight: 'bold',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    margin: '0 0 12px 0'
  },
  subtitle: {
    fontSize: '16px',
    color: '#64748b',
    margin: 0
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '24px',
    marginBottom: '40px'
  },
  card: {
    background: 'white',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07)',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    position: 'relative',
    animation: 'fadeInUp 0.5s ease forwards',
    opacity: 0,
    border: '1px solid #e2e8f0'
  },
  rankBadge: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '16px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
    zIndex: 10
  },
  imageContainer: {
    width: '100%',
    height: '220px',
    overflow: 'hidden',
    background: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    transition: 'transform 0.3s ease'
  },
  placeholderImage: {
    width: '100%',
    height: '220px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  placeholderIcon: {
    fontSize: '64px',
    opacity: 0.3
  },
  cardInfo: {
    padding: '20px'
  },
  cardName: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#0f172a',
    margin: '0 0 16px 0',
    lineHeight: '1.4',
    minHeight: '42px',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden'
  },
  priceContainer: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderRadius: '12px',
    padding: '12px 16px',
    marginBottom: '12px'
  },
  priceLabel: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px'
  },
  priceValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: 'white'
  },
  quantityBadge: {
    marginTop: '6px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#0f172a',
    background: 'rgba(255, 255, 255, 0.85)',
    borderRadius: '999px',
    padding: '4px 8px',
    display: 'inline-block'
  },
  statsRow: {
    display: 'flex',
    gap: '16px',
    paddingTop: '12px',
    borderTop: '1px solid #e2e8f0'
  },
  statItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  statLabel: {
    fontSize: '11px',
    color: '#94a3b8',
    fontWeight: '500',
    textTransform: 'uppercase'
  },
  statValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#0f172a'
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '60px 20px'
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e2e8f0',
    borderTop: '4px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px'
  },
  loadingText: {
    color: '#64748b',
    fontSize: '16px'
  },
  errorContainer: {
    textAlign: 'center',
    padding: '60px 20px'
  },
  errorText: {
    color: '#ef4444',
    fontSize: '16px'
  },
  emptyContainer: {
    textAlign: 'center',
    padding: '60px 20px'
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '16px'
  },
  emptyText: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#0f172a',
    margin: '0 0 8px 0'
  },
  emptySubtext: {
    fontSize: '14px',
    color: '#64748b',
    margin: 0
  },
  ctaContainer: {
    textAlign: 'center',
    padding: '32px 20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderRadius: '16px',
    marginTop: '20px'
  },
  ctaButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 32px',
    background: 'white',
    color: '#667eea',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
  }
};

// Add keyframe animations via a style tag
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  [style*="cursor: pointer"]:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15) !important;
  }

  [style*="cursor: pointer"]:hover img {
    transform: scale(1.05);
  }

  @media (max-width: 768px) {
    h2[style*="fontSize: '32px'"] {
      font-size: 24px !important;
    }
  }
`;
document.head.appendChild(styleSheet);

export default TopCards;
