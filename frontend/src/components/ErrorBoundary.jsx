import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('UI ErrorBoundary caught:', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ maxWidth: 520, margin: '3rem auto', padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)' }}>Algo deu errado nesta tela</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '1.25rem' }}>
            Ocorreu um erro inesperado ao renderizar os dados. Você pode recarregar ou voltar ao início.
          </p>
          <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.href = '/';
              }}
            >
              Voltar ao Mercado
            </button>
            <button className="btn btn-ghost" onClick={() => window.location.reload()}>
              Recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

