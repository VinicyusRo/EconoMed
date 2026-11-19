// Tudo o que a pessoa guarda fica só neste navegador (localStorage).
const CHAVE = 'economed:v1';
const PADRAO = { historico: [], salvarHistorico: true, remedios: [], cep: '', texto: 1, viuIntro: false };

let estado = carregar();
function carregar() {
  try {
    return { ...PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') };
  } catch {
    return { ...PADRAO };
  }
}
function gravar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch { /* modo privado: segue só na memória */ }
}

export const store = {
  get: (k) => estado[k],
  set(k, v) { estado[k] = v; gravar(); },
  addHistorico(termo) {
    if (!estado.salvarHistorico) return;
    const t = String(termo).trim();
    if (!t) return;
    estado.historico = [t, ...estado.historico.filter((h) => h.toLowerCase() !== t.toLowerCase())].slice(0, 8);
    gravar();
  },
  limparHistorico() { estado.historico = []; gravar(); },
  apagarTudo() { estado = { ...PADRAO, viuIntro: true }; gravar(); },
  // Meus remédios: { id, sub, dose, nome, rotulo, fp, ultima: 'AAAA-MM-DD' | '', lembrete: bool }
  salvo: (id) => estado.remedios.find((r) => r.id === id),
  salvar(r) { estado.remedios = [r, ...estado.remedios.filter((x) => x.id !== r.id)]; gravar(); },
  remover(id) { estado.remedios = estado.remedios.filter((x) => x.id !== id); gravar(); },
  atualizar(id, dados) { estado.remedios = estado.remedios.map((x) => (x.id === id ? { ...x, ...dados } : x)); gravar(); },
};
