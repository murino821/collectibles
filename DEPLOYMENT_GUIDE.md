# 🚀 Deployment Guide - Automatické aktualizácie cien

> **Krok-po-kroku návod** na nasadenie Firebase Cloud Functions a notification systému

---

## 📋 Checklist pred deploymentom

Pred nasadením over, že máš:

- ✅ eBay Developer account a credentials (Client ID + Secret)
- ✅ Firebase projekt (`your-card-collection-2026`)
- ✅ Firebase CLI nainštalované (`npm install -g firebase-tools`)
- ✅ Prihlásený v Firebase CLI (`firebase login`)

---

## 1️⃣ Inštalácia Firebase Functions dependencies

```bash
cd /home/miroslav/release_nhl/functions
npm install
```

**Tento príkaz nainstaluje:**
- `firebase-admin` - Firebase SDK pre server
- `firebase-functions` - Cloud Functions runtime
- `node-fetch` - HTTP client pre eBay API

---

## 2️⃣ Konfigurácia eBay API credentials

### **A) Získaj eBay credentials**

1. Choď na: https://developer.ebay.com/my/keys
2. Vytvor/otvor svoju aplikáciu
3. Skopíruj:
   - **App ID (Client ID)**: `Miroslav-NHLCards-PRD-abc123456`
   - **Cert ID (Client Secret)**: `PRD-abc123456def789xyz`

### **B) Nastav credentials v Firebase**

```bash
cd /home/miroslav/release_nhl

# Set eBay credentials
firebase functions:config:set \
  ebay.client_id="TVOJ_CLIENT_ID" \
  ebay.client_secret="TVOJ_CLIENT_SECRET" \
  ebay.env="production"

# Verify config
firebase functions:config:get
```

**Výstup by mal vyzerať:**
```json
{
  "ebay": {
    "client_id": "Miroslav-NHLCards-PRD-...",
    "client_secret": "PRD-...",
    "env": "production"
  }
}
```

### **C) Pre lokálne testovanie**

```bash
cd functions

# Vytvor .runtimeconfig.json
echo '{
  "ebay": {
    "client_id": "TVOJ_CLIENT_ID",
    "client_secret": "TVOJ_CLIENT_SECRET",
    "env": "production"
  }
}' > .runtimeconfig.json

# IMPORTANT: .runtimeconfig.json je v .gitignore - nikdy ho necommituj!
```

---

## 3️⃣ Deploy Cloud Functions

```bash
cd /home/miroslav/release_nhl

# Deploy len functions
firebase deploy --only functions

# Alebo deploy všetko (hosting + functions)
firebase deploy
```

**Deployment môže trvať 2-5 minút.**

### **Očakávaný výstup:**

```
✔  functions: Finished running predeploy script.
i  functions: ensuring required API cloudfunctions.googleapis.com is enabled...
i  functions: ensuring required API cloudbuild.googleapis.com is enabled...
✔  functions: required API cloudfunctions.googleapis.com is enabled
✔  functions: required API cloudbuild.googleapis.com is enabled
i  functions: preparing functions directory for uploading...
i  functions: packaged functions (XX KB) for uploading
✔  functions: functions folder uploaded successfully
i  functions: creating Node.js 18 function checkScheduledUpdates...
i  functions: creating Node.js 18 function updateUserCollection...
i  functions: creating Node.js 18 function onUserCreate...
✔  functions[checkScheduledUpdates(us-central1)]: Successful create operation.
✔  functions[updateUserCollection(us-central1)]: Successful create operation.
✔  functions[onUserCreate(us-central1)]: Successful create operation.

✔  Deploy complete!

Functions deployed:
- checkScheduledUpdates(us-central1)
- updateUserCollection(us-central1)
- onUserCreate(us-central1)
```

---

## 4️⃣ Verifikácia deploymentu

### **A) Skontroluj functions v Firebase Console**

1. Choď na: https://console.firebase.google.com/project/your-card-collection-2026/functions
2. Mal by si vidieť 3 functions:
   - `checkScheduledUpdates` - Scheduled (každý deň o 3:00)
   - `updateUserCollection` - HTTPS Callable
   - `onUserCreate` - Auth Trigger

### **B) Test eBay API connection**

```bash
# Trigger test function manuálne
firebase functions:log --only checkScheduledUpdates

# Očakávaný log:
# "No users scheduled for update today" (ak nikto nemá scheduled update dnes)
```

