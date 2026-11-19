import { DB, carregar, buscar, sugerir, dosagens, precos, acharNoTexto, ehNomeDoPrincipio, nomeTipo, nomeTarja, brl, norm } from './dados.js';
import { store } from './store.js';
import { ic } from './icones.js';

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');
const $aviso = document.getElementById('aviso');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const DIA = 864e5;
const hojeIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const somaDias = (iso, n) => new Date(new Date(iso + 'T12:00:00').getTime() + n * DIA).toISOString().slice(0, 10);
const diasAte = (iso) => Math.round((new Date(iso + 'T12:00:00') - new Date(hojeIso() + 'T12:00:00')) / DIA);
const dataBr = (iso) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
const MAIS_PROCURADOS = ['Losartana', 'Metformina', 'Sinvastatina', 'Insulina', 'Dipirona', 'Omeprazol'];

// Nome curto para mostrar: "Losartana potássica; Hidroclorotiazida" -> "Losartana potássica + hidroclorotiazida"
const nomeSub = (sub) => sub.nome.split('; ').map((p, i) => (i ? p.toLowerCase() : p)).join(' + ');
const rotuloDose = (d) => [d.conc, d.forma].filter(Boolean).join(', ');
const marcasDe = (sub, n = 3) => [...sub.marcas.entries()].filter(([m, tipo]) => !ehNomeDoPrincipio({ n: norm(m), tipo }, sub)).map(([m]) => m).slice(0, n);

// ---------- Roteamento por hash (#/busca?q=...) ----------
function rota() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [caminho, qs] = h.split('?');
  const partes = caminho.split('/').filter(Boolean).map(decodeURIComponent);
  return { partes, p: new URLSearchParams(qs || '') };
}
export const ir = (h) => { location.hash = h; };

const TELAS = {
  '': telaInicio,
  busca: telaBusca,
  r: telaRemedio,
  item: telaItem,
  gratuitos: telaGratuitos,
  receita: telaReceita,
  meus: telaMeus,
  farmacias: telaFarmacias,
  ajuda: telaAjuda,
};
const ABA = { '': 'inicio', busca: 'inicio', r: 'inicio', item: 'inicio', gratuitos: 'inicio', farmacias: 'inicio', receita: 'receita', meus: 'meus', ajuda: 'ajuda' };

let telaAtual = '';
async function render() {
  const { partes, p } = rota();
  const nome = partes[0] || '';
  const tela = TELAS[nome] || telaNaoEncontrada;
  marcarAba(ABA[nome] || 'inicio');
  const mudouTela = telaAtual !== location.hash.split('?')[0] || nome !== 'busca';
  telaAtual = location.hash.split('?')[0];
  if (!DB.pronto && nome !== 'ajuda') {
    $app.innerHTML = `<div class="carregando" role="status">${ic('pill')}<p>Abrindo a lista de remédios…</p></div>`;
    try { await carregar(); } catch { $app.innerHTML = telaErroDados(); return; }
  }
  const html = tela(partes.slice(1), p);
  if (html === null) return; // tela cuidou do próprio desenho
  $app.innerHTML = html;
  depoisDeDesenhar(nome);
  if (mudouTela) {
    window.scrollTo(0, 0);
    const h1 = $app.querySelector('h1');
    if (h1 && nome !== '' ) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }
}

function marcarAba(aba) {
  $nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.aba === aba) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function avisar(texto) {
  $aviso.textContent = texto;
  $aviso.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { $aviso.hidden = true; }, 4500);
}

// ---------- Pedaços ----------
const voltar = (href = '#/') => `<a class="voltar" href="${href}" data-act="voltar">${ic('back')}<span>Voltar</span></a>`;
const campoBusca = (valor = '', autofocus = false) => `
  <form class="busca" role="search" action="#/busca" data-form="busca">
    <label for="q" class="rotulo">Nome do remédio</label>
    <div class="campo">
      ${ic('search')}
      <input id="q" name="q" type="search" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search"
        placeholder="Ex.: losartana, Glifage" value="${esc(valor)}" ${autofocus ? 'autofocus' : ''} aria-describedby="q-ajuda">
      ${valor ? `<button type="button" class="limpar" data-act="limparBusca" aria-label="Apagar o que foi digitado">${ic('close')}</button>` : ''}
    </div>
    <p id="q-ajuda" class="ajuda-campo">Pode ser o nome da caixa (marca) ou o nome do remédio que está na receita.</p>
  </form>`;
const selo = (gratis) => (gratis ? `<span class="selo gratis">${ic('check')}De graça</span>` : '');
const fonteLinha = () => `<p class="fonte">Lista do Farmácia Popular de ${esc(DB.fp?.versao || '')} · Preços CMED/Anvisa de ${esc(DB.cmedData || '')}</p>`;

// ---------- Início ----------
function telaInicio() {
  const prox = proximaRetirada();
  return `
  <section class="hero">
    <h1>Descubra se o seu remédio é de graça</h1>
    <p class="lead">Confira na lista oficial do Farmácia Popular e veja o preço máximo que a farmácia pode cobrar.</p>
    ${campoBusca()}
    <div class="chips" aria-label="Mais procurados">
      <span class="chips-titulo">Mais procurados:</span>
      ${MAIS_PROCURADOS.map((m) => `<a class="chip" href="#/busca?q=${enc(m)}">${m}</a>`).join('')}
    </div>
  </section>
  ${prox}
  <div class="grade">
    <a class="cartao acao" href="#/receita">
      <span class="cartao-ic azul">${ic('camera')}</span>
      <span><b>Tem a receita ou a caixa?</b><span class="sub">Tire uma foto e o EconoMed procura o remédio para você.</span></span>
      ${ic('chev', 'ic seta')}
    </a>
    <a class="cartao acao" href="#/gratuitos">
      <span class="cartao-ic verde">${ic('doc')}</span>
      <span><b>Todos os remédios de graça</b><span class="sub">${DB.fp.itens.length} itens, separados por doença.</span></span>
      ${ic('chev', 'ic seta')}
    </a>
  </div>
  <section class="leve" aria-labelledby="t-levar">
    <h2 id="t-levar">Para pegar de graça na farmácia, leve</h2>
    <ul class="lista-ic">
      <li>${ic('doc')}<span><b>A receita médica</b> dentro da validade, com o nome do remédio e a dosagem. Pode ser do SUS ou de médico particular.</span></li>
      <li>${ic('person')}<span><b>Um documento com foto e o CPF.</b> Se outra pessoa for buscar, leve também os documentos dela.</span></li>
    </ul>
    <a class="link-forte" href="#/farmacias">${ic('pin')}Achar uma farmácia credenciada</a>
  </section>
  ${fonteLinha()}`;
}

