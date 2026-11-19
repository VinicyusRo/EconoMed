# EconoMed

Diz se um remédio é **de graça no Farmácia Popular**, qual dosagem é gratuita, o que levar à farmácia e qual é o **preço máximo** que a farmácia pode cobrar (tabela CMED/Anvisa).
Projeto integrador do curso de Ciência da Computação.

## MVP (versão web)

**Abrir:** https://vinicyusro.github.io/EconoMed/

Funciona no navegador do celular e do computador, sem instalar nada e sem login. Foi pensado para quem tem 60 anos ou mais: letra grande (com botão para aumentar), botões grandes, uma decisão por tela e linguagem simples.

### O que já funciona de verdade

- **Busca real** em 22.165 apresentações da tabela CMED de 09/11/2026: pelo nome da caixa (marca, ex.: Glifage) ou pelo nome do remédio (ex.: metformina), por doença ("pressão alta") e com "Você quis dizer?" para erros de digitação.
- **De graça ou não, por dosagem:** cada apresentação da CMED é cruzada com o elenco do Farmácia Popular (princípio ativo + dosagem + forma).
- **Preço máximo permitido** (PMC, ICMS 18%): o mais barato, a faixa dos genéricos e todas as marcas, mais links para ver o preço do dia nas redes.
- **Foto da receita:** lê o texto no próprio aparelho (Tesseract.js) e acha os remédios e a dosagem escritos.
- **Código de barras da caixa** e **QR code da receita digital** (BarcodeDetector ou ZXing).
- **Meus remédios:** salvar, "Retirei hoje", próxima retirada em 30 dias e lembrete na agenda do celular (arquivo .ics).
- **Farmácias:** CEP (ViaCEP) ou localização, abrindo o mapa com farmácias "Aqui tem Farmácia Popular".
- **Ouvir em voz alta** e **Enviar** (WhatsApp etc.).
- **Privacidade:** tudo fica no aparelho (localStorage). Dá para apagar tudo em Ajuda.

O protótipo navegável aprovado pelo grupo continua em [`docs/prototipo/`](docs/prototipo/) (https://vinicyusro.github.io/EconoMed/docs/prototipo/).

### Como o código está organizado

```
docs/                 site publicado no GitHub Pages (HTML, CSS e JS puros, sem build)
  index.html
  css/app.css         visual (paleta Verde Cuidado, fonte Lexend)
  js/app.js           telas e navegação (rotas com #/)
  js/dados.js         carrega os dados, busca, dosagens e preços
  js/receita.js       leitura de foto (OCR) e de códigos
  js/store.js         o que fica guardado no aparelho
  data/remedios.json  tabela CMED convertida (gerada pelo script)
  data/farmacia-popular.json
scripts/
  build_data.py       converte a planilha da CMED em docs/data/
  farmacia_popular.json  elenco gratuito e as regras para casar com a CMED
```

### Atualizar os dados

1. Baixe a planilha "PMC" mais nova no site da Anvisa (CMED, preços de medicamentos).
2. Rode `pip install openpyxl` e depois `python3 scripts/build_data.py caminho/da/planilha.xlsx`.
3. O script mostra quantas apresentações bateram com cada item gratuito. Item com 0 precisa de ajuste em `scripts/farmacia_popular.json`.

### Rodar no computador

```
cd docs && python3 -m http.server 8000
```
e abra http://localhost:8000

### Fontes dos dados

- Remédios gratuitos: Programa Farmácia Popular do Brasil (Ministério da Saúde), versão de 10/11/2026. Confira a lista com a página oficial antes de apresentar.
- Preço máximo: tabela CMED/Anvisa de 09/11/2026, PMC com ICMS de 18%.
- Endereço pelo CEP: ViaCEP.

## Integrantes

Giovanni, Italo, Guilherme, Murilo, Pierre e Vinicyus.
