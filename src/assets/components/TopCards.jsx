import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { t, getCurrentLanguage } from '../../translations';

/**
 * TopCards - Displays top 10 most valuable cards from all collections
 * Public component for landing page
 */
function TopCards() {
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
          orderBy('current', 'desc'),
          limit(50) // Get more to filter client-side
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

        console.log('TopCards: Loaded', cards.length, 'cards with images');
        setTopCards(cards.slice(0, 10)); // Ensure max 10 cards
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
    return new Intl.NumberFormat('sk-SK', {
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
                  €{formatPrice(card.current)}
                </div>
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
                        {card.buy > 0 ? `${((card.current - card.buy) / card.buy * 100).toFixed(0)}%` : '—'}
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
        <p style={styles.ctaText}>
          {t('topcards.cta', lang)}
        </p>
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
  ctaText: {
    fontSize: '18px',
    fontWeight: '600',
    color: 'white',
    margin: 0
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
