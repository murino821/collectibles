import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db, storage } from './firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, limit, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import ImportCSV from './assets/components/ImportCSV';
import NotificationPanel from './assets/components/NotificationPanel';
import PortfolioChart from './assets/components/PortfolioChart';
import PriceHistoryChart from './assets/components/PriceHistoryChart';
import ProfileEditor from './assets/components/ProfileEditor';
import LanguageSwitcher from './assets/components/LanguageSwitcher';
import CurrencySwitcher from './assets/components/CurrencySwitcher';
import { useToast } from './assets/components/Toast';
import { useLanguage } from './LanguageContext';
import { useCurrency } from './CurrencyContext';

function CardManager({ user }) {
  const isMockAuth = import.meta.env.DEV && import.meta.env.VITE_MOCK_AUTH === '1';
  const toast = useToast();
  const { t, language } = useLanguage();
  const { currency, formatCurrency, formatCurrencyCompact, convertFromEur, convertToEur } = useCurrency();
  const mockCards = [
    {
      id: 'mock-1',
      userId: 'mock-user',
      item: '2005 Upper Deck Young Guns #201 Crosby PSA 10',
      buy: 180.0,
      current: 320.0,
      status: 'zbierka',
      quantity: 2,
      isPublic: true,
      note: 'Top rookie card',
      imageUrl: '/sports.jpg',
      priceHistory: [
        { date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30), price: 250 },
        { date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15), price: 290 },
        { date: new Date(), price: 320 }
      ]
    },
    {
      id: 'mock-2',
      userId: 'mock-user',
      item: 'Connor McDavid OPC Platinum Base',
      buy: 25.0,
      current: 40.0,
      status: 'zbierka',
      quantity: 1,
      isPublic: false,
      note: '',
      imageUrl: null
    },
    {
      id: 'mock-3',
      userId: 'mock-user',
      item: 'Ovechkin 2005-06 SPA Future Watch Auto',
      buy: 210.0,
      current: 280.0,
      status: 'predaná',
      quantity: 1,
      isPublic: false,
      soldPrice: 295.0,
      note: 'Sold at expo',
      imageUrl: '/sports-collection.jpg'
    },
    {
      id: 'mock-4',
      userId: 'mock-user',
      item: 'Jagr 1990-91 Score Rookie',
      buy: 8.0,
      current: 12.0,
      status: 'zbierka',
      quantity: 3,
      isPublic: false,
      note: 'No photo',
      imageUrl: null
    }
  ];
  const mockNotifications = [
    {
      id: 'mock-notif-1',
      type: 'system',
      title: 'Mock notifikácia',
      message: 'Testovací záznam.',
      createdAt: { toDate: () => new Date(Date.now() - 1000 * 60 * 60) }
    }
  ];
  const createMockId = () => `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [cards, setCards] = useState([]);
  const [filteredCards, setFilteredCards] = useState([]);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });
  const [showModal, setShowModal] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('zbierka');
  const [photoFilter, setPhotoFilter] = useState('all');
  const [sortKey, setSortKey] = useState('item');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [viewMode, setViewMode] = useState(() => {
    // Default: table for desktop, list for mobile
    return window.innerWidth >= 768 ? 'table' : 'list';
  });
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
  const [formData, setFormData] = useState({ item: '', buy: '', current: '', status: 'zbierka', note: '', imageFile: null, imageUrl: '', soldPrice: '', quantity: '1', isPublic: false });
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPortfolioChart, setShowPortfolioChart] = useState(false);
  const [selectedCardForChart, setSelectedCardForChart] = useState(null);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);
  const [sellCard, setSellCard] = useState(null);
  const [sellPrice, setSellPrice] = useState('');
  const [sellQuantity, setSellQuantity] = useState('1');
  const [imageModalUrl, setImageModalUrl] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteCard, setDeleteCard] = useState(null);
  const [userProfile, setUserProfile] = useState({ displayName: user.displayName, photoURL: user.photoURL, pricingMode: 'text' });
  const [userRole, setUserRole] = useState('standard');
  const isTestHost = typeof window !== 'undefined' && window.location.hostname.includes('your-card-collection-2026-test');
  const isAllowlistedAdmin = isTestHost && ['miroslav.svajda@gmail.com'].includes(user?.email || '');
  const [showFilters, setShowFilters] = useState(true);
  const [showStats, setShowStats] = useState(true);

  // Persist dark mode to localStorage
  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const checkScreenSize = () => {
      const desktop = window.innerWidth >= 768;
      setIsDesktop(desktop);
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Load user data (role, limits)
  useEffect(() => {
    if (!user) return;
    if (isMockAuth) return;

    const loadUserData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserRole(isAllowlistedAdmin ? 'admin' : (userData.role || 'standard'));
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };

    loadUserData();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (isMockAuth) return;
    const q = query(collection(db, 'cards'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cardsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCards(cardsData);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (isMockAuth) {
      setCards(prev => (prev.length ? prev : mockCards));
    }
  }, [isMockAuth]);

  useEffect(() => {
    if (!user) return;
    if (isMockAuth) return;
    // Subscribe to unread notifications count
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUnreadCount(snapshot.size);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (isMockAuth) return;

    const initializeUserProfile = async () => {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      // Create user document if it doesn't exist
      if (!userSnap.exists()) {
        console.log('Creating user document for:', user.uid);
        await setDoc(userRef, {
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0] || 'Anonym',
          photoURL: user.photoURL || null,
          pricingMode: 'text',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    };

    initializeUserProfile();

    // Load user profile from Firestore
    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const userData = snapshot.data();
        setUserRole(isAllowlistedAdmin ? 'admin' : (userData.role || 'standard'));
        setUserProfile({
          displayName: userData.displayName || user.displayName || user.email?.split('@')[0] || 'Profil',
          photoURL: userData.photoURL || user.photoURL || null,
          pricingMode: userData.pricingMode || 'text'
        });
      }
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    let filtered = cards;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(c => (c.item || '').toLowerCase().includes(q) || (c.note || '').toLowerCase().includes(q) || (c.status || '').toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') filtered = filtered.filter(c => c.status === statusFilter);
    if (photoFilter === 'photo') {
      filtered = filtered.filter(c => {
        const url = c.imageUrl;
        return typeof url === 'string' ? url.trim().length > 0 : !!url;
      });
    }
    const sorted = [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'item') {
        return dir * String(a.item || '').localeCompare(String(b.item || ''));
      }
      const getValue = (card) => {
        const qty = card.quantity || 1;
        if (sortKey === 'buy') return (parseFloat(card.buy) || 0) * qty;
        if (sortKey === 'current') return (parseFloat(card.current) || 0) * qty;
        if (sortKey === 'sold') return (parseFloat(card.soldPrice) || 0) * qty;
        return 0;
      };
      return dir * (getValue(a) - getValue(b));
    });
    setFilteredCards(sorted);
  }, [cards, searchQuery, statusFilter, photoFilter, sortKey, sortDir]);

  const collectionCards = cards.filter(c => c.status === 'zbierka');
  const soldCards = cards.filter(c => c.status === 'predaná');
  const getQty = (card) => card.quantity || 1;
  const totalBuy = collectionCards.reduce((sum, c) => sum + (parseFloat(c.buy) || 0) * getQty(c), 0);
  const totalCurrent = collectionCards.reduce((sum, c) => sum + (parseFloat(c.current) || 0) * getQty(c), 0);
  const profit = totalCurrent - totalBuy;
  const totalSoldValue = soldCards.reduce((sum, c) => sum + (parseFloat(c.soldPrice) || 0) * getQty(c), 0);
  const soldProfit = totalSoldValue - soldCards.reduce((sum, c) => sum + (parseFloat(c.buy) || 0) * getQty(c), 0);
  const totalCollectionPieces = collectionCards.reduce((sum, c) => sum + getQty(c), 0);
  const totalSoldPieces = soldCards.reduce((sum, c) => sum + getQty(c), 0);
  const formatMoney = (value, options = {}) => formatCurrency(value, language, options);
  const equalColWidth = isDesktop ? '130px' : '120px';

  const handleLogout = async () => { try { await signOut(auth); } catch (err) { toast.error('Chyba pri odhlásení: ' + err.message); } };
  const toInputValue = (valueEur) => {
    if (valueEur === null || valueEur === undefined || valueEur === '') return '';
    const converted = convertFromEur(parseFloat(valueEur));
    return Number.isFinite(converted) ? String(Math.round(converted * 100) / 100) : '';
  };
  const openAddModal = () => {
    setEditingCard(null);
    setFormData({ item: '', buy: '', current: '', status: 'zbierka', note: '', imageFile: null, imageUrl: '', soldPrice: '', quantity: '1', isPublic: false });
    setShowModal(true);
  };
  const openEditModal = (card) => {
    setEditingCard(card);
    setFormData({
      item: card.item || '',
      buy: toInputValue(card.buy),
      current: toInputValue(card.current),
      status: card.status || 'zbierka',
      note: card.note || '',
      imageFile: null,
      imageUrl: card.imageUrl || '',
      soldPrice: toInputValue(card.soldPrice),
      quantity: String(card.quantity || 1),
      isPublic: !!card.isPublic
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.item.trim()) { toast.warning('Vyplň aspoň pole "Položka"'); return; }
    try {
      const quantityValue = Math.max(1, parseInt(formData.quantity, 10) || 1);
      const parseMoney = (value) => {
        const num = parseFloat(value);
        return Number.isFinite(num) ? convertToEur(num) : null;
      };
      if (isMockAuth) {
        const mockImageUrl = formData.imageFile ? URL.createObjectURL(formData.imageFile) : formData.imageUrl;
        const cardData = {
          id: editingCard?.id || createMockId(),
          item: formData.item.trim(),
          buy: parseMoney(formData.buy),
          current: parseMoney(formData.current),
          status: formData.status,
          note: formData.note.trim(),
          imageUrl: mockImageUrl,
          userId: user.uid,
          quantity: quantityValue,
          isPublic: !!formData.isPublic,
          updatedAt: new Date()
        };

        if (formData.status === 'predaná') {
          cardData.soldAt = new Date();
          cardData.soldPrice = formData.soldPrice ? parseMoney(formData.soldPrice) :
                              (formData.current ? parseMoney(formData.current) : null);
        } else if (editingCard?.status === 'predaná') {
          cardData.soldAt = null;
          cardData.soldPrice = null;
        }

        setCards(prev => {
          if (editingCard) {
            return prev.map(c => (c.id === editingCard.id ? { ...c, ...cardData } : c));
          }
          return [cardData, ...prev];
        });

        setShowModal(false);
        return;
      }

      let imageUrl = formData.imageUrl;
      if (formData.imageFile) {
        const fileRef = ref(storage, `cards/${user.uid}/${Date.now()}_${formData.imageFile.name}`);
        await uploadBytes(fileRef, formData.imageFile);
        imageUrl = await getDownloadURL(fileRef);
      }

      const cardData = {
        item: formData.item.trim(),
        buy: formData.buy ? parseMoney(formData.buy) : null,
        current: formData.current ? parseMoney(formData.current) : null,
        status: formData.status,
        note: formData.note.trim(),
        imageUrl: imageUrl,
        userId: user.uid,
        quantity: quantityValue,
        isPublic: !!formData.isPublic,
        updatedAt: serverTimestamp()
      };

      // Automaticky nastaviť soldAt a soldPrice pri zmene statusu na "predaná"
      if (formData.status === 'predaná') {
        // Ak je to nový predaj (status sa zmenil z "zbierka" na "predaná")
        const wasInCollection = editingCard && editingCard.status === 'zbierka';
        const isNewSoldCard = !editingCard && formData.status === 'predaná';

        if (wasInCollection || isNewSoldCard || !editingCard?.soldAt) {
          cardData.soldAt = serverTimestamp();
        }
        // Použiť soldPrice ak je zadaná, inak použiť current cenu
        cardData.soldPrice = formData.soldPrice ? parseMoney(formData.soldPrice) :
                            (formData.current ? parseMoney(formData.current) : null);
      } else {
        // Ak sa karta vracia do zbierky, vymazať predajné údaje
        if (editingCard && editingCard.status === 'predaná') {
          cardData.soldAt = null;
          cardData.soldPrice = null;
        }
      }

      if (editingCard) {
        await updateDoc(doc(db, 'cards', editingCard.id), cardData);
      } else {
        await addDoc(collection(db, 'cards'), { ...cardData, createdAt: serverTimestamp() });
      }
      setShowModal(false);
    } catch (err) { toast.error('Chyba pri ukladaní: ' + err.message); }
  };

  const openDeleteModal = (card) => {
    setDeleteCard(card);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteCard) return;
    try {
      if (isMockAuth) {
        setCards(prev => prev.filter(c => c.id !== deleteCard.id));
        toast.success('Karta bola zmazaná');
        setShowDeleteModal(false);
        setDeleteCard(null);
        return;
      }
      await deleteDoc(doc(db, 'cards', deleteCard.id));
      toast.success('Karta bola zmazaná');
      setShowDeleteModal(false);
      setDeleteCard(null);
    } catch (err) {
      toast.error('Chyba pri mazaní: ' + err.message);
    }
  };

  const openSellModal = (card) => {
    setSellCard(card);
    setSellPrice(card.current != null ? String(Math.round(convertFromEur(card.current) * 100) / 100) : '');
    setSellQuantity(String(card.quantity || 1));
    setShowSellModal(true);
  };

  const handleSellConfirm = async () => {
    if (!sellCard) return;

    const sellQty = Math.max(1, parseInt(sellQuantity, 10) || 1);
    const maxQty = sellCard.quantity || 1;
    if (sellQty > maxQty) {
      toast.warning(`Maximálny počet kusov na predaj je ${maxQty}`);
      return;
    }

    const finalPriceEur = sellPrice ? convertToEur(parseFloat(sellPrice)) : (sellCard.current || 0);

    try {
      if (isMockAuth) {
        setCards(prev => {
          const updated = [];
          prev.forEach(c => {
            if (c.id !== sellCard.id) {
              updated.push(c);
              return;
            }

            const remainingQty = (c.quantity || 1) - sellQty;
            if (remainingQty > 0) {
              updated.push({ ...c, quantity: remainingQty, updatedAt: new Date() });
              updated.push({
                ...c,
                id: createMockId(),
                status: 'predaná',
                quantity: sellQty,
                soldPrice: finalPriceEur,
                soldAt: new Date(),
                updatedAt: new Date()
              });
            } else {
              updated.push({ ...c, status: 'predaná', quantity: sellQty, soldPrice: finalPriceEur, soldAt: new Date(), updatedAt: new Date() });
            }
          });
          return updated;
        });
        toast.success(`Karta predaná za ${formatMoney(finalPriceEur)} (${sellQty}x)`);
        setShowSellModal(false);
        setSellCard(null);
        setSellPrice('');
        setSellQuantity('1');
        return;
      }
      if (sellQty < maxQty) {
        const remainingQty = maxQty - sellQty;
        await updateDoc(doc(db, 'cards', sellCard.id), {
          quantity: remainingQty,
          updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, 'cards'), {
          userId: sellCard.userId,
          item: sellCard.item,
          buy: sellCard.buy || null,
          current: sellCard.current || null,
          status: 'predaná',
          soldPrice: finalPriceEur,
          soldAt: serverTimestamp(),
          note: sellCard.note || '',
          imageUrl: sellCard.imageUrl || null,
          quantity: sellQty,
          isPublic: !!sellCard.isPublic,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'cards', sellCard.id), {
          status: 'predaná',
          soldPrice: finalPriceEur,
          soldAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      toast.success(`Karta predaná za ${formatMoney(finalPriceEur)} (${sellQty}x)`);
      setShowSellModal(false);
      setSellCard(null);
      setSellPrice('');
      setSellQuantity('1');
    } catch (err) {
      toast.error('Chyba pri predaji: ' + err.message);
    }
  };
  const handleFileChange = (e) => { const file = e.target.files?.[0]; if (file) setFormData({ ...formData, imageFile: file }); };

  const toggleSelectCard = (cardId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (prev.size === filteredCards.length && filteredCards.length > 0) {
        return new Set();
      }
      return new Set(filteredCards.map(c => c.id));
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const applyBulkUpdate = async ({ isPublic }) => {
    if (selectedIds.size === 0) return;
    const updates = {};
    if (typeof isPublic === 'boolean') updates.isPublic = isPublic;
    if (!Object.keys(updates).length) return;

    try {
      if (isMockAuth) {
        setCards(prev => prev.map(c => (
          selectedIds.has(c.id) ? { ...c, ...updates, updatedAt: new Date() } : c
        )));
        toast.success(`Upravené položky: ${selectedIds.size}`);
        clearSelection();
        return;
      }

      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.update(doc(db, 'cards', id), {
          ...updates,
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      toast.success(`Upravené položky: ${selectedIds.size}`);
      clearSelection();
    } catch (err) {
      toast.error('Chyba pri hromadnej úprave: ' + err.message);
    }
  };

  const styles = {
    container: { fontFamily: 'system-ui, -apple-system, Arial', padding: isDesktop ? '24px' : '12px', backgroundColor: darkMode ? '#0f172a' : '#f8fafc', color: darkMode ? '#f8fafc' : '#0f172a', minHeight: '100vh', transition: 'all 0.3s' },
    button: { padding: '10px 16px', minHeight: '44px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', transition: 'all 0.2s', fontSize: '14px', fontWeight: '500' },
    primaryButton: { background: '#1d4ed8', color: '#fff', borderColor: '#1d4ed8' }
  };
  const sellPriceValue = parseFloat(sellPrice) || 0;
  const sellQtyValue = Math.max(1, parseInt(sellQuantity, 10) || 1);
  const sellBuyValue = sellCard ? convertFromEur(sellCard.buy || 0) : 0;
  const sellProfitTotal = (sellPriceValue - sellBuyValue) * sellQtyValue;
  const sellProfitPercent = sellBuyValue > 0 ? ((sellPriceValue - sellBuyValue) / sellBuyValue * 100).toFixed(1) : '0.0';
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: isDesktop ? '26px' : '20px', flexBasis: isDesktop ? 'auto' : '100%' }}>🎯 {t('manager.title')}</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {isDesktop ? (
            <button
              onClick={() => setShowProfileEditor(true)}
              style={{ ...styles.button, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px', color: '#0f172a' }}
              title="Upraviť profil"
            >
              {userProfile.photoURL ? (
                <img src={userProfile.photoURL} alt={userProfile.displayName} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span>👤</span>
              )}
              <span style={{ fontSize: '14px' }}>
                {userProfile.displayName || user.email?.split('@')[0] || 'Profil'}
              </span>
            </button>
          ) : (
            <button
              onClick={() => setShowProfileEditor(true)}
              style={{ ...styles.button, width: '44px', height: '44px', padding: '0' }}
              title="Upraviť profil"
            >
              👤
            </button>
          )}
          <button
            onClick={() => setShowNotifications(true)}
            style={{
              ...styles.button,
              width: '44px',
              height: '44px',
              padding: '0',
              background: '#f0f9ff',
              position: 'relative'
            }}
            title="Notifikácie"
          >
            🔔
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: '#ef4444',
                color: 'white',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                border: '2px solid ' + (darkMode ? '#0f172a' : '#f8fafc')
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <LanguageSwitcher darkMode={darkMode} />
          <CurrencySwitcher darkMode={darkMode} isDesktop={isDesktop} />
          {(userRole === 'admin' || isAllowlistedAdmin) && (
            <button
              onClick={() => window.open('/admin_panel.html', '_blank')}
              style={{
                ...styles.button,
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                color: 'white',
                fontWeight: '600',
                border: 'none',
                boxShadow: '0 2px 8px rgba(251, 191, 36, 0.3)'
              }}
              title="Admin Panel"
            >
              {isDesktop ? '👑 Admin' : '👑'}
            </button>
          )}
          <button onClick={() => setDarkMode(!darkMode)} style={{ ...styles.button, width: '44px', height: '44px', padding: '0', background: '#eef2ff' }} title="Prepnúť tmavý režim">{darkMode ? '☀️' : '🌙'}</button>
          <button
            onClick={handleLogout}
            style={{ ...styles.button, border: '1px solid #fecaca', background: '#fee2e2', color: '#991b1b' }}
          >
            {isDesktop ? 'Odhlásiť' : '🚪'}
          </button>
        </div>
      </div>

      <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', borderRadius: '12px', marginBottom: '16px', overflow: 'hidden' }}>
        {isDesktop ? (
          /* Desktop: všetky stats v jednom riadku */
          <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{formatMoney(totalCurrent)}</div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>{t('manager.stats.value')}</div>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: profit >= 0 ? '#10b981' : '#ef4444' }}>{profit >= 0 ? '+' : ''}{formatMoney(profit)}</div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>{t('manager.stats.unrealized')}</div>
            </div>
            <div>
              <div style={{ fontSize: '28px', fontWeight: 'bold', color: soldProfit >= 0 ? '#10b981' : '#ef4444' }}>{soldProfit >= 0 ? '+' : ''}{formatMoney(soldProfit)}</div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>{t('manager.stats.realized')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{totalCollectionPieces}</div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>{t('manager.stats.inCollection')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{totalSoldPieces}</div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>{t('manager.stats.sold')}</div>
            </div>
          </div>
        ) : (
          /* Mobile: expandable accordion */
          <>
            <div
              onClick={() => setShowStats(!showStats)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{formatMoney(totalCurrent)}</div>
                  <div style={{ fontSize: '11px', opacity: 0.85 }}>{t('manager.stats.value')}</div>
                </div>
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: profit >= 0 ? '#10b981' : '#ef4444' }}>{profit >= 0 ? '+' : ''}{formatMoney(profit)}</div>
                  <div style={{ fontSize: '11px', opacity: 0.85 }}>{t('manager.stats.unrealized')}</div>
                </div>
              </div>
              <span style={{ fontSize: '16px', opacity: 0.8, transition: 'transform 0.2s', transform: showStats ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
            </div>
            {showStats && (
              <div style={{
                padding: '0 16px 12px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                textAlign: 'center',
                borderTop: '1px solid rgba(255,255,255,0.2)',
                paddingTop: '12px'
              }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: soldProfit >= 0 ? '#10b981' : '#ef4444' }}>{soldProfit >= 0 ? '+' : ''}{formatMoney(soldProfit)}</div>
                  <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '4px' }}>{t('manager.stats.realized')}</div>
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{totalCollectionPieces}</div>
                  <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '4px' }}>{t('manager.stats.inCollection')}</div>
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{totalSoldPieces}</div>
                  <div style={{ fontSize: '11px', opacity: 0.85, marginTop: '4px' }}>{t('manager.stats.sold')}</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Filter Bar */}
      <div style={{ marginBottom: '16px' }}>
        {isDesktop ? (
          /* Desktop: Search flex-5, ostatné flex-1 každý */
          <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
            <input
              type="text"
              placeholder={t('manager.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                ...styles.button,
                flex: 5,
                minWidth: 0,
                background: darkMode ? '#1e293b' : '#fff',
                color: darkMode ? '#f8fafc' : '#0f172a',
                fontSize: '16px'
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: 0 }}>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ ...styles.button, width: '100%', background: darkMode ? '#1e293b' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a', padding: '8px 12px', minHeight: '0', height: 'auto' }}
              >
                <option value="all">{t('manager.filter.all')}</option>
                <option value="zbierka">{t('manager.filter.collection')}</option>
                <option value="predaná">{t('manager.filter.sold')}</option>
              </select>
              <select
                value={photoFilter}
                onChange={(e) => setPhotoFilter(e.target.value)}
                style={{ ...styles.button, width: '100%', background: darkMode ? '#1e293b' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a', padding: '8px 12px', minHeight: '0', height: 'auto' }}
              >
                <option value="all">{t('manager.filter.allPhotos')}</option>
                <option value="photo">{t('manager.filter.withPhoto')}</option>
              </select>
            </div>
            <button
              onClick={openAddModal}
              style={{ ...styles.button, ...styles.primaryButton, flex: 1, minWidth: 0 }}
            >
              {t('manager.add')}
            </button>
            <div style={{
              display: 'flex',
              gap: '4px',
              flex: 1,
              minWidth: 0,
              background: darkMode ? '#334155' : '#f3f4f6',
              borderRadius: '12px',
              padding: '4px'
            }}>
          {[
            { mode: 'list', icon: '📋', title: t('manager.view.list') },
            { mode: 'cards', icon: '🏒', title: t('manager.view.tiles') },
            { mode: 'gallery', icon: '🖼️', title: t('manager.view.gallery') },
            { mode: 'table', icon: '📊', title: t('manager.view.table') }
          ].map(({ mode, icon, title }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  title={title}
                  style={{
                    flex: 1,
                    minHeight: '44px',
                    padding: '10px 2px',
                    border: 'none',
                    borderRadius: '8px',
                    background: viewMode === mode ? '#667eea' : 'transparent',
                    color: viewMode === mode ? 'white' : (darkMode ? '#f8fafc' : '#64748b'),
                    cursor: 'pointer',
                    fontSize: '16px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowPortfolioChart(!showPortfolioChart)}
              style={{
                ...styles.button,
                flex: 1,
                minWidth: 0,
                background: showPortfolioChart ? '#667eea' : darkMode ? '#334155' : '#f3f4f6',
                color: showPortfolioChart ? 'white' : darkMode ? '#f8fafc' : '#0f172a'
              }}
            >
              {showPortfolioChart ? `📉 ${t('manager.chart.hide')}` : `📈 ${t('manager.chart.show')}`}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ImportCSV onImportComplete={() => {}} />
            </div>
          </div>
        ) : (
          /* Mobile: search + add + filter toggle v prvom riadku, ostatné expandable */
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'stretch' }}>
              <input
                type="text"
                placeholder={t('manager.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  ...styles.button,
                  flex: 1,
                  minWidth: 0,
                  background: darkMode ? '#1e293b' : '#fff',
                  color: darkMode ? '#f8fafc' : '#0f172a',
                  fontSize: '16px'
                }}
              />
              <button
                onClick={openAddModal}
                style={{ ...styles.button, ...styles.primaryButton, flex: '0 0 auto', padding: '12px 16px' }}
              >
                +
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                style={{
                  ...styles.button,
                  flex: '0 0 auto',
                  background: showFilters ? '#667eea' : darkMode ? '#334155' : '#f3f4f6',
                  color: showFilters ? 'white' : darkMode ? '#f8fafc' : '#64748b',
                  padding: '12px 14px'
                }}
              >
                🔧
              </button>
            </div>
            {showFilters && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 calc(50% - 4px)' }}>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ ...styles.button, width: '100%', flex: 1, background: darkMode ? '#1e293b' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a' }}
                  >
                    <option value="all">{t('manager.filter.all')}</option>
                    <option value="zbierka">{t('manager.filter.collection')}</option>
                    <option value="predaná">{t('manager.filter.sold')}</option>
                  </select>
                  <select
                    value={photoFilter}
                    onChange={(e) => setPhotoFilter(e.target.value)}
                    style={{ ...styles.button, width: '100%', flex: 1, background: darkMode ? '#1e293b' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a' }}
                  >
                    <option value="all">{t('manager.filter.allPhotos')}</option>
                    <option value="photo">{t('manager.filter.withPhoto')}</option>
                  </select>
                </div>
                <div style={{
                  display: 'flex',
                  gap: '4px',
                  flex: '1 1 calc(50% - 4px)',
                  minWidth: 0,
                  flexWrap: 'wrap',
                  background: darkMode ? '#334155' : '#f3f4f6',
                  borderRadius: '12px',
                  padding: '4px'
                }}>
                  {[
                    { mode: 'list', icon: '📋', title: t('manager.view.list') },
                    { mode: 'cards', icon: '🏒', title: t('manager.view.tiles') },
                    { mode: 'gallery', icon: '🖼️', title: t('manager.view.gallery') },
                    { mode: 'table', icon: '📊', title: t('manager.view.table') }
                  ].map(({ mode, icon, title }) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      title={title}
                      style={{
                        flex: 1,
                        minWidth: '44px',
                        minHeight: '44px',
                        padding: '10px 8px',
                        border: 'none',
                        borderRadius: '8px',
                        background: viewMode === mode ? '#667eea' : 'transparent',
                        color: viewMode === mode ? 'white' : (darkMode ? '#f8fafc' : '#64748b'),
                        cursor: 'pointer',
                        fontSize: '18px',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowPortfolioChart(!showPortfolioChart)}
                  style={{
                    ...styles.button,
                    background: showPortfolioChart ? '#667eea' : darkMode ? '#334155' : '#f3f4f6',
                    color: showPortfolioChart ? 'white' : darkMode ? '#f8fafc' : '#0f172a',
                    flex: '1 1 calc(50% - 4px)',
                    minWidth: 0
                  }}
                >
                  {showPortfolioChart ? `📉 ${t('manager.chart.hide')}` : `📈 ${t('manager.chart.show')}`}
                </button>
                <div style={{ flex: '1 1 calc(50% - 4px)', minWidth: 0 }}>
                  <ImportCSV onImportComplete={() => {}} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Portfolio Chart - zobrazí sa pod filter barom */}
      {showPortfolioChart && (
        <div style={{ marginBottom: '16px' }}>
          <PortfolioChart user={user} darkMode={darkMode} isMockAuth={isMockAuth} />
        </div>
      )}

      {selectedIds.size > 0 && (
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          borderRadius: '12px',
          border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
          background: darkMode ? '#1e293b' : '#fff',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          alignItems: 'center'
        }}>
          <div style={{ fontWeight: '600' }}>
            {selectedIds.size}× vybrané
          </div>
          <button
            onClick={toggleSelectAll}
            style={{ ...styles.button, minHeight: '36px', padding: '8px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#334155' }}
          >
            {t('manager.bulk.selectAll')}
          </button>
          <button
            onClick={() => applyBulkUpdate({ isPublic: true })}
            style={{ ...styles.button, minHeight: '36px', padding: '8px 10px', background: '#dbeafe', border: '1px solid #93c5fd', color: '#1e3a8a' }}
          >
            {t('manager.bulk.public')}
          </button>
          <button
            onClick={() => applyBulkUpdate({ isPublic: false })}
            style={{ ...styles.button, minHeight: '36px', padding: '8px 10px', background: '#e2e8f0', border: '1px solid #cbd5e1', color: '#334155' }}
          >
            {t('manager.bulk.private')}
          </button>
        </div>
      )}

      {viewMode === 'cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {filteredCards.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#64748b' }}>{cards.length === 0 ? `📋 ${t('manager.empty')}` : `🔍 ${t('manager.noResults')}`}</div>
          ) : (
            filteredCards.map((card) => (
              <div className="card-item" key={card.id} style={{ background: darkMode ? '#1e293b' : '#fff', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(card.id)}
                    onChange={() => toggleSelectCard(card.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontSize: '12px', color: '#64748b' }}>#{card.id?.slice?.(0, 4) || ''}</span>
                </div>
                {card.imageUrl && <img src={card.imageUrl} alt="foto" style={{ width: '100%', height: '180px', objectFit: 'contain', borderRadius: '8px', cursor: 'pointer', background: darkMode ? '#0f172a' : '#f8fafc' }} onClick={(e) => { e.stopPropagation(); setImageModalUrl(card.imageUrl); }} />}
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{card.item}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                  {card.buy != null && <div><span style={{ color: '#64748b' }}>{t('manager.card.buy')}</span><div style={{ fontWeight: '600' }}>{formatMoney(card.buy)}</div></div>}
                  {card.current != null && <div><span style={{ color: '#64748b' }}>{t('manager.card.current')}</span><div style={{ fontWeight: '600' }}>{formatMoney(card.current)}</div></div>}
                  {card.status === 'predaná' && card.soldPrice != null && <div><span style={{ color: '#64748b' }}>{t('manager.card.soldFor')}</span><div style={{ fontWeight: '600' }}>{formatMoney(card.soldPrice)}</div></div>}
                  <div><span style={{ color: '#64748b' }}>{t('manager.card.quantity')}</span><div style={{ fontWeight: '600' }}>{card.quantity || 1}</div></div>
                  <div><span style={{ color: '#64748b' }}>{t('manager.card.status')}</span><div style={{ fontWeight: '600', padding: '4px 8px', borderRadius: '6px', display: 'inline-block', background: card.status === 'zbierka' ? '#d1fae5' : '#fee2e2', color: card.status === 'zbierka' ? '#065f46' : '#991b1b' }}>{card.status === 'zbierka' ? t('manager.filter.collection') : t('manager.filter.sold')}</div></div>
                </div>
                {card.note && <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>{card.note}</div>}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button onClick={() => openEditModal(card)} style={{ ...styles.button, flex: '1', background: '#eef2ff', border: '1px solid #c7d2fe', color: '#1e3a8a' }}>{t('manager.actions.edit')}</button>
                  {card.status === 'zbierka' && (
                    <button onClick={() => openSellModal(card)} style={{ ...styles.button, flex: '1', background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46' }}>{t('manager.actions.sell')}</button>
                  )}
                  <button onClick={() => openDeleteModal(card)} style={{ ...styles.button, flex: '1', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}>{t('manager.actions.delete')}</button>
                </div>
                {card.priceHistory && card.priceHistory.length > 0 && (
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}` }}>
                    <button
                      onClick={() => setSelectedCardForChart(selectedCardForChart?.id === card.id ? null : card)}
                      style={{
                        ...styles.button,
                        width: '100%',
                        background: selectedCardForChart?.id === card.id ? '#667eea' : darkMode ? '#334155' : '#f3f4f6',
                        color: selectedCardForChart?.id === card.id ? 'white' : darkMode ? '#f8fafc' : '#0f172a',
                        fontSize: '12px',
                        padding: '8px'
                      }}
                    >
                      {selectedCardForChart?.id === card.id ? `📉 ${t('manager.actions.hideChart')}` : `📈 ${t('manager.actions.showChart')}`}
                    </button>
                    {selectedCardForChart?.id === card.id && (
                      <div style={{ marginTop: '12px' }}>
                        <PriceHistoryChart priceHistory={card.priceHistory} darkMode={darkMode} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : viewMode === 'list' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredCards.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', background: darkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}` }}>{cards.length === 0 ? `📋 ${t('manager.empty')}` : `🔍 ${t('manager.noResults')}`}</div>
          ) : (
            filteredCards.map((card, idx) => (
              <div key={card.id} onClick={() => openEditModal(card)} style={{ background: darkMode ? '#1e293b' : '#fff', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', transition: 'all 0.15s' }} onMouseEnter={(e) => { e.currentTarget.style.background = darkMode ? '#334155' : '#f8fafc'; e.currentTarget.style.borderColor = darkMode ? '#475569' : '#cbd5e1'; }} onMouseLeave={(e) => { e.currentTarget.style.background = darkMode ? '#1e293b' : '#fff'; e.currentTarget.style.borderColor = darkMode ? '#334155' : '#e2e8f0'; }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(card.id)}
                  onChange={() => toggleSelectCard(card.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: '16px', height: '16px' }}
                />
                <span style={{ fontSize: '12px', color: '#64748b', minWidth: '24px' }}>{idx + 1}.</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.item}</div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {card.buy != null && <span>{t('manager.card.buy')} {formatMoney(card.buy)}</span>}
                    {card.current != null && <span style={{ fontWeight: '600', color: darkMode ? '#f8fafc' : '#0f172a' }}>{t('manager.card.current')} {formatMoney(card.current)}</span>}
                    {card.status === 'predaná' && card.soldPrice != null && <span style={{ color: '#10b981' }}>{t('manager.card.soldFor')} {formatMoney(card.soldPrice)}</span>}
                    <span>{t('manager.card.quantity')} {card.quantity || 1}</span>
                  </div>
                </div>
                <span style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: card.status === 'zbierka' ? '#d1fae5' : '#fee2e2', color: card.status === 'zbierka' ? '#065f46' : '#991b1b', whiteSpace: 'nowrap' }}>{card.status === 'zbierka' ? t('manager.filter.collection') : t('manager.filter.sold')}</span>
                <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                  {card.status === 'zbierka' && (
                    <button onClick={() => openSellModal(card)} style={{ ...styles.button, padding: '6px 10px', minHeight: '32px', fontSize: '12px', background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46' }}>💰</button>
                  )}
                  <button onClick={() => openDeleteModal(card)} style={{ ...styles.button, padding: '6px 10px', minHeight: '32px', fontSize: '12px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}>🗑️</button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : viewMode === 'gallery' ? (
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(180px, 1fr))' : 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
          {filteredCards.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#64748b', background: darkMode ? '#1e293b' : '#fff', borderRadius: '12px', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}` }}>{cards.length === 0 ? `📋 ${t('manager.empty')}` : `🔍 ${t('manager.noResults')}`}</div>
          ) : (
            filteredCards.map((card) => (
              <div
                key={card.id}
                style={{
                  background: darkMode ? '#1e293b' : '#fff',
                  border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                onClick={() => openEditModal(card)}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = darkMode ? '#667eea' : '#667eea'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = darkMode ? '#334155' : '#e2e8f0'; e.currentTarget.style.transform = 'scale(1)'; }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(card.id)}
                  onChange={() => toggleSelectCard(card.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    left: '10px',
                    width: '18px',
                    height: '18px',
                    zIndex: 3
                  }}
                />
                {card.imageUrl ? (
                  <div style={{ position: 'relative', paddingTop: '100%', background: darkMode ? '#0f172a' : '#f8fafc' }}>
                    <img
                      src={card.imageUrl}
                      alt={card.item}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain'
                      }}
                    />
                  </div>
                ) : (
                  <div style={{
                    paddingTop: '100%',
                    background: darkMode ? '#334155' : '#f1f5f9',
                    position: 'relative'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontSize: '32px',
                      opacity: 0.3
                    }}>🏒</div>
                  </div>
                )}
                <div style={{ padding: '10px' }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginBottom: '4px'
                  }}>{card.item}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: darkMode ? '#10b981' : '#059669'
                    }}>
                      {card.current != null ? `${formatCurrencyCompact((card.current || 0) * (card.quantity || 1), language)}` : '—'}
                    </span>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '9px',
                      fontWeight: '600',
                      background: card.status === 'zbierka' ? '#d1fae5' : '#fee2e2',
                      color: card.status === 'zbierka' ? '#065f46' : '#991b1b'
                    }}>{card.status === 'zbierka' ? t('manager.filter.collection') : t('manager.filter.sold')}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {!isDesktop && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '40px',
              background: `linear-gradient(to right, transparent, ${darkMode ? 'rgba(30, 41, 59, 0.9)' : 'rgba(255, 255, 255, 0.9)'})`,
              pointerEvents: 'none',
              zIndex: 5,
              borderRadius: '0 12px 12px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ fontSize: '16px', opacity: 0.6 }}>→</span>
            </div>
          )}
          <div style={{ overflow: 'auto', maxHeight: '67vh', borderRadius: '12px', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, background: darkMode ? '#1e293b' : '#fff' }}>
            <table style={{ width: '100%', minWidth: isDesktop ? 'auto' : '800px', borderCollapse: 'collapse', fontSize: '14px', background: darkMode ? '#1e293b' : '#fff' }}>
            <thead><tr style={{ background: darkMode ? '#334155' : '#f8fafc' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filteredCards.length}
                  onChange={toggleSelectAll}
                  style={{ width: '16px', height: '16px' }}
                />
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>{t('manager.table.photo')}</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>
                <button
                  onClick={() => toggleSort('item')}
                  style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: darkMode ? '#f8fafc' : '#0f172a', fontWeight: 600 }}
                >
                  {t('manager.table.item')}
                  {sortKey === 'item' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'center', width: equalColWidth, minWidth: equalColWidth, position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>
                <button
                  onClick={() => toggleSort('buy')}
                  style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: darkMode ? '#f8fafc' : '#0f172a', fontWeight: 600, width: '100%' }}
                >
                  {t('manager.table.buyPrice')} ({currency})
                  {sortKey === 'buy' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'center', width: equalColWidth, minWidth: equalColWidth, position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>
                <button
                  onClick={() => toggleSort('current')}
                  style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: darkMode ? '#f8fafc' : '#0f172a', fontWeight: 600, width: '100%' }}
                >
                  {t('manager.table.currentPrice')} ({currency})
                  {sortKey === 'current' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'center', width: equalColWidth, minWidth: equalColWidth, position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>
                <button
                  onClick={() => toggleSort('sold')}
                  style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', color: darkMode ? '#f8fafc' : '#0f172a', fontWeight: 600, width: '100%' }}
                >
                  {t('manager.table.soldPrice')} ({currency})
                  {sortKey === 'sold' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </button>
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'center', width: equalColWidth, minWidth: equalColWidth, position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>{t('manager.table.quantity')}</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', width: equalColWidth, minWidth: equalColWidth, position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>{t('manager.table.status')}</th>
              <th style={{ padding: '10px 12px', textAlign: 'center', width: equalColWidth, minWidth: equalColWidth, position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>{t('manager.table.actions')}</th>
            </tr></thead>
            <tbody>
              {filteredCards.length === 0 ? (
                <tr><td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>{cards.length === 0 ? `📋 ${t('manager.empty')}` : `🔍 ${t('manager.noResults')}`}</td></tr>
              ) : (
                filteredCards.map((card, idx) => (
                  <tr key={card.id} onClick={() => openEditModal(card)} style={{ borderBottom: `1px solid ${darkMode ? '#334155' : '#f1f5f9'}`, cursor: 'pointer', transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = darkMode ? '#334155' : '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 12px' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(card.id)}
                        onChange={() => toggleSelectCard(card.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={{ padding: '10px 12px' }}>{card.imageUrl ? <img src={card.imageUrl} alt="foto" style={{ width: '56px', height: '56px', objectFit: 'contain', borderRadius: '10px', border: '1px solid #e5e7eb', background: darkMode ? '#0f172a' : '#f8fafc' }} onClick={(e) => { e.stopPropagation(); setImageModalUrl(card.imageUrl); }} /> : <span style={{ color: '#64748b' }}>—</span>}</td>
                    <td style={{ padding: '10px 12px' }}>{card.item}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', width: equalColWidth, minWidth: equalColWidth }}>{card.buy != null ? formatMoney(card.buy) : ''}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', width: equalColWidth, minWidth: equalColWidth }}>
                      {card.current != null ? (
                        <span>
                          {formatMoney(card.current)}
                          {card.ebayPriceSource && (
                            <span style={{ marginLeft: '6px', fontSize: '14px' }} title="Cena z eBay">📊</span>
                          )}
                        </span>
                      ) : ''}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', width: equalColWidth, minWidth: equalColWidth }}>{card.status === 'predaná' && card.soldPrice != null ? formatMoney(card.soldPrice) : ''}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', width: equalColWidth, minWidth: equalColWidth }}>{card.quantity || 1}</td>
                    <td style={{ padding: '10px 12px', width: equalColWidth, minWidth: equalColWidth, textAlign: 'center' }}>
                      <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', background: card.status === 'zbierka' ? '#d1fae5' : '#fee2e2', color: card.status === 'zbierka' ? '#065f46' : '#991b1b' }}>{card.status === 'zbierka' ? t('manager.filter.collection') : t('manager.filter.sold')}</span>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', width: equalColWidth, minWidth: equalColWidth, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      {card.status === 'zbierka' && (
                        <button onClick={() => openSellModal(card)} style={{ ...styles.button, background: '#d1fae5', border: '1px solid #6ee7b7', color: '#065f46', marginRight: '5px', padding: '8px 12px', minHeight: '36px' }}>💰</button>
                      )}
                      <button onClick={() => openDeleteModal(card)} style={{ ...styles.button, background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', padding: '8px 12px', minHeight: '36px' }}>🗑️</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: isDesktop ? '20px' : '12px' }} onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ background: darkMode ? '#1e293b' : 'white', color: darkMode ? '#f8fafc' : '#0f172a', borderRadius: '16px', width: '100%', maxWidth: isDesktop ? '680px' : '100%', maxHeight: isDesktop ? 'none' : 'calc(100vh - 24px)', overflowY: isDesktop ? 'visible' : 'auto', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)' }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: isDesktop ? '16px 24px' : '14px 16px', borderBottom: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '18px' }}>{editingCard ? t('manager.modal.edit') : t('manager.modal.add')}</strong>
              <button onClick={() => setShowModal(false)} style={{ background: darkMode ? '#334155' : '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', color: darkMode ? '#94a3b8' : '#64748b', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ padding: isDesktop ? '20px 24px' : '16px', display: 'flex', flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? '20px' : '16px' }}>
                {/* Left side - Image */}
                <div style={{ flex: isDesktop ? '0 0 160px' : 'none' }}>
                  {(formData.imageUrl || formData.imageFile) ? (
                    <div style={{ position: 'relative' }}>
                      <img
                        src={formData.imageFile ? URL.createObjectURL(formData.imageFile) : formData.imageUrl}
                        alt="Preview"
                        style={{ width: isDesktop ? '160px' : '100%', height: isDesktop ? '160px' : '180px', objectFit: 'contain', borderRadius: '12px', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, background: darkMode ? '#0f172a' : '#f8fafc' }}
                      />
                      <label style={{ position: 'absolute', bottom: '8px', right: '8px', background: darkMode ? '#334155' : 'white', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                        📷 {t('manager.modal.changePhoto')}
                        <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                      </label>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: isDesktop ? '160px' : '100%', height: isDesktop ? '160px' : '100px', border: `2px dashed ${darkMode ? '#334155' : '#cbd5e1'}`, borderRadius: '12px', cursor: 'pointer', background: darkMode ? '#0f172a' : '#f8fafc', transition: 'all 0.2s' }}>
                      <span style={{ fontSize: '28px', opacity: 0.5 }}>📷</span>
                      <span style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>{t('manager.modal.addPhoto')}</span>
                      <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                    </label>
                  )}
                </div>

                {/* Right side - Form fields */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
                  {/* Item name */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: darkMode ? '#94a3b8' : '#64748b', display: 'block', marginBottom: '6px' }}>{t('manager.modal.item')} *</label>
                    <input type="text" value={formData.item} onChange={(e) => setFormData({ ...formData, item: e.target.value })} placeholder="napr. 2005 Upper Deck Young Guns #201 Crosby PSA 10" required style={{ ...styles.button, width: '100%', boxSizing: 'border-box', padding: '12px 14px', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a', fontSize: '14px' }} />
                  </div>

                  {/* Status + Buy price row */}
                  <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '14px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: darkMode ? '#94a3b8' : '#64748b', display: 'block', marginBottom: '6px' }}>{t('manager.modal.status')}</label>
                      <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} style={{ ...styles.button, width: '100%', boxSizing: 'border-box', padding: '12px 14px', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a', fontSize: '14px' }}><option value="zbierka">{t('manager.filter.collection')}</option><option value="predaná">{t('manager.filter.sold')}</option></select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: darkMode ? '#94a3b8' : '#64748b', display: 'block', marginBottom: '6px' }}>{t('manager.modal.buyPrice')} ({currency})</label>
                      <input type="number" step="0.01" min="0" value={formData.buy} onChange={(e) => setFormData({ ...formData, buy: e.target.value })} placeholder={currency} style={{ ...styles.button, width: '100%', boxSizing: 'border-box', padding: '12px 14px', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a', fontSize: '14px' }} />
                    </div>
                  </div>

                  {/* Current price + Sold price row */}
                  <div style={{ display: 'grid', gridTemplateColumns: (formData.status === 'predaná' && isDesktop) ? '1fr 1fr' : '1fr', gap: '14px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: darkMode ? '#94a3b8' : '#64748b', display: 'block', marginBottom: '6px' }}>
                        {t('manager.modal.currentPrice')} ({currency})
                        {editingCard && editingCard.ebayPriceSource && <span style={{ marginLeft: '6px', color: '#10b981' }}>📊</span>}
                      </label>
                      <input type="number" step="0.01" min="0" value={formData.current} onChange={(e) => setFormData({ ...formData, current: e.target.value })} placeholder={currency} style={{ ...styles.button, width: '100%', boxSizing: 'border-box', padding: '12px 14px', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a', fontSize: '14px' }} />
                    </div>
                    {formData.status === 'predaná' && (
                      <div>
                        <label style={{ fontSize: '12px', fontWeight: '600', color: '#10b981', display: 'block', marginBottom: '6px' }}>{t('manager.modal.soldPrice')} ({currency})</label>
                        <input type="number" step="0.01" min="0" value={formData.soldPrice} onChange={(e) => setFormData({ ...formData, soldPrice: e.target.value })} placeholder={formData.current || currency} style={{ ...styles.button, width: '100%', boxSizing: 'border-box', padding: '12px 14px', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a', fontSize: '14px', borderColor: '#10b981' }} />
                      </div>
                    )}
                  </div>

                  {/* Quantity + Public row */}
                  <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: '14px' }}>
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: '600', color: darkMode ? '#94a3b8' : '#64748b', display: 'block', marginBottom: '6px' }}>{t('manager.modal.quantity')}</label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                        placeholder="1"
                        style={{ ...styles.button, width: '100%', boxSizing: 'border-box', padding: '12px 14px', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a', fontSize: '14px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                      <input
                        type="checkbox"
                        checked={!!formData.isPublic}
                        onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                        style={{ width: '18px', height: '18px' }}
                      />
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: darkMode ? '#f8fafc' : '#0f172a' }}>{t('manager.modal.public')}</div>
                        <div style={{ fontSize: '11px', color: darkMode ? '#94a3b8' : '#64748b' }}>{t('manager.modal.publicHint')}</div>
                      </div>
                    </div>
                  </div>

                  {/* Note */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: '600', color: darkMode ? '#94a3b8' : '#64748b', display: 'block', marginBottom: '6px' }}>{t('manager.modal.note')}</label>
                    <input type="text" value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} placeholder={t('manager.modal.notePlaceholder')} style={{ ...styles.button, width: '100%', boxSizing: 'border-box', padding: '12px 14px', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a', fontSize: '14px' }} />
                  </div>
                </div>
              </div>

              {/* Price History Chart - compact */}
              {editingCard && editingCard.priceHistory && editingCard.priceHistory.length > 0 && (
                <div style={{ padding: '0 24px 16px', borderTop: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, marginTop: '0', paddingTop: '16px' }}>
                  <PriceHistoryChart priceHistory={editingCard.priceHistory} darkMode={darkMode} compact />
                </div>
              )}

              {/* Footer */}
              <div style={{ padding: isDesktop ? '14px 24px' : '12px 16px', borderTop: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, display: 'flex', gap: '12px', justifyContent: 'flex-end', background: darkMode ? '#0f172a' : '#f8fafc', borderRadius: '0 0 16px 16px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    ...styles.button,
                    padding: '12px 24px',
                    background: darkMode ? '#334155' : '#f1f5f9',
                    color: darkMode ? '#f8fafc' : '#334155',
                    border: `1px solid ${darkMode ? '#475569' : '#cbd5e1'}`
                  }}
                >
                  {t('manager.modal.cancel')}
                </button>
                <button type="submit" style={{ ...styles.button, ...styles.primaryButton, padding: '12px 28px' }}>{t('manager.modal.save')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNotifications && (
        <NotificationPanel
          user={user}
          darkMode={darkMode}
          isMockAuth={isMockAuth}
          mockNotifications={mockNotifications}
          onClose={() => setShowNotifications(false)}
        />
      )}

      {showProfileEditor && (
        <ProfileEditor
          user={{ ...user, displayName: userProfile.displayName, photoURL: userProfile.photoURL, pricingMode: userProfile.pricingMode }}
          isOpen={showProfileEditor}
          isMockAuth={isMockAuth}
          onClose={() => setShowProfileEditor(false)}
          onUpdate={(newProfile) => {
            setUserProfile(newProfile);
          }}
        />
      )}

      {/* Sell Modal */}
      {showSellModal && sellCard && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }} onClick={() => setShowSellModal(false)}>
          <div style={{
            background: darkMode ? '#1e293b' : 'white',
            color: darkMode ? '#f8fafc' : '#0f172a',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>{t('manager.sell.title')}</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>{t('manager.sell.subtitle')}</p>
              </div>
              <button
                onClick={() => setShowSellModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: darkMode ? '#94a3b8' : '#64748b',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '20px' }}>
              <div style={{
                background: darkMode ? '#334155' : '#f8fafc',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '4px' }}>{sellCard.item}</div>
                <div style={{ fontSize: '13px', color: '#64748b' }}>
                  {t('manager.sell.buyPrice')} {formatMoney(sellCard.buy || 0)}
                </div>
                {sellCard.current && (
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    {t('manager.sell.currentValue')} {formatMoney(sellCard.current)}
                  </div>
                )}
              </div>

              <label style={{ fontSize: '14px', fontWeight: '500', color: darkMode ? '#cbd5e1' : '#475569', display: 'block', marginBottom: '8px' }}>
                {t('manager.sell.priceLabel')} ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                placeholder={t('manager.sell.pricePlaceholder')}
                autoFocus
                style={{
                  ...styles.button,
                  width: '100%',
                  boxSizing: 'border-box',
                  background: darkMode ? '#334155' : '#fff',
                  color: darkMode ? '#f8fafc' : '#0f172a',
                  fontSize: '18px',
                  fontWeight: '600',
                  textAlign: 'center',
                  padding: '16px'
                }}
              />

              <div style={{ marginTop: '12px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500', color: darkMode ? '#cbd5e1' : '#475569', display: 'block', marginBottom: '6px' }}>
                {t('manager.sell.quantityLabel')} ({t('manager.sell.quantityHint')} {sellCard.quantity || 1})
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max={sellCard.quantity || 1}
                value={sellQuantity}
                onChange={(e) => setSellQuantity(e.target.value)}
                  style={{
                    ...styles.button,
                    width: '100%',
                    boxSizing: 'border-box',
                    background: darkMode ? '#334155' : '#fff',
                    color: darkMode ? '#f8fafc' : '#0f172a',
                    fontSize: '16px',
                    fontWeight: '600',
                    textAlign: 'center',
                    padding: '12px'
                  }}
                />
              </div>

              {sellPrice && sellCard.buy != null && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: sellPriceValue >= sellBuyValue ? '#d1fae5' : '#fee2e2',
                  color: sellPriceValue >= sellBuyValue ? '#065f46' : '#991b1b',
                  fontSize: '14px',
                  fontWeight: '600',
                  textAlign: 'center'
                }}>
                  {sellPriceValue >= sellBuyValue ? '📈' : '📉'} {t('manager.sell.profitLoss')} {formatMoney(convertToEur(sellProfitTotal))}
                  <span style={{ fontWeight: '400', marginLeft: '8px' }}>
                    ({sellProfitPercent}%)
                  </span>
                </div>
              )}

              {sellPrice && (
                <div style={{
                  marginTop: '10px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: darkMode ? '#94a3b8' : '#64748b'
                }}>
                  {t('manager.sell.totalLabel')}: {formatMoney(convertToEur(sellPriceValue * sellQtyValue))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={() => setShowSellModal(false)}
                style={{
                  ...styles.button,
                  flex: 1,
                  background: darkMode ? '#334155' : '#f1f5f9',
                  color: darkMode ? '#f8fafc' : '#475569'
                }}
              >
                {t('manager.modal.cancel')}
              </button>
              <button
                onClick={handleSellConfirm}
                style={{
                  ...styles.button,
                  flex: 1,
                  background: '#10b981',
                  color: 'white',
                  border: '1px solid #10b981',
                  fontWeight: '600'
                }}
              >
                {t('manager.sell.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && deleteCard && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }} onClick={() => setShowDeleteModal(false)}>
          <div style={{
            background: darkMode ? '#1e293b' : 'white',
            color: darkMode ? '#f8fafc' : '#0f172a',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '400px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#ef4444' }}>{t('manager.delete.title')}</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>{t('manager.delete.subtitle')}</p>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: darkMode ? '#94a3b8' : '#64748b',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px'
                }}
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '20px' }}>
              <div style={{
                background: darkMode ? '#334155' : '#fef2f2',
                borderRadius: '12px',
                padding: '16px',
                border: `1px solid ${darkMode ? '#475569' : '#fecaca'}`
              }}>
                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>{deleteCard.item}</div>
                <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {deleteCard.buy != null && <span>{t('manager.card.buy')} {formatMoney(deleteCard.buy)}</span>}
                  {deleteCard.current != null && <span>{t('manager.card.current')} {formatMoney(deleteCard.current)}</span>}
                </div>
              </div>
              <p style={{ margin: '16px 0 0 0', fontSize: '14px', color: darkMode ? '#94a3b8' : '#64748b', textAlign: 'center' }}>
                {t('manager.delete.warning')}
              </p>
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
              display: 'flex',
              gap: '12px'
            }}>
              <button
                onClick={() => setShowDeleteModal(false)}
                style={{
                  ...styles.button,
                  flex: 1,
                  background: darkMode ? '#334155' : '#f1f5f9',
                  color: darkMode ? '#f8fafc' : '#475569'
                }}
              >
                {t('manager.modal.cancel')}
              </button>
              <button
                onClick={handleDeleteConfirm}
                style={{
                  ...styles.button,
                  flex: 1,
                  background: '#ef4444',
                  color: 'white',
                  border: '1px solid #ef4444',
                  fontWeight: '600'
                }}
              >
                {t('manager.delete.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal */}
      {imageModalUrl && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px'
          }}
          onClick={() => setImageModalUrl(null)}
        >
          <button
            onClick={() => setImageModalUrl(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '48px',
              height: '48px',
              fontSize: '24px',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
          <img
            src={imageModalUrl}
            alt="Zväčšený obrázok"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '8px'
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default CardManager;
