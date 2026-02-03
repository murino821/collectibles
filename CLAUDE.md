# Project: NHL Hockey Cards Collection

Webová aplikácia na správu zbierky hokejových kariet s automatickou aktualizáciou cien.

## 🎯 PROJECT CONTEXT

Osobná aplikácia pre správu zbierky hokejových kariet:
- Evidencia kariet s hodnotami a stavom
- Automatická aktualizácia cien cez eBay API
- Grafy vývoja hodnoty portfólia
- Viacjazyčná podpora (SK/EN)

**Repository:** release_nhl
**Hosting:** Firebase Hosting
**Firebase Project ID:** your-card-collection-2026

---

## 👤 AI ROLES

### Technical Role
Senior JavaScript/React engineer delivering production-ready code.
- Vždy analyzuj existujúci kód pred navrhovaním zmien
- Mysli systémovo - zváž závislosti naprieč celým projektom
- Architektonické zmeny vyžadujú explicitné schválenie pred implementáciou

### Domain Role
Špecialista na zberateľské aplikácie a e-commerce integrácie.
- UX/UI musí byť intuitívne pre správu zbierky
- Dátová integrita je priorita - ceny a hodnoty musia byť presné
- Výkon aplikácie je kľúčový pri veľkých zbierkach

---

## 🔄 SDLC WORKFLOW

### Kompletný vývojový cyklus

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEVELOPMENT CYCLE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. USER → Claude Code      Prompt s popisom problému           │
│  2. Claude Code             Analýza + návrh + tasklist          │
│  3. USER                    Rozhodnutie o prioritách/úlohách    │
│  4. Claude Code             Implementácia úloh                  │
│  5. Claude Code             lint → build → localhost test       │
│  6. Codex (VSCode)          Code review (funkčnosť, UX, UI)     │
│  7. USER                    Hodnotenie → OK alebo → späť na 2   │
│  8. Claude Code             git add + commit + push             │
│  9. Copilot (GitHub)        Analýza PUSH pred deployom          │
│ 10. USER                    Finálne rozhodnutie o deploy        │
│ 11. Claude Code             firebase deploy (produkcia)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Detailný popis krokov

#### Fáza 1-3: ANALÝZA A PLÁNOVANIE
| Krok | Kto | Čo sa deje |
|------|-----|------------|
| 1 | USER | Napíše prompt s popisom problému/požiadavky |
| 2 | Claude Code | Pripraví analýzu, návrh riešenia, aktualizuje tasklist |
| 3 | USER | Schváli/upraví priority a vyberie úlohy na implementáciu |

#### Fáza 4-5: IMPLEMENTÁCIA
| Krok | Kto | Čo sa deje |
|------|-----|------------|
| 4 | Claude Code | Implementuje schválené úlohy |
| 5 | Claude Code | Spustí `npm run lint` → `npm run build` → otestuje na localhost |

#### Fáza 6-7: CODE REVIEW (Codex)
| Krok | Kto | Čo sa deje |
|------|-----|------------|
| 6 | Codex (VSCode) | Analyzuje zmeny: funkčnosť, UX, UI |
| 7 | USER | Hodnotí výstup. **OK** → pokračuj na 8. **NIE** → späť na 2 so zisteniami |

#### Fáza 8-10: GIT & REVIEW (Copilot)
| Krok | Kto | Čo sa deje |
|------|-----|------------|
| 8 | Claude Code | `git add` → `git commit` → `git push origin main` |
| 9 | Copilot (GitHub) | Analyzuje posledný push, overuje zmysel zmien |
| 10 | USER | Finálne rozhodnutie. **OK** → deploy. **NIE** → späť na 2 |

#### Fáza 11: DEPLOY
| Krok | Kto | Čo sa deje |
|------|-----|------------|
| 11 | Claude Code | `firebase deploy` - nasadenie do produkcie |

### Zodpovednosti nástrojov

| Nástroj | Zodpovednosť |
|---------|--------------|
| **Claude Code** | Analýza, implementácia, build, commit, push, deploy |
| **Codex (VSCode)** | Code review pred commitom (vidí projekt lokálne) |
| **Copilot (GitHub)** | Code review po push (vidí commit v GitHub) |
| **USER** | Rozhodnutia v bodoch 3, 7, 10 |

---

## 🛠 TECH STACK

```
Framework:    React 19 + Vite 7
Language:     JavaScript (ES6+, JSX)
Styling:      CSS (samostatné súbory)
Charts:       Recharts 3.4
Backend:      Firebase (Auth, Firestore, Storage, Functions)
Runtime:      Node.js 20 (Cloud Functions)
```

---

## 📁 PROJECT STRUCTURE

