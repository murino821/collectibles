# 📈 Implementácia grafov vývoja cien

> **Kompletná dokumentácia** pre price evolution charts - individuálne karty aj celé portfólio

---

## ✅ Čo bolo implementované

### **1. Recharts Library Integration** 📊

**Balík:** `recharts` v2.x (40 packages)

**Inštalácia:**
```bash
npm install recharts --save
```

**Použité komponenty:**
- `LineChart` - Pre individuálne karty (line graph)
- `AreaChart` - Pre portfólio (area chart s gradientom)
- `XAxis`, `YAxis` - Osi s custom formátovaním
- `CartesianGrid` - Grid pre lepšiu čitateľnosť
- `Tooltip` - Interaktívne tooltips
- `Legend` - Legenda grafov
- `ResponsiveContainer` - Responzívne grafy

---

## 📂 Nové súbory

### **1. PriceHistoryChart.jsx** (170 lines)

**Cesta:** `/home/miroslav/release_nhl/src/assets/components/PriceHistoryChart.jsx`

**Účel:** Graf pre vývoj ceny jednotlivej karty

**Props:**
```javascript
{
  priceHistory: Array<{
    date: Timestamp,
    price: number,
    source: string
  }>,
  darkMode: boolean
}
```

**Features:**
- ✅ Line chart s price evolution
- ✅ Automatická konverzia Firestore Timestamps na dátumy
- ✅ Výpočet price change (€ a %)
- ✅ Zobrazenie min/max cien
- ✅ Farebné indikátory (zelená = rast, červená = pokles)
- ✅ Dark mode support
- ✅ Responzívny design
- ✅ Empty state (ak žiadne dáta)
- ✅ Slovak locale (dd. mmm yyyy)

**Vizualizácia:**
```
┌─────────────────────────────────────┐
│ Vývoj ceny         +5.20 € (+12.3%) │
├─────────────────────────────────────┤
│                                     │
│      📈 Line Chart (250px height)   │
│                                     │
├─────────────────────────────────────┤
│ Minimum: €35.00    Maximum: €47.50  │
└─────────────────────────────────────┘
```

---

### **2. PortfolioChart.jsx** (280 lines)

**Cesta:** `/home/miroslav/release_nhl/src/assets/components/PortfolioChart.jsx`

**Účel:** Graf pre celkovú hodnotu portfólia v čase

**Props:**
```javascript
{
  user: Object,  // Firebase user
  darkMode: boolean
}
```

**Features:**
- ✅ Area chart s gradient fill
- ✅ Real-time načítanie všetkých kariet usera
- ✅ Forward-fill algoritmus (last known price)
- ✅ Agregácia cien do timeline
- ✅ Výpočet portfolio stats:
  - Aktuálna hodnota
  - Zmena (€ a %)
  - Počet kariet
  - Priemerná cena karty
  - Počet aktualizácií
- ✅ Loading state
- ✅ Empty state
- ✅ Dark mode support
- ✅ Responzívny (300px height)

**Algorithm - Forward Fill:**
```javascript
// Pre každý dátum v timeline:
// 1. Aktualizuj last known prices s novými cenami z daného dňa
// 2. Sčítaj všetky last known prices = total portfolio value
// 3. Zaznamenaj do chart data

Example:
Day 1: Card A = €10, Card B = €20  → Total = €30
Day 5: Card A = €12                 → Total = €32 (B still €20)
Day 8: Card B = €25                 → Total = €37 (A still €12)
```

**Vizualizácia:**
```
┌──────────────────────────────────────────────┐
│ 📊 Investičné portfólio                      │
├──────────────────────────────────────────────┤
│ Aktuálna hodnota │ Zmena        │ Počet      │
│ €12,450.00       │ +€450 (+3.8%)│ 138 kariet │
├──────────────────────────────────────────────┤
│                                              │
│       📈 Area Chart (300px height)           │
│       s gradient fill (zelený/červený)       │
│                                              │
├──────────────────────────────────────────────┤
│ Počiatočná: €12k │ Avg: €90.22  │ Updates: 3 │
└──────────────────────────────────────────────┘
```

---

## 🔧 Upravené súbory

### **1. functions/index.js** (lines 169-184)

**Zmena:** Pridaná `priceHistory` array do každej aktualizácie karty

**Pred:**
```javascript
await cardDoc.ref.update({
  current: estimatedPrice,
  lastPriceUpdate: admin.firestore.FieldValue.serverTimestamp(),
  priceSource: "ebay",
  ebayResults: results.slice(0, 3),
});
```

