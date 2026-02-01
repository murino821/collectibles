import { useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { t, getCurrentLanguage } from '../../translations';

/**
 * ProfileEditor - Modal for editing user profile (displayName, photoURL)
 */
function ProfileEditor({ user, isOpen, onClose, onUpdate, isMockAuth = false }) {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [photoURL, setPhotoURL] = useState(user.photoURL || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const lang = getCurrentLanguage();

  const handleSave = async () => {
    if (!displayName.trim()) {
      setError(t('profile.error.empty', lang));
      return;
    }

    if (isMockAuth) {
      onUpdate({ displayName: displayName.trim(), photoURL: photoURL.trim() });
      onClose();
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const userRef = doc(db, 'users', user.uid);
      // Use setDoc with merge to create or update
      await setDoc(userRef, {
        displayName: displayName.trim(),
        photoURL: photoURL.trim() || null,
        email: user.email,
        updatedAt: new Date(),
        createdAt: new Date() // Will only be set on first create
      }, { merge: true });

      console.log('Profile saved successfully');
      onUpdate({ displayName: displayName.trim(), photoURL: photoURL.trim() });
      onClose();
    } catch (err) {
      console.error('Error saving profile:', err);
      setError(`${lang === 'en' ? 'Failed to save profile' : lang === 'cz' ? 'Nepodařilo se uložit profil' : 'Nepodarilo sa uložiť profil'}: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>✏️ {t('profile.title', lang)}</h2>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        <div style={styles.content}>
          {/* Display Name */}
          <div style={styles.field}>
            <label style={styles.label}>
              {t('profile.name', lang)} <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={lang === 'en' ? 'Enter name' : lang === 'cz' ? 'Zadejte jméno' : 'Zadaj meno'}
              style={styles.input}
              maxLength={50}
            />
            <div style={styles.hint}>
              {t('profile.name.hint', lang)}
            </div>
          </div>

          {/* Photo URL */}
          <div style={styles.field}>
            <label style={styles.label}>{t('profile.photo', lang)}</label>
            <input
              type="url"
              value={photoURL}
              onChange={(e) => setPhotoURL(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              style={styles.input}
            />
            <div style={styles.hint}>
              {t('profile.photo.hint', lang)}
            </div>
          </div>

          {/* Preview */}
          {(displayName || photoURL) && (
            <div style={styles.preview}>
              <div style={styles.previewLabel}>{t('profile.preview', lang)}</div>
              <div style={styles.previewCard}>
                <div style={styles.avatar}>
                  {photoURL ? (
                    <img
                      src={photoURL}
                      alt={displayName}
                      style={styles.avatarImage}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    style={{
                      ...styles.avatarPlaceholder,
                      display: photoURL ? 'none' : 'flex'
                    }}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div style={styles.previewName}>{displayName || 'Anonym'}</div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={styles.error}>
              ❌ {error}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.cancelButton} disabled={saving}>
            {t('profile.cancel', lang)}
          </button>
          <button onClick={handleSave} style={styles.saveButton} disabled={saving}>
            {saving ? `⏳ ${t('profile.saving', lang)}` : `💾 ${t('profile.save', lang)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '20px'
  },
  modal: {
    background: 'white',
    borderRadius: '16px',
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #e2e8f0'
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '700',
    color: '#0f172a'
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#64748b',
    padding: '4px 8px',
    borderRadius: '4px',
    transition: 'all 0.2s'
  },
  content: {
    padding: '24px'
  },
  field: {
    marginBottom: '20px'
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: '8px'
  },
  input: {
    width: '100%',
    padding: '12px',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box'
  },
  hint: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '6px'
  },
  preview: {
    marginTop: '24px',
    padding: '16px',
    background: '#f8fafc',
    borderRadius: '12px',
    border: '1px solid #e2e8f0'
  },
  previewLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '12px'
  },
  previewCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  avatar: {
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    overflow: 'hidden',
    border: '2px solid #e2e8f0',
    position: 'relative'
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    fontSize: '20px',
    fontWeight: '700'
  },
  previewName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#0f172a'
  },
  error: {
    padding: '12px',
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: '8px',
    fontSize: '14px',
    marginTop: '16px'
  },
  footer: {
    display: 'flex',
    gap: '12px',
    padding: '20px 24px',
    borderTop: '1px solid #e2e8f0'
  },
  cancelButton: {
    flex: 1,
    padding: '12px 24px',
    background: '#f1f5f9',
    color: '#475569',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  saveButton: {
    flex: 1,
    padding: '12px 24px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
};

export default ProfileEditor;
