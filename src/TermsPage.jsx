import './LandingPage.css';
import LanguageSwitcher from './assets/components/LanguageSwitcher';
import { useLanguage } from './LanguageContext';

function TermsPage({ onBack }) {
  const { t } = useLanguage();

  const sections = [
    {
      title: t('terms.section1.title'),
      content: t('terms.section1.content')
    },
    {
      title: t('terms.section2.title'),
      content: t('terms.section2.content')
    },
    {
      title: t('terms.section3.title'),
      content: t('terms.section3.content')
    },
    {
      title: t('terms.section4.title'),
      content: t('terms.section4.content')
    },
    {
      title: t('terms.section5.title'),
      content: t('terms.section5.content')
    },
    {
      title: t('terms.section6.title'),
      content: t('terms.section6.content')
    },
    {
      title: t('terms.section7.title'),
      content: t('terms.section7.content')
    }
  ];

  return (
    <div className="landing-page legal-page">
      {/* Header */}
      <header className="legal-header">
        <div className="container">
          <button onClick={onBack} className="back-button">
            {t('collectors.back')}
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Hero */}
      <section className="legal-hero">
        <div className="container">
          <h1>{t('terms.title')}</h1>
          <p>{t('terms.subtitle')}</p>
          <p className="legal-date">{t('terms.lastUpdate')}: 1.1.2026</p>
        </div>
      </section>

      {/* Content */}
      <section className="legal-content">
        <div className="container">
          <div className="legal-sections">
            {sections.map((section, index) => (
              <div key={index} className="legal-section">
                <h2>{index + 1}. {section.title}</h2>
                <p>{section.content}</p>
              </div>
            ))}
          </div>

          <div className="legal-contact">
            <h3>{t('terms.contact.title')}</h3>
            <address>
              {t('terms.contact.content').split('\n').map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </address>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <div className="footer-bottom">
            <p>&copy; 2025 {t('landing.footer.brand')}. {t('landing.footer.rights')}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default TermsPage;