**Po:**
```javascript
// Create price history entry
const priceHistoryEntry = {
  date: admin.firestore.FieldValue.serverTimestamp(),
  price: estimatedPrice,
  source: "ebay",
};

// Update card with price and append to history
await cardDoc.ref.update({
  current: estimatedPrice,
  lastPriceUpdate: admin.firestore.FieldValue.serverTimestamp(),
  priceSource: "ebay",
  ebayResults: results.slice(0, 3),
  priceHistory: admin.firestore.FieldValue.arrayUnion(priceHistoryEntry),
});
```

**Dôležité:** `arrayUnion` automaticky pridá nový záznam do array, bez duplikátov.

---

### **2. CardManager.jsx** (Multiple changes)

#### **A) Imports (lines 1-9)**

```javascript
import PortfolioChart from './assets/components/PortfolioChart';
import PriceHistoryChart from './assets/components/PriceHistoryChart';
```

#### **B) State (lines 25-26)**

```javascript
const [showPortfolioChart, setShowPortfolioChart] = useState(false);
const [selectedCardForChart, setSelectedCardForChart] = useState(null);
```

#### **C) Portfolio Chart Section (lines 164-197)**

Pridané po stats banneri:

```jsx
{/* Portfolio Chart Section */}
<div style={{ marginBottom: '16px' }}>
  <div style={{
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  }}>
    <h3>Vývoj portfólia</h3>
    <button onClick={() => setShowPortfolioChart(!showPortfolioChart)}>
      {showPortfolioChart ? '📉 Skryť graf' : '📈 Zobraziť graf'}
    </button>
  </div>

  {showPortfolioChart && (
    <PortfolioChart user={user} darkMode={darkMode} />
  )}
</div>
```

#### **D) Individual Card Chart - Cards View (lines 230-251)**

V každej card (card view mode):

```jsx
{card.priceHistory && card.priceHistory.length > 0 && (
  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '...' }}>
    <button onClick={() => setSelectedCardForChart(...)}>
      {selectedCardForChart?.id === card.id ? '📉 Skryť graf' : '📈 Zobraziť vývoj ceny'}
    </button>
    {selectedCardForChart?.id === card.id && (
      <div style={{ marginTop: '12px' }}>
        <PriceHistoryChart priceHistory={card.priceHistory} darkMode={darkMode} />
      </div>
    )}
  </div>
)}
```

#### **E) Individual Card Chart - Edit Modal (lines 318-323)**

V edit modale:

```jsx
{/* Price History Chart for editing card */}
{editingCard && editingCard.priceHistory && editingCard.priceHistory.length > 0 && (
  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '...' }}>
    <PriceHistoryChart priceHistory={editingCard.priceHistory} darkMode={darkMode} />
  </div>
)}
```

---

## 🗄️ Database Schema Changes

### **cards collection - nové pole:**

```javascript
{
  // Existujúce polia
  userId: "abc123",
  item: "2005 Upper Deck Young Guns #201 Crosby PSA 10",
  buy: 1200,
  current: 1450,
  sell: null,
  status: "zbierka",
  imageUrl: "https://...",
  lastPriceUpdate: Timestamp,
  priceSource: "ebay",
  ebayResults: [...],

  // NOVÉ pole ✨
  priceHistory: [
    {
      date: Timestamp("2025-11-18T03:00:00Z"),
      price: 1450,
      source: "ebay"
    },
    {
      date: Timestamp("2025-12-18T03:00:00Z"),
      price: 1520,
      source: "ebay"
    },
    {
      date: Timestamp("2026-01-18T03:00:00Z"),
      price: 1480,
      source: "ebay"
    }
  ]
}
```

**Poznámky:**
- `priceHistory` je array, nie subcollection
- Používa `arrayUnion` pre automatické pridávanie
- Max ~30-36 záznamov (jeden mesačný update = jeden záznam)
- 36 months × 3 fields × 50 bytes = ~5.4 KB per card (zanedbateľné)

---

## 🎯 User Flow

### **Flow 1: Portfolio Chart**

```
1. User otvorí CardManager
   ↓
2. Vidí "Vývoj portfólia" sekciu
   ↓
3. Klikne "📈 Zobraziť graf"
   ↓
4. PortfolioChart sa načíta:
   → Fetch all user's cards
   → Build timeline aggregation
   → Render area chart
   ↓
5. User vidí:
   - Aktuálnu hodnotu portfólia
   - Zmenu od začiatku (€ a %)
   - Graf vývoja hodnoty
   - Stats (avg price, update count, etc.)
   ↓
6. Klikne "📉 Skryť graf" → chart zmizne
```

---

### **Flow 2: Individual Card Chart (Cards View)**

