import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.content}>
            <div style={styles.icon}>⚠️</div>
            <h1 style={styles.title}>Niečo sa pokazilo</h1>
            <p style={styles.message}>
              Ospravedlňujeme sa, nastala neočakávaná chyba.
              Skúste obnoviť stránku alebo sa vrátiť na úvodnú stránku.
            </p>

            {import.meta.env.DEV && this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>Technické detaily</summary>
                <pre style={styles.errorText}>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div style={styles.buttons}>
              <button onClick={this.handleReload} style={styles.primaryButton}>
                🔄 Obnoviť stránku
              </button>
              <button onClick={this.handleGoHome} style={styles.secondaryButton}>
                🏠 Úvodná stránka
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  content: {
    maxWidth: '500px',
    width: '100%',
    background: 'white',
    borderRadius: '16px',
    padding: '40px',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
  },
  icon: {
    fontSize: '64px',
    marginBottom: '20px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#0f172a',
    margin: '0 0 16px 0',
  },
  message: {
    fontSize: '16px',
    color: '#64748b',
    lineHeight: '1.6',
    margin: '0 0 24px 0',
  },
  details: {
    textAlign: 'left',
    marginBottom: '24px',
    background: '#fef2f2',
    borderRadius: '8px',
    padding: '12px',
  },
  summary: {
    cursor: 'pointer',
    fontWeight: '600',
    color: '#991b1b',
    marginBottom: '8px',
  },
  errorText: {
    fontSize: '12px',
    color: '#991b1b',
    overflow: 'auto',
    maxHeight: '200px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  primaryButton: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  secondaryButton: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#667eea',
    background: 'white',
    border: '2px solid #667eea',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
};

export default ErrorBoundary;
