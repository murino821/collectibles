import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { t, getCurrentLanguage } from '../../translations';

function GlobalCollectionStats() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalCollectionValueEur: 0, totalItems: 0 });
  const lang = getCurrentLanguage();

  useEffect(() => {
    const statsRef = doc(db, 'stats', 'global');
    const unsubscribe = onSnapshot(statsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setStats({
          totalCollectionValueEur: data.totalCollectionValueEur || 0,
          totalItems: data.totalItems || 0
        });
      }
      setLoading(false);
    });
    return () => unsubscribe();
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
            {loading ? '—' : formatEur(stats.totalCollectionValueEur)}
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

