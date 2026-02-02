# 📈 Price Evolution Graphs - Quick Start

> **Rýchly prehľad** novo implementovaných grafov pre sledovanie vývoja cien

---

## ✨ Čo je nové?

Pridali sme **2 typy grafov** pre sledovanie vývoja cien:

### **1. 📊 Portfolio Chart**
- Zobrazuje celkovú hodnotu zbierky v čase
- Automaticky agreguje ceny všetkých kariet
- Ukazuje zmenu hodnoty (€ a %)
- Priemerná cena karty, počet aktualizácií

### **2. 📈 Individual Card Chart**
- Zobrazuje vývoj ceny konkrétnej karty
- Min/Max hodnoty
- Price change od prvej aktualizácie
- Dostupný v cards view aj edit modale

---

## 🎯 Kde nájdem grafy?

### **Portfolio Chart:**
```
CardManager → Po stats banneri → "Vývoj portfólia" sekcia
```

**Ako použiť:**
1. Otvor CardManager (po prihlásení)
2. Nájdi sekciu "Vývoj portfólia" (pod stats)
3. Klikni "📈 Zobraziť graf"
4. Vidíš celkový vývoj hodnoty zbierky

### **Individual Card Charts:**

**Variant A - Cards View:**
```
CardManager → Cards view mode → Pri každej karte s históriou
```

**Ako použiť:**
1. Prepni do cards view (🃏 ikona)
2. Scrolluj k hocijakej karte
3. Ak má karta price history → vidíš tlačidlo "📈 Zobraziť vývoj ceny"
4. Klikni → graf sa expands

**Variant B - Edit Modal:**
```
CardManager → Klikni "Upraviť" na karte → Graf na konci formulára
```

**Ako použiť:**
1. Klikni "Upraviť" na karte
2. Scroll down v modale
3. Ak má karta price history → graf je automaticky viditeľný

---

## 🔄 Ako sa naplnia dáta?

Grafy zobrazujú históriu z **automatických mesačných aktualizácií**.

### **Timeline:**

```
Mesiac 1 (setup):
- User má 50 kariet v zbierke
- Žiadna price history → grafy sú prázdne
- Empty state: "Ceny sa budú zaznamenávať pri mesačných aktualizáciách"

Mesiac 2 (prvá aktualizácia):
- Scheduled job (3:00 AM) aktualizuje ceny
- Každá karta dostane prvý záznam v priceHistory[]
- Grafy ukážu 1 data point (zatiaľ žiadny trend)

Mesiac 3 (druhá aktualizácia):
- Druhý záznam v priceHistory[]
- Grafy ukážu line/area chart s 2 bodmi
- Prvé trendy viditeľné (rast/pokles)

Mesiac 4-12:
- Každý mesiac +1 data point
- Po 6 mesiacoch → zmysluplné trendy
- Po 12 mesiacoch → ročný prehľad
```

---

## 📊 Príklad dát

### **Card priceHistory:**

```javascript
{
  item: "2005 Upper Deck Young Guns #201 Crosby PSA 10",
  priceHistory: [
    { date: Timestamp("2025-11-18"), price: 1450, source: "ebay" },
    { date: Timestamp("2025-12-18"), price: 1520, source: "ebay" },  // +€70 (+4.8%)
    { date: Timestamp("2026-01-18"), price: 1480, source: "ebay" },  // -€40 (-2.6%)
  ]
}
```

**Graf ukáže:**
- Celková zmena: **+€30 (+2.1%)** 🟢
- Minimum: **€1,450**
- Maximum: **€1,520**
- Line chart s 3 bodmi

---

### **Portfolio aggregate:**

```javascript
// User má 3 karty:
Card A: €1,450 → €1,520 → €1,480
Card B: €800   → €850   → €820
Card C: €600   → €580   → €590

Portfolio Total:
Nov: €2,850
Dec: €2,950  (+€100 / +3.5%)
Jan: €2,890  (-€60 / -2.0%)

Celková zmena: +€40 (+1.4%) 🟢
```

**Graf ukáže:**
- Area chart s 3 bodmi
- Aktuálna hodnota: **€2,890**
- Zmena: **+€40 (+1.4%)**
- Počet kariet: **3**
- Priemerná cena: **€963.33**

---

## 🎨 Vizuálne features

### **Farby:**

