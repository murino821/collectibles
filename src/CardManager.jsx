import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db, storage } from './firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, orderBy, limit, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import ImportCSV from './assets/components/ImportCSV';
import NotificationPanel from './assets/components/NotificationPanel';
import PortfolioChart from './assets/components/PortfolioChart';
import PriceHistoryChart from './assets/components/PriceHistoryChart';
import ProfileEditor from './assets/components/ProfileEditor';
import LanguageSwitcher from './assets/components/LanguageSwitcher';
import { useToast } from './assets/components/Toast';

function CardManager({ user }) {
  const toast = useToast();
  const [cards, setCards] = useState([]);
  const [filteredCards, setFilteredCards] = useState([]);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });
  const [showModal, setShowModal] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [photoFilter, setPhotoFilter] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const [isMobile, setIsMobile] = useState(false);
  const [formData, setFormData] = useState({ item: '', buy: '', current: '', sell: '', status: 'zbierka', note: '', imageFile: null, imageUrl: '', soldPrice: '' });
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPortfolioChart, setShowPortfolioChart] = useState(false);
  const [selectedCardForChart, setSelectedCardForChart] = useState(null);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [userProfile, setUserProfile] = useState({ displayName: user.displayName, photoURL: user.photoURL });
  const [userRole, setUserRole] = useState('standard');
  const [cardLimit, setCardLimit] = useState(20);
  const [currentCardCount, setCurrentCardCount] = useState(0);

  // Persist dark mode to localStorage
  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setViewMode('cards');
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load user data (role, limits)
  useEffect(() => {
    if (!user) return;

    const loadUserData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserRole(userData.role || 'standard');
          setCardLimit(userData.cardLimit || 20);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };

    loadUserData();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'cards'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const cardsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCards(cardsData);

      // Count cards in collection
      const collectionCount = cardsData.filter(c => c.status === 'zbierka').length;
      setCurrentCardCount(collectionCount);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
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
        setUserProfile({
          displayName: userData.displayName || user.displayName || 'Anonym',
          photoURL: userData.photoURL || user.photoURL || null
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
    if (photoFilter) filtered = filtered.filter(c => c.imageUrl);
    setFilteredCards(filtered);
  }, [cards, searchQuery, statusFilter, photoFilter]);

  const collectionCards = cards.filter(c => c.status === 'zbierka');
  const totalBuy = collectionCards.reduce((sum, c) => sum + (parseFloat(c.buy) || 0), 0);
  const totalCurrent = collectionCards.reduce((sum, c) => sum + (parseFloat(c.current) || 0), 0);
  const profit = totalCurrent - totalBuy;
  const fmt = (n) => (n === null || n === undefined || n === '') ? '' : Number(n).toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleLogout = async () => { try { await signOut(auth); } catch (err) { toast.error('Chyba pri odhlásení: ' + err.message); } };
  const openAddModal = () => { setEditingCard(null); setFormData({ item: '', buy: '', current: '', sell: '', status: 'zbierka', note: '', imageFile: null, imageUrl: '', soldPrice: '' }); setShowModal(true); };
  const openEditModal = (card) => { setEditingCard(card); setFormData({ item: card.item || '', buy: card.buy || '', current: card.current || '', sell: card.sell || '', status: card.status || 'zbierka', note: card.note || '', imageFile: null, imageUrl: card.imageUrl || '', soldPrice: card.soldPrice || '' }); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.item.trim()) { toast.warning('Vyplň aspoň pole "Položka"'); return; }
    try {
      let imageUrl = formData.imageUrl;
      if (formData.imageFile) {
        const fileRef = ref(storage, `cards/${user.uid}/${Date.now()}_${formData.imageFile.name}`);
        await uploadBytes(fileRef, formData.imageFile);
        imageUrl = await getDownloadURL(fileRef);
      }

      const cardData = {
        item: formData.item.trim(),
        buy: formData.buy ? parseFloat(formData.buy) : null,
        current: formData.current ? parseFloat(formData.current) : null,
        sell: formData.sell ? parseFloat(formData.sell) : null,
        status: formData.status,
        note: formData.note.trim(),
        imageUrl: imageUrl,
        userId: user.uid,
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
        // Použiť soldPrice ak je zadaná, inak použiť sell alebo current cenu
        cardData.soldPrice = formData.soldPrice ? parseFloat(formData.soldPrice) :
                            (formData.sell ? parseFloat(formData.sell) :
                            (formData.current ? parseFloat(formData.current) : null));
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

  const handleDelete = async (cardId) => { if (!confirm('Naozaj chceš zmazať túto kartu?')) return; try { await deleteDoc(doc(db, 'cards', cardId)); toast.success('Karta bola zmazaná'); } catch (err) { toast.error('Chyba pri mazaní: ' + err.message); } };
  const handleFileChange = (e) => { const file = e.target.files?.[0]; if (file) setFormData({ ...formData, imageFile: file }); };

  const styles = {
    container: { fontFamily: 'system-ui, -apple-system, Arial', padding: isMobile ? '12px' : '24px', backgroundColor: darkMode ? '#0f172a' : '#f8fafc', color: darkMode ? '#f8fafc' : '#0f172a', minHeight: '100vh', transition: 'all 0.3s' },
    button: { padding: '10px 16px', minHeight: '44px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', transition: 'all 0.2s', fontSize: '14px', fontWeight: '500' },
    primaryButton: { background: '#1d4ed8', color: '#fff', borderColor: '#1d4ed8' }
  };

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ margin: 0, fontSize: isMobile ? '20px' : '26px', flexBasis: isMobile ? '100%' : 'auto' }}>🎯 Moja zbierka</h1>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          {!isMobile && (
            <button
              onClick={() => setShowProfileEditor(true)}
              style={{ ...styles.button, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Upraviť profil"
            >
              {userProfile.photoURL ? (
                <img src={userProfile.photoURL} alt={userProfile.displayName} style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <span>👤</span>
              )}
              <span style={{ fontSize: '14px' }}>{userProfile.displayName}</span>
            </button>
          )}
          {isMobile && (
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
          {userRole === 'admin' && (
            <button
              onClick={() => window.location.href = '/admin_panel.html'}
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
              {isMobile ? '👑' : '👑 Admin'}
            </button>
          )}
          <button onClick={() => setDarkMode(!darkMode)} style={{ ...styles.button, width: '44px', height: '44px', padding: '0', background: '#eef2ff' }} title="Prepnúť tmavý režim">{darkMode ? '☀️' : '🌙'}</button>
          <button onClick={handleLogout} style={{ ...styles.button, border: '1px solid #fecaca', background: '#fee2e2', color: '#991b1b' }}>{isMobile ? '🚪' : 'Odhlásiť'}</button>
        </div>
      </div>

      <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', padding: isMobile ? '12px' : '16px', borderRadius: '12px', marginBottom: '16px' }}>
        {/* User Role Badge */}
        <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '11px',
            fontWeight: '600',
            textTransform: 'uppercase',
            background: userRole === 'admin' ? '#fef3c7' : userRole === 'premium' ? '#fef3c7' : '#e0e7ff',
            color: userRole === 'admin' ? '#92400e' : userRole === 'premium' ? '#92400e' : '#3730a3',
            letterSpacing: '0.5px'
          }}>
            {userRole === 'admin' ? '👑 ADMIN' : userRole === 'premium' ? '⭐ PREMIUM' : '👤 STANDARD'}
          </span>
          <span style={{
            fontSize: '12px',
            opacity: 0.9,
            background: 'rgba(255,255,255,0.2)',
            padding: '4px 10px',
            borderRadius: '999px'
          }}>
            {currentCardCount}/{cardLimit === 999999 ? '∞' : cardLimit} položiek
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '16px', textAlign: 'center' }}>
          <div><div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold' }}>{collectionCards.length}</div><div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px' }}>Počet položiek</div></div>
          <div><div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold' }}>{fmt(totalCurrent)} €</div><div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px' }}>Hodnota</div></div>
          <div><div style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold', color: profit >= 0 ? '#10b981' : '#ef4444' }}>{fmt(profit)} €</div><div style={{ fontSize: '12px', opacity: 0.9, marginTop: '4px' }}>Zisk/Strata</div></div>
        </div>
      </div>

      {/* Portfolio Chart Section */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '16px',
            fontWeight: '600',
            color: darkMode ? '#f8fafc' : '#0f172a'
          }}>
            Vývoj portfólia
          </h3>
          <button
            onClick={() => setShowPortfolioChart(!showPortfolioChart)}
            style={{
              ...styles.button,
              background: showPortfolioChart ? '#667eea' : darkMode ? '#334155' : '#f3f4f6',
              color: showPortfolioChart ? 'white' : darkMode ? '#f8fafc' : '#0f172a',
              fontSize: '13px',
              padding: '6px 12px'
            }}
          >
            {showPortfolioChart ? '📉 Skryť graf' : '📈 Zobraziť graf'}
          </button>
        </div>

        {showPortfolioChart && (
          <PortfolioChart user={user} darkMode={darkMode} />
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px', whiteSpace: 'nowrap' }}><input type="checkbox" checked={photoFilter} onChange={(e) => setPhotoFilter(e.target.checked)} />s fotkou</label>
        <input type="text" placeholder="Hľadať..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ ...styles.button, flex: '1 1 200px', minWidth: '150px', background: darkMode ? '#1e293b' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a' }} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...styles.button, background: darkMode ? '#1e293b' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a' }}><option value="all">všetko</option><option value="zbierka">zbierka</option><option value="predaná">predaná</option></select>
        <div style={{ display: 'flex', gap: '10px', marginLeft: isMobile ? '0' : 'auto', flexBasis: isMobile ? '100%' : 'auto' }}>
          <ImportCSV onImportComplete={() => {}} />
          <button onClick={openAddModal} style={{ ...styles.button, ...styles.primaryButton, flex: isMobile ? '1' : 'none' }}>+ Pridať</button>
        </div>
        {!isMobile && <button onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')} style={{ ...styles.button, background: '#f3f4f6' }}>{viewMode === 'table' ? '🃏' : '📊'}</button>}
      </div>

      {viewMode === 'cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {filteredCards.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: '#64748b' }}>{cards.length === 0 ? '📋 Zatiaľ žiadne karty' : '🔍 Žiadne výsledky'}</div>
          ) : (
            filteredCards.map((card) => (
              <div key={card.id} style={{ background: darkMode ? '#1e293b' : '#fff', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {card.imageUrl && <img src={card.imageUrl} alt="foto" style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer' }} onClick={() => window.open(card.imageUrl, '_blank')} />}
                <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{card.item}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                  {card.buy != null && <div><span style={{ color: '#64748b' }}>Nákup:</span><div style={{ fontWeight: '600' }}>{fmt(card.buy)} €</div></div>}
                  {card.current != null && <div><span style={{ color: '#64748b' }}>Aktuálna:</span><div style={{ fontWeight: '600' }}>{fmt(card.current)} €</div></div>}
                  {card.sell != null && <div><span style={{ color: '#64748b' }}>Predajná:</span><div style={{ fontWeight: '600' }}>{fmt(card.sell)} €</div></div>}
                  <div><span style={{ color: '#64748b' }}>Stav:</span><div style={{ fontWeight: '600' }}>{card.status}</div></div>
                </div>
                {card.note && <div style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>{card.note}</div>}
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button onClick={() => openEditModal(card)} style={{ ...styles.button, flex: '1', background: '#eef2ff', border: '1px solid #c7d2fe', color: '#1e3a8a' }}>Upraviť</button>
                  <button onClick={() => handleDelete(card.id)} style={{ ...styles.button, flex: '1', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}>Zmazať</button>
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
                      {selectedCardForChart?.id === card.id ? '📉 Skryť graf' : '📈 Zobraziť vývoj ceny'}
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
      ) : (
        <div style={{ overflow: 'auto', maxHeight: '67vh', borderRadius: '12px', border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, background: darkMode ? '#1e293b' : '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', background: darkMode ? '#1e293b' : '#fff' }}>
            <thead><tr style={{ background: darkMode ? '#334155' : '#f8fafc' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>#</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>Foto</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>Položka</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>Nákupná (€)</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>Aktuálna (€)</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>Predajná (€)</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>Stav</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', position: 'sticky', top: 0, background: darkMode ? '#334155' : '#f8fafc', zIndex: 10 }}>Akcie</th>
            </tr></thead>
            <tbody>
              {filteredCards.length === 0 ? (
                <tr><td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>{cards.length === 0 ? '📋 Zatiaľ žiadne karty' : '🔍 Žiadne výsledky'}</td></tr>
              ) : (
                filteredCards.map((card, idx) => (
                  <tr key={card.id} style={{ borderBottom: `1px solid ${darkMode ? '#334155' : '#f1f5f9'}` }}>
                    <td style={{ padding: '10px 12px' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 12px' }}>{card.imageUrl ? <img src={card.imageUrl} alt="foto" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '10px', border: '1px solid #e5e7eb', cursor: 'pointer' }} onClick={() => window.open(card.imageUrl, '_blank')} /> : <span style={{ color: '#64748b' }}>—</span>}</td>
                    <td style={{ padding: '10px 12px' }}>{card.item}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{card.buy != null ? fmt(card.buy) : ''}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {card.current != null ? (
                        <span>
                          {fmt(card.current)}
                          {card.ebayPriceSource && (
                            <span style={{ marginLeft: '6px', fontSize: '14px' }} title="Cena z eBay">📊</span>
                          )}
                        </span>
                      ) : ''}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{card.sell != null ? fmt(card.sell) : ''}</td>
                    <td style={{ padding: '10px 12px' }}>{card.status}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEditModal(card)} style={{ ...styles.button, background: '#eef2ff', border: '1px solid #c7d2fe', color: '#1e3a8a', marginRight: '5px', padding: '8px 12px', minHeight: '36px' }}>Upraviť</button>
                      <button onClick={() => handleDelete(card.id)} style={{ ...styles.button, background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', padding: '8px 12px', minHeight: '36px' }}>Zmazať</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px', overflowY: 'auto' }} onClick={() => setShowModal(false)}>
          <div style={{ background: darkMode ? '#1e293b' : 'white', color: darkMode ? '#f8fafc' : '#0f172a', borderRadius: '16px', width: '100%', maxWidth: '720px', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: darkMode ? '#1e293b' : 'white', zIndex: 10 }}>
              <strong style={{ fontSize: '18px' }}>{editingCard ? 'Upraviť položku' : 'Pridať položku'}</strong>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: darkMode ? '#f8fafc' : '#0f172a', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '16px' }}>
                  <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'block', marginBottom: '6px' }}>Položka *</label>
                    <input type="text" value={formData.item} onChange={(e) => setFormData({ ...formData, item: e.target.value })} placeholder="napr. 2005 Upper Deck Young Guns #201 Crosby PSA 10" required style={{ ...styles.button, width: '100%', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'block', marginBottom: '6px' }}>Stav</label>
                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} style={{ ...styles.button, width: '100%', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a' }}><option value="zbierka">zbierka</option><option value="predaná">predaná</option></select>
                  </div>
                  <div>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'block', marginBottom: '6px' }}>Nákupná cena (€)</label>
                    <input type="number" step="0.01" min="0" value={formData.buy} onChange={(e) => setFormData({ ...formData, buy: e.target.value })} style={{ ...styles.button, width: '100%', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'block', marginBottom: '6px' }}>
                      Aktuálna cena (€)
                      {editingCard && editingCard.ebayPriceSource && (
                        <span style={{ marginLeft: '8px', fontSize: '12px', color: '#10b981', fontWeight: '600' }} title="Cena aktualizovaná z eBay">
                          📊 eBay
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.current}
                      onChange={(e) => setFormData({ ...formData, current: e.target.value })}
                      placeholder="Zadaj manuálne alebo nechaj aktualizovať z eBay"
                      style={{ ...styles.button, width: '100%', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'block', marginBottom: '6px' }}>Očakávaná predajná cena (€)</label>
                    <input type="number" step="0.01" min="0" value={formData.sell} onChange={(e) => setFormData({ ...formData, sell: e.target.value })} style={{ ...styles.button, width: '100%', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a' }} />
                  </div>
                  {formData.status === 'predaná' && (
                    <div>
                      <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'block', marginBottom: '6px' }}>
                        Skutočná predajná cena (€)
                        <span style={{ marginLeft: '6px', fontSize: '11px', color: '#10b981' }}>realizovaná</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.soldPrice}
                        onChange={(e) => setFormData({ ...formData, soldPrice: e.target.value })}
                        placeholder={formData.sell || formData.current || 'Zadaj skutočnú predajnú cenu'}
                        style={{ ...styles.button, width: '100%', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a', borderColor: '#10b981' }}
                      />
                    </div>
                  )}
                  <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
                    <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'block', marginBottom: '6px' }}>Poznámka</label>
                    <input type="text" value={formData.note} onChange={(e) => setFormData({ ...formData, note: e.target.value })} placeholder="voliteľné" style={{ ...styles.button, width: '100%', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a' }} />
                  </div>
                </div>
                <div style={{ marginTop: '16px' }}>
                  <label style={{ fontSize: '14px', fontWeight: '500', color: '#475569', display: 'block', marginBottom: '6px' }}>Fotografia (JPG/PNG)</label>
                  <input type="file" accept="image/*" onChange={handleFileChange} style={{ ...styles.button, width: '100%', background: darkMode ? '#334155' : '#fff', color: darkMode ? '#f8fafc' : '#0f172a' }} />
                  {(formData.imageUrl || formData.imageFile) && (
                    <div style={{ marginTop: '12px' }}>
                      {formData.imageUrl && !formData.imageFile && <img src={formData.imageUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '12px', border: '1px solid #e5e7eb' }} />}
                      {formData.imageFile && <div style={{ fontSize: '14px', color: '#64748b' }}>📎 {formData.imageFile.name}</div>}
                    </div>
                  )}
                </div>

                {/* Price History Chart for editing card */}
                {editingCard && editingCard.priceHistory && editingCard.priceHistory.length > 0 && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}` }}>
                    <PriceHistoryChart priceHistory={editingCard.priceHistory} darkMode={darkMode} />
                  </div>
                )}
              </div>
              <div style={{ padding: '16px 20px', borderTop: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`, display: 'flex', gap: '10px', justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: darkMode ? '#1e293b' : 'white' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ ...styles.button, flex: isMobile ? '1' : 'none' }}>Zrušiť</button>
                <button type="submit" style={{ ...styles.button, ...styles.primaryButton, flex: isMobile ? '1' : 'none' }}>Uložiť</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showNotifications && (
        <NotificationPanel
          user={user}
          darkMode={darkMode}
          onClose={() => setShowNotifications(false)}
        />
      )}

      {showProfileEditor && (
        <ProfileEditor
          user={{ ...user, displayName: userProfile.displayName, photoURL: userProfile.photoURL }}
          isOpen={showProfileEditor}
          onClose={() => setShowProfileEditor(false)}
          onUpdate={(newProfile) => {
            setUserProfile(newProfile);
          }}
        />
      )}
    </div>
  );
}

export default CardManager;