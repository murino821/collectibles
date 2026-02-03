import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

const CurrencyContext = createContext();

const DEFAULT_CURRENCY = 'EUR';
const DEFAULT_RATES = { EUR: 1, USD: 1, CZK: 1 };

const getLocaleForLanguage = (language) => {
  if (language === 'en') return 'en-GB';
  if (language === 'cz') return 'cs-CZ';
  return 'sk-SK';
};

// eslint-disable-next-line react-refresh/only-export-components
export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within CurrencyProvider');
  }
  return context;
};

export const CurrencyProvider = ({ children, user }) => {
  const [currency, setCurrencyState] = useState(() => localStorage.getItem('currency') || DEFAULT_CURRENCY);
  const [rates, setRates] = useState(() => {
    const cached = localStorage.getItem('exchangeRates');
    try {
      return cached ? { ...DEFAULT_RATES, ...JSON.parse(cached) } : DEFAULT_RATES;
    } catch {
      return DEFAULT_RATES;
    }
  });
  const [ratesAsOf, setRatesAsOf] = useState(() => localStorage.getItem('exchangeRatesAsOf') || null);

  useEffect(() => {
    const ratesRef = doc(db, 'exchangeRates', 'latest');
    const unsubscribe = onSnapshot(ratesRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      if (data?.rates) {
        setRates({ ...DEFAULT_RATES, ...data.rates });
        localStorage.setItem('exchangeRates', JSON.stringify(data.rates));
      }
      if (data?.asOf) {
        setRatesAsOf(data.asOf);
        localStorage.setItem('exchangeRatesAsOf', data.asOf);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const userCurrency = snapshot.data()?.currency;
      if (userCurrency && userCurrency !== currency) {
        setCurrencyState(userCurrency);
        localStorage.setItem('currency', userCurrency);
      }
    });

    return () => unsubscribe();
  }, [user, currency]);

  const setCurrency = async (nextCurrency) => {
    if (!['EUR', 'USD', 'CZK'].includes(nextCurrency)) return;
    setCurrencyState(nextCurrency);
    localStorage.setItem('currency', nextCurrency);

    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { currency: nextCurrency });
      } catch (error) {
        console.error('Failed to update user currency:', error);
      }
    }
  };

  const getRate = (code) => {
    if (code === 'EUR') return 1;
    return typeof rates?.[code] === 'number' && rates[code] > 0 ? rates[code] : 1;
  };

  const convertFromEur = (amountEur) => {
    if (amountEur == null || Number.isNaN(amountEur)) return 0;
    const rate = getRate(currency);
    return amountEur * rate;
  };

  const convertToEur = (amountCurrency) => {
    if (amountCurrency == null || Number.isNaN(amountCurrency)) return 0;
    const rate = getRate(currency);
    return amountCurrency / rate;
  };

  const formatCurrency = (amountEur, language = 'sk', options = {}) => {
    const value = convertFromEur(amountEur);
    const locale = getLocaleForLanguage(language);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options
    }).format(value);
  };

  const formatCurrencyCompact = (amountEur, language = 'sk', options = {}) => {
    const value = convertFromEur(amountEur);
    const locale = getLocaleForLanguage(language);
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      ...options
    }).format(value);
  };

  const contextValue = useMemo(() => ({
    currency,
    rates,
    ratesAsOf,
    setCurrency,
    convertFromEur,
    convertToEur,
    formatCurrency,
    formatCurrencyCompact,
    getLocaleForLanguage
  }), [currency, rates, ratesAsOf]);

  return (
    <CurrencyContext.Provider value={contextValue}>
      {children}
    </CurrencyContext.Provider>
  );
};