function proximaRetirada() {
  const comData = store.get('remedios').filter((r) => r.ultima && r.fp);
  if (!comData.length) return '';
  const r = comData.map((x) => ({ ...x, prox: somaDias(x.ultima, 30) })).sort((a, b) => (a.prox < b.prox ? -1 : 1))[0];
  const n = diasAte(r.prox);
  const quando = n <= 0 ? 'Já pode retirar' : n === 1 ? 'Pode retirar amanhã' : `Pode retirar em ${n} dias`;
  return `<a class="cartao lembrete" href="#/meus">
    <span class="cartao-ic ambar">${ic('bell')}</span>
    <span><b>${quando}</b><span class="sub">${esc(r.nome)} ${esc(r.rotulo)} · a partir de ${dataBr(r.prox)}</span></span>
    ${ic('chev', 'ic seta')}
  </a>`;
}

// ---------- Busca ----------
function telaBusca(_, p) {
  const q = p.get('q') || '';
  return `
  <h1 class="sr">Buscar remédio</h1>
  ${campoBusca(q, !q)}
  <div id="resultados" aria-live="polite">${resultadosHtml(q)}</div>`;
}

function resultadosHtml(q) {
  if (!q.trim()) {
    const hist = store.get('historico');
    return hist.length
      ? `<section><h2 class="t-secao">Buscas recentes</h2><div class="chips">${hist.map((h) => `<a class="chip" href="#/busca?q=${enc(h)}">${ic('history')}${esc(h)}</a>`).join('')}</div></section>`
      : `<p class="vazio">Digite pelo menos 3 letras para começar.</p>`;
  }
  if (norm(q).length < 3) return `<p class="vazio">Digite pelo menos 3 letras.</p>`;
  const { itens, total } = buscar(q, 30);
  if (!itens.length) {
    const sug = sugerir(q);
    return `<div class="caixa aviso-ambar" role="status">
      <p class="t-titulo">Não achamos “${esc(q)}”</p>
      ${sug.length ? `<p>Você quis dizer:</p><div class="chips">${sug.map((s) => `<a class="chip forte" href="#/busca?q=${enc(s)}">${esc(s)}</a>`).join('')}</div>` : '<p>Confira se o nome está escrito igual ao da receita ou da caixa.</p>'}
      <p class="sub">Dica: você também pode <a href="#/receita">tirar foto da receita ou da caixa</a>.</p>
    </div>`;
  }
  const linhas = itens.map((r) => {
    if (r.tipo === 'grupo') {
      return `<li><a class="resultado" href="#/gratuitos?g=${r.grupo.id}">
        <span class="res-ic verde">${ic('doc')}</span>
        <span class="res-txt"><b>Remédios de graça para ${esc(r.grupo.nome.toLowerCase())}</b><span class="sub">Ver a lista do Farmácia Popular</span></span>${ic('chev', 'ic seta')}</a></li>`;
    }
    if (r.tipo === 'item') {
      return `<li><a class="resultado" href="#/item/${r.item.id}">
        <span class="res-ic verde">${ic('check')}</span>
        <span class="res-txt"><b>${esc(r.item.nome)}</b><span class="sub">${esc(r.item.nota || '')}</span></span>${selo(true)}</a></li>`;
    }
    const sub = r.sub;
    const gratis = sub.fp.size > 0;
    const menor = Math.min(...sub.itens.map((i) => i.pmc));
    if (r.tipo === 'marca') {
      return `<li><a class="resultado" href="#/r/${sub.i}?marca=${enc(r.marca)}">
        <span class="res-ic">${ic('pill')}</span>
        <span class="res-txt"><b>${esc(r.marca)}</b><span class="sub">Marca de <b>${esc(nomeSub(sub))}</b></span></span>${gratis ? selo(true) : ''}</a></li>`;
    }
    const marcas = marcasDe(sub);
    return `<li><a class="resultado" href="#/r/${sub.i}">
      <span class="res-ic">${ic('pill')}</span>
      <span class="res-txt"><b>${esc(nomeSub(sub))}</b><span class="sub">${marcas.length ? `Marcas: ${esc(marcas.join(', '))}` : `Preço máximo a partir de ${brl(menor)}`}</span></span>${gratis ? selo(true) : ''}</a></li>`;
  });
  const combo = itens.map((r) => r.tipo === 'sub' && r.sub.nome.includes(';'));
  const principais = linhas.filter((_, i) => !combo[i]);
  const combos = linhas.filter((_, i) => combo[i]);
  return `<p class="contagem">${total > itens.length ? `Mostrando ${itens.length} de ${total} resultados. Digite mais letras para filtrar.` : `${total} ${total === 1 ? 'resultado' : 'resultados'}`}</p>
    ${principais.length ? `<ul class="resultados">${principais.join('')}</ul>` : ''}
    ${combos.length ? `<details class="mais" ${principais.length ? '' : 'open'}><summary>Remédios que juntam dois ou mais (${combos.length})</summary><ul class="resultados">${combos.join('')}</ul></details>` : ''}`;
}

