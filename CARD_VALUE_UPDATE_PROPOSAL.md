# 💰 Návrh implementácie automatickej aktualizácie hodnôt hokejových kariet

> **Pripravil:** Claude (Anthropic)
> **Dátum:** 18. November 2025
> **Pre projekt:** NHL Cards Collection Manager

---

## 📋 Executive Summary

Tento dokument poskytuje komplexný návrh implementácie systému pre automatickú aktualizáciu trhových hodnôt hokejových kariet vo vašej zbierkovej aplikácii.

**Hlavný problém:** Užívatelia musia manuálne aktualizovať pole "Aktuálna hodnota" pre každú kartu, čo je časovo náročné a neefektívne.

**Riešenie:** Integrácia externého pricing API pre automatické sťahovanie aktuálnych trhových cien.

---

## 🎯 Ciele implementácie

1. ✅ **Automatizácia** - Užívatelia jedným klikom aktualizujú ceny všetkých kariet
2. ✅ **Presnosť** - Použitie overených trhových dát namiesto manuálneho odhadu
3. ✅ **History tracking** - Sledovanie zmien cien v čase (investment tracking)
4. ✅ **Cost-effective** - Optimalizácia nákladov na API calls
5. ✅ **User experience** - Intuitívne UI s progress indikátorom

---

## 🔍 Analýza dostupných API riešení

### **Option 1: SportsCardsPro API (PriceCharting)** ⭐⭐⭐⭐⭐ ODPORÚČANÉ

#### Základné info:
- **Cena:** $49/mesiac (Legendary tier)
- **Pokrytie:** Všetky hokejové karty (NHL, OPC, Upper Deck, atď.)
- **Grades:** Ungraded, PSA 8, PSA 9, PSA 10, BGS
- **Limity:** 20 výsledkov/request, CSV download 1×/deň
- **Dokumentácia:** https://www.pricecharting.com/api-documentation

#### Výhody:
✅ Oficiálne, legálne API
✅ Full-text search (napr. "Sidney Crosby 2005 Upper Deck Young Guns")
✅ Podporuje všetky hlavné grades
✅ Stabilná spoločnosť s dlhou históriou
✅ CSV export pre bulk updates
✅ Denné aktualizácie cien

#### Nevýhody:
❌ $49/mesiac je relatívne vysoká cena pre hobby projekt
❌ Ceny sú agregované (nie priamo z predajov)
❌ Historické dáta nie sú v API (len aktuálne ceny)

#### API Príklady:

**Autentifikácia:**
```javascript
const token = 'YOUR_40_CHAR_TOKEN'; // Získaš po registrácii
```

