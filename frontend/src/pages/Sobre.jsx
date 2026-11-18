import React from 'react';
import { BookOpenIcon, CalculatorIcon, ShieldCheckIcon, BarChartIcon } from '../components/Icons';

const GLOSSARY = [
  {
    term: 'P/L (Preço / Lucro)',
    formula: 'Cotação ÷ LPA',
    desc: 'Indica quantos anos de lucro atual seriam necessários para pagar o preço da ação. Útil para comparar empresas do mesmo setor.',
  },
  {
    term: 'P/VP (Preço / Valor Patrimonial)',
    formula: 'Cotação ÷ VPA',
    desc: 'Compara o preço de mercado com o patrimônio líquido contábil. Valores abaixo de 1,0 sugerem desconto frente ao patrimônio.',
  },
  {
    term: 'Dividend Yield (DY)',
    formula: '(Dividendos 12m ÷ Cotação) × 100',
    desc: 'Percentual de retorno em proventos pagos aos acionistas nos últimos 12 meses. Estratégias de renda costumam buscar DY ≥ 6%.',
  },
  {
    term: 'ROE (Return on Equity)',
    formula: 'Lucro Líquido ÷ Patrimônio Líquido',
    desc: 'Mede a eficiência da gestão em gerar lucro usando o capital próprio dos acionistas. Acima de 15% sinaliza forte rentabilidade.',
  },
  {
    term: 'EV / EBITDA',
    formula: 'Enterprise Value ÷ EBITDA',
    desc: 'Relaciona o valor total da companhia (incluindo dívida líquida) com sua geração operacional de caixa.',
  },
  {
    term: 'Dívida Líquida / EBITDA',
    formula: '(Dívida Total − Caixa) ÷ EBITDA',
    desc: 'Mostra quantos anos de geração operacional pagariam a dívida líquida. Valores negativos significam mais caixa que dívida.',
  },
];

