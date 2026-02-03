import { useCurrency } from '../../CurrencyContext';
import { useLanguage } from '../../LanguageContext';

function CurrencySwitcher({ darkMode }) {
  const { currency, setCurrency } = useCurrency();
  const { t } = useLanguage();

  const currencies = [
    { code: 'EUR', label: 'EUR €' },
    { code: 'USD', label: 'USD $' },
    { code: 'CZK', label: 'CZK Kč' }
  ];

  return (
    <div style={styles.container}>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value)}
        style={{
          ...styles.select,
          background: darkMode ? '#334155' : 'white',
          color: darkMode ? 'white' : '#0f172a',
          borderColor: darkMode ? '#475569' : '#e2e8f0',
          width: '74px',
          paddingRight: '6px'
        }}
        title={t('currency.switcher')}
      >
        {currencies.map((cur) => (
          <option key={cur.code} value={cur.code}>
            {cur.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const styles = {
  container: {
    display: 'inline-block'
  },
  select: {
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid',
    fontSize: '12px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: '44px',
    height: '44px'
  }
};

export default CurrencySwitcher;

