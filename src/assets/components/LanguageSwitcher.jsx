import { useState } from 'react';
import { getCurrentLanguage, setLanguage } from '../../translations';

/**
 * LanguageSwitcher - Dropdown for switching languages
 */
function LanguageSwitcher({ darkMode }) {
  const [currentLang, setCurrentLang] = useState(getCurrentLanguage());

  const languages = [
    { code: 'sk', flag: '🇸🇰', name: 'Slovenčina' },
    { code: 'en', flag: '🇬🇧', name: 'English' },
    { code: 'cz', flag: '🇨🇿', name: 'Čeština' }
  ];

  const handleLanguageChange = (langCode) => {
    setLanguage(langCode);
    setCurrentLang(langCode);
    // Reload page to apply new language
    window.location.reload();
  };

  return (
    <div style={styles.container}>
      <select
        value={currentLang}
        onChange={(e) => handleLanguageChange(e.target.value)}
        style={{
          ...styles.select,
          background: darkMode ? '#334155' : 'white',
          color: darkMode ? 'white' : '#0f172a',
          borderColor: darkMode ? '#475569' : '#e2e8f0'
        }}
        title="Change language"
      >
        {languages.map(lang => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.name}
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
