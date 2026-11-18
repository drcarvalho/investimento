import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';
import TickerTape from './components/TickerTape';
import {
  TrendingUpIcon,
  FilterIcon,
  ScaleIcon,
  SearchIcon,
  SunIcon,
  MoonIcon,
  StarIcon,
  BuildingIcon,
  ShieldCheckIcon,
  WalletIcon,
} from './components/Icons';
import { ToastContainer } from './components/Toast';
import { useWatchlist } from './hooks/useWatchlist';

const Home = lazy(() => import('./pages/Home'));
const Screener = lazy(() => import('./pages/Screener'));
const Assets = lazy(() => import('./pages/Assets'));
const StockDetail = lazy(() => import('./pages/StockDetail'));
const Compare = lazy(() => import('./pages/Compare'));
const Intelligence = lazy(() => import('./pages/Intelligence'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const Studies = lazy(() => import('./pages/Studies'));
const Search = lazy(() => import('./pages/Search'));
const Sobre = lazy(() => import('./pages/Sobre'));

const NAV_ITEMS = [
  { path: '/', label: 'Mercado', icon: <TrendingUpIcon size={16} /> },
  { path: '/acoes', label: 'Ações', icon: <FilterIcon size={16} /> },
  { path: '/ativos', label: 'FIIs/ETFs', icon: <BuildingIcon size={16} /> },
  { path: '/comparar', label: 'Comparar', icon: <ScaleIcon size={16} /> },
  { path: '/inteligencia', label: 'Inteligência', icon: <ShieldCheckIcon size={16} /> },
];

function getPageTitle(pathname) {
  if (pathname === '/') return 'Mercado';
  if (pathname === '/acoes') return 'Screening de Ações';
  if (pathname === '/ativos') return 'FIIs e ETFs';
  if (pathname === '/comparar') return 'Comparar Ativos';
  if (pathname === '/inteligencia') return 'Inteligência Quantitativa';
  if (pathname === '/carteira') return 'Minha Carteira';
  if (pathname === '/estudos') return 'Meus Estudos';
  if (pathname === '/buscar') return 'Buscar Ativos';
  if (pathname === '/sobre') return 'Guia do Investidor';
  if (pathname.startsWith('/acoes/')) {
    const sym = decodeURIComponent(pathname.slice('/acoes/'.length).split('/')[0] || '').toUpperCase();
    return sym ? `${sym} — Análise` : 'Análise do Ativo';
  }
  return 'Página não encontrada';
}

function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="card" style={{ padding: '3rem 1.75rem', textAlign: 'center', maxWidth: 560, margin: '2rem auto' }}>
      <span className="page-eyebrow">Erro 404</span>
      <h1 style={{ margin: '0.25rem 0 0.5rem', fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
        Página não encontrada
      </h1>
      <p style={{ margin: '0 0 1.4rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
        O endereço acessado não existe ou foi movido. Use os atalhos abaixo para continuar sua análise.
      </p>
      <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
          Ir para o Mercado
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/buscar')}>
          Buscar Ativo
        </button>
      </div>
    </div>
  );
}

function RouteFallback() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="skeleton" style={{ height: 52, width: '100%' }} />
      <div className="skeleton" style={{ height: 220, width: '100%' }} />
    </div>
  );
}

function Navbar({ theme, toggleTheme, onOpenPalette }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { watchlist } = useWatchlist();

  return (
    <>
      <header className="navbar">
        <div className="navbar-inner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <Link to="/" className="nav-brand">
              <span className="nav-brand-badge">
                <TrendingUpIcon size={17} />
              </span>
              <span>
                Investimento <span style={{ color: 'var(--positive)' }}>Flash</span>
              </span>
            </Link>

            <nav className="nav-links desktop-nav-links" aria-label="Navegação principal">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`nav-link ${active ? 'active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <Link
                to="/carteira"
                className={`nav-link ${location.pathname.startsWith('/carteira') ? 'active' : ''}`}
                aria-current={location.pathname.startsWith('/carteira') ? 'page' : undefined}
              >
                <span>Carteira</span>
              </Link>
              <Link
                to="/estudos"
                className={`nav-link ${location.pathname.startsWith('/estudos') ? 'active' : ''}`}
                aria-current={location.pathname.startsWith('/estudos') ? 'page' : undefined}
              >
                <span>Estudos</span>
              </Link>
              <Link
                to="/sobre"
                className={`nav-link ${location.pathname.startsWith('/sobre') ? 'active' : ''}`}
                aria-current={location.pathname.startsWith('/sobre') ? 'page' : undefined}
              >
                <span>Guia</span>
              </Link>
            </nav>
          </div>

          <div className="nav-actions">
            <button
              type="button"
              className="nav-cmd-trigger"
              onClick={onOpenPalette}
              aria-label="Abrir busca rápida (Ctrl+K)"
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                <SearchIcon size={14} />
                <span>Buscar ação...</span>
              </span>
              <span className="cmd-kbd">Ctrl K</span>
            </button>

            {watchlist.length > 0 && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => navigate(`/comparar?tickers=${watchlist.slice(0, 4).join(',')}`)}
                title={`Comparar seus ${watchlist.length} favoritos`}
                aria-label={`Comparar seus ${watchlist.length} favoritos`}
              >
                <span style={{ color: '#fbbf24', display: 'flex' }}>
                  <StarIcon size={14} filled />
                </span>
                <span className="num">{watchlist.length}</span>
              </button>
            )}

            <button
              className="icon-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Alternar para modo claro' : 'Alternar para modo escuro'}
              aria-label="Alternar tema"
              aria-pressed={theme === 'dark'}
            >
              {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <nav className="mobile-bottom-nav" aria-label="Navegação mobile">
        {[
          ...NAV_ITEMS,
          { path: '/carteira', label: 'Carteira', icon: <WalletIcon size={16} /> },
        ].map((item) => {
          const active =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`mobile-nav-item ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function AppShell({ theme, toggleTheme }) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);
  const hasMountedRef = React.useRef(false);

  React.useEffect(() => {
    document.title = `${pageTitle} | Investimento Flash`;
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const frame = window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body || active.tagName === 'A' || active.tagName === 'BUTTON') {
        document.getElementById('main-content')?.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, pageTitle]);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (
        e.key === '/' &&
        !paletteOpen &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      ) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen]);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Pular para o conteúdo principal
      </a>
      <Navbar
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      <TickerTape />
      <main id="main-content" className="app-main" tabIndex={-1}>
        <p className="sr-only" role="status" aria-live="polite">{pageTitle}</p>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/acoes" element={<Screener />} />
              <Route path="/ativos" element={<Assets />} />
              <Route path="/acoes/:symbol" element={<StockDetail />} />
              <Route path="/comparar" element={<Compare />} />
              <Route path="/inteligencia" element={<Intelligence />} />
              <Route path="/carteira" element={<Portfolio />} />
              <Route path="/estudos" element={<Studies />} />
              <Route path="/buscar" element={<Search />} />
              <Route path="/sobre" element={<Sobre />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className="app-footer">
        <div className="footer-inner">
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Investimento Flash</strong>
            <span> · Inteligência Financeira &amp; Estudos da B3</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span>Fontes: Banco Central (SGS), CVM e brapi.dev</span>
            <Link to="/sobre" className="footer-link">Metodologia</Link>
            <span style={{ color: 'var(--text-subtle)' }}>Conteúdo estritamente informativo</span>
          </div>
        </div>
      </footer>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        theme={theme}
        toggleTheme={toggleTheme}
      />
      <ToastContainer />
    </div>
  );
}

function App() {
  const [theme, setTheme] = React.useState(() => {
    try {
      const saved = localStorage.getItem('investanalytics_theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('investanalytics_theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <Router>
      <AppShell theme={theme} toggleTheme={toggleTheme} />
    </Router>
  );
}

export default App;
