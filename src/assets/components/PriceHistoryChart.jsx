import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguage } from '../../LanguageContext';

/**
 * PriceHistoryChart - Displays price evolution for a single card
 *
 * @param {Array} priceHistory - Array of { date: Timestamp, price: number, source: string }
 * @param {boolean} darkMode - Dark mode flag
 */
function PriceHistoryChart({ priceHistory = [], darkMode = false }) {
  const { t, language } = useLanguage();

  if (!priceHistory || priceHistory.length === 0) {
    return (
      <div style={{
        padding: '40px 20px',
        textAlign: 'center',
        color: darkMode ? '#94a3b8' : '#64748b',
        background: darkMode ? '#1e293b' : '#f8fafc',
        borderRadius: '12px',
        border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
        <p style={{ margin: 0, fontSize: '14px' }}>
          {t('chart.noData')}
        </p>
        <p style={{ margin: '8px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
          {t('chart.noDataHint')}
        </p>
      </div>
    );
  }

  // Get locale for date formatting
  const dateLocale = language === 'en' ? 'en-GB' : language === 'cz' ? 'cs-CZ' : 'sk-SK';

  // Transform Firestore Timestamps to readable dates
  const chartData = priceHistory.map(entry => {
    const date = entry.date?.toDate ? entry.date.toDate() : new Date(entry.date);
    return {
      date: date.toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' }),
      cena: entry.price,
      timestamp: date.getTime() // For sorting
    };
  }).sort((a, b) => a.timestamp - b.timestamp);

  // Calculate price change
  const firstPrice = chartData[0]?.cena || 0;
  const lastPrice = chartData[chartData.length - 1]?.cena || 0;
  const priceChange = lastPrice - firstPrice;
  const priceChangePercent = firstPrice > 0 ? ((priceChange / firstPrice) * 100).toFixed(1) : 0;
  const isPositive = priceChange >= 0;

  // Chart colors
  const lineColor = isPositive ? '#10b981' : '#ef4444';
  const gridColor = darkMode ? '#334155' : '#e2e8f0';
  const textColor = darkMode ? '#cbd5e1' : '#475569';

  return (
    <div style={{
      background: darkMode ? '#1e293b' : 'white',
      borderRadius: '12px',
      padding: '20px',
      border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`
    }}>
      {/* Header with stats */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        paddingBottom: '16px',
        borderBottom: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`
      }}>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '600' }}>
            {t('chart.title')}
          </h4>
          <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
            {chartData.length} {t('chart.records')}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{
            fontSize: '20px',
            fontWeight: 'bold',
            color: isPositive ? '#10b981' : '#ef4444',
            marginBottom: '4px'
          }}>
            {isPositive ? '+' : ''}{priceChange.toFixed(2)} €
          </div>
          <div style={{
            fontSize: '13px',
            color: isPositive ? '#10b981' : '#ef4444',
            fontWeight: '500'
          }}>
            {isPositive ? '+' : ''}{priceChangePercent}%
          </div>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={250}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="date"
            stroke={textColor}
            style={{ fontSize: '11px' }}
            tick={{ fill: textColor }}
          />
          <YAxis
            stroke={textColor}
            style={{ fontSize: '11px' }}
            tick={{ fill: textColor }}
            tickFormatter={(value) => `€${value.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              background: darkMode ? '#334155' : 'white',
              border: `1px solid ${darkMode ? '#475569' : '#e2e8f0'}`,
              borderRadius: '8px',
              fontSize: '13px'
            }}
            labelStyle={{ color: textColor, fontWeight: '600' }}
            formatter={(value) => [`€${value.toFixed(2)}`, t('chart.price')]}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px' }}
            iconType="line"
          />
          <Line
            type="monotone"
            dataKey="cena"
            stroke={lineColor}
            strokeWidth={2}
            dot={{ fill: lineColor, r: 4 }}
            activeDot={{ r: 6 }}
            name={t('chart.priceLabel')}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Min/Max stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginTop: '16px',
        paddingTop: '16px',
        borderTop: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`
      }}>
        <div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
            Minimum
          </div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#ef4444' }}>
            €{Math.min(...chartData.map(d => d.cena)).toFixed(2)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
            Maximum
          </div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: '#10b981' }}>
            €{Math.max(...chartData.map(d => d.cena)).toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PriceHistoryChart;
