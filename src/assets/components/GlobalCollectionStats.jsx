import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { t, getCurrentLanguage } from '../../translations';

function GlobalCollectionStats() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalValue: 0, totalItems: 0 });
  const lang = getCurrentLanguage();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const cardsRef = collection(db, 'cards');
        const snapshot = await getDocs(cardsRef);

        let totalValue = 0;
        let totalItems = 0;

        snapshot.docs.forEach(doc => {
          const card = doc.data();
          if (card.status === 'zbierka') {
            const qty = card.quantity || 1;
            totalItems += qty;
            totalValue += (card.current || 0) * qty;
          }
        });

        setStats({ totalValue, totalItems });
      } catch (err) {
        console.error('GlobalCollectionStats error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const formatEur = (value) => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : lang === 'cz' ? 'cs-CZ' : 'sk-SK', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value || 0);

  return (
    <section style={styles.section}>
      <div style={styles.card}>
        <div style={styles.textBlock}>
          <h2 style={styles.title}>{t('landing.globalValue.title', lang)}</h2>
          <p style={styles.subtitle}>{t('landing.globalValue.subtitle', lang)}</p>
        </div>
        <div style={styles.valueBlock}>
          <div style={styles.label}>{t('landing.globalValue.label', lang)}</div>
          <div style={styles.value}>
            {loading ? '—' : formatEur(stats.totalValue)}
          </div>
          <div style={styles.meta}>
            {loading ? '—' : `${stats.totalItems} ${t('landing.globalValue.items', lang)}`}
          </div>
        </div>
      </div>
    </section>
  );
}

const styles = {
  section: {
    maxWidth: '1200px',
    margin: '40px auto 0',
    padding: '0 20px'
  },
  card: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
    color: 'white',
    boxShadow: '0 18px 35px rgba(37, 99, 235, 0.25)'
  },
  textBlock: {
    flex: '1 1 260px'
  },
  title: {
    margin: 0,
    fontSize: '22px',
    fontWeight: '700'
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: '14px',
    opacity: 0.9
  },
  valueBlock: {
    textAlign: 'right',
    flex: '1 1 220px'
  },
  label: {
    fontSize: '12px',
    opacity: 0.85,
    textTransform: 'uppercase',
    letterSpacing: '0.08em'
  },
  value: {
    fontSize: '28px',
    fontWeight: '800',
    margin: '6px 0'
  },
  meta: {
    fontSize: '13px',
    opacity: 0.9
  }
};

export default GlobalCollectionStats;