**Vyhľadávanie karty:**
```javascript
const searchCard = async (query) => {
  const response = await fetch(
    `https://www.pricecharting.com/api/products?q=${encodeURIComponent(query)}&t=${token}`
  );
  const data = await response.json();

  if (data.status === 'success') {
    return data.products.map(p => ({
      id: p.id,
      name: p['product-name'],
      ungraded: p['loose-price'] / 100, // Ceny sú v centoch
      psa9: p['graded-price'] / 100,
      psa10: p['manual-only-price'] / 100
    }));
  }
  return [];
};
```

**Príklad vyhľadávania:**
```javascript
// Input: "connor mcdavid 2015 upper deck young guns psa 10"
// Output: [
//   {
//     id: "123456",
//     name: "2015-16 Upper Deck Young Guns Connor McDavid #201 PSA 10",
//     ungraded: 450.00,
//     psa9: 850.00,
//     psa10: 1500.00
//   }
// ]
```

---

### **Option 2: eBay Browse API** ⭐⭐⭐ FREE ALTERNATIVE

#### Základné info:
- **Cena:** ZADARMO
- **Limity:** 5,000 calls/deň (možnosť zvýšiť na 1.5M)
- **Pokrytie:** Len aktuálne "Buy It Now" listings
- **Dokumentácia:** https://developer.ebay.com/api-docs/buy/browse/overview.html

#### Výhody:
✅ Kompletne zadarmo
✅ Vysoký denný limit
✅ Oficiálne API
✅ OAuth 2.0 autentifikácia

#### Nevýhody:
❌ **Nemá prístup k "sold listings"** - len aktuálne ponuky
❌ Menej presné ako SportsCardsPro
❌ Vyžaduje OAuth setup
❌ Ceny môžu byť nadhodnotené (predajcovia často dávajú vyššie ceny)

#### API Príklad:

**OAuth token:**
```javascript
const getEbayToken = async () => {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
  });

  return (await response.json()).access_token;
};
```

**Vyhľadávanie:**
```javascript
const searchEbayCards = async (query) => {
  const token = await getEbayToken();
  const response = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&category_ids=261328&limit=10`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      }
    }
  );

  const data = await response.json();
  return data.itemSummaries?.map(item => ({
    title: item.title,
    price: item.price.value,
    currency: item.price.currency
  })) || [];
};
```

---

### **Option 3: 130point.com Web Scraping** ❌ NIE JE ODPORÚČANÉ

#### Prečo NIE:
- ❌ **Porušuje Terms of Service** väčšiny webov
- ❌ **Právne riziká** - môžu vás zablokovať alebo žalovať
- ❌ **Nestabilné** - zmena HTML štruktúry vás zlomí
- ❌ **Cloudflare protection** - ťažké obísť

**Záver:** Neimplementovať web scraping, aj keď by to technicky fungovalo.

---

## 🏗️ Architektúra riešenia

### **Fáza 1: Frontend UI komponenty**

#### 1.1 Tlačidlo "Aktualizovať ceny" v CardManager.jsx

```jsx
// Nové state variables
const [updatingPrices, setUpdatingPrices] = useState(false);
const [updateProgress, setUpdateProgress] = useState({ current: 0, total: 0 });

// UI button v header area (vedľa Dark mode a Logout)
<button
  onClick={handleUpdateAllPrices}
  disabled={updatingPrices || cards.length === 0}
  style={{
    ...styles.button,
    ...styles.primaryButton,
    opacity: updatingPrices ? 0.6 : 1
  }}
  title="Aktualizovať ceny všetkých kariet z API"
>
  {updatingPrices
    ? `⏳ ${updateProgress.current}/${updateProgress.total}`
    : '💰 Aktualizovať ceny'
  }
</button>
```

#### 1.2 Progress modal počas aktualizácie

```jsx
{updatingPrices && (
  <div style={{
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  }}>
    <div style={{
      background: darkMode ? '#1e293b' : 'white',
      padding: '32px',
      borderRadius: '16px',
      maxWidth: '400px',
      textAlign: 'center'
    }}>
      <h3>Aktualizujem ceny...</h3>
      <div style={{
        width: '100%',
        height: '12px',
        background: '#e2e8f0',
        borderRadius: '6px',
        overflow: 'hidden',
        margin: '20px 0'
      }}>
        <div style={{
          width: `${(updateProgress.current / updateProgress.total) * 100}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #667eea, #764ba2)',
          transition: 'width 0.3s'
        }} />
      </div>
      <p>{updateProgress.current} / {updateProgress.total} kariet</p>
    </div>
  </div>
)}
```

#### 1.3 Indikátor poslednej aktualizácie

```jsx
// Pridať do každej karty field "lastPriceUpdate"
// Zobraziť v CardTable:

{card.lastPriceUpdate && (
  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
    Aktualizované: {formatDistanceToNow(card.lastPriceUpdate.toDate(), {
      addSuffix: true,
      locale: sk
    })}
  </div>
)}
```

---

### **Fáza 2: API Integration Layer**

#### 2.1 Vytvorenie utility súboru `src/utils/priceAPI.js`

```javascript
// src/utils/priceAPI.js

const SPORTSCARDSPRO_TOKEN = import.meta.env.VITE_SPORTSCARDSPRO_TOKEN;
const API_BASE = 'https://www.pricecharting.com/api';

/**
 * Rate limiter pre API calls
 */
class RateLimiter {
  constructor(requestsPerSecond = 1) {
    this.delay = 1000 / requestsPerSecond;
    this.lastRequest = 0;
  }

  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;

    if (timeSinceLastRequest < this.delay) {
      await new Promise(resolve =>
        setTimeout(resolve, this.delay - timeSinceLastRequest)
      );
    }

    this.lastRequest = Date.now();
  }
}

const limiter = new RateLimiter(1); // 1 request/second

/**
 * Vyhľadá kartu v SportsCardsPro API
 * @param {string} query - Názov karty (napr. "connor mcdavid 2015 upper deck young guns")
 * @returns {Promise<Array>} - Pole výsledkov s cenami
 */
