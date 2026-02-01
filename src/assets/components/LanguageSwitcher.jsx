import { useLanguage } from '../../LanguageContext';
import { setLanguage as saveLanguage } from '../../translations';

/**
 * LanguageSwitcher - Dropdown for switching languages (flags only)
 */
function LanguageSwitcher({ darkMode }) {
  const { language, setLanguage } = useLanguage();

  const languages = [
    { code: 'sk', flag: '🇸🇰', name: 'Slovenčina' },
    { code: 'en', flag: '🇬🇧', name: 'English' },
    { code: 'cz', flag: '🇨🇿', name: 'Čeština' }
  ];

  const handleLanguageChange = (langCode) => {
    saveLanguage(langCode); // Save to localStorage
    setLanguage(langCode);  // Update context (triggers re-render)
  };

  return (
    <div style={styles.container}>
      <select
        value={language}
        onChange={(e) => handleLanguageChange(e.target.value)}
        style={{
          ...styles.select,
          background: darkMode ? '#334155' : 'white',
          color: darkMode ? 'white' : '#0f172a',
          borderColor: darkMode ? '#475569' : '#e2e8f0',
          width: '52px',
          paddingRight: '4px'
        }}
        title="Change language"
      >
        {languages.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.flag}
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
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid',
    fontSize: '14px',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: '44px',
    height: '44px'
  }
};

export default LanguageSwitcher;