// ---------- Remédio: escolher a dosagem ----------
function telaRemedio(partes, p) {
  const sub = DB.subs[Number(partes[0])];
  if (!sub) return telaNaoEncontrada();
  const marca = p.get('marca') || '';
  if (partes[1]) return telaResultado(sub, partes[1], marca);
  let doses = dosagens(sub, marca);
  if (!doses.length) doses = dosagens(sub);
  const gratisEmOutra = marca && !doses.some((d) => d.fp) && sub.fp.size;
  if (doses.length === 1) {
    history.replaceState(null, '', `#/r/${sub.i}/${enc(doses[0].dose)}${marca ? `?marca=${enc(marca)}` : ''}`);
    return telaResultado(sub, doses[0].dose, marca);
  }
  const titulo = marca ? esc(marca) : esc(nomeSub(sub));
  const opcaoDose = (d) => `<li><a class="opcao" href="#/r/${sub.i}/${enc(d.dose)}${marca ? `?marca=${enc(marca)}` : ''}">
        <span class="opcao-txt"><b>${esc(d.conc || 'Dosagem única')}</b><span class="sub">${esc(d.forma)}</span></span>
        ${d.fp ? selo(true) : ''}${ic('chev', 'ic seta')}</a></li>`;
  return `
  ${voltar()}
  <header class="cab">
    <h1>${titulo}</h1>
    ${marca ? `<p class="lead">É o nome de marca de <b>${esc(nomeSub(sub))}</b>.</p>` : marcasDe(sub, 4).length ? `<p class="lead">Também vendido como ${esc(marcasDe(sub, 4).join(', '))}.</p>` : ''}
    ${sub.fp.size ? `<p class="faixa gratis">${ic('check')}Tem dosagem de graça no Farmácia Popular</p>` : `<p class="faixa neutra">${ic('info')}Não está no Farmácia Popular</p>`}
  </header>
  <section aria-labelledby="t-dose">
    <h2 id="t-dose" class="t-secao">Qual é a dosagem da sua receita?</h2>
    <p class="sub">Ela aparece do lado do nome, por exemplo “50 mg”.</p>
    <ul class="opcoes">${doses.filter((d) => d.fp || d.comerc).map(opcaoDose).join('')}</ul>
    ${doses.some((d) => !d.fp && !d.comerc) ? `<details class="mais"><summary>Outras dosagens (pouco vendidas)</summary>
      <ul class="opcoes">${doses.filter((d) => !d.fp && !d.comerc).map(opcaoDose).join('')}</ul></details>` : ''}
    ${gratisEmOutra ? `<p class="caixa info">${ic('info')}<span>A marca ${esc(marca)} não tem dosagem gratuita, mas o mesmo remédio tem. <a href="#/r/${sub.i}">Ver todas as dosagens de ${esc(nomeSub(sub))}</a>.</span></p>` : ''}
  </section>
  ${fonteLinha()}`;
}

// ---------- Resultado de uma dosagem ----------
function telaResultado(sub, dose, marca) {
  let doses = dosagens(sub);
  const d = doses.find((x) => x.dose === dose);
  if (!d) return telaNaoEncontrada();
  const fp = d.fp ? DB.fpById.get(d.fp) : null;
  const rotulo = rotuloDose(d);
  const nome = nomeSub(sub);
  const id = `${sub.i}|${dose}`;
  const salvo = store.salvo(id);
  const outrasGratis = doses.filter((x) => x.fp && x.dose !== dose);
  const dadosFala = fp
    ? `${nome}, ${rotulo}. É de graça no Farmácia Popular. Leve a receita, um documento com foto e o CPF.`
    : `${nome}, ${rotulo}. Esta dosagem não é de graça no Farmácia Popular.`;

  const status = fp
    ? `<section class="status gratis" aria-labelledby="t-status">
        <span class="status-ic">${ic('check')}</span>
        <div><h2 id="t-status">De graça no Farmácia Popular</h2>
        <p>${esc(nome)} <b>${esc(rotulo)}</b> está na lista oficial. Você não paga nada.</p>
        ${fp.nota ? `<p class="nota">${ic('info')}<span>${esc(fp.nota)}</span></p>` : ''}</div>
      </section>`
    : `<section class="status nao" aria-labelledby="t-status">
        <span class="status-ic">${ic('info')}</span>
        <div><h2 id="t-status">${sub.fp.size ? 'Esta dosagem não é de graça' : 'Não está no Farmácia Popular'}</h2>
        <p>${sub.fp.size ? `${esc(nome)} ${esc(rotulo)} não está na lista do programa.` : `${esc(nome)} não faz parte da lista do programa. Veja abaixo o preço máximo que a farmácia pode cobrar.`}</p></div>
      </section>`;

  const outras = !fp && outrasGratis.length
    ? `<div class="caixa info">${ic('info')}<div><p><b>Mas existe versão de graça:</b></p>
        <ul class="links-simples">${outrasGratis.map((x) => `<li><a href="#/r/${sub.i}/${enc(x.dose)}">${esc(nome)} ${esc(rotuloDose(x))}</a></li>`).join('')}</ul>
        <p class="sub">Só o médico pode trocar a dosagem. Leve esta informação na próxima consulta.</p></div></div>`
    : '';

  const levar = fp
    ? `<section class="leve" aria-labelledby="t-levar2">
        <h2 id="t-levar2">O que levar à farmácia</h2>
        <ul class="lista-ic">
          <li>${ic('doc')}<span><b>Receita médica</b> dentro da validade, com “${esc(nome.split(' + ')[0])}” e a dosagem ${esc(d.conc)}.</span></li>
          <li>${ic('person')}<span><b>Documento com foto e CPF</b> de quem vai usar o remédio.</span></li>
        </ul>
        ${marca && norm(marca) !== sub.n ? `<p class="sub">Na farmácia, você pode receber outra marca com o mesmo remédio, em geral o genérico. O efeito é o mesmo.</p>` : ''}
        <a class="botao primario bloco" href="#/farmacias?para=${enc(fp.id)}">${ic('pin')}Achar farmácia perto de mim</a>
      </section>`
    : '';

  const embs = precos(d);
  const principal = embs[0];
  const gen = principal.its.filter((i) => i.tipo === 'G');
  const resumo = `
    <div class="preco-destaque">
      <div><span class="sub">Mais barato (${esc(principal.emb || 'embalagem')})</span><b>${brl(principal.its[0].pmc)}</b><span class="sub">${esc(principal.its[0].produto)} · ${esc(principal.its[0].lab)}</span></div>
      ${gen.length ? `<div><span class="sub">Genéricos</span><b>${gen.length > 1 && gen[0].pmc !== gen[gen.length - 1].pmc ? `${brl(gen[0].pmc)} a ${brl(gen[gen.length - 1].pmc)}` : brl(gen[0].pmc)}</b><span class="sub">${gen.length} ${gen.length === 1 ? 'opção' : 'opções'}</span></div>` : ''}
    </div>`;
  const tabela = embs.slice(0, 6).map((e) => `
    <h3 class="t-pequeno">${esc(e.emb ? `Embalagem com ${e.emb}` : 'Embalagem')}</h3>
    <ul class="precos">${e.its.slice(0, 12).map((it) => `<li class="${marca && it.produto === marca ? 'destacado' : ''}">
      <span><b>${esc(it.produto)}</b><span class="sub">${esc(nomeTipo(it.tipo))} · ${esc(it.lab)}</span></span><span class="valor">${brl(it.pmc)}</span></li>`).join('')}
    </ul>${e.its.length > 12 ? `<p class="sub">E mais ${e.its.length - 12} opções.</p>` : ''}`).join('');
  const tarja = nomeTarja(d.itens[0].tarja);
  const preco = `
    <section class="cartao-plano" aria-labelledby="t-preco">
      <h2 id="t-preco">${fp ? 'Se for comprar' : 'Preço máximo permitido'}</h2>
      <p class="sub">É o valor mais alto que qualquer farmácia pode cobrar. Muitas cobram menos.</p>
      ${resumo}
      <details class="mais"><summary>Ver todas as marcas e preços</summary>${tabela}</details>
      <h3 class="t-pequeno">Ver o preço de hoje no site das redes</h3>
      <div class="redes">${linksRedes(nome.split(' + ')[0] + ' ' + d.conc)}</div>
      <p class="fonte">Tabela CMED/Anvisa de ${esc(DB.cmedData)}, com ICMS de ${DB.icms}% (São Paulo e outros estados com a mesma alíquota).</p>
    </section>`;

  return `
  ${voltar(`#/r/${sub.i}${marca ? `?marca=${enc(marca)}` : ''}`)}
  <header class="cab">
    <p class="sobretitulo">${marca && norm(marca) !== sub.n ? `${esc(marca)} · ` : ''}${esc(nome)}</p>
    <h1>${esc(nome.split(' + ').length > 1 ? nome : nome)} ${esc(d.conc)}</h1>
    <p class="lead">${esc(d.forma)}${tarja ? ` · ${esc(tarja)}` : ''}</p>
  </header>
  ${status}
  ${outras}
  <div class="acoes">
    <button class="botao ${salvo ? 'tonal' : 'contorno'}" data-act="salvar" data-id="${esc(id)}" data-nome="${esc(nome)}" data-rotulo="${esc(rotulo)}" data-fp="${esc(d.fp)}" aria-pressed="${!!salvo}">
      ${ic(salvo ? 'star' : 'starOutline')}${salvo ? 'Salvo em Meus remédios' : 'Salvar em Meus remédios'}</button>
    <button class="botao contorno" data-act="ouvir" data-texto="${esc(dadosFala)}">${ic('volume')}Ouvir</button>
    <button class="botao contorno" data-act="compartilhar" data-texto="${esc(dadosFala)}">${ic('share')}Enviar</button>
  </div>
  ${levar}
  ${preco}
  <p class="aviso-medico">${ic('info')}O EconoMed informa, mas não substitui o médico ou o farmacêutico.</p>`;
}

const linksRedes = (termo) => {
  const q = enc(termo.trim());
  return [
    ['Drogasil', `https://www.drogasil.com.br/search?w=${q}`],
    ['Droga Raia', `https://www.drogaraia.com.br/search?w=${q}`],
    ['Pague Menos', `https://www.paguemenos.com.br/${q}?_q=${q}&map=ft`],
  ].map(([n, u]) => `<a class="botao contorno pequeno" href="${u}" target="_blank" rel="noopener">${n}${ic('ext')}<span class="sr"> (abre outro site)</span></a>`).join('');
};

