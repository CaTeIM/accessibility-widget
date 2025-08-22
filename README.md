# Documentação Técnica: Widget de Acessibilidade

## 1. Visão Geral

O Widget de Acessibilidade é um script JavaScript **autocontido e sem dependências externas** (`vanilla JS`), projetado para ser injetado em qualquer página do site. Seu objetivo é adicionar uma camada de acessibilidade com funcionalidades de Leitura de Voz (TTS), ajuste de fonte e modo de alto contraste.

## 2. Instalação

A instalação do widget requer apenas a inclusão do arquivo JavaScript no HTML da página.

#### Passo 1: Estrutura de Arquivos

O widget espera a seguinte estrutura de pastas, baseada na organização do repositório:

```
/ (Raiz do projeto)
|-- assets/
|   |-- js/
|   |   |-- accessibility-widget.js  (O script principal)
|   |-- accessibility.svg            (O ícone do botão flutuante)
|
|-- profile.html (ou qualquer outra página do seu site)
```

**Importante:** O caminho para o ícone (`assets/accessibility.svg`) é definido dentro do `accessibility-widget.js` e é relativo à página HTML que o carrega. Mantenha essa estrutura para que o ícone seja encontrado corretamente.

#### Passo 2: Inclusão no HTML

Adicione a seguinte tag `<script>` em suas páginas HTML, preferencialmente logo antes do fechamento da tag `</body>`.

```html
    ...
    <script src="./assets/js/accessibility-widget.js" defer></script>
  </body>
</html>
```

- **`src="./assets/js/accessibility-widget.js"`**: Este é o caminho correto baseado na estrutura do seu repositório.
- **`defer`**: O atributo `defer` é **altamente recomendado**. Ele garante que o script do widget seja carregado sem bloquear a renderização do restante da página, melhorando a performance.

Uma vez que o script é adicionado, o widget irá se inicializar automaticamente, sem a necessidade de chamar qualquer função.

## 3. Como Funciona

#### Injeção e Instância Única

- O script `accessibility-widget.js` é carregado na página.
- Ao ser executado, ele primeiro verifica a existência de `window.__ACCESSIBILITY_WIDGET_LOADED__`. Se `true`, ele aborta a execução para garantir que **apenas uma instância** do widget exista na página, evitando conflitos.
- Se for a primeira execução, ele cria dinamicamente toda a sua interface (botão flutuante e painel) e injeta seu próprio CSS no `<head>` da página, garantindo que funcione de forma isolada.

#### Gerenciamento de Estado

- As preferências do usuário são salvas no **`localStorage`**, sob a chave `'aw_settings_v1'`.
- Um objeto `state` centraliza todas as configurações: `fontSize`, `highContrast`, `rate`, `pitch`, `minimized`, etc.
- As funções `safeLoad()` e `safeSave()` garantem que os dados sejam lidos e gravados de forma segura, tratando possíveis erros de JSON.
- O widget sempre inicia no estado salvo pelo usuário, proporcionando uma experiência consistente entre as sessões.

#### O "Cérebro": Extração e Preparação de Texto

Esta é a parte mais complexa e crucial. O processo para transformar o conteúdo visual em texto falado segue os seguintes passos:

1.  **Identificação do Conteúdo Principal:** A função `getReadableText()` tenta encontrar o conteúdo principal da página, procurando por tags semânticas como `<main>` e `<article>`. Se não as encontra, usa o `<body>` como fallback.
2.  **Conversão de DOM para Texto (`nodeToText`):**
    * Clona o nó do conteúdo para não alterar a página original.
    * **Anuncia Elementos Interativos:** Identifica botões, links, inputs, etc., e substitui esses elementos por uma descrição textual (ex: "Botão Salvar").
    * **Adiciona Pausas Semânticas:** Percorre elementos de bloco (`div`, `p`, `li`, `h1`, etc.) e garante que o texto extraído de cada um termine com um ponto final. Isso força o leitor de voz a fazer pausas naturais entre diferentes linhas e seções, evitando que o texto fique "embolado".
3.  **Normalização Final (`normalizeTextForReading`):**
    * **Tratamento de E-mails e Domínios:** Usa expressões regulares para encontrar e-mails (ex: `teste@pixgo.org`) e domínios (ex: `PixGO.org`) e os converte para uma forma falada (ex: "teste arroba pixgo ponto org"), evitando que o leitor se confunda com os pontos.
    * **Limpeza:** Remove espaços excessivos e normaliza quebras de linha.
4.  **Divisão em Pedaços (`splitToChunks`):** O texto limpo é quebrado em pequenos trechos de no máximo 220 caracteres para garantir que a API de TTS do navegador não falhe com textos muito longos.

#### Leitor de Voz (TTS)

- Utiliza a API nativa do navegador, `window.speechSynthesis`.
- A função `populateVoices()` detecta as vozes disponíveis no sistema do usuário e as lista no menu de seleção.
- `speakChunksSequentially()` cria uma fila com os "pedaços" de texto e os executa em sequência, usando os eventos `onstart` e `onend` para controlar o avanço e a interface do player.
- A função `pauseResume()` controla o pause e o play, garantindo uma resposta imediata ao usuário.
