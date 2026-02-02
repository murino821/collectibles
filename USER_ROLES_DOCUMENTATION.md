# User Roles & Permissions System 👑

## Prehľad

Aplikácia teraz podporuje tri typy používateľov s rôznymi právami a limitmi.

---

## 🎭 Typy používateľov

### 1. 👤 **STANDARD** (Štandardný užívateľ)
- **Limit položiek:** 20 kariet v zbierke
- **Aktualizácia cien z eBay:** ❌ NIE (ani automaticky, ani manuálne)
- **Zadávanie cien:** Len manuálne - priamo v detaile karty
- **Cena:** Zadarmo
- **Ideálne pre:** Začínajúcich zberateľov, hobby collecting

### 2. ⭐ **PREMIUM** (Prémiový užívateľ)
- **Limit položiek:** Neobmedzený (∞)
- **Aktualizácia cien z eBay:** ✅ ÁNO
  - Automatická: 2× za mesiac (každých 15 dní)
  - Manuálna: 1× za 24 hodín
- **Cena:** TBD
- **Ideálne pre:** Pokročilých zberateľov, obchodníkov

### 3. 👑 **ADMIN** (Administrátor)
- **Limit položiek:** Neobmedzený (∞)
- **Aktualizácia cien z eBay:** ✅ ÁNO
  - Automatická: 2× za mesiac (každých 15 dní)
  - Manuálna: Bez limitu
- **Špeciálne práva:**
  - Prístup k admin panelu
  - Správa všetkých používateľov
  - Zmena rol ostatných užívateľov
  - Nastavenie update schedule pre všetkých
  - Môže spustiť aktualizáciu pre akéhokoľvek používateľa
- **Ideálne pre:** Správcov systému

---

## 🚀 Implementované funkcie

### Cloud Functions

#### `onUserCreate` (Trigger)
- Automaticky vytvára user dokument pri registrácii
- Priraďuje rolu: `standard` (default)
- Nastavuje limity podľa role
- Generuje náhodný update schedule

#### `onCardCreate` (Firestore Trigger)
- Kontroluje limit položiek pri vytváraní karty
- Ak user presiahne limit, karta sa vymaže
- Odošle notifikáciu o prekročení limitu
- Aktualizuje `currentCardCount` v user dokumente

#### `getAllUsers` (Callable Function) 👑 ADMIN ONLY
- Vracia zoznam všetkých používateľov so štatistikami
- Počet kariet, rola, limity, update schedule
- Prístup len pre adminov

#### `updateUserRole` (Callable Function) 👑 ADMIN ONLY
- Mení rolu používateľa (standard → premium → admin)
- Automaticky upraví limity podľa novej role
- Prístup len pre adminov
- Loguje kto a kedy zmenil rolu

#### `setScheduleForAllUsers` (Callable Function) 👑 ADMIN ONLY
- Nastaví `nextUpdateDate` pre všetkých users
- Používa sa v admin paneli pre hromadné update scheduling

---

## 🎨 UI Zmeny

### CardManager.jsx
- **Badge s rolou** - Zobrazuje aktuálnu rolu usera (👑 ADMIN / ⭐ PREMIUM / 👤 STANDARD)
- **Counter položiek** - Ukazuje `currentCardCount / cardLimit`
- Príklad: `15/20 položiek` alebo `150/∞ položiek`

### Admin Panel
- **URL:** `http://your-app.com/admin_panel.html`
- **Prístup:** Len pre users s role = `admin`
- **Funkcie:**
  - Zoznam všetkých users s ich štatistikami
  - Zmena role jedným klikom
  - Globálne štatistiky (celkom users, premium users, celkom cards)
  - Update schedule management

---

## 📊 Firestore Schéma

### `users/{userId}`
```javascript
{
  uid: string,
  email: string,
  displayName: string,
  photoURL: string,

  // Role & Subscription
  role: "admin" | "premium" | "standard",
  subscriptionStatus: "active" | "inactive",
  subscriptionStartDate: Timestamp,

  // Limits
  cardLimit: number,  // 20 for standard, 999999 for premium/admin
  currentCardCount: number,  // Auto-updated by onCardCreate trigger

  // Price Updates
  priceUpdatesEnabled: boolean,
  updateIntervalDays: number,  // 30 for standard, 15 for premium/admin
  updatesPerMonth: number,  // 1 for standard, 2 for premium/admin
  updateDayOfMonth: number,
  updateHourOfDay: number,
  nextUpdateDate: Timestamp,

  // Audit
  roleUpdatedAt: Timestamp,
  roleUpdatedBy: string,  // Admin UID who changed role
  createdAt: Timestamp
}
```

