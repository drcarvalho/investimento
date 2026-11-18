export function fmtNum(v, decimals = 2, suffix = '') {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return `${Number(v).toFixed(decimals).replace('.', ',')}${suffix}`;
}

export function fmtMoney(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  if (Math.abs(n) >= 1e12) return `R$ ${(n / 1e12).toFixed(2).replace('.', ',')} T`;
  if (Math.abs(n) >= 1e9) return `R$ ${(n / 1e9).toFixed(2).replace('.', ',')} B`;
  if (Math.abs(n) >= 1e6) return `R$ ${(n / 1e6).toFixed(2).replace('.', ',')} M`;
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtVol(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v)) || Number(v) === 0) return '—';
  const n = Number(v);
  if (n >= 1e6) return `${(n / 1e6).toFixed(2).replace('.', ',')} M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace('.', ',')} K`;
  return n.toLocaleString('pt-BR');
}

export function fmtMacroVal(item) {
  if (!item || item.value === null || item.value === undefined) return '—';
  if (item.unit === 'R$') return `R$ ${Number(item.value).toFixed(4).replace('.', ',')}`;
  return `${Number(item.value).toFixed(2).replace('.', ',')}${item.unit || ''}`;
}

export function formatDateBr(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

