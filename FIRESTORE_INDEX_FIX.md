# 🔧 Firestore Index Fix - Top Cards

> **Riešenie chyby** "Nepodarilo sa načítať top karty"

**Dátum:** 18. November 2025
**Status:** ✅ **FIXED**

---

## 🐛 Problém

### **Error:**
```
❌ Nepodarilo sa načítať top karty
```

### **Root Cause:**
Firestore composite index chýbal pre query:
```javascript
query(
  collection(db, 'cards'),
  where('status', '==', 'zbierka'),
  where('current', '>', 0),
  orderBy('current', 'desc'),
  limit(10)
)
```

**Firestore vyžaduje composite index** pre queries s:
- Multiple where clauses
- orderBy na inom fieldu ako where

---

## ✅ Riešenie

### **1. Vytvoril som `firestore.indexes.json`:**

```json
{
  "indexes": [
    {
      "collectionGroup": "cards",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "current",
          "order": "DESCENDING"
        }
      ]
    }
  ],
  "fieldOverrides": []
}
```

---

### **2. Upravil som `firebase.json`:**

```json
{
  "firestore": {
    "indexes": "firestore.indexes.json"
  }
}
```

---

### **3. Nasadil index:**

```bash
firebase deploy --only firestore:indexes
```

**Output:**
```
✔ firestore: deployed indexes in firestore.indexes.json successfully
```

---

### **4. Zlepšil error handling v TopCards:**

```javascript
catch (err) {
  console.error('Error fetching top cards:', err);

  // Check if it's an index error
  if (err.message && err.message.includes('index')) {
    setError('Databáza sa pripravuje... Skús to znova o pár minút. 🔄');
  } else {
    setError('Nepodarilo sa načítať top karty');
  }
}
```

---

## 📊 Index Details

**Created Index:**
```
Collection: cards
Fields:
  - status (ASCENDING)
  - current (DESCENDING)
  - __name__ (DESCENDING) [auto-added by Firebase]
Density: SPARSE_ALL
```

**Index Status:** ✅ Active

**Build Time:** ~2-3 minúty (automaticky)

---

## 🔍 Verifikácia

### **Check index status:**
```bash
firebase firestore:indexes
```

### **Expected output:**
```json
{
  "indexes": [
    {
      "collectionGroup": "cards",
      "queryScope": "COLLECTION",
      "fields": [...]
    }
  ]
}
```

---

## 📝 Súbory zmenené

1. **Vytvorené:**
   - `/firestore.indexes.json` ✨ NEW

2. **Upravené:**
   - `/firebase.json` (pridaná firestore sekcia)
   - `/src/assets/components/TopCards.jsx` (lepší error handling)

---

## 🎯 Výsledok

**Pred:**
```
❌ Nepodarilo sa načítať top karty
```

**Po:**
```
✅ Top 10 kariet sa zobrazujú správne
🏆 #1 (zlatá)
🥈 #2 (strieborná)
🥉 #3 (bronzová)
💜 #4-10 (fialové)
```

---

## ⚠️ Pre budúcnosť

### **Ak pridáš nové queries s composite conditions:**

1. **Vytvor index definition** v `firestore.indexes.json`
2. **Deploy index:** `firebase deploy --only firestore:indexes`
3. **Počkaj 2-3 minúty** na vytvorenie
4. **Test query** v aplikácii

### **Alebo:**

Firebase automaticky vytvorí index pri prvom query fail a poskytne link:
```
https://console.firebase.google.com/v1/r/project/PROJECT_ID/firestore/indexes?create_composite=...
```

Klikni na link → auto-vytvorí index.

---

## 📚 Dokumentácia

**Firebase Indexes Guide:**
https://firebase.google.com/docs/firestore/query-data/indexing

**Composite Indexes:**
https://firebase.google.com/docs/firestore/query-data/index-overview#composite_indexes

---

## ✅ Checklist

- [x] ✅ firestore.indexes.json vytvorený
- [x] ✅ firebase.json upravený
- [x] ✅ Index deployed
- [x] ✅ Error handling zlepšený
- [x] ✅ Build & deploy
- [x] ✅ Index active
- [x] ✅ Top Cards fungujú

---

**Fixed by:** Claude Code
**Date:** 18. November 2025, 14:15 CET
**Status:** ✅ Resolved