```
/src
  /assets/components      # React komponenty
    CardTable.jsx         # Tabuľka kariet
    CardForm.jsx          # Formulár pre karty
    Filters.jsx           # Filtrovanie kariet
    Stats.jsx             # Štatistiky zbierky
    TopCards.jsx          # Top karty podľa hodnoty
    PriceHistoryChart.jsx # Graf histórie cien
    PortfolioChart.jsx    # Graf hodnoty portfólia
    ImportCSV.jsx         # Import z CSV
    NotificationPanel.jsx # Notifikácie
    ProfileEditor.jsx     # Úprava profilu
    LanguageSwitcher.jsx  # Prepínač jazykov
    ImageModal.jsx        # Modal pre obrázky
  App.jsx                 # Hlavná aplikácia
  App.css                 # Hlavné štýly
  firebase.js             # Firebase konfigurácia
  Login.jsx               # Prihlásenie
  LoginModal.css          # Štýly prihlasovania
  CardManager.jsx         # Správa kariet
  LandingPage.jsx         # Vstupná stránka
  LandingPage.css         # Štýly vstupnej stránky
  CollectorsPage.jsx      # Stránka zberateľov
  CollectorsPage.css      # Štýly zberateľov
  LanguageContext.jsx     # Context pre jazyky
  translations.js         # Preklady SK/EN
  main.jsx                # Entry point
  index.css               # Globálne štýly
/functions
  index.js                # Cloud Functions
  rateLimiter.js          # Rate limiting pre API
  package.json            # Závislosti funkcií
/public                   # Statické súbory
/dist                     # Build výstup
admin_panel.html          # Admin rozhranie
admin_logs.html           # Logy administrátora
update_schedule.html      # Nastavenie plánovania
```

---

## 🌍 I18N IMPLEMENTATION

### Podporované jazyky
1. **SK (default)** - Slovenčina - primárny jazyk
2. **EN** - Angličtina

### Použitie prekladov
```javascript
import { useLanguage } from './LanguageContext';

const { t } = useLanguage();
// t('cards.title') → 'Moje karty' alebo 'My Cards'
```

---

## 📜 NPM SCRIPTS

### Frontend (root)
```bash
npm run dev      # Vite dev server
npm run build    # Build + kopírovanie admin HTML do dist/
npm run lint     # ESLint
npm run preview  # Preview production build
```

### Cloud Functions
```bash
cd functions
npm run serve    # Lokálne emulátory
npm run deploy   # Deploy funkcií
npm run logs     # Firebase logs
```

---

## 🔥 FIREBASE COMMANDS

```bash
firebase deploy                    # Deploy všetkého
firebase deploy --only hosting     # Iba hosting
firebase deploy --only functions   # Iba Cloud Functions
firebase deploy --only firestore:rules  # Iba pravidlá
firebase emulators:start           # Lokálne testovanie
```

---

## ✅ CODING STANDARDS

### Must Do
- Funkcionálne komponenty s hooks
- Všetky texty cez translation system
- Konzistentné pomenovanie: PascalCase komponenty, camelCase funkcie
- Error handling pre Firebase operácie
- Loading states pre async operácie

### Must NOT Do
- ❌ Žiadne inline štýly - používaj CSS súbory
- ❌ Žiadne console.log v produkcii
- ❌ Nekomitovaťcitlivé údaje (API keys sú v firebase.js OK - Firebase je na to dizajnovaný)

---

## 🗄 FIRESTORE COLLECTIONS

```
/users/{userId}           # Profily používateľov
/users/{userId}/cards     # Karty používateľa
/priceHistory             # História cien
/notifications            # Notifikácie
/adminLogs                # Admin logy
```

---

## 🔐 AUTHENTICATION

- Google Sign-In cez Firebase Auth
- Admin role uložená v custom claims
- Firestore rules kontrolujú prístup podľa userId

---

## 🤖 PRÍKAZY PRE CLAUDE CODE

### BUILD
Keď poviem **"BUILD"**, vykonaj:
```bash
npm run lint
npm run build
```
Nahlas výsledok: počet errorov, warningov, úspešnosť buildu.

### DEPLOY
Keď poviem **"DEPLOY"**, vykonaj:
```bash
firebase deploy
```
Nahlas stav deploymentu.

### DEPLOY FUNCTIONS
Keď poviem **"DEPLOY FUNCTIONS"**, vykonaj:
```bash
cd functions && npm run deploy
```

### CHECK
Keď poviem **"CHECK"**, vykonaj:
```bash
npm run lint
npm run build
```
Nahlas všetky nájdené chyby.

---

## 📝 COMMIT MESSAGE FORMAT

```
type(scope): stručný popis

- Detail 1
- Detail 2

🤖 Generated with Claude Code
```

**Types:** feat, fix, refactor, style, docs, chore, perf

**Príklady:**
- `feat(cards): pridané filtrovanie podľa tímu`
- `fix(auth): opravené presmerovanie po prihlásení`
- `refactor(charts): optimalizácia renderingu grafov`

---

## 🚨 CRITICAL REMINDERS

1. **Pri úprave Cloud Functions** - nezabudni `cd functions && npm install` ak pridávaš závislosti
2. **Firestore indexy** - musia sa deploynúť samostatne pri nových compound queries
3. **Build script** - automaticky kopíruje admin HTML súbory do dist/
4. **Rate limiting** - eBay API má limity, používaj rateLimiter.js
5. **Admin HTML súbory** - nie sú súčasťou React buildu, edituj priamo
