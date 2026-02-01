import { useRef, useState, useEffect } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useToast } from './Toast';

export default function ImportCSV({ onImportComplete }) {
  const fileInputRef = useRef(null);
  const toast = useToast();
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const parseCSV = async (text) => {
    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    if (!lines.length) throw new Error('Prázdny súbor');

    const separator = text.includes(';') ? ';' : ',';
    const hasHeader = /^položka$/i.test(lines[0]);
    const start = hasHeader ? 1 : 0;

    const items = [];
    for (let i = start; i < lines.length; i++) {
      const cols = lines[i].split(separator);
      const name = cols[0].replace(/^"|"$/g, '').trim();
      if (name && name.length > 0) items.push(name);
    }

    return items;
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const itemNames = await parseCSV(text);

      if (itemNames.length === 0) {
        toast.warning('V súbore neboli nájdené žiadne položky.');
        return;
      }

      const user = auth.currentUser;
      if (!user) {
        toast.error('Musíš byť prihlásený!');
        return;
      }

      let added = 0;
      const cardsRef = collection(db, 'cards');

      for (const name of itemNames) {
        await addDoc(cardsRef, {
          userId: user.uid,
          item: name,
          buy: null,
          current: null,
          status: 'zbierka',
          note: '',
          imageUrl: null,
          imageName: null,
          createdAt: new Date()
        });
        added++;
      }

      toast.success(`Import hotový! Pridaných položiek: ${added}`);
      if (onImportComplete) onImportComplete();

    } catch (err) {
      console.error('Chyba pri importe:', err);
      toast.error('Chyba pri importe: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <label style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      padding: '10px 16px',
      minHeight: '44px',
      height: '100%',
      width: '100%',
      boxSizing: 'border-box',
      backgroundColor: '#f3e8ff',
      color: '#6b21a8',
      border: '1px solid #e9d5ff',
      borderRadius: '12px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      transition: 'all 0.2s',
      whiteSpace: 'nowrap'
    }}
    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e9d5ff'}
    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f3e8ff'}
    >
      📊 {isDesktop && <span>Import z </span>}CSV
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleImport}
        style={{ display: 'none' }}
      />
    </label>
  );
}
