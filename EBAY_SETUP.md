# eBay API Setup - Sold Listings Integration

## Zmeny implementované ✅

### 1. **Sold Listings namiesto Buy It Now**
- Filter: `itemEndDate` - vyhľadáva len predané položky za posledných 90 dní
- Získava **reálne trhové ceny** z predajov
- Žiadne zľavy nie sú potrebné (sold price = market price)

### 2. **EUR mena namiesto USD**
- Marketplace: `EBAY_DE` (Nemecko - pokrýva EU trh)
- Filter: `priceCurrency:EUR`
- Všetky ceny v eurách

### 3. **Vylepšený výpočet ceny**
- Získa 20 predaných položiek (namiesto 10)
- Odstráni outliers (top 10% a bottom 10%)
- Priemer z trimmed prices = najpresnejšia trhová cena

---

## Potrebné kroky pre deployment

### Krok 1: Povoliť eBay Production Keyset

Na stránke: https://developer.ebay.com/my/keys

1. Klikni na **"CardPrices"** keyset
2. Klikni na **"apply for an exemption"** alebo **"subscribe to notifications"**
3. Počkaj na schválenie (zvyčajne pár hodín)

---

### Krok 2: Skopírovať credentials

Po povolení keysetu získaj:

```
App ID (Client ID): xxxxx
Cert ID (Client Secret): xxxxx
Dev ID: xxxxx
```

---

### Krok 3: Nastaviť Firebase config

```bash
cd /home/miroslav/release_nhl

firebase functions:config:set \
  ebay.client_id="TVOJ_APP_ID" \
  ebay.client_secret="TVOJ_CERT_ID" \
  ebay.dev_id="TVOJ_DEV_ID" \
  ebay.env="production"
```

---

### Krok 4: Deploy functions

```bash
npm run build
firebase deploy --only functions
```

---

## Ako to funguje

### Vyhľadávanie sold listings:

```javascript
// Filter parametre
filter: `buyingOptions:{AUCTION|FIXED_PRICE},itemEndDate:[${dateFilter}..],priceCurrency:EUR`
```

- `itemEndDate:[date..]` - len predané položky
- `priceCurrency:EUR` - len EUR ceny
- `buyingOptions:{AUCTION|FIXED_PRICE}` - aukcie aj Buy It Now

### Výpočet ceny:

1. Získa 20 predaných položiek
2. Odstráni 10% najlacnejších a 10% najdrahších
3. Vypočíta priemer zostávajúcich cien
4. **Výsledok = reálna trhová cena v EUR**

---

## Test príklad

```javascript
// Input: "Connor McDavid Young Guns 2015"
// Query eBay: "connor mcdavid young guns 2015 card"
// Nájde: 15 predaných kariet za posledných 90 dní
// Ceny: €120, €125, €130, €135, €140, ...
// Odstráni outliers: €125-€175
// Priemer: €145
// Result: €145 (reálna trhová cena)
```

---

## Výhody sold listings

✅ **Reálne ceny** - skutočne predané položky, nie spekulatívne ponuky
✅ **Presnejšie** - žiadne "wishful thinking" ceny od predajcov
✅ **EUR mena** - priamo v eurách pre slovenský trh
✅ **Čerstvé dáta** - len posledných 90 dní
✅ **Trimmed average** - odstráni extrémne outliers

---

## Automatické aktualizácie

- Používateľ môže povoliť auto-update každých 30 dní
- Firebase Cloud Function beží o 3:00 ráno
- Automaticky aktualizuje ceny všetkých položiek v zbierke

---

## Potrebná akcia od teba

1. ✅ Kód je hotový
2. ⏳ **Povolíš Production keyset na eBay**
3. ⏳ **Pošleš mi credentials** (App ID, Cert ID, Dev ID)
4. ⏳ Nastavím Firebase config
5. ⏳ Deploy functions

**Daj mi vedieť keď budeš mať credentials!** 🚀