---

## 5️⃣ Inicializácia existujúcich userov

Ak máš už existujúcich userov v databáze, musíš im prideliť update schedules:

### **Variant A: Firestore Console (Manual)**

1. Choď na: https://console.firebase.google.com/project/your-card-collection-2026/firestore
2. Pre každý dokument v `users` collection pridaj:

```javascript
{
  priceUpdatesEnabled: true,
  updateDayOfMonth: 15,        // Random 1-28
  updateHourOfDay: 3,           // Random 0-23
  nextUpdateDate: Timestamp,    // Vypočítaj: 15. deň ďalšieho mesiaca o 3:00
  updateIntervalDays: 30,
  cardLimit: 500,
  emailNotifications: false,
  inAppNotifications: true
}
```

### **Variant B: Script (Automatic)**

Vytvor jednorázový script `init-users.js`:

```javascript
// init-users.js
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function initializeUsers() {
  const usersSnapshot = await db.collection('users').get();

  for (const userDoc of usersSnapshot.docs) {
    const dayOfMonth = Math.floor(Math.random() * 28) + 1;
    const hour = Math.floor(Math.random() * 24);

    const nextUpdate = new Date();
    nextUpdate.setDate(dayOfMonth);
    nextUpdate.setHours(hour, 0, 0, 0);

    if (nextUpdate < new Date()) {
      nextUpdate.setMonth(nextUpdate.getMonth() + 1);
    }

    await userDoc.ref.update({
      priceUpdatesEnabled: true,
      updateDayOfMonth: dayOfMonth,
      updateHourOfDay: hour,
      nextUpdateDate: nextUpdate,
      updateIntervalDays: 30,
      cardLimit: 500,
      emailNotifications: false,
      inAppNotifications: true
    });

    console.log(`✅ Initialized user ${userDoc.id}: Day ${dayOfMonth}, Hour ${hour}`);
  }

  console.log('🎉 All users initialized!');
}

initializeUsers().then(() => process.exit(0));
```

**Spusti:**
```bash
cd functions
node init-users.js
```

---

## 6️⃣ Testovanie notifikácií

### **A) Vytvor test notifikáciu v Firestore Console**

```javascript
// Collection: notifications
{
  userId: "TVOJ_USER_UID",  // Doplň skutočný UID
  type: "price_update_complete",
  title: "✅ Zbierka aktualizovaná",
  message: "Ceny 50 kariet boli aktualizované. Celková hodnota: €5,432",
  read: false,
  createdAt: serverTimestamp(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  actionType: "view_log",
  actionData: {
    successCount: 50,
    failCount: 0,
    totalValue: 5432
  }
}
```

### **B) Over v aplikácii**

1. Otvor app: https://your-card-collection-2026.web.app
2. Prihlás sa
3. Mal by si vidieť **červený badge** na 🔔 ikone
4. Klikni na 🔔 → otvorí sa notification panel
5. Klikni na notifikáciu → zobrazí detail

---

## 7️⃣ Monitorovanie a logy

### **Realtime logs**

```bash
# All functions logs
firebase functions:log

# Specific function
firebase functions:log --only checkScheduledUpdates

# Filter errors
firebase functions:log | grep ERROR

# Follow (real-time)
firebase functions:log --only checkScheduledUpdates --follow
```

### **Firebase Console logs**

1. Choď na: https://console.firebase.google.com/project/your-card-collection-2026/functions/logs
2. Filter podľa function name
3. Nájdeš detailné logy pre každý run

---

## 8️⃣ Troubleshooting

### **Problém: "eBay credentials not configured"**

**Riešenie:**
```bash
firebase functions:config:set \
  ebay.client_id="..." \
  ebay.client_secret="..."

# Re-deploy
firebase deploy --only functions
```

---

### **Problém: "CORS error" pri manual trigger**

**Riešenie:**
HTTPS callable functions sú dostupné len z aplikácie, nie z browsera priamo.

Test cez app:
```javascript
// V CardManager.jsx - pridaj debug button
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const updateCollection = httpsCallable(functions, 'updateUserCollection');

// Button onClick
const handleManualUpdate = async () => {
  try {
    const result = await updateCollection();
    alert('Update complete: ' + JSON.stringify(result.data));
  } catch (error) {
    alert('Error: ' + error.message);
  }
};
```