```
🟢 Zelená (#10b981):
- Cena stúpla
- Pozitívna zmena

🔴 Červená (#ef4444):
- Cena klesla
- Negatívna zmena

🟣 Purple (#667eea):
- Active toggle button
```

### **Dark Mode:**

- ✅ Automaticky prepína s dark mode v CardManager
- ✅ Tmavé pozadie (#1e293b)
- ✅ Svetlý text (#cbd5e1)
- ✅ Tmavý grid (#334155)

---

## 🔧 Technické detaily

### **Dependencies:**

```json
{
  "recharts": "^2.x"  // ~40 packages
}
```

**Už nainštalované!** ✅

### **Files:**

```
src/assets/components/
├── PriceHistoryChart.jsx    (170 lines)
└── PortfolioChart.jsx       (280 lines)

functions/
└── index.js                  (modified - priceHistory tracking)

src/
└── CardManager.jsx           (modified - chart integration)
```

### **Database:**

```javascript
// Firestore - cards collection
{
  // ... existing fields
  priceHistory: [
    {
      date: Timestamp,
      price: number,
      source: "ebay"
    }
  ]
}
```

**Storage impact:** <0.1% of free tier ✅

---

## 🚀 Deployment

### **Frontend:**

```bash
cd /home/miroslav/release_nhl

# Build (already successful!)
npm run build

# Deploy
firebase deploy --only hosting
```

### **Functions:**

```bash
# Už deploy-ované! (priceHistory tracking je súčasťou updateUserCollection)
# Ak potrebuješ re-deploy:
firebase deploy --only functions
```

---

## 🧪 Testing

### **Test scenario 1: Portfolio Chart**

1. ✅ Prihlás sa
2. ✅ Otvor CardManager
3. ✅ Klikni "📈 Zobraziť graf"
4. ✅ Ak máš cards s priceHistory → vidíš graf
5. ✅ Ak nemáš dáta → vidíš empty state

### **Test scenario 2: Individual Card Chart**

1. ✅ Prepni do cards view
2. ✅ Nájdi kartu s priceHistory
3. ✅ Klikni "📈 Zobraziť vývoj ceny"
4. ✅ Graf sa expands
5. ✅ Klikni "📉 Skryť graf" → collapse

### **Test scenario 3: Edit Modal**

1. ✅ Klikni "Upraviť" na karte
2. ✅ Scroll down
3. ✅ Ak má karta priceHistory → vidíš graf
4. ✅ Graf je read-only (len zobrazuje)

---

## 📱 Mobile Support

- ✅ Responzívne charts (100% width)
- ✅ Touch-friendly toggle buttons
- ✅ Scrollable tooltips
- ✅ Optimalizované font sizes
- ✅ Grid layouts (auto-fit)

---

## 💡 Tips

### **1. Prečo nemám žiadne grafy?**

Možné príčiny:
- Karty ešte neboli aktualizované monthly job-om
- `priceHistory` pole neexistuje (staré karty)
- Scheduled updates ešte nebežali

**Riešenie:**
- Počkaj na prvý scheduled update (každý mesiac)
- Alebo trigger manual update (implementované v functions)

### **2. Ako testovať pred prvou aktualizáciou?**

Manuálne pridaj test data do Firestore:

```javascript
// Firestore Console → cards/{cardId}
priceHistory: [
  {
    date: new Date("2025-10-18"),
    price: 100,
    source: "test"
  },
  {
    date: new Date("2025-11-18"),
    price: 120,
    source: "test"
  }
]
```

### **3. Koľko dát potrebujem pre zmysluplný graf?**

- **Minimum:** 2 data points (ukáže trend)
- **Optimum:** 6+ data points (6 mesiacov)
- **Maximum:** Unlimited (ale typicky 12-36 mesiacov)

---

## 🎉 Summary

**Čo máš k dispozícii:**

✅ Portfolio chart pre celkovú hodnotu zbierky
✅ Individual card charts pre každú kartu
✅ Automatické nahrávanie dát pri monthly updates
✅ Dark mode support
✅ Responzívny design
✅ Empty states pre nové karty
✅ Toggle show/hide buttons
✅ Min/Max/Change statistics
✅ Zero additional costs

**Všetko funguje automaticky!** 🚀

Po prvom scheduled update (každý mesiac) sa grafy automaticky začnú plniť.

---

**Autor:** Claude Code
**Dátum:** 18. November 2025
**Status:** ✅ Ready to Deploy
