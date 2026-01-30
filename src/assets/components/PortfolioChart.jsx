import { useEffect, useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';

const TIME_FILTERS = [
  { key: '1Y', label: '1 rok', months: 12 },
  { key: '2Y', label: '2 roky', months: 24 },
  { key: '5Y', label: '5 rokov', months: 60 },
  { key: '10Y', label: '10 rokov', months: 120 },
  { key: 'ALL', label: 'Všetko', months: null }
];

/**
 * PortfolioChart - Displays total collection value evolution over time
 * Includes: purchases (createdAt + buy), price updates, and sales (soldAt + soldPrice)
 *
 * @param {Object} user - Firebase user object
 * @param {boolean} darkMode - Dark mode flag
 */
function PortfolioChart({ user, darkMode = false }) {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('ALL');
  const [cards, setCards] = useState([]);

  useEffect(() => {
    if (!user) return;

    const loadPortfolioHistory = async () => {
      setLoading(true);
      try {
        const cardsRef = collection(db, 'cards');
        const q = query(cardsRef, where('userId', '==', user.uid));
        const snapshot = await getDocs(q);

        const cardsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setCards(cardsData);

        // Build complete timeline with all events
        const events = [];

        cardsData.forEach(card => {
          // 1. Purchase event (createdAt + buy price)
          if (card.createdAt) {
            const purchaseDate = card.createdAt.toDate ? card.createdAt.toDate() : new Date(card.createdAt);
            events.push({
              date: purchaseDate,
              cardId: card.id,
              type: 'purchase',
              price: card.buy || 0,
              cardName: card.item
            });
          }

          // 2. Price history events
          if (card.priceHistory && card.priceHistory.length > 0) {
            card.priceHistory.forEach(entry => {
              const priceDate = entry.date?.toDate ? entry.date.toDate() : new Date(entry.date);
              events.push({
                date: priceDate,
                cardId: card.id,
                type: 'priceUpdate',
                price: entry.price,
                cardName: card.item
              });
            });
          }

          // 3. Sale event (soldAt + soldPrice)
          if (card.status === 'predaná' && card.soldAt) {
            const saleDate = card.soldAt.toDate ? card.soldAt.toDate() : new Date(card.soldAt);
            events.push({
              date: saleDate,
              cardId: card.id,
              type: 'sale',
              price: card.soldPrice || card.sell || card.current || 0,
              cardName: card.item
            });
          }
        });

        // Sort events chronologically
        events.sort((a, b) => a.date - b.date);

        // Build portfolio value timeline
        const cardStates = new Map(); // cardId -> { price, sold }
        const timeline = [];

        // Group events by date (same day)
        const eventsByDate = new Map();
        events.forEach(event => {
          const dateKey = event.date.toISOString().split('T')[0];
          if (!eventsByDate.has(dateKey)) {
            eventsByDate.set(dateKey, {
              date: event.date,
              events: []
            });
          }
          eventsByDate.get(dateKey).events.push(event);
        });

        // Process each day
        eventsByDate.forEach((dayData, dateKey) => {
          const purchases = [];
          const sales = [];

          dayData.events.forEach(event => {
            if (event.type === 'purchase') {
              cardStates.set(event.cardId, { price: event.price, sold: false });
              purchases.push(event.cardName);
            } else if (event.type === 'priceUpdate') {
              if (cardStates.has(event.cardId)) {
                const state = cardStates.get(event.cardId);
                if (!state.sold) {
                  state.price = event.price;
                }
              }
            } else if (event.type === 'sale') {
              if (cardStates.has(event.cardId)) {
                cardStates.get(event.cardId).sold = true;
              }
              sales.push(event.cardName);
            }
          });

          // Calculate total portfolio value (only non-sold cards)
          let totalValue = 0;
          let activeCards = 0;
          cardStates.forEach(state => {
            if (!state.sold) {
              totalValue += state.price;
              activeCards++;
            }
          });

          timeline.push({
            date: dayData.date,
            dateKey,
            hodnota: parseFloat(totalValue.toFixed(2)),
            pocetPoloziek: activeCards,
            purchases: purchases.length > 0 ? purchases : null,
            sales: sales.length > 0 ? sales : null,
            hasPurchase: purchases.length > 0,
            hasSale: sales.length > 0
          });
        });

        setAllData(timeline);
      } catch (error) {
        console.error('Error loading portfolio history:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPortfolioHistory();
  }, [user]);

  // Filter data based on time selection
  const filteredData = useMemo(() => {
    if (allData.length === 0) return [];

    const filter = TIME_FILTERS.find(f => f.key === timeFilter);
    if (!filter || filter.months === null) {
      return allData;
    }

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - filter.months);

    return allData.filter(item => item.date >= cutoffDate);
  }, [allData, timeFilter]);

  // Format data for chart
  const chartData = useMemo(() => {
    return filteredData.map(item => ({
      ...item,
      dateFormatted: item.date.toLocaleDateString('sk-SK', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }),
      timestamp: item.date.getTime()
    }));
  }, [filteredData]);

  // Calculate stats
  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return {
        currentValue: 0,
        initialValue: 0,
        change: 0,
        changePercent: 0,
        cardCount: 0,
        totalInvested: 0,
        totalSold: 0,
        realizedProfit: 0
      };
    }

    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    const change = last.hodnota - first.hodnota;
    const changePercent = first.hodnota > 0 ? ((change / first.hodnota) * 100) : 0;

    // Calculate totals from cards
    const collectionCards = cards.filter(c => c.status === 'zbierka');
    const soldCards = cards.filter(c => c.status === 'predaná');

    const totalInvested = cards.reduce((sum, c) => sum + (parseFloat(c.buy) || 0), 0);
    const totalSold = soldCards.reduce((sum, c) => sum + (parseFloat(c.soldPrice) || parseFloat(c.sell) || 0), 0);
    const soldCost = soldCards.reduce((sum, c) => sum + (parseFloat(c.buy) || 0), 0);
    const realizedProfit = totalSold - soldCost;

    return {
      currentValue: last.hodnota,
      initialValue: first.hodnota,
      change,
      changePercent,
      cardCount: collectionCards.length,
      totalInvested,
      totalSold,
      realizedProfit,
      soldCount: soldCards.length
    };
  }, [chartData, cards]);

  if (loading) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        background: darkMode ? '#1e293b' : '#f8fafc',
        borderRadius: '12px',
        border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
        <p style={{ margin: 0, fontSize: '14px', color: darkMode ? '#94a3b8' : '#64748b' }}>
          Načítavam históriu portfólia...
        </p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        color: darkMode ? '#94a3b8' : '#64748b',
        background: darkMode ? '#1e293b' : '#f8fafc',
        borderRadius: '12px',
        border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📈</div>
        <p style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '500' }}>
          Žiadne historické dáta
        </p>
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
          Pridaj karty do zbierky a sleduj vývoj hodnoty portfólia
        </p>
      </div>
    );
  }

  const isPositive = stats.change >= 0;
  const gradientColor = isPositive ? '#10b981' : '#ef4444';
  const gridColor = darkMode ? '#334155' : '#e2e8f0';
  const textColor = darkMode ? '#cbd5e1' : '#475569';

  // Custom tooltip
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;

    return (
      <div style={{
        background: darkMode ? '#334155' : 'white',
        border: `1px solid ${darkMode ? '#475569' : '#e2e8f0'}`,
        borderRadius: '8px',
        padding: '12px',
        fontSize: '13px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <div style={{ fontWeight: '600', marginBottom: '8px', color: textColor }}>
          {data.dateFormatted}
        </div>
        <div style={{ color: darkMode ? '#f8fafc' : '#0f172a', fontWeight: '600', fontSize: '16px' }}>
          €{data.hodnota.toFixed(2)}
        </div>
        <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>
          {data.pocetPoloziek} položiek v zbierke
        </div>
        {data.purchases && (
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${gridColor}` }}>
            <span style={{ color: '#10b981' }}>+ Nákup:</span>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {data.purchases.slice(0, 2).join(', ')}
              {data.purchases.length > 2 && ` +${data.purchases.length - 2} ďalších`}
            </div>
          </div>
        )}
        {data.sales && (
          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${gridColor}` }}>
            <span style={{ color: '#ef4444' }}>− Predaj:</span>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {data.sales.slice(0, 2).join(', ')}
              {data.sales.length > 2 && ` +${data.sales.length - 2} ďalších`}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      background: darkMode ? '#1e293b' : 'white',
      borderRadius: '12px',
      padding: '20px',
      border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`
    }}>
      {/* Header with stats */}
      <div style={{
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px'
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            📊 Investičné portfólio
          </h3>

          {/* Time filters */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {TIME_FILTERS.map(filter => (
              <button
                key={filter.key}
                onClick={() => setTimeFilter(filter.key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  background: timeFilter === filter.key
                    ? '#667eea'
                    : darkMode ? '#334155' : '#f1f5f9',
                  color: timeFilter === filter.key
                    ? 'white'
                    : darkMode ? '#94a3b8' : '#64748b'
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '16px'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              Hodnota zbierky
            </div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: darkMode ? '#f8fafc' : '#0f172a' }}>
              €{stats.currentValue.toFixed(2)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              Zmena ({TIME_FILTERS.find(f => f.key === timeFilter)?.label})
            </div>
            <div style={{
              fontSize: '18px',
              fontWeight: 'bold',
              color: isPositive ? '#10b981' : '#ef4444'
            }}>
              {isPositive ? '+' : ''}{stats.change.toFixed(2)} €
              <span style={{ fontSize: '12px', marginLeft: '4px' }}>
                ({isPositive ? '+' : ''}{stats.changePercent.toFixed(1)}%)
              </span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              V zbierke
            </div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#667eea' }}>
              {stats.cardCount} ks
            </div>
          </div>

          {stats.soldCount > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                Realizovaný zisk
              </div>
              <div style={{
                fontSize: '18px',
                fontWeight: '600',
                color: stats.realizedProfit >= 0 ? '#10b981' : '#ef4444'
              }}>
                {stats.realizedProfit >= 0 ? '+' : ''}{stats.realizedProfit.toFixed(2)} €
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
        >
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={gradientColor} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={gradientColor} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="dateFormatted"
            stroke={textColor}
            style={{ fontSize: '10px' }}
            tick={{ fill: textColor }}
            interval="preserveStartEnd"
          />
          <YAxis
            stroke={textColor}
            style={{ fontSize: '11px' }}
            tick={{ fill: textColor }}
            tickFormatter={(value) => `€${value.toFixed(0)}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="hodnota"
            stroke={gradientColor}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorValue)"
          />
          {/* Purchase markers */}
          {chartData.filter(d => d.hasPurchase).map((d, i) => (
            <ReferenceDot
              key={`purchase-${i}`}
              x={d.dateFormatted}
              y={d.hodnota}
              r={5}
              fill="#10b981"
              stroke="white"
              strokeWidth={2}
            />
          ))}
          {/* Sale markers */}
          {chartData.filter(d => d.hasSale).map((d, i) => (
            <ReferenceDot
              key={`sale-${i}`}
              x={d.dateFormatted}
              y={d.hodnota}
              r={5}
              fill="#ef4444"
              stroke="white"
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '20px',
        marginTop: '12px',
        fontSize: '12px',
        color: '#94a3b8'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
          Nákup
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
          Predaj
        </div>
      </div>

      {/* Bottom stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
        gap: '12px',
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`
      }}>
        <div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
            Celkom investované
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600' }}>
            €{stats.totalInvested.toFixed(2)}
          </div>
        </div>
        {stats.soldCount > 0 && (
          <div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
              Predané ({stats.soldCount} ks)
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600' }}>
              €{stats.totalSold.toFixed(2)}
            </div>
          </div>
        )}
        <div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
            Priem. cena karty
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600' }}>
            €{stats.cardCount > 0 ? (stats.currentValue / stats.cardCount).toFixed(2) : '0.00'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
            Záznamov
          </div>
          <div style={{ fontSize: '14px', fontWeight: '600' }}>
            {chartData.length}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PortfolioChart;