export async function searchCardPrice(query) {
  if (!SPORTSCARDSPRO_TOKEN) {
    throw new Error('API token nie je nakonfigurovaný. Pridaj VITE_SPORTSCARDSPRO_TOKEN do .env');
  }

  await limiter.throttle();

  try {
    const response = await fetch(
      `${API_BASE}/products?q=${encodeURIComponent(query)}&t=${SPORTSCARDSPRO_TOKEN}`
    );

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Skús neskôr.');
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'success' && data.products) {
      return data.products.slice(0, 5).map(p => ({
        id: p.id,
        name: p['product-name'],
        ungraded: p['loose-price'] ? p['loose-price'] / 100 : null,
        psa9: p['graded-price'] ? p['graded-price'] / 100 : null,
        psa10: p['manual-only-price'] ? p['manual-only-price'] / 100 : null,
        // Použij najvyššiu dostupnú cenu
        suggestedPrice: p['manual-only-price']
          ? p['manual-only-price'] / 100
          : p['graded-price']
            ? p['graded-price'] / 100
            : p['loose-price']
              ? p['loose-price'] / 100
              : null
      }));
    }

    return [];
  } catch (error) {
    console.error('Price API error:', error);
    throw error;
  }
}

/**
 * Fallback: eBay Browse API (FREE)
 */
export async function searchEbayPrice(query) {
  // TODO: Implementovať eBay API ako fallback ak SportsCardsPro zlyhá
  // Vyžaduje OAuth setup
}
```

---

#### 2.2 Hlavná funkcia pre bulk update v `CardManager.jsx`

```javascript
import { searchCardPrice } from './utils/priceAPI';

const handleUpdateAllPrices = async () => {
  if (!cards.length) {
    alert('Nemáš žiadne karty na aktualizáciu');
    return;
  }

  const confirmed = confirm(
    `Aktualizujem ceny pre ${cards.length} kariet. ` +
    `Toto môže trvať ${Math.ceil(cards.length / 60)} minút. Pokračovať?`
  );

  if (!confirmed) return;

  setUpdatingPrices(true);
  setUpdateProgress({ current: 0, total: cards.length });

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];

    try {
      // Vyhľadaj cenu v API
      const results = await searchCardPrice(card.item);

      if (results.length > 0) {
        const bestMatch = results[0];
        const newPrice = bestMatch.suggestedPrice;

        if (newPrice) {
          // Update Firestore
          await updateDoc(doc(db, 'cards', card.id), {
            current: newPrice,
            lastPriceUpdate: serverTimestamp(),
            apiProductId: bestMatch.id,
            apiProductName: bestMatch.name
          });

          successCount++;
        } else {
          failCount++;
          errors.push(`${card.item}: Žiadna cena nenájdená`);
        }
      } else {
        failCount++;
        errors.push(`${card.item}: Žiadne výsledky`);
      }
    } catch (error) {
      failCount++;
      errors.push(`${card.item}: ${error.message}`);
    }

    setUpdateProgress({ current: i + 1, total: cards.length });
  }

  setUpdatingPrices(false);

  // Zobraz výsledky
  alert(
    `✅ Aktualizácia dokončená!\n\n` +
    `Úspešne: ${successCount}\n` +
    `Neúspešne: ${failCount}\n\n` +
    (errors.length > 0 ? `Chyby:\n${errors.slice(0, 5).join('\n')}` : '')
  );
};
```

---

### **Fáza 3: Databázová štruktúra**

#### 3.1 Aktualizované Firestore schema pre "cards" collection

```javascript
{
  // Existujúce fields
  item: "Connor McDavid 2015 Upper Deck Young Guns PSA 10",
  buy: 800,
  current: 1500, // ← Aktualizované z API
  sell: null,
  status: "zbierka",
  note: "Rookie card",
  imageUrl: "https://...",
  userId: "abc123",
  createdAt: timestamp,
  updatedAt: timestamp,

  // NOVÉ fields pre price tracking
  lastPriceUpdate: timestamp, // Kedy bola naposledy aktualizovaná cena
  apiProductId: "123456", // ID produktu v SportsCardsPro (pre budúce updates)
  apiProductName: "2015-16 Upper Deck Young Guns Connor McDavid #201 PSA 10",
  priceHistory: [ // Array pre tracking zmien cien
    { date: "2025-01-10", price: 1400 },
    { date: "2025-01-17", price: 1450 },
    { date: "2025-01-24", price: 1500 }
  ]
}
```

#### 3.2 Firestore Security Rules update

```javascript
// firestore.rules
match /cards/{cardId} {
  allow read, write: if request.auth != null &&
                       request.auth.uid == resource.data.userId;

  // Povoliť update cien len pre vlastníka
  allow update: if request.auth != null &&
                   request.auth.uid == resource.data.userId &&
                   request.resource.data.userId == resource.data.userId; // Zabraň zmene userId
}
```

---

### **Fáza 4: Optimalizácia a caching**

#### 4.1 Lokálny cache pre price queries

```javascript
// src/utils/priceCache.js