---

### **Problém: "Daily budget exceeded"**

**Riešenie:**
1. Počkaj do ďalšieho dňa (budget sa resetuje o polnoci)
2. Alebo zažiadaj o zvýšenie limitu: https://developer.ebay.com/support

---

### **Problém: Functions timeout (>60s)**

**Riešenie:**
Upgrade Firebase plan na **Blaze (Pay as you go)** pre extended timeout (9 min).

```bash
# Set timeout in functions/index.js
exports.checkScheduledUpdates = functions
  .runWith({ timeoutSeconds: 540 }) // 9 minutes
  .pubsub.schedule(...)
```

---

## 9️⃣ Frontend build & deploy

```bash
cd /home/miroslav/release_nhl

# Build
npm run build

# Deploy hosting + functions
firebase deploy

# Alebo len hosting
firebase deploy --only hosting
```

---

## 🔟 Scheduled job overenie

### **Ako overiť že scheduled job funguje?**

1. **Firebase Console:**
   - Choď na: https://console.firebase.google.com/project/your-card-collection-2026/functions
   - Klikni na `checkScheduledUpdates`
   - Skontroluj "Last execution" timestamp
   - Mal by sa spúšťať každý deň o 3:00 AM

2. **Logs:**
   ```bash
   firebase functions:log --only checkScheduledUpdates --limit 10
   ```

3. **Test notification:**
   - Nastav `nextUpdateDate` na dnes v Firestore
   - Počkaj na scheduled run (3:00 AM)
   - Alebo trigger manuálne cez Firestore Console

---

## ✅ Post-deployment checklist

- [ ] ✅ Functions deployed successfully
- [ ] ✅ eBay credentials configured
- [ ] ✅ Existujúci useri majú update schedules
- [ ] ✅ Test notifikácia funguje
- [ ] ✅ Notification badge sa zobrazuje
- [ ] ✅ Logs sú čisté (bez errors)
- [ ] ✅ Scheduled job je active
- [ ] ✅ Frontend deployed

---

## 📊 Očakávané správanie

### **Pre nového usera:**

```
1. User sa registruje
   → onUserCreate trigger
   → Automaticky vytvorí user document s random schedule

2. User pridáva karty
   → Normálna funkcionalita

3. O 30 dní (scheduled date)
   → checkScheduledUpdates (3:00 AM)
   → updateUserCollection
   → 2-3 minúty spracovanie
   → Vytvorí notification

4. User otvorí app
   → Vidí badge 🔔 (1)
   → Klikne → Detail update
   → Všetky ceny aktuálne!
```

### **Daily budget tracking:**

```
Deň 1: 36 users × 100 kariet = 3,600 API calls
Deň 2: 36 users × 100 kariet = 3,600 API calls
...
Deň 28: 36 users × 100 kariet = 3,600 API calls

Total monthly: ~100,000 API calls (66% of 150,000 limit)
```

---

## 🔗 Užitočné linky

- **Firebase Console:** https://console.firebase.google.com/project/your-card-collection-2026
- **eBay Developer Portal:** https://developer.ebay.com/my/keys
- **Functions Logs:** https://console.firebase.google.com/project/your-card-collection-2026/functions/logs
- **Firestore Database:** https://console.firebase.google.com/project/your-card-collection-2026/firestore

---

## 💰 Cost overview

| Service | Usage | Firebase Free Tier | Status |
|---------|-------|-------------------|--------|
| Cloud Functions (invocations) | ~900/month | 2M/month | ✅ 0.045% |
| Cloud Functions (compute) | ~3 min/month | 400,000 GB-s/month | ✅ <0.01% |
| Firestore reads | ~3,000/day | 50,000/day | ✅ 6% |
| Firestore writes | ~1,500/day | 20,000/day | ✅ 7.5% |
| Cloud Scheduler | 1 job | 3 jobs | ✅ 33% |

**Total cost: €0/mesiac** (hlboko v free tier limits)

---

## 🎉 Gratulujem!

Automatické aktualizácie cien sú **live**!

Systém teraz:
- ✅ Automaticky aktualizuje ceny každý mesiac
- ✅ Fair distribution naprieč 28 dňami
- ✅ Rate limiting protection
- ✅ User notifications
- ✅ Audit logs
- ✅ Zero operating costs

**Užívaj!** 🚀