### `notifications/{notificationId}`
```javascript
{
  userId: string,
  type: "limit_exceeded" | "price_update_complete" | ...,
  title: string,
  message: string,
  read: boolean,
  createdAt: Timestamp,
  expiresAt: Timestamp,
  actionType: "upgrade_premium" | "view_log" | ...
}
```

---

## 🔧 Ako nastaviť admina

### Metóda 1: Firebase Console
1. Otvor Firebase Console → Firestore
2. Nájdi collection `users`
3. Vyber user dokumenty ktorému chceš dať admin
4. Uprav pole `role` na hodnotu: `"admin"`
5. Uprav `cardLimit` na: `999999`
6. Uprav `updateIntervalDays` na: `15`
7. Uprav `updatesPerMonth` na: `2`
8. Save

### Metóda 2: Admin Panel (ak už máš jedného admina)
1. Prihlás sa ako admin
2. Otvor admin panel: `http://127.0.0.1:8765/admin_panel.html`
3. Nájdi usera v tabuľke
4. Klikni "Zmeniť rolu"
5. Vyber "Admin"
6. Uložiť

---

## 🎯 Testovanie

### Test Standard User Limit
1. Prihlás sa ako standard user
2. Pridaj 20 položiek do zbierky
3. Pokús sa pridať 21. položku
4. Položka by sa mala vymazať automaticky
5. Objaví sa notifikácia o prekročení limitu

### Test Premium Upgrade
1. Otvor admin panel ako admin
2. Nájdi standard usera
3. Zmeň rolu na "Premium"
4. Overy že `cardLimit` sa zmenil na `999999`
5. User môže teraz pridávať neobmedzene

### Test Admin Panel Access
1. Prihlás sa ako standard user
2. Otvor admin panel URL
3. Mala by sa zobraziť hlá

ška "Prístup zamietnutý"
4. Prihlás sa ako admin
5. Admin panel by sa mal načítať správne

---

## 📝 Nastavenie update schedule

### Pre jedného usera (Admin Panel)
1. Otvor admin panel
2. Klikni "Nastaviť update na dnes o 11:00"
3. Všetci useri dostanú update dnes o 11:00

### Automatický systém
- Každý user má random `updateDayOfMonth` (1-28) a `updateHourOfDay` (0-23)
- Scheduled function `checkScheduledUpdates` beží každý deň o 11:00
- Nájde userov, ktorí majú `nextUpdateDate` = dnes
- Spustí pre nich `updateUserCollection()`
- Po dokončení nastaví `nextUpdateDate` + `updateIntervalDays` (30 alebo 15 dní)

---

## 🔐 Security Rules (Firestore)

Odporúčané pravidlá pre Firestore:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      // User môže čítať len svoj dokument
      allow read: if request.auth != null && request.auth.uid == userId;

      // User môže updatovať len svoj dokument (okrem role)
      allow update: if request.auth != null
                    && request.auth.uid == userId
                    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(['role', 'cardLimit', 'updateIntervalDays']);
    }

    // Cards collection
    match /cards/{cardId} {
      // User môže čítať len svoje karty
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;

      // User môže vytvárať karty len so svojím userId
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;

      // User môže upravovať len svoje karty
      allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }

    // Notifications collection
    match /notifications/{notifId} {
      allow read, update: if request.auth != null && resource.data.userId == request.auth.uid;
    }
  }
}
```

---

## 💡 Ďalšie vylepšenia (TODO)

- [ ] Platobný systém pre Premium upgrade (Stripe/PayPal)
- [ ] Email notifikácie pre limit exceeded
- [ ] Admin dashboard s grafmi a štatistikami
- [ ] Bulk operations v admin paneli (mass upgrade to premium)
- [ ] Trial period - 7 dní Premium zadarmo pre nových userov
- [ ] Discount codes pre Premium subscription
- [ ] Referral system - pozvi priateľa, dostaneš 1 mesiac Premium free

---

## 📞 Kontakt

Pre otázky ohľadom user management systému kontaktuj administrátora.

**Nasadené:** ${new Date().toLocaleString('sk-SK')}
**Verzia:** 2.0.0 - User Roles System