// ---------- Item gratuito sem preço (fralda, absorvente, ou sem par na CMED) ----------
function telaItem(partes) {
  const f = DB.fpById.get(partes[0]);
  if (!f) return telaNaoEncontrada();
  if (f.sub != null) {
    const d = dosagens(DB.subs[f.sub]).find((x) => x.fp === f.id);
    if (d) { history.replaceState(null, '', `#/r/${f.sub}/${enc(d.dose)}`); return telaResultado(DB.subs[f.sub], d.dose, ''); }
  }
  const fala = `${f.nome}${f.dose ? ' ' + f.dose : ''}. É de graça no Farmácia Popular. ${f.nota || ''}`;
  return `
  ${voltar('#/gratuitos')}
  <header class="cab"><h1>${esc(f.nome)} ${esc(f.dose)}</h1><p class="lead">${esc(f.forma)}</p></header>
  <section class="status gratis"><span class="status-ic">${ic('check')}</span><div><h2>De graça no Farmácia Popular</h2>
    <p>Está na lista oficial do programa.</p>${f.nota ? `<p class="nota">${ic('info')}<span>${esc(f.nota)}</span></p>` : ''}</div></section>
  <div class="acoes"><button class="botao contorno" data-act="ouvir" data-texto="${esc(fala)}">${ic('volume')}Ouvir</button>
  <button class="botao contorno" data-act="compartilhar" data-texto="${esc(fala)}">${ic('share')}Enviar</button></div>
  <section class="leve"><h2>O que levar à farmácia</h2>
    <ul class="lista-ic"><li>${ic('doc')}<span><b>Receita, laudo ou autorização</b>, conforme o item.</span></li><li>${ic('person')}<span><b>Documento com foto e CPF.</b></span></li></ul>
    <a class="botao primario bloco" href="#/farmacias?para=${enc(f.id)}">${ic('pin')}Achar farmácia perto de mim</a></section>`;
}

// ---------- Lista de gratuitos por doença ----------
function telaGratuitos(_, p) {
  const g = p.get('g') || '';
  const itens = DB.fp.itens.filter((i) => !g || i.grupo === g);
  const porGrupo = DB.grupos.filter((gr) => !g || gr.id === g).map((gr) => ({ gr, its: itens.filter((i) => i.grupo === gr.id) }));
  return `
  ${voltar()}
  <header class="cab"><h1>Remédios de graça</h1>
  <p class="lead">Lista oficial do Farmácia Popular, atualizada em ${esc(DB.fp.versao)}. Só a dosagem que está na lista é gratuita.</p></header>
  <nav class="chips rolagem" aria-label="Filtrar por doença">
    <a class="chip ${!g ? 'ativo' : ''}" href="#/gratuitos" ${!g ? 'aria-current="true"' : ''}>Todas</a>
    ${DB.grupos.map((gr) => `<a class="chip ${g === gr.id ? 'ativo' : ''}" href="#/gratuitos?g=${gr.id}" ${g === gr.id ? 'aria-current="true"' : ''}>${esc(gr.nome)}</a>`).join('')}
  </nav>
  ${porGrupo.map(({ gr, its }) => `<section aria-labelledby="g-${gr.id}"><h2 class="t-secao" id="g-${gr.id}">${esc(gr.nome)}</h2>
    <ul class="opcoes">${its.map((i) => `<li><a class="opcao" href="#/item/${i.id}">
      <span class="opcao-txt"><b>${esc(i.nome)}</b><span class="sub">${esc([i.dose, i.forma].filter(Boolean).join(', '))}</span></span>${ic('chev', 'ic seta')}</a></li>`).join('')}</ul></section>`).join('')}
  <p class="fonte">Fonte: Ministério da Saúde, Programa Farmácia Popular do Brasil.</p>`;
}