function Sobre() {
  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <span className="page-eyebrow">Educação Financeira · Transparência</span>
      <h1 style={styles.title}>
        <span style={{ color: 'var(--brand)', display: 'inline-flex' }}><BookOpenIcon size={22} /></span>
        Guia de Estudos & Metodologia
      </h1>
      <p style={styles.subtitle}>
        Referência transparente das fórmulas de valuation, critérios do motor quantitativo, fontes oficiais e principais indicadores exibidos no Investimento Flash.
      </p>

      <div style={styles.twoCol}>
        <div className="card" style={{ padding: '1.35rem' }}>
          <h2 className="section-title" style={{ fontSize: '1rem', marginBottom: '0.65rem' }}>
            <span style={{ color: '#2563eb', display: 'flex' }}><CalculatorIcon size={18} /></span>
            Fórmulas de Preço Justo
          </h2>
          <div style={styles.formulaBlock}>
            <strong>Fórmula de Benjamin Graham</strong>
            <div className="mono" style={styles.formulaCode}>VI = √(22,5 × LPA × VPA)</div>
            <p style={styles.bodyText}>
              Estima o valor intrínseco para empresas lucrativas e consolidadas assumindo um teto conservador de P/L ≤ 15 e P/VP ≤ 1,5.
            </p>
          </div>
          <div style={{ ...styles.formulaBlock, marginBottom: 0 }}>
            <strong>Método Décio Bazin</strong>
            <div className="mono" style={styles.formulaCode}>Preço Teto = Dividendo Anual ÷ 0,06</div>
            <p style={styles.bodyText}>
              Define o preço máximo a pagar por uma ação para garantir um Dividend Yield mínimo de 6% ao ano.
            </p>
          </div>
        </div>

        <div className="card" style={{ padding: '1.35rem' }}>
          <h2 className="section-title" style={{ fontSize: '1rem', marginBottom: '0.65rem' }}>
            <span style={{ color: '#10b981', display: 'flex' }}><ShieldCheckIcon size={18} /></span>
            Saúde Fundamentalista & Score (0–100)
          </h2>
          <p style={styles.bodyText}>
            A pontuação do Investimento Flash é 100% determinística e auditável, ponderando os pilares fundamentais sem nunca inventar indicadores ausentes:
          </p>
          <ul style={styles.list}>
            <li><strong>Valuation (25 pts):</strong> P/L positivo e descontado (≤ 12 pontuação máxima) e P/VP competitivo.</li>
            <li><strong>Rentabilidade (30 pts):</strong> ROE consistente (≥ 15%) e margem líquida saudável.</li>
            <li><strong>Proventos (25 pts):</strong> Dividend Yield atrativo (≥ 6% pontuação máxima) frente à Selic.</li>
            <li><strong>Endividamento (20 pts):</strong> Dívida Líquida / EBITDA controlada (≤ 2,5x).</li>
          </ul>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
            <span className="pill viab-azulim">≥ 75 Atrativa</span>
            <span className="pill viab-viavel">55–74 Viável</span>
            <span className="pill viab-atencao">35–54 Atenção</span>
            <span className="pill viab-risco">&lt; 35 Alto risco</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '1.25rem 1.35rem', marginTop: '1.15rem' }}>
        <h2 className="section-title" style={{ fontSize: '0.98rem', marginBottom: '0.5rem' }}>
          Fontes Públicas & Integridade dos Dados
        </h2>
        <p style={{ ...styles.bodyText, margin: 0 }}>
          Os indicadores macroeconômicos (<strong>Selic, IPCA e PTAX</strong>) vêm diretamente do <strong>Banco Central (SGS)</strong>; os dados patrimoniais e proventos de FIIs vêm do <strong>Informe Mensal Oficial da CVM</strong>; as demonstrações financeiras podem ser atualizadas pelos <strong>Dados Abertos da CVM (DFP/ITR)</strong>; e as cotações da B3 são consultadas em tempo real via <strong>brapi.dev</strong>. Quando um indicador não está disponível na fonte oficial, exibimos <strong>—</strong> sem estimativas artificiais.
        </p>
      </div>

      <section style={{ marginTop: '1.5rem' }}>
        <div className="section-heading">
          <h2 className="section-title">
            <span style={{ color: 'var(--brand)', display: 'flex' }}><BarChartIcon size={18} /></span>
            Glossário de Indicadores Fundamentalistas
          </h2>
        </div>
        <div style={styles.glossaryGrid}>
          {GLOSSARY.map((item) => (
            <div key={item.term} className="card" style={{ padding: '1.15rem' }}>
              <div style={{ fontWeight: 700, fontSize: '0.94rem', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                {item.term}
              </div>
              <div className="mono" style={{ fontSize: '0.73rem', color: 'var(--brand)', marginBottom: '0.5rem' }}>
                {item.formula}
              </div>
              <p style={{ ...styles.bodyText, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const styles = {
  title: {
    margin: '0 0 0.25rem 0',
    fontSize: '1.45rem',
    fontWeight: 800,
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  subtitle: { margin: '0 0 1.4rem 0', fontSize: '0.88rem', color: 'var(--text-muted)' },
  twoCol: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
    gap: '1.15rem',
  },
  formulaBlock: {
    background: 'var(--bg-surface-subtle)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    padding: '0.85rem 1rem',
    marginBottom: '0.8rem',
  },
  formulaCode: {
    fontSize: '0.82rem',
    color: 'var(--brand)',
    margin: '0.3rem 0 0.4rem',
    fontWeight: 700,
  },
  bodyText: {
    fontSize: '0.84rem',
    lineHeight: 1.55,
    color: 'var(--text-secondary)',
    margin: '0 0 0.5rem 0',
  },
  list: {
    margin: '0.5rem 0 0',
    paddingLeft: '1.15rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    fontSize: '0.83rem',
    color: 'var(--text-secondary)',
  },
  glossaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1rem',
  },
};

export default Sobre;
