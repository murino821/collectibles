import './LandingPage.css';
import LanguageSwitcher from './assets/components/LanguageSwitcher';
import { useLanguage } from './LanguageContext';

function PrivacyPage({ onBack }) {
  const { t } = useLanguage();

  const sections = [
    {
      title: t('privacy.section1.title'),
      content: t('privacy.section1.content'),
      list: [
        t('privacy.section1.item1'),
        t('privacy.section1.item2'),
        t('privacy.section1.item3')
      ]
    },
    {
      title: t('privacy.section2.title'),
      content: t('privacy.section2.content'),
      list: [
        t('privacy.section2.item1'),
        t('privacy.section2.item2'),
        t('privacy.section2.item3'),
        t('privacy.section2.item4')
      ]
    },
    {
      title: t('privacy.section3.title'),
      content: t('privacy.section3.content')
    },
    {
      title: t('privacy.section4.title'),
      content: t('privacy.section4.content')
    },
    {
      title: t('privacy.section5.title'),
      content: t('privacy.section5.content'),
      list: [
        t('privacy.section5.item1'),
        t('privacy.section5.item2'),
        t('privacy.section5.item3'),
        t('privacy.section5.item4')
      ]
    },
    {
      title: t('privacy.section6.title'),
      content: t('privacy.section6.content')
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
          <h1>{t('privacy.title')}</h1>
          <p>{t('privacy.subtitle')}</p>
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
                {section.list && (
                  <ul>
                    {section.list.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="legal-contact">
            <h3>{t('privacy.contact.title')}</h3>
            <address>
              {t('privacy.contact.content').split('\n').map((line, index) => (
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

export default PrivacyPage;