const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 dní

export class PriceCache {
  constructor() {
    this.cache = new Map();
    this.loadFromLocalStorage();
  }

  // Načítaj cache z localStorage pri starte
  loadFromLocalStorage() {
    try {
      const cached = localStorage.getItem('priceCache');
      if (cached) {
        const data = JSON.parse(cached);
        this.cache = new Map(data);
      }
    } catch (error) {
      console.error('Cache load error:', error);
    }
  }

  // Ulož cache do localStorage
  saveToLocalStorage() {
    try {
      const data = Array.from(this.cache.entries());
      localStorage.setItem('priceCache', JSON.stringify(data));
    } catch (error) {
      console.error('Cache save error:', error);
    }
  }

  // Získaj cenu z cache
  get(query) {
    const cached = this.cache.get(query);

    if (!cached) return null;

    const age = Date.now() - cached.timestamp;

    if (age > CACHE_DURATION) {
      this.cache.delete(query);
      return null;
    }

    return cached.results;
  }

  // Ulož cenu do cache
  set(query, results) {
    this.cache.set(query, {
      results,
      timestamp: Date.now()
    });
    this.saveToLocalStorage();
  }

  // Vyčisti starý cache
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > CACHE_DURATION) {
        this.cache.delete(key);
      }
    }
    this.saveToLocalStorage();
  }
}

export const priceCache = new PriceCache();
```

#### 4.2 Update `priceAPI.js` s cachingom

```javascript
import { priceCache } from './priceCache';

export async function searchCardPrice(query) {
  // Skontroluj cache najprv
  const cached = priceCache.get(query);
  if (cached) {
    console.log('Cache hit:', query);
    return cached;
  }

  // Cache miss - fetch z API
  const results = await fetchFromAPI(query);

  // Ulož do cache
  if (results.length > 0) {
    priceCache.set(query, results);
  }

  return results;
}
```

---

### **Fáza 5: Advanced features (Optional - Fáza 2)**

#### 5.1 Price history tracking a grafy

```jsx
// Nový komponent: PriceHistoryChart.jsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export default function PriceHistoryChart({ card }) {
  if (!card.priceHistory || card.priceHistory.length < 2) {
    return <p>Nedostatok dát pre graf</p>;
  }

  return (
    <LineChart width={600} height={300} data={card.priceHistory}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="date" />
      <YAxis />
      <Tooltip />
      <Legend />
      <Line type="monotone" dataKey="price" stroke="#667eea" strokeWidth={2} />
    </LineChart>
  );
}
```

#### 5.2 Smart matching - AI-powered query enhancement

```javascript
// Vylepšenie query pre lepší matching
function enhanceQuery(cardName) {
  // Odstráň common noise words
  let enhanced = cardName
    .toLowerCase()
    .replace(/\b(card|rookie|rc|nhl|hockey)\b/gi, '')
    .trim();

  // Pridaj "hockey card" suffix ak chýba
  if (!enhanced.includes('hockey') && !enhanced.includes('nhl')) {
    enhanced += ' hockey card';
  }

  return enhanced;
}
```

#### 5.3 Email notifikácie pri veľkých zmenách cien

```javascript
// Firebase Cloud Function
exports.priceChangeNotification = functions.firestore
  .document('cards/{cardId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    const priceDiff = after.current - before.current;
    const percentChange = (priceDiff / before.current) * 100;

    // Ak zmena > 10%, pošli email
    if (Math.abs(percentChange) > 10) {
      const userEmail = await getUserEmail(after.userId);

      await sendEmail({
        to: userEmail,
        subject: `Veľká zmena ceny: ${after.item}`,
        body: `
          Karta: ${after.item}
          Stará cena: €${before.current}
          Nová cena: €${after.current}
          Zmena: ${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%
        `
      });
    }
  });
