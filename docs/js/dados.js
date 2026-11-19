// Carrega a tabela CMED já convertida (data/remedios.json) e o elenco do
// Farmácia Popular (data/farmacia-popular.json), e monta o índice de busca.
// Tudo roda no navegador: nenhuma busca sai do aparelho.

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+,./ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const TIPO = { G: 'Genérico', S: 'Similar', N: 'Marca de referência', E: 'Específico', B: 'Biológico', F: 'Fitoterápico', O: 'Outro' };
const TARJA = { V: 'Tarja vermelha: precisa de receita', R: 'Tarja vermelha: a farmácia retém a receita', P: 'Tarja preta: receita especial, retida na farmácia', L: 'Sem tarja: venda sem receita' };

export const DB = {
  pronto: false,
  cmedData: '',
  fp: null, // elenco do Farmácia Popular
  fpById: new Map(),
  grupos: [],
  subs: [], // { i, nome, n (normalizado), itens:[], fp:Set, marcas:Set }
  produtos: [], // { nome, n, sub, tipo }
  porEan: new Map(),
};

let carregando = null;
export function carregar() {
  if (!carregando) carregando = _carregar();
  return carregando;
}

async function _carregar() {
  const [rem, fp] = await Promise.all([
    fetch('data/remedios.json').then((r) => { if (!r.ok) throw new Error('remedios'); return r.json(); }),
    fetch('data/farmacia-popular.json').then((r) => { if (!r.ok) throw new Error('fp'); return r.json(); }),
  ]);
  DB.cmedData = rem.cmed;
  DB.icms = rem.icms;
  DB.fp = fp;
  DB.grupos = fp.grupos.map(([id, nome]) => ({ id, nome }));
  fp.itens.forEach((it) => DB.fpById.set(it.id, { ...it, subs: new Map() }));

  DB.subs = rem.subs.map((nome, i) => ({ i, nome, n: norm(nome), itens: [], fp: new Set(), marcas: new Map() }));
  const prodMap = new Map();
  for (const r of rem.itens) {
    const [si, produto, lab, tipo, conc, forma, emb, pmc, ean, fpId, tarja, comerc] = r;
    const sub = DB.subs[si];
    const it = {
      sub: si, produto, lab: rem.labs[lab], tipo, conc, forma: rem.formas[forma], emb, pmc, ean,
      fp: fpId, tarja, comerc: !!comerc,
    };
    it.dose = `${conc}|${it.forma}`;
    sub.itens.push(it);
    if (fpId) {
      sub.fp.add(fpId);
      const f = DB.fpById.get(fpId);
      if (f) f.subs.set(si, (f.subs.get(si) || 0) + 1);
    }
    if (ean && !DB.porEan.has(ean)) DB.porEan.set(ean, it);
    const k = `${si}|${produto}`;
    if (!prodMap.has(k)) {
      const p = { nome: produto, n: norm(produto), sub: si, tipo, comerc: false };
      prodMap.set(k, p);
      sub.marcas.set(produto, tipo);
    }
    if (comerc) prodMap.get(k).comerc = true;
  }
  DB.produtos = [...prodMap.values()];
  // Para cada item gratuito, o princípio ativo "principal" (o que mais aparece).
  for (const f of DB.fpById.values()) {
    f.sub = [...f.subs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
  DB.pronto = true;
  return DB;
}

// ---------- Busca ----------
function pontua(n, q, palavras) {
  if (n === q) return 100;
  if (n.startsWith(q)) return 80;
  const ws = n.split(/[ ;+]+/);
  if (ws.some((w) => w.startsWith(q))) return 65;
  if (palavras.length > 1 && palavras.every((p) => ws.some((w) => w.startsWith(p)))) return 55;
  if (q.length >= 4 && n.includes(q)) return 40;
  return 0;
}

// Resultado: lista de { tipo:'sub'|'marca'|'item'|'grupo', ... } ordenada.
export function buscar(qBruto, limite = 40) {
  const q = norm(qBruto);
  if (!q) return { q, itens: [] };
  const palavras = q.split(' ').filter(Boolean);
  const out = [];

  // Doenças: "pressão alta", "diabetes"...
  const DOENCAS = {
    pressao: ['pressao', 'pressao alta', 'hipertensao'], diabetes: ['diabetes', 'diabete', 'acucar no sangue', 'glicose'],
    asma: ['asma', 'bronquite', 'falta de ar'], rinite: ['rinite', 'alergia nasal'], colesterol: ['colesterol', 'dislipidemia'],
    osteoporose: ['osteoporose', 'osso'], parkinson: ['parkinson'], glaucoma: ['glaucoma', 'olho'], anticoncepcao: ['anticoncepcional', 'anticoncepcao', 'pilula', 'contraceptivo'],
    outros: ['fralda', 'absorvente'],
  };
  for (const g of DB.grupos) {
    if ((DOENCAS[g.id] || []).some((t) => t.startsWith(q) || (q.length >= 4 && t.includes(q)) || q.startsWith(t))) {
      out.push({ tipo: 'grupo', grupo: g, s: 90 });
    }
  }
  // Itens sem princípio ativo (fralda, absorvente)
  for (const f of DB.fpById.values()) {
    if (f.busca && f.busca.some((b) => b.startsWith(q) || q.startsWith(b))) out.push({ tipo: 'item', item: f, s: 95 });
  }
  // Princípios ativos
  for (const sub of DB.subs) {
    const s = pontua(sub.n, q, palavras);
    if (s) out.push({ tipo: 'sub', sub, s: s + (sub.fp.size ? 12 : 0) + (sub.nome.includes(';') ? -8 : 0) });
  }
  // Marcas (nome comercial)
  const vistos = new Set();
  for (const p of DB.produtos) {
    const s = pontua(p.n, q, palavras);
    if (!s) continue;
    const k = p.n + '|' + p.sub;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const sub = DB.subs[p.sub];
    // Genéricos usam o nome do próprio princípio ativo: não repetir.
    if (ehNomeDoPrincipio(p, sub)) continue;
    out.push({ tipo: 'marca', marca: p.nome, sub, s: s - 2 + (sub.fp.size ? 10 : 0) + (p.comerc ? 3 : 0) });
  }
  out.sort((a, b) => b.s - a.s || nomeDe(a).localeCompare(nomeDe(b), 'pt-BR'));
  return { q, itens: out.slice(0, limite), total: out.length };
}
const nomeDe = (r) => (r.tipo === 'sub' ? r.sub.nome : r.tipo === 'marca' ? r.marca : r.tipo === 'item' ? r.item.nome : r.grupo.nome);

const soLetras = (s) => s.replace(/[^a-z]/g, '');
const SAL = /^(cloridrato|maleato|besilato|sulfato|acetato|brometo|dipropionato|fosfato|succinato|fumarato|tartarato|citrato|mesilato|dicloridrato|valerato|enantato|propionato|de|do|da)$/;
const palavraChave = (n) => n.split(/[ ;+]+/).find((w) => w.length >= 4 && !SAL.test(w)) || n;
// Um produto cujo nome é o próprio princípio ativo (genérico) não é "marca".
export function ehNomeDoPrincipio(p, sub) {
  if (p.tipo === 'G') return true;
  if (soLetras(p.n) === soLetras(sub.n)) return true;
  return soLetras(p.n).startsWith(soLetras(palavraChave(sub.n)));
}

// "Você quis dizer?": distância de edição contra nomes de remédios e marcas.
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < menor) menor = cur[j];
    }
    if (menor > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
export function sugerir(qBruto) {
  const q = norm(qBruto);
  if (q.length < 4) return [];
  const max = q.length <= 5 ? 1 : 2;
  const cands = new Map();
  const tenta = (nome, n, peso) => {
    for (const w of [n, ...n.split(/[ ;]+/).filter((w) => w.length >= 5)]) {
      const d = lev(q, w.slice(0, q.length + 2), max);
      if (d <= max) {
        const prevD = cands.get(nome);
        if (prevD === undefined || d - peso < prevD) cands.set(nome, d - peso);
      }
    }
  };
  for (const s of DB.subs) if (!s.nome.includes(';')) tenta(s.nome, s.n, s.fp.size ? 0.5 : 0);
  for (const p of DB.produtos) if (p.comerc && !ehNomeDoPrincipio(p, DB.subs[p.sub])) tenta(p.nome, p.n, 0);
  const vistos = new Set();
  return [...cands.entries()].sort((a, b) => a[1] - b[1])
    .filter(([nome]) => { const k = norm(nome); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .slice(0, 3).map(([nome]) => nome);
}

// Acha nomes de remédios dentro de um texto (receita lida por OCR ou QR).
export function acharNoTexto(texto) {
  const t = ' ' + norm(texto) + ' ';
  const achados = new Map(); // chave -> { sub, marca }
  for (const sub of DB.subs) {
    if (sub.nome.includes(';')) continue;
    // usa a palavra mais distintiva do princípio ativo (ex.: "losartana")
    const chave = sub.n.split(' ').filter((w) => w.length >= 6 && !SAIS.has(w)).sort((a, b) => b.length - a.length)[0];
    if (chave && t.includes(' ' + chave)) {
      const atual = achados.get(chave)?.sub;
      if (!atual || sub.fp.size > atual.fp.size || (sub.fp.size === atual.fp.size && sub.itens.length > atual.itens.length)) achados.set(chave, { sub });
    }
  }
  for (const p of DB.produtos) {
    if (p.n.length >= 5 && p.comerc && t.includes(' ' + p.n + ' ')) {
      const sub = DB.subs[p.sub];
      if (![...achados.values()].some((a) => a.sub === sub)) achados.set(p.n, { sub, marca: p.nome });
    }
  }
  // Dosagem escrita logo depois do nome, ex.: "losartana potassica 50 mg"
  return [...achados.entries()].map(([chave, a]) => {
    const rx = new RegExp(chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^0-9]{0,30}?(\\d+(?:[.,]\\d+)?) ?(mg|mcg|g|ui)\\b');
    const m = t.match(rx);
    return { ...a, conc: m ? `${m[1].replace('.', ',')} ${m[2]}` : '' };
  });
}
const SAIS = new Set(['cloridrato', 'maleato', 'besilato', 'sulfato', 'acetato', 'brometo', 'dipropionato', 'potassica', 'sodica', 'monoidratada', 'hidratado', 'hidratada', 'micronizado', 'fosfato', 'succinato', 'fumarato', 'tartarato', 'citrato', 'mesilato', 'calcica', 'magnesica', 'dicloridrato', 'cloridrato', 'valerato', 'enantato', 'propionato']);

// ---------- Dosagens e preços ----------
// Agrupa as apresentações de um princípio ativo por dosagem + forma.
export function dosagens(sub, marca) {
  const m = new Map();
  for (const it of sub.itens) {
    if (marca && it.produto !== marca) continue;
    if (!m.has(it.dose)) m.set(it.dose, { dose: it.dose, conc: it.conc, forma: it.forma, fp: '', itens: [], comerc: false });
    const d = m.get(it.dose);
    d.itens.push(it);
    if (it.fp) d.fp = it.fp;
    if (it.comerc) d.comerc = true;
  }
  return [...m.values()].sort((a, b) => (!!b.fp - !!a.fp) || massa(a.conc) - massa(b.conc) || a.forma.localeCompare(b.forma));
}
const numDe = (c) => parseFloat(String(c).replace(',', '.')) || 0;
// "1 g" vem depois de "850 mg"
const massa = (c) => numDe(c) * (/^[\d.,]+ g\b/.test(c) ? 1000 : /^[\d.,]+ mcg/.test(c) ? 0.001 : 1);

// Preços: o menor e o maior teto por embalagem, separando genérico e marca.
export function precos(dosagem) {
  const porEmb = new Map();
  for (const it of dosagem.itens) {
    const k = it.emb || '—';
    if (!porEmb.has(k)) porEmb.set(k, []);
    porEmb.get(k).push(it);
  }
  // embalagem mais comum entre as comercializadas primeiro
  const embs = [...porEmb.entries()]
    .map(([emb, its]) => ({ emb, its: its.sort((a, b) => a.pmc - b.pmc), comerc: its.filter((i) => i.comerc).length }))
    .sort((a, b) => b.comerc - a.comerc || b.its.length - a.its.length);
  return embs;
}

export const nomeTipo = (t) => TIPO[t] || 'Outro';
export const nomeTarja = (t) => TARJA[t] || '';
export const brl = (cent) => (cent / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
