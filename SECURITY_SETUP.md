# Security Setup Guide

Tento dokument obsahuje návod na nastavenie bezpečnostných opatrení pre Hockey Cards Collection aplikáciu.

---

## 1. Firebase Budget Alerts (POVINNÉ)

### Krok za krokom:

1. **Otvor Google Cloud Console**
   - https://console.cloud.google.com/billing/budgets?project=your-card-collection-2026

2. **Vytvor nový budget**
   - Klikni "CREATE BUDGET"
   - Name: `Hockey Cards Monthly Budget`
   - Projects: `your-card-collection-2026`

3. **Nastav sumy alertov**
   ```
   Budget amount: $25/mesiac (alebo podľa tvojich možností)

   Alert thresholds:
   - 25% ($6.25)  → Email notification
   - 50% ($12.50) → Email notification
   - 75% ($18.75) → Email notification
   - 90% ($22.50) → Email notification + možnosť automatického vypnutia
   - 100% ($25)   → Email notification
   ```

4. **Nastav notifikácie**
   - Email recipients: tvoj email
   - Voliteľne: Webhook pre Slack/Discord

5. **Voliteľné: Automatické vypnutie pri prekročení**
   - Cloud Billing > Budgets & alerts > Manage notifications
   - Nastav Cloud Function na automatické vypnutie služieb

---

## 2. Firebase App Check (ODPORÚČANÉ)

App Check chráni backend pred botmi a neautorizovanými klientmi.

### Nastavenie:

1. **Firebase Console**
   - https://console.firebase.google.com/project/your-card-collection-2026/appcheck

2. **Registruj aplikáciu**
   - Klikni na "Register" pri tvojej web aplikácii
   - Vyber "reCAPTCHA Enterprise"

3. **Google Cloud Console - vytvor reCAPTCHA key**
   - https://console.cloud.google.com/security/recaptcha?project=your-card-collection-2026
   - Klikni "CREATE KEY"
   - Vyber "Website" a "Score-based (invisible)"
   - Pridaj domény: `your-card-collection-2026.web.app`, `localhost`

4. **Aktualizuj firebase.js**
   - Nahraď `'YOUR_RECAPTCHA_SITE_KEY'` skutočným kľúčom

5. **Enforce App Check (po testovaní)**
   - Firebase Console > App Check > APIs
   - Zapni enforcement pre Firestore, Storage, Functions

---

## 3. Firestore Security Rules (UŽ NASTAVENÉ)

Aktuálne pravidlá obsahujú:

- **Data validation** - maximálne dĺžky polí, validné hodnoty
- **Rate limiting helpers** - pripravené funkcie
- **Catch-all deny** - všetko čo nie je explicitne povolené je zakázané

### Limity nastavené v pravidlách:
| Pole | Max veľkosť |
|------|-------------|
| item | 500 znakov |
| note | 2000 znakov |
| imageUrl | 1000 znakov |
| displayName | 100 znakov |
| ceny | max 10,000,000 € |

---

## 4. Cloud Functions Rate Limiting (UŽ NASTAVENÉ)

Limity v `rateLimiter.js`:

```javascript
REQUESTS_PER_SECOND = 2        // Max eBay API volaní za sekundu
DAILY_BUDGET = 4500            // Max eBay API volaní za deň
MAX_CARDS_PER_USER = 500       // Max kariet na používateľa
MAX_UPDATES_PER_HOUR = 2       // Max manuálnych aktualizácií za hodinu
MAX_FUNCTION_CALLS_PER_MINUTE = 30  // Max volaní Cloud Functions za minútu
```

---

## 5. Monitoring a Alerting

### Firebase Performance Monitoring
- Automaticky sleduje výkon aplikácie
- Console: https://console.firebase.google.com/project/your-card-collection-2026/performance

### Cloud Logging
- Všetky Cloud Functions logujú do Cloud Logging
- Console: https://console.cloud.google.com/logs?project=your-card-collection-2026

### Odporúčané metriky na sledovanie:
1. `cloudfunctions.googleapis.com/function/execution_count` - počet vykonaní
2. `firestore.googleapis.com/document/read_count` - počet čítaní
3. `firestore.googleapis.com/document/write_count` - počet zápisov

---

## 6. Bezpečnostný checklist pred produkciou

- [ ] Budget alerts nastavené
- [ ] App Check aktivovaný a enforced
- [ ] Firestore rules nasadené
- [ ] Cloud Functions rate limiting aktívny
- [ ] Admin účet má silné heslo / 2FA
- [ ] API keys obmedzené na domény
- [ ] Testovacie dáta odstránené
- [ ] Console.log statements odstránené z produkcie

---

## 7. Reakcia na incident

### Ak zistíš neobvyklú aktivitu:

1. **Okamžite**
   - Skontroluj Cloud Logging
   - Skontroluj billing dashboard

2. **Ak je útok aktívny**
   - Firebase Console > Firestore > Rules > Nastav `allow read, write: if false;`
   - Alebo: `firebase deploy --only firestore:rules` s prázdnymi pravidlami

3. **Po incidente**
   - Analyzuj logy
   - Identifikuj zraniteľnosť
   - Uprav pravidlá

---

## Kontakt pre bezpečnostné incidenty

Ak zistíš bezpečnostnú zraniteľnosť, kontaktuj: [tvoj email]

---

*Dokument vytvorený: 2026-01-29*
*Posledná aktualizácia: 2026-01-29*