```
1. User je v cards view mode
   ↓
2. Scrolluje kartami
   ↓
3. Pri karte s priceHistory vidí tlačidlo "📈 Zobraziť vývoj ceny"
   ↓
4. Klikne na tlačidlo
   ↓
5. PriceHistoryChart sa expands inline:
   → Line chart s cenami
   → Price change stats
   → Min/Max values
   ↓
6. Klikne "📉 Skryť graf" → chart collapse
```

---

### **Flow 3: Individual Card Chart (Edit Modal)**

```
1. User klikne "Upraviť" na karte
   ↓
2. Otvorí sa modal
   ↓
3. Ak karta má priceHistory:
   → Graf sa automaticky zobrazí na konci formulára
   ↓
4. User vidí vývoj ceny počas editácie
   ↓
5. Môže zmeniť current price manuálne (ak chce override)
   ↓
6. Uloží → modal sa zatvorí
```

---

## 📊 Chart Customization

### **Colors:**

```javascript
// Positive trend (rast)
lineColor: '#10b981'   // Green
gradientColor: '#10b981'

// Negative trend (pokles)
lineColor: '#ef4444'   // Red
gradientColor: '#ef4444'

// Grid & text (dark mode)
gridColor: '#334155'
textColor: '#cbd5e1'

// Grid & text (light mode)
gridColor: '#e2e8f0'
textColor: '#475569'
```

### **Font Sizes:**

```javascript
// PriceHistoryChart
header: '16px'
stats: '20px' (price change), '13px' (percent)
axis: '11px'
tooltip: '13px'
min/max: '16px'

// PortfolioChart
header: '18px'
stats: '22px' (current value), '18px' (change)
axis: '11px'
tooltip: '13px'
additional stats: '15px'
```

### **Dimensions:**

```javascript
// PriceHistoryChart
height: 250px
padding: '20px'
borderRadius: '12px'

// PortfolioChart
height: 300px
padding: '20px'
borderRadius: '12px'
```

---

## 🔄 Data Flow Diagram

```
Firebase Cloud Function (Monthly)
          ↓
    updateUserCollection()
          ↓
    Search eBay API
          ↓
    Calculate median price
          ↓
    Create priceHistoryEntry {
      date: serverTimestamp(),
      price: estimatedPrice,
      source: "ebay"
    }
          ↓
    cardDoc.update({
      priceHistory: arrayUnion(priceHistoryEntry)
    })
          ↓
    Firestore saves to cards/{cardId}
          ↓
    Real-time listener in CardManager
          ↓
    UI updates with new price point
          ↓
    User opens chart → sees updated graph
```

---

## 🎨 UI/UX Features

### **1. Toggle Buttons**

```javascript
// Portfolio chart
'📈 Zobraziť graf' → '📉 Skryť graf'

// Individual card chart
'📈 Zobraziť vývoj ceny' → '📉 Skryť graf'
```

