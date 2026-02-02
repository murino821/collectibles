import './LandingPage.css';
import LanguageSwitcher from './assets/components/LanguageSwitcher';
import { useLanguage } from './LanguageContext';

function HowItWorksPage({ onBack }) {
  const { t } = useLanguage();

  const steps = [
    {
      number: '1',
      icon: '🔐',
      title: t('howto.step1.title'),
      description: t('howto.step1.desc'),
      details: [
        t('howto.step1.detail1'),
        t('howto.step1.detail2'),
        t('howto.step1.detail3')
      ]
    },
    {
      number: '2',
      icon: '➕',
      title: t('howto.step2.title'),
      description: t('howto.step2.desc'),
      details: [
        t('howto.step2.detail1'),
        t('howto.step2.detail2'),
        t('howto.step2.detail3')
      ]
    },
    {
      number: '3',
      icon: '📊',
      title: t('howto.step3.title'),
      description: t('howto.step3.desc'),
      details: [
        t('howto.step3.detail1'),
        t('howto.step3.detail2'),
        t('howto.step3.detail3')
      ]
    },
    {
      number: '4',
      icon: '💰',
      title: t('howto.step4.title'),
      description: t('howto.step4.desc'),
      details: [
        t('howto.step4.detail1'),
        t('howto.step4.detail2'),
        t('howto.step4.detail3')
      ]
    }
  ];

  const faqs = [
    { q: t('howto.faq1.q'), a: t('howto.faq1.a') },
    { q: t('howto.faq2.q'), a: t('howto.faq2.a') },
    { q: t('howto.faq3.q'), a: t('howto.faq3.a') },
    { q: t('howto.faq4.q'), a: t('howto.faq4.a') }
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
          <h1>{t('howto.title')}</h1>
          <p>{t('howto.subtitle')}</p>
        </div>
      </section>

      {/* Steps */}
      <section className="legal-content">
        <div className="container">
          <div className="howto-steps">
            {steps.map((step, index) => (
              <div key={index} className="howto-step-card">
                <div className="howto-step-header">
                  <span className="howto-step-number">{step.number}</span>
                  <span className="howto-step-icon">{step.icon}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                <ul>
                  {step.details.map((detail, i) => (
                    <li key={i}>
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                      </svg>
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* FAQ Section */}
          <div className="howto-faq">
            <h2>{t('howto.faq.title')}</h2>
            <div className="faq-list">
              {faqs.map((faq, index) => (
                <div key={index} className="faq-item">
                  <h4>{faq.q}</h4>
                  <p>{faq.a}</p>
                </div>
              ))}
            </div>
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

export default HowItWorksPage;