// ---------- Receita / caixa ----------
let leitura = { estado: 'inicio' }; // inicio | lendo | resultado | erro
function telaReceita() {
  const l = leitura;
  let corpo = '';
  if (l.estado === 'lendo') {
    corpo = `<div class="caixa lendo" role="status" aria-live="polite">
      <div class="barra"><i style="width:${Math.round((l.prog || 0) * 100)}%"></i></div>
      <p class="t-titulo">${esc(l.msg || 'Lendo…')}</p>
      <p class="sub">A leitura acontece neste aparelho. A foto não é enviada para ninguém.</p></div>`;
  } else if (l.estado === 'resultado') {
    corpo = resultadoLeitura(l);
  } else if (l.estado === 'erro') {
    corpo = `<div class="caixa aviso-ambar" role="alert"><p class="t-titulo">${esc(l.titulo)}</p><p>${esc(l.msg)}</p>
      <p class="sub">Você pode tentar outra foto ou <a href="#/busca">digitar o nome do remédio</a>.</p></div>`;
  }
  return `
  <header class="cab"><h1>Ler receita ou caixa</h1>
  <p class="lead">Escolha o que você tem em mãos. A leitura é feita neste aparelho.</p></header>
  ${corpo}
  <div class="grade">
    <label class="cartao acao arquivo">
      <input type="file" accept="image/*" capture="environment" data-ler="texto" class="sr">
      <span class="cartao-ic azul">${ic('camera')}</span>
      <span><b>Foto da receita de papel</b><span class="sub">Fotografe de perto, com boa luz e a receita reta.</span></span>
    </label>
    <label class="cartao acao arquivo">
      <input type="file" accept="image/*" capture="environment" data-ler="codigo" class="sr">
      <span class="cartao-ic verde">${ic('barcode')}</span>
      <span><b>Código de barras da caixa</b><span class="sub">Fotografe as barras pretas da caixa do remédio.</span></span>
    </label>
    <label class="cartao acao arquivo">
      <input type="file" accept="image/*" capture="environment" data-ler="codigo" class="sr">
      <span class="cartao-ic ambar">${ic('qr')}</span>
      <span><b>QR code da receita digital</b><span class="sub">Fotografe o quadradinho que vem na receita digital.</span></span>
    </label>
  </div>
  <p class="sub centro">No computador, os botões abrem a escolha de uma imagem já salva.</p>`;
}