**Design:**
- Inactive: Gray background
- Active: Purple (#667eea) background
- Smooth transitions
- Clear emoji indicators

---

### **2. Empty States**

**PriceHistoryChart:**
```
┌─────────────────────────┐
│         📊              │
│ Žiadne historické dáta  │
│ o cenách                │
│                         │
│ Ceny sa budú            │
│ zaznamenávať pri        │
│ mesačných aktualizáciách│
└─────────────────────────┘
```

**PortfolioChart:**
```
┌─────────────────────────┐
│         📈              │
│ Žiadne historické dáta  │
│ o portfóliu             │
│                         │
│ Hodnota zbierky sa bude │
│ zaznamenávať pri        │
│ mesačných aktualizáciách│
└─────────────────────────┘
```

---

### **3. Loading State (PortfolioChart only)**

```
┌─────────────────────────┐
│         ⏳              │
│ Načítavam históriu      │
│ portfolia...            │
└─────────────────────────┘
```

---

### **4. Tooltips**

```javascript
// On hover over data point
┌──────────────────┐
│ 18. nov 2025     │  ← Date (SK locale)
│ Cena: €1,450.00  │  ← Price with 2 decimals
└──────────────────┘

// Portfolio chart
┌──────────────────────────┐
│ 18. nov 2025             │
│ Hodnota portfólia:       │
│ €12,450.00               │
│ Počet kariet: 138        │
└──────────────────────────┘
```

---

## 📱 Responzívny Design

### **Mobile (< 768px):**

- ✅ Charts full width
- ✅ Stats v grid layout (auto-fit)
- ✅ Font sizes slightly smaller
- ✅ Touch-friendly buttons (44px min)
- ✅ Scrollable tooltips

### **Desktop (>= 768px):**

- ✅ Charts max-width container
- ✅ Larger fonts
- ✅ Hover effects
- ✅ Better grid spacing

---

## 🚀 Performance

### **Optimalizácie:**

1. **PortfolioChart:**
   - Jednorázový fetch (useEffect s dependency na user)
   - Bez real-time listener (nie je potrebný)
   - Efektívny forward-fill algoritmus O(n×m)
   - Caching v component state

2. **PriceHistoryChart:**
   - Stateless component (pure render)
   - Dáta prichádzajú cez props
   - Žiadne external fetches
   - Rýchle Timestamp→Date konverzie

3. **Recharts:**
   - ResponsiveContainer = lazy resize
   - Light bundle size (~40 packages)
   - Canvas-based rendering (rýchle)

---

## 💾 Storage Impact

### **Firestore:**

```javascript
// Existing card: ~500 bytes
// + priceHistory (36 months × 50 bytes) = ~1.8 KB
// Total per card: ~2.3 KB

// 500 cards × 2.3 KB = ~1.15 MB total
// Firestore free tier: 1 GB storage
// → 0.1% využitia
```

**Záver:** Zanedbateľný impact! ✅

---

### **Reads:**

```javascript
// Portfolio chart load:
// 1× getDocs(cards) = N reads (N = počet kariet)

// Example: 150 kariet = 150 reads
// Free tier: 50,000 reads/day
// → 0.3% využitia per load
```

**Záver:** Stále hlboko v free tier! ✅

---

## 🔮 Future Enhancements

### **Možné vylepšenia:**

1. **Export to CSV/PDF:**
   ```javascript
   <button onClick={exportChartToPDF}>
     �� Exportovať graf
   </button>
   ```

2. **Time Range Selector:**
   ```javascript
   <select value={timeRange} onChange={...}>
     <option value="1m">Posledný mesiac</option>
     <option value="3m">3 mesiace</option>
     <option value="6m">6 mesiacov</option>
     <option value="1y">Rok</option>
     <option value="all">Všetko</option>
   </select>
   ```

3. **Compare Cards:**
   ```javascript
   // Multi-select cards → overlay múltiple lines
   <MultiCardComparisonChart cards={[card1, card2, card3]} />
   ```

4. **Price Alerts:**
   ```javascript
   // Notification keď cena presiahne threshold
   {
     priceAlerts: [
       { threshold: 1500, direction: "above", notified: false }
     ]
   }
   ```

5. **ROI Calculator:**
   ```javascript
   // Kalkulátor návratnosti investície
   const roi = ((current - buy) / buy) * 100;
   ```

---

## ✅ Testing Checklist

- [ ] ✅ Portfolio chart zobrazuje správne dáta
- [ ] ✅ Individual card chart zobrazuje price history
- [ ] ✅ Toggle buttons fungujú (show/hide)
- [ ] ✅ Dark mode správne prepína farby
- [ ] ✅ Empty states sa zobrazujú keď žiadne dáta
- [ ] ✅ Loading state v PortfolioChart
- [ ] ✅ Tooltips fungujú na hover
- [ ] ✅ Min/Max values správne vypočítané
- [ ] ✅ Price change (€ a %) správne
- [ ] ✅ Slovak date formatting (dd. mmm yyyy)
- [ ] ✅ Responzívny na mobile
- [ ] ✅ Chart v edit modale funguje
- [ ] ✅ Chart v cards view funguje
- [ ] ✅ Forward-fill algoritmus správny
- [ ] ✅ arrayUnion pridáva záznamy bez duplikátov

---

## 🎉 Výsledok

Kompletný systém grafov pre price evolution je **implementovaný**!

**Funkcionalita:**
- ✅ Portfolio chart (celková hodnota zbierky)
- ✅ Individual card charts (vývoj ceny karty)
- ✅ Automatické nahrávanie histórie pri monthly updates
- ✅ Dark mode support
- ✅ Responzívny design
- ✅ Empty & loading states
- ✅ Interactive tooltips
- ✅ Toggle show/hide

**Zero additional costs:**
- ✅ Recharts library (free, open-source)
- ✅ Firestore storage impact: <0.1%
- ✅ Firestore reads: <1% of daily quota

**User experience:**
- ✅ Vizuálne atraktívne grafy
- ✅ Jasné price change indikátory
- ✅ Jednoduché toggle buttons
- ✅ Dostupné v cards view aj edit modale
- ✅ Portfolio overview pre celý investičný prehľad

---

**Last updated:** 18. November 2025
**Version:** 1.0
**Status:** ✅ Production Ready
