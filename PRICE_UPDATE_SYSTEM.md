# Price Update System - Dokumentácia

## Prehľad

Aplikácia používa **randomizovaný systém automatických aktualizácií cien** z eBay API, kde každý používateľ má vlastný unikátny čas aktualizácie.

## Typy aktualizácií

### 1. Automatické (Scheduled) Aktualizácie
- **Frekvencia kontroly**: Každú hodinu (cron: `0 * * * *`)
- **Standard users**: 1× mesačne (interval 30 dní)
- **Premium users**: 2× mesačne (interval 15 dní)
- **Admin users**: 2× mesačne (interval 15 dní)

### 2. Manuálne Aktualizácie
- Spúšťané cez admin panel
- Real-time progress tracking
- Bez rate limitu pre adminov
- Rate limit pre standard users: 1× za 24 hodín

## Ako funguje randomizácia

### Pri registrácii nového usera (`onUserCreate`):

1. **Vygeneruje sa náhodný čas**:
   - Deň v mesiaci: 1-28
   - Hodina: 0-23

2. **Kontrola kolízií** (`findFreeTimeSlot`):
   - Skontroluje sa, či už iný user nemá aktualizáciu v tej istej hodine
   - Ak áno, vygeneruje sa nový náhodný čas (max 10 pokusov)
   - Výsledok: každý user má **unikátny časový slot**

3. **Výpočet prvej aktualizácie**:
   ```javascript
   nextUpdate.setDate(dayOfMonth);
   nextUpdate.setHours(hour, 0, 0, 0);
   // Ak dátum už prešiel tento mesiac, posunie sa na ďalší mesiac
   ```

### Pri ďalších aktualizáciách:

```javascript
// Standard user (30 dní)
nextUpdate = currentDate + 30 dní

// Premium user (15 dní)
nextUpdate = currentDate + 15 dní
```

Hodina zostáva rovnaká ako pri registrácii (`userData.updateHourOfDay`).

## Limity eBay API

### Free tier eBay Browse API:
- **5,000 calls/deň**
- **150,000 calls/mesiac**

### Naše limity:
- **1 karta = ~1 eBay API call**
- **Batch processing**: 20 kariet naraz, 10s pauza medzi batchmi
- **Global rate limiter**: 100 calls/minútu

### Príklad kapacity:

**Scenár 1: Len Standard users**
- 20 users × 20 kariet = 400 kariet/user
- 20 updates/mesiac × 400 calls = **8,000 calls/mesiac** ✅

**Scenár 2: Mix Standard + Premium**
- 10 standard users: 10 × 1 update × 400 calls = 4,000
- 10 premium users: 10 × 2 updates × 400 calls = 8,000
- **Spolu: 12,000 calls/mesiac** ✅

**Scenár 3: Unlimited Premium users**
- Teoreticky: 150,000 / (2 × 400) = **187 premium users**
- Prakticky s rezervou: **~100-150 premium users**

## Databázové polia

### User document:
```javascript
{
  // Update scheduling
  updateDayOfMonth: 15,           // Deň v mesiaci (1-28)
  updateHourOfDay: 8,             // Hodina (0-23)
  nextUpdateDate: Timestamp,      // Presný timestamp ďalšej aktualizácie
  updateIntervalDays: 30,         // 30 pre standard, 15 pre premium
  updatesPerMonth: 1,             // 1 pre standard, 2 pre premium

  // Status
  priceUpdatesEnabled: true,      // Zapnuté/vypnuté
  lastCollectionUpdate: Timestamp,

  // Role & limits
  role: "standard",               // "standard", "premium", "admin"
  cardLimit: 20                   // 20 pre standard, unlimited pre premium/admin
}
```

## Firestore Indexes

Vyžadovaný composite index pre `users` kolekciu:
```json
{
  "collectionGroup": "users",
  "fields": [
    {"fieldPath": "priceUpdatesEnabled", "order": "ASCENDING"},
    {"fieldPath": "nextUpdateDate", "order": "ASCENDING"}
  ]
}
```

## Cloud Functions

### `checkScheduledUpdates` (Scheduled)
- **Cron**: `0 * * * *` (každú hodinu)
- **Timezone**: Europe/Bratislava
- Vyhľadá users s `nextUpdateDate` v aktuálnej hodine
- Spustí `updateUserCollection` pre každého
- Vypočíta ďalší update dátum (+30 alebo +15 dní)

### `updateUserCollection` (Callable)
- Aktualizuje všetky karty usera
- Batch processing (20 kariet/batch)
- Real-time progress tracking cez `updateStatus` kolekciu
- Vracia výsledky: successCount, failCount, cardsProcessed

### `onUserCreate` (Trigger)
- Automaticky sa spustí pri registrácii
- Vytvorí user document s náhodným časom
- Kontroluje kolízie cez `findFreeTimeSlot()`

## Admin Panel Funkcie

### Manuálna aktualizácia
```javascript
const updateUserCollection = httpsCallable(functions, 'updateUserCollection');
await updateUserCollection({ userId: targetUserId });
```

### Zmena ďalšieho update dátumu
```javascript
const updateNextUpdateDate = httpsCallable(functions, 'updateNextUpdateDate');
await updateNextUpdateDate({
  targetUserId: userId,
  nextUpdateDate: newDate.toISOString()
});
```

## Monitoring

### Logy
```bash
firebase functions:log -n 100
```

### Update status (real-time)
```javascript
onSnapshot(doc(db, 'updateStatus', userId), (snapshot) => {
  const status = snapshot.data();
  // status.status: "processing" | "completed" | "error"
  // status.successCount, status.failCount, status.progress
});
```

### Update logs (history)
```javascript
const logs = await db.collection('updateLogs')
  .where('userId', '==', userId)
  .orderBy('timestamp', 'desc')
  .limit(10)
  .get();
```

## Best Practices

1. **Nemeniť `updateHourOfDay`** manuálne - môže spôsobiť kolízie
2. **Používať admin panel** pre zmeny rozvrhu
3. **Monitorovať eBay API usage** v developer dashboarde
4. **Rate limiting**: Nepridávať viac ako ~150 premium users
5. **Indexy**: Zabezpečiť že Firestore indexy sú vytvorené

## Troubleshooting

### Scheduled updates nefungujú
- Skontrolovať Firestore indexy (Firebase Console → Firestore → Indexes)
- Pozrieť logy: `firebase functions:log`
- Overiť že `priceUpdatesEnabled: true`

### eBay API chyby
- Rate limit exceeded → Zvýšiť `BATCH_PAUSE_MS` alebo znížiť `BATCH_SIZE`
- Token expired → Automaticky sa obnoví
- No results → Normálne, nie každá karta má predané položky

### Kolízie časov
- Funkcia `findFreeTimeSlot()` automaticky rieši
- Ak zlyhá po 10 pokusoch, použije sa posledný vygenerovaný čas
- S 672 slotmi (24h × 28 dní) je kolízia nepravdepodobná

## Budúce vylepšenia

- [ ] Adaptívny batch size podľa API usage
- [ ] Notifikácie pre users po aktualizácii
- [ ] Dashboard s eBay API usage metrics
- [ ] Auto-scaling pre premium users
- [ ] Fallback na iné price sources (CardMarket, TCGPlayer)