function resultadoLeitura(l) {
  if (l.produto) {
    const it = l.produto;
    const sub = DB.subs[it.sub];
    return `<div class="caixa sucesso" role="status"><p class="t-titulo">Achamos a caixa</p>
      <a class="resultado" href="#/r/${sub.i}/${enc(it.dose)}?marca=${enc(it.produto)}"><span class="res-ic">${ic('pill')}</span>
      <span class="res-txt"><b>${esc(it.produto)} ${esc(it.conc)}</b><span class="sub">${esc(nomeSub(sub))} · ${esc(it.forma)}</span></span>${it.fp ? selo(true) : ''}</a></div>`;
  }
  if (l.achados?.length) {
    return `<div class="caixa sucesso" role="status"><p class="t-titulo">Encontramos ${l.achados.length === 1 ? 'este remédio' : 'estes remédios'}</p>
      <p class="sub">Confira com a receita e toque para ver se é de graça.</p>
      <ul class="resultados">${l.achados.map((a) => {
        const d = a.conc ? dosagens(a.sub).find((x) => norm(x.conc) === norm(a.conc)) : null;
        const href = `#/r/${a.sub.i}${d ? `/${enc(d.dose)}` : ''}${a.marca ? `?marca=${enc(a.marca)}` : ''}`;
        const gratis = d ? !!d.fp : a.sub.fp.size > 0;
        return `<li><a class="resultado" href="${href}">
        <span class="res-ic">${ic('pill')}</span><span class="res-txt"><b>${esc(a.marca || nomeSub(a.sub))}${d ? ` ${esc(d.conc)}` : ''}</b>${a.marca ? `<span class="sub">${esc(nomeSub(a.sub))}</span>` : ''}${d ? `<span class="sub">${esc(d.forma)}</span>` : ''}</span>${gratis ? selo(true) : ''}</a></li>`;
      }).join('')}</ul>
      ${l.link ? linkReceitaDigital(l.link) : ''}</div>`;
  }
  if (l.link) return `<div class="caixa info" role="status">${linkReceitaDigital(l.link)}</div>`;
  return `<div class="caixa aviso-ambar" role="status"><p class="t-titulo">Não reconhecemos nenhum remédio</p>
    <p>${l.codigo ? `Lemos o código ${esc(l.codigo)}, mas ele não está na tabela da Anvisa.` : 'A letra pode estar difícil de ler.'} Tente outra foto, mais perto e com mais luz, ou <a href="#/busca">digite o nome</a>.</p></div>`;
}
const linkReceitaDigital = (url) => `<p class="t-titulo">Receita digital</p>
  <p>Este QR code abre a receita no site de validação. Lá você vê o nome e a dosagem.</p>
  <a class="botao contorno" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ic('ext')}Abrir a receita digital</a>
  <p class="sub">Endereço: ${esc(url.replace(/^https?:\/\//, '').slice(0, 60))}</p>`;

async function lerArquivo(arquivo, modo) {
  const mod = await import('./receita.js');
  leitura = { estado: 'lendo', prog: 0.05, msg: modo === 'texto' ? 'Preparando a leitura da receita…' : 'Procurando o código…' };
  redesenhaReceita();
  try {
    if (modo === 'texto') {
      if (!navigator.onLine && !lerArquivo.ocrPronto) throw Object.assign(new Error('rede'), { semRede: true });
      const texto = await mod.lerTexto(arquivo, (p) => { leitura.prog = 0.1 + p * 0.9; leitura.msg = `Lendo a receita… ${Math.round(p * 100)}%`; atualizaBarra(); });
      lerArquivo.ocrPronto = true;
      leitura = { estado: 'resultado', achados: acharNoTexto(texto) };
    } else {
      const r = await mod.lerCodigo(arquivo);
      if (!r) {
        leitura = { estado: 'erro', titulo: 'Não conseguimos ler o código', msg: 'Tente de novo com o código inteiro na foto, sem reflexo de luz.' };
      } else if (/^\d{8,14}$/.test(r.texto)) {
        const it = DB.porEan.get(r.texto) || DB.porEan.get(r.texto.replace(/^0+/, ''));
        leitura = { estado: 'resultado', produto: it, codigo: r.texto };
      } else {
        const link = /^https?:\/\//i.test(r.texto) ? r.texto : '';
        leitura = { estado: 'resultado', achados: acharNoTexto(r.texto), link };
      }
    }
  } catch (e) {
    leitura = e.semRede || e.message === 'rede'
      ? { estado: 'erro', titulo: 'Precisa de internet na primeira vez', msg: modo === 'texto' ? 'Para ler a foto, o EconoMed baixa uma vez o leitor de letras. Conecte-se e tente de novo.' : 'Para ler o código, o EconoMed baixa uma vez o leitor de códigos. Conecte-se e tente de novo.' }
      : e.message === 'imagem'
        ? { estado: 'erro', titulo: 'Não conseguimos abrir a foto', msg: 'Tente tirar a foto de novo.' }
        : { estado: 'erro', titulo: 'A leitura falhou', msg: 'Tente outra foto, mais perto e com mais luz.' };
  }
  redesenhaReceita();
}
function redesenhaReceita() { if (rota().partes[0] === 'receita') { $app.innerHTML = telaReceita(); $app.querySelector('.caixa')?.scrollIntoView({ block: 'nearest' }); } }
function atualizaBarra() {
  const i = $app.querySelector('.lendo .barra i');
  const t = $app.querySelector('.lendo .t-titulo');
  if (i) i.style.width = `${Math.round(leitura.prog * 100)}%`;
  if (t) t.textContent = leitura.msg;
}

// ---------- Meus remédios ----------
function telaMeus() {
  const lista = store.get('remedios');
  const cartoes = lista.map((r) => {
    const prox = r.ultima ? somaDias(r.ultima, 30) : '';
    const n = prox ? diasAte(prox) : null;
    const [si, dose] = r.id.split('|');
    return `<li class="cartao-plano remedio">
      <div class="remedio-topo"><div><b class="t-titulo">${esc(r.nome)}</b><p class="sub">${esc(r.rotulo)}</p></div>${r.fp ? selo(true) : ''}</div>
      ${r.fp ? `<p class="retirada">${ic('calendar')}<span>${prox
        ? (n <= 0 ? `<b>Já pode retirar de novo.</b> Última retirada: ${dataBr(r.ultima)}.` : `<b>Próxima retirada: ${dataBr(prox)}</b> (em ${n} ${n === 1 ? 'dia' : 'dias'}).`)
        : 'Marque quando retirar, para saber a próxima data.'}</span></p>` : ''}
      <div class="acoes">
        ${r.fp ? `<button class="botao primario" data-act="retirei" data-id="${esc(r.id)}">${ic('check')}Retirei hoje</button>` : ''}
        ${r.fp && prox ? `<button class="botao contorno" data-act="agenda" data-id="${esc(r.id)}">${ic('bell')}Lembrete na agenda</button>` : ''}
        <a class="botao contorno" href="#/r/${si}/${enc(dose)}">Ver detalhes</a>
        <button class="botao texto perigo" data-act="remover" data-id="${esc(r.id)}">${ic('del')}Tirar da lista</button>
      </div></li>`;
  });
  return `
  <header class="cab"><h1>Meus remédios</h1>
  <p class="lead">Guarde os remédios que você usa e saiba quando pode retirar de novo. Fica só neste aparelho.</p></header>
  ${lista.length ? `<ul class="lista-cartoes">${cartoes.join('')}</ul>
    <p class="sub">O Farmácia Popular entrega, em geral, a quantidade para 30 dias. A data é uma estimativa.</p>`
    : `<div class="caixa vazio-grande">${ic('pill')}<p class="t-titulo">Nenhum remédio salvo ainda</p>
      <p>Busque um remédio e toque em <b>Salvar em Meus remédios</b>.</p>
      <a class="botao primario" href="#/busca">${ic('search')}Buscar remédio</a></div>`}`;
}

function arquivoAgenda(r) {
  const prox = somaDias(r.ultima, 30);
  const lembrar = somaDias(prox, -3).replace(/-/g, '');
  const fim = somaDias(prox, -2).replace(/-/g, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EconoMed//PT-BR', 'BEGIN:VEVENT',
    `UID:${Date.now()}@economed`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${lembrar}`, `DTEND;VALUE=DATE:${fim}`,
    `SUMMARY:Retirar ${r.nome} ${r.rotulo} no Farmácia Popular`,
    `DESCRIPTION:A partir de ${dataBr(prox)} você pode retirar de novo. Leve a receita\\, documento com foto e CPF.`,
    'BEGIN:VALARM', 'TRIGGER:PT9H', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete do EconoMed', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'lembrete-economed.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------- Farmácias ----------
let endereco = null;
function telaFarmacias(_, p) {
  const para = p.get('para');
  const f = para ? DB.fpById.get(para) : null;
  const cep = store.get('cep');
  return `
  ${voltar()}
  <header class="cab"><h1>Farmácias credenciadas</h1>
  <p class="lead">Procure farmácias com a placa “Aqui tem Farmácia Popular”.${f ? ` Você vai retirar: <b>${esc(f.nome)} ${esc(f.dose)}</b>.` : ''}</p></header>
  <form class="cartao-plano" data-form="cep" novalidate>
    <label for="cep" class="rotulo">Seu CEP</label>
    <div class="linha-campo">
      <input id="cep" name="cep" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" value="${esc(cep)}" aria-describedby="cep-msg">
      <button class="botao primario" type="submit">${ic('search')}Procurar</button>
    </div>
    <p id="cep-msg" class="ajuda-campo" aria-live="polite">${endereco ? '' : 'O CEP fica guardado só neste aparelho.'}</p>
  </form>
  <div id="endereco">${endereco ? enderecoHtml(endereco) : ''}</div>
  <button class="botao contorno bloco" data-act="localizacao">${ic('gps')}Usar minha localização</button>
  <section class="leve"><h2>Outras formas de achar</h2>
    <ul class="lista-ic">
      <li>${ic('phone')}<span>Ligue para o <b>Disque Saúde 136</b>. A ligação é gratuita.</span></li>
      <li>${ic('info')}<span>Na farmácia, procure o adesivo “Aqui tem Farmácia Popular” na porta ou no balcão.</span></li>
    </ul>
    <a class="link-forte" href="${esc(DB.fp.fonte)}" target="_blank" rel="noopener">${ic('ext')}Página oficial do programa (gov.br)</a>
  </section>
  <p class="sub">Em breve: lista oficial das farmácias credenciadas dentro do app.</p>`;
}
const mapaBusca = (onde) => `https://www.google.com/maps/search/?api=1&query=${enc('Farmácia Popular perto de ' + onde)}`;
function enderecoHtml(e) {
  if (e.erro) return `<div class="caixa aviso-ambar" role="alert"><p>${esc(e.erro)}</p></div>`;
  const onde = [e.logradouro, e.bairro, `${e.localidade} - ${e.uf}`].filter(Boolean).join(', ');
  return `<div class="cartao-plano endereco"><p class="sub">Perto de</p><p class="t-titulo">${esc(onde)}</p>
    <a class="botao primario bloco" href="${mapaBusca(onde)}" target="_blank" rel="noopener">${ic('pin')}Ver farmácias no mapa${ic('ext')}</a></div>`;
}
async function procurarCep(valor) {
  const cep = valor.replace(/\D/g, '');
  const msg = $app.querySelector('#cep-msg');
  if (cep.length !== 8) { msg.textContent = 'O CEP tem 8 números. Exemplo: 01310-100.'; msg.classList.add('erro'); $app.querySelector('#cep').setAttribute('aria-invalid', 'true'); return; }
  store.set('cep', `${cep.slice(0, 5)}-${cep.slice(5)}`);
  msg.textContent = 'Procurando…'; msg.classList.remove('erro'); $app.querySelector('#cep').removeAttribute('aria-invalid');
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const j = await r.json();
    endereco = j.erro ? { erro: 'Não achamos esse CEP. Confira os números.' } : j;
  } catch {
    endereco = { erro: 'Sem internet agora. Para achar farmácias, conecte-se e tente de novo.' };
  }
  msg.textContent = '';
  $app.querySelector('#endereco').innerHTML = enderecoHtml(endereco);
  $app.querySelector('#endereco a, #endereco .caixa')?.focus?.();
}

// ---------- Ajuda e privacidade ----------
function telaAjuda() {
  const t = store.get('texto');
  return `
  <header class="cab"><h1>Ajuda e privacidade</h1></header>
  <section class="cartao-plano" aria-labelledby="t-texto">
    <h2 id="t-texto">Tamanho do texto</h2>
    <div class="segmentado" role="group" aria-labelledby="t-texto">
      ${[[1, 'Normal'], [1.15, 'Grande'], [1.3, 'Muito grande']].map(([v, n]) => `<button data-act="texto" data-v="${v}" aria-pressed="${t === v}">${n}</button>`).join('')}
    </div>
  </section>
  <section class="cartao-plano" aria-labelledby="t-priv">
    <h2 id="t-priv">Seus dados ficam com você</h2>
    <ul class="lista-ic">
      <li>${ic('person')}<span><b>Sem login e sem cadastro.</b> Você não informa nome, CPF nem e-mail.</span></li>
      <li>${ic('phone')}<span><b>Buscas e remédios salvos ficam só neste aparelho.</b></span></li>
      <li>${ic('camera')}<span><b>A foto da receita é lida aqui mesmo</b> e não é enviada para nenhum servidor.</span></li>
      <li>${ic('pin')}<span><b>O CEP</b> só é usado para achar o seu bairro (serviço ViaCEP).</span></li>
      <li>${ic('shield')}<span>Seguimos a Lei Geral de Proteção de Dados (LGPD).</span></li>
    </ul>
    <label class="interruptor"><input type="checkbox" data-act="historico" ${store.get('salvarHistorico') ? 'checked' : ''}><span>Guardar as minhas últimas buscas</span></label>
    <button class="botao texto perigo" data-act="apagarTudo">${ic('del')}Apagar tudo o que está guardado</button>
  </section>
  <section class="cartao-plano" aria-labelledby="t-como">
    <h2 id="t-como">Como o EconoMed sabe?</h2>
    <p>Usamos duas listas oficiais, guardadas no aparelho:</p>
    <ul class="lista-ic">
      <li>${ic('doc')}<span><b>Farmácia Popular</b> (Ministério da Saúde): quais remédios e dosagens são de graça. Versão de ${esc(DB.fp?.versao || '10/11/2026')}.</span></li>
      <li>${ic('money')}<span><b>Tabela CMED</b> (Anvisa): o preço máximo de ${DB.pronto ? DB.subs.reduce((n, s) => n + s.itens.length, 0).toLocaleString('pt-BR') : 'mais de 22 mil'} apresentações vendidas em farmácia. Versão de ${esc(DB.cmedData || '09/11/2026')}.</span></li>
    </ul>
    <p class="sub">O EconoMed é um projeto de estudantes de Ciência da Computação. Ele informa, mas não substitui o médico ou o farmacêutico.</p>
  </section>`;
}

function telaNaoEncontrada() {
  return `${voltar()}<div class="caixa aviso-ambar"><h1 class="t-titulo">Página não encontrada</h1><p><a href="#/">Voltar ao início</a></p></div>`;
}
function telaErroDados() {
  return `<div class="caixa aviso-ambar" role="alert"><h1 class="t-titulo">Não conseguimos abrir a lista de remédios</h1>
  <p>Confira a internet e tente de novo.</p><button class="botao primario" data-act="recarregar">${ic('refresh')}Tentar de novo</button></div>`;
}

// ---------- Eventos ----------
let tBusca;
function depoisDeDesenhar(nome) {
  if (nome === 'busca') {
    const q = $app.querySelector('#q');
    if (q && document.activeElement !== q && !q.value) q.focus();
  }
}

$app.addEventListener('input', (e) => {
  if (e.target.id === 'q' && rota().partes[0] === 'busca') {
    clearTimeout(tBusca);
    tBusca = setTimeout(() => {
      const v = e.target.value;
      history.replaceState(null, '', `#/busca${v ? `?q=${enc(v)}` : ''}`);
      $app.querySelector('#resultados').innerHTML = resultadosHtml(v);
      const limpar = $app.querySelector('.limpar');
      if (!!v !== !!limpar) {
        const campo = $app.querySelector('.campo');
        if (v) campo.insertAdjacentHTML('beforeend', `<button type="button" class="limpar" data-act="limparBusca" aria-label="Apagar o que foi digitado">${ic('close')}</button>`);
        else limpar.remove();
      }
    }, 120);
  }
  if (e.target.id === 'cep') {
    const d = e.target.value.replace(/\D/g, '').slice(0, 8);
    e.target.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
  }
});

$app.addEventListener('submit', (e) => {
  const f = e.target.dataset.form;
  if (!f) return;
  e.preventDefault();
  if (f === 'busca') {
    const v = e.target.q.value.trim();
    if (v) store.addHistorico(v);
    if (rota().partes[0] === 'busca') {
      $app.querySelector('#resultados').innerHTML = resultadosHtml(v);
      e.target.q.blur();
      $app.querySelector('#resultados .resultado, #resultados .caixa')?.scrollIntoView({ block: 'nearest' });
    } else ir(`#/busca?q=${enc(v)}`);
  }
  if (f === 'cep') procurarCep(e.target.cep.value);
});

$app.addEventListener('change', (e) => {
  const modo = e.target.dataset.ler;
  if (modo && e.target.files?.[0]) { lerArquivo(e.target.files[0], modo); e.target.value = ''; }
  if (e.target.dataset.act === 'historico') {
    store.set('salvarHistorico', e.target.checked);
    if (!e.target.checked) store.limparHistorico();
    avisar(e.target.checked ? 'As buscas vão ficar guardadas.' : 'Buscas apagadas. Não vamos guardar as próximas.');
  }
});

document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (!a || a.tagName === 'INPUT') {
    // Quem busca e toca num resultado: guarda o termo no histórico.
    const res = e.target.closest('#resultados .resultado');
    if (res) store.addHistorico($app.querySelector('#q')?.value || '');
    return;
  }
  const act = a.dataset.act;
  if (act === 'voltar' && voltar.podeVoltar) { e.preventDefault(); history.back(); }
  if (act === 'limparBusca') { const q = $app.querySelector('#q'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); q.focus(); }
  if (act === 'salvar') {
    const { id, nome, rotulo, fp } = a.dataset;
    if (store.salvo(id)) { store.remover(id); avisar('Tirado de Meus remédios.'); }
    else { store.salvar({ id, nome, rotulo, fp, ultima: '' }); avisar('Salvo em Meus remédios.'); }
    const sv = !!store.salvo(id);
    a.setAttribute('aria-pressed', sv);
    a.className = `botao ${sv ? 'tonal' : 'contorno'}`;
    a.innerHTML = `${ic(sv ? 'star' : 'starOutline')}${sv ? 'Salvo em Meus remédios' : 'Salvar em Meus remédios'}`;
  }
  if (act === 'ouvir') ouvir(a.dataset.texto, a);
  if (act === 'compartilhar') compartilhar(a.dataset.texto);
  if (act === 'retirei') { store.atualizar(a.dataset.id, { ultima: hojeIso() }); avisar('Anotado. A próxima retirada é daqui a 30 dias.'); render(); }
  if (act === 'agenda') { const r = store.salvo(a.dataset.id); if (r) { arquivoAgenda(r); avisar('Abra o arquivo baixado para colocar o lembrete na sua agenda.'); } }
  if (act === 'remover') {
    if (a.dataset.confirmar) { store.remover(a.dataset.id); avisar('Tirado da lista.'); render(); }
    else { a.dataset.confirmar = '1'; a.innerHTML = `${ic('del')}Toque de novo para confirmar`; }
  }
  if (act === 'texto') { aplicarTexto(Number(a.dataset.v)); render(); }
  if (act === 'apagarTudo') {
    if (a.dataset.confirmar) { store.apagarTudo(); aplicarTexto(1); avisar('Tudo apagado deste aparelho.'); render(); }
    else { a.dataset.confirmar = '1'; a.innerHTML = `${ic('del')}Toque de novo para apagar tudo`; }
  }
  if (act === 'localizacao') usarLocalizacao(a);
  if (act === 'recarregar') location.reload();
  if (act === 'tamanhoRapido') { const ordem = [1, 1.15, 1.3]; const t = store.get('texto'); aplicarTexto(ordem[(ordem.indexOf(t) + 1) % 3]); avisar(`Texto ${({ 1: 'normal', 1.15: 'grande', 1.3: 'muito grande' })[store.get('texto')]}.`); }
});

function ouvir(texto, botao) {
  if (!('speechSynthesis' in window)) { avisar('Este navegador não consegue ler em voz alta.'); return; }
  if (speechSynthesis.speaking) { speechSynthesis.cancel(); return; }
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = 'pt-BR'; u.rate = 0.9;
  const voz = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'));
  if (voz) u.voice = voz;
  botao?.setAttribute('aria-pressed', 'true');
  u.onend = u.onerror = () => botao?.setAttribute('aria-pressed', 'false');
  speechSynthesis.speak(u);
}
async function compartilhar(texto) {
  const dados = { title: 'EconoMed', text: `${texto}\nVeja no EconoMed: ${location.href}` };
  if (navigator.share) { try { await navigator.share(dados); return; } catch (err) { if (err?.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(dados.text); avisar('Texto copiado. Cole no WhatsApp ou onde quiser.'); }
  catch { avisar('Não deu para copiar. Tente pelo menu do navegador.'); }
}
function usarLocalizacao(botao) {
  if (!navigator.geolocation) { avisar('Este aparelho não informa a localização.'); return; }
  botao.disabled = true;
  navigator.geolocation.getCurrentPosition((pos) => {
    botao.disabled = false;
    const { latitude: la, longitude: lo } = pos.coords;
    window.open(`https://www.google.com/maps/search/${enc('Farmácia Popular')}/@${la.toFixed(5)},${lo.toFixed(5)},15z`, '_blank', 'noopener');
  }, () => { botao.disabled = false; avisar('Não deu para usar a localização. Digite o CEP.'); }, { timeout: 10000 });
}

function aplicarTexto(v) {
  store.set('texto', v);
  document.documentElement.style.setProperty('--escala', v);
}

// Saber se há página anterior do próprio app (para o "Voltar" não sair do site).
let navs = 0;
window.addEventListener('hashchange', () => { navs++; voltar.podeVoltar = navs > 0; render(); });
aplicarTexto(store.get('texto') || 1);
render();
carregar().catch(() => {});
