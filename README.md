# EconoMed

App Android que diz se um remédio é gratuito no programa Farmácia Popular e onde retirar.
Projeto integrador do curso de Ciência da Computação.

## Protótipo navegável

**Abrir:** https://vinicyusro.github.io/EconoMed/

O protótipo simula o app num celular Android. Dá para tocar nas telas como no app de verdade, ou usar o painel ao lado para ir direto a qualquer tela, simular erros (sem internet, câmera negada, falha na leitura da receita) e testar fonte grande e tema escuro.

### Funções

- Busca por nome ou nome comercial, com "Você quis dizer?"
- Escolha da dosagem e resultado gratuito, com o que levar à farmácia
- Lista completa do programa, filtrada por doença
- Leitura da receita por foto ou QR code
- Farmácias credenciadas por CEP
- Preço máximo permitido (CMED) e links para ver o preço nas redes
- Meus remédios: próxima retirada e lembrete 3 dias antes
- Ouvir o resultado em voz alta e compartilhar
- Privacidade: sem login, tudo fica no celular

O código fica em [`docs/index.html`](docs/index.html): um único arquivo HTML, CSS e JavaScript, sem dependências.

### Fontes dos dados

- Remédios e dosagens: lista do programa Farmácia Popular (Ministério da Saúde), versão de 10/11/2026.
- Farmácias: no app, lista oficial "Aqui Tem Farmácia Popular". No protótipo, os endereços são exemplos.
- Preço máximo permitido: tabela CMED/Anvisa publicada em 09/11/2026 (PMC com ICMS de 18%, São Paulo).
- Preços de cada farmácia: o app não guarda. Os links abrem o site de cada rede (Drogasil, Droga Raia, Pague Menos).

### Publicar no GitHub Pages

Em **Settings › Pages**, escolha *Deploy from a branch* e a branch `main`. Com a pasta `/docs`, o endereço abre o protótipo direto. Com a pasta `/ (root)`, o `index.html` da raiz redireciona para `docs/`.

## Integrantes

Giovanni, Italo, Guilherme, Murilo, Pierre e Vinicyus.
