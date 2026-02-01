import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { useToast } from './Toast';

function NotificationPanel({ user, darkMode, onClose }) {
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Subscribe to notifications
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotifications(notifs);
      setUnreadCount(notifs.length);
    });

    return () => unsubscribe();
  }, [user]);

  const markAsRead = async (notificationId) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const batch = writeBatch(db);
      notifications.forEach(notif => {
        batch.update(doc(db, 'notifications', notif.id), { read: true });
      });
      await batch.commit();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Teraz';
    if (diffMins < 60) return `pred ${diffMins} min`;
    if (diffHours < 24) return `pred ${diffHours} h`;
    if (diffDays < 7) return `pred ${diffDays} dňami`;
    return date.toLocaleDateString('sk-SK');
  };

  const handleNotificationClick = async (notif) => {
    // Mark as read
    await markAsRead(notif.id);

    // Handle action based on type
    if (notif.actionType === 'view_log') {
      // Mohli by sme otvoriť detail modal s logom
      console.log('View log:', notif.actionData);
      toast.info(`Update detail:\n✅ Úspešne: ${notif.actionData.successCount}\n❌ Neúspešne: ${notif.actionData.failCount}\n💰 Celková hodnota: €${notif.actionData.totalValue.toFixed(2)}`, 8000);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: '100%',
      maxWidth: '400px',
      height: '100vh',
      background: darkMode ? '#1e293b' : 'white',
      boxShadow: '-4px 0 20px rgba(0,0,0,0.2)',
      zIndex: 9999,
      overflowY: 'auto',
      padding: '20px',
      paddingTop: 'max(20px, env(safe-area-inset-top, 20px))',
      paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
      paddingRight: 'max(20px, env(safe-area-inset-right, 20px))',
      animation: 'slideInRight 0.3s ease-out'
    }}>
      <style>
        {`
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
            }
            to {
              transform: translateX(0);
            }
          }
        `}
      </style>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: `2px solid ${darkMode ? '#334155' : '#e2e8f0'}`
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>🔔 Notifikácie</h3>
          {unreadCount > 0 && (
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              {unreadCount} {unreadCount === 1 ? 'nová' : 'nové'}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '24px',
            cursor: 'pointer',
            padding: '4px 8px',
            color: darkMode ? '#f8fafc' : '#0f172a'
          }}
        >
          ✕
        </button>
      </div>

      {notifications.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#64748b'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <p style={{ margin: 0 }}>Žiadne nové notifikácie</p>
        </div>
      ) : (
        <>
          {notifications.map(notif => (
            <div
              key={notif.id}
              style={{
                padding: '16px',
                background: darkMode ? '#334155' : '#f8fafc',
                borderRadius: '12px',
                marginBottom: '12px',
                cursor: 'pointer',
                border: `2px solid ${darkMode ? '#475569' : '#e2e8f0'}`,
                transition: 'all 0.2s'
              }}
              onClick={() => handleNotificationClick(notif)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#667eea';
                e.currentTarget.style.transform = 'translateX(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = darkMode ? '#475569' : '#e2e8f0';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <div style={{
                  fontSize: '24px',
                  flexShrink: 0
                }}>
                  {notif.type === 'price_update_complete' && '✅'}
                  {notif.type === 'price_update_failed' && '❌'}
                  {notif.type === 'system' && 'ℹ️'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontWeight: '600',
                    marginBottom: '4px',
                    fontSize: '15px'
                  }}>
                    {notif.title}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: darkMode ? '#cbd5e1' : '#64748b',
                    lineHeight: '1.5'
                  }}>
                    {notif.message}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#94a3b8',
                    marginTop: '8px'
                  }}>
                    {formatTime(notif.createdAt)}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {notifications.length > 0 && (
            <button
              onClick={markAllAsRead}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '16px',
                background: darkMode ? '#334155' : '#f3f4f6',
                color: darkMode ? '#f8fafc' : '#0f172a',
                border: `1px solid ${darkMode ? '#475569' : '#d1d5db'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = darkMode ? '#475569' : '#e5e7eb';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = darkMode ? '#334155' : '#f3f4f6';
              }}
            >
              Označiť všetky ako prečítané
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default NotificationPanel;