```

---

## 💰 Náklady a ROI analýza

### **Option 1: SportsCardsPro API**

**Náklady:**
- $49/mesiac = **$588/rok**

**Break-even analýza:**
- Ak máš 100 kariet v zbierke
- Manuálna aktualizácia = 2 min/karta = **3.3 hodiny/mesiac**
- Tvoja hodinová sadzba: €15/hod → **€50/mesiac ušetrených**
- Break-even: **Už pri 100 kartách sa to oplatí**

---

### **Option 2: eBay Browse API (FREE)**

**Náklady:** €0

**Trade-offs:**
- Menej presné ceny
- Len "Buy It Now" listings
- Viac developerského času na setup

**Odporúčanie:** Ak máš <50 kariet, použi eBay API ako free tier.

---

## 📅 Implementation Timeline

### **Week 1: Setup & Research**
- [ ] Registrácia SportsCardsPro account (alebo eBay Developer)
- [ ] Získanie API tokenu
- [ ] Testovanie API v Postman
- [ ] Environment variables setup

### **Week 2: Frontend Development**
- [ ] Pridať "Aktualizovať ceny" button
- [ ] Progress modal UI
- [ ] Last update indicator

### **Week 3: API Integration**
- [ ] `priceAPI.js` utility
- [ ] Rate limiting
- [ ] Error handling
- [ ] Caching layer

### **Week 4: Testing & Optimization**
- [ ] Unit testy
- [ ] Integration testing
- [ ] Performance optimization
- [ ] User acceptance testing

### **Week 5: Deployment**
- [ ] Firebase deploy
- [ ] Monitoring setup
- [ ] User documentation

---

## 🚀 Quick Start Guide

### **1. Registrácia SportsCardsPro**

1. Choď na: https://www.pricecharting.com/api-access
2. Zvoľ "Legendary Subscription" ($49/mes)
3. Získaj svoj 40-character API token
4. Ulož token do `.env` súboru

### **2. Environment Setup**

```bash
# .env
VITE_SPORTSCARDSPRO_TOKEN=your_40_char_token_here
```

### **3. Install dependencies**

```bash
npm install date-fns  # Pre formatovanie dátumov
```

### **4. Test API**

```bash
# Test v console
curl "https://www.pricecharting.com/api/products?q=connor+mcdavid+2015+upper+deck&t=YOUR_TOKEN"
```

---

## 📊 Success Metrics

**KPIs pre meranie úspechu:**

1. **User Engagement:**
   - % užívateľov, ktorí použili "Update Prices"
   - Frekvencia používania
   - Priemerný čas ušetrený

2. **Data Quality:**
   - % kariet s aktuálnymi cenami
   - Presnosť matchingu (manual review sample)
   - User feedback score

3. **Technical:**
   - API call count/deň
   - Cache hit rate
   - Error rate
   - Average response time

---

## ⚠️ Riziká a mitigácia

### **Riziko 1: API outage**
- **Mitigácia:** Fallback na eBay API
- **Fallback 2:** Manual price entry stále dostupný

### **Riziko 2: Vysoké náklady**
- **Mitigácia:** Monthly budget alert
- **Optimization:** CSV download namiesto API pre bulk

### **Riziko 3: Matching errors**
- **Mitigácia:** Manual review option
- **UI:** Zobraz top 3 matches, užívateľ vyberie

### **Riziko 4: Rate limiting**
- **Mitigácia:** Client-side rate limiter
- **Queueing:** Process v backgrounde

---

## 🎓 Užívateľská dokumentácia

### **Ako aktualizovať ceny:**

1. **Klikni na "💰 Aktualizovať ceny"** v hlavnom menu
2. **Potvrď akciu** - aktualizácia môže trvať niekoľko minút
3. **Počkaj na dokončenie** - progress bar zobrazí postup
4. **Skontroluj výsledky** - upozornenie zobrazí počet úspešných aktualizácií

### **Ako často aktualizovať:**

- **Odporúčame:** 1× týždenne (nedeľa večer)
- **Minimum:** 1× mesačne
- **Maximum:** Denne (ak intenzívne obchoduješ)

### **FAQ:**

**Q: Prečo niektoré karty nezmenili cenu?**
A: API nenašlo presný match. Skontroluj či má karta správny názov (vrátane roku a edície).

**Q: Môžem manuálne prepísať API cenu?**
A: Áno, stále môžeš editovať pole "Aktuálna hodnota" manuálne.

**Q: Sú ceny v USD alebo EUR?**
A: SportsCardsPro používa USD. Budúca verzia bude mať currency conversion.

---

## 📞 Next Steps

1. **Rozhodnutie:** Zvoliť medzi SportsCardsPro ($49/mes) vs. eBay (free)
2. **Registrácia:** Vytvoriť API account
3. **Development:** Implementovať podľa tohto dokumentu
4. **Testing:** Beta test s 10-20 kartami
5. **Deployment:** Production release

---

## 📚 Resources

- SportsCardsPro API Docs: https://www.pricecharting.com/api-documentation
- eBay Browse API: https://developer.ebay.com/api-docs/buy/browse/overview.html
- Firebase Functions: https://firebase.google.com/docs/functions
- React Best Practices: https://react.dev/learn

---

**Pripravené na implementáciu? Začni s Week 1 a postupuj krok po kroku. Úspech! 🚀**
