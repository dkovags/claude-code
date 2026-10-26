# Rateio

Aplicativo para dividir despesas com amigos, praticamente idêntico ao Splitwise, em português.
Funciona no navegador do computador e do celular, pode ser instalado como aplicativo (PWA) e funciona sem internet.

Este repositório também traz o **Post Pronto**, que transforma fotos em *stories* e publicações para o Instagram, com
texto, figurinhas, música e localização (veja [Post Pronto](#post-pronto-stories-e-publicações-para-o-instagram), no fim).

## O que ele faz

- **Grupos** (casa, viagem, casal, outro) com membros, moeda padrão e **simplificação de dívidas**.
- **Amigos**, com despesas dentro ou fora de grupos e saldo separado por grupo.
- **Despesas** com descrição, valor (aceita contas, como `10+5,5`), moeda, data, categoria (as mesmas do Splitwise,
  sugeridas pela descrição), observações e **repetição** (semanal, quinzenal, mensal, anual).
- **Quem pagou**: uma pessoa ou várias, cada uma com o seu valor.
- **Divisão** igual, por valores exatos, por porcentagens, por partes ou com ajustes.
- **Acertar contas**: sugere os pagamentos a partir dos saldos e, quando há saldo em vários grupos, quita todos de uma vez.
- **Painel** com saldo total, quanto você deve e quanto devem a você; listas por amigo e por grupo.
- **Atividade recente** com tudo o que aconteceu, incluindo exclusões que podem ser desfeitas.
- **Comentários** e **histórico de alterações** em cada despesa.
- **Totais** e **gráficos** (gastos por categoria e por mês), **busca** e **exportação para planilha** (CSV que o Excel abre direto).
- **Várias moedas**, com saldos separados por moeda, como no Splitwise.
- **Chave Pix** de cada pessoa, que aparece na hora de acertar as contas (com botão de copiar) e vai junto no lembrete
  de cobrança pelo WhatsApp.
- **_Backup_ e restauração** em arquivo, tema claro e escuro e botão para instalar o app no celular.
- **Sincronização na nuvem** opcional, para cada amigo usar no próprio celular (veja abaixo).

## Onde ficam os dados

O app tem dois modos:

- **Só neste aparelho** (padrão): os dados ficam no armazenamento do navegador. Use **Conta > Fazer backup** de vez em
  quando; o arquivo de *backup* serve para restaurar tudo ou passar os dados para outro aparelho.
- **Sincronizado na nuvem** (opcional, como no Splitwise): cada pessoa entra com a conta Google e vê, no próprio
  celular, os grupos e despesas de que participa. Quem você cadastrar com e-mail passa a ver o que vocês dividem assim
  que entrar com a conta Google desse e-mail. Funciona sem internet e envia as alterações quando a conexão volta.
  Para ativar, siga o passo a passo abaixo.

## Como ativar a sincronização na nuvem (Firebase)

O Firebase tem um plano gratuito (Spark) que sobra para uso pessoal.

1. Em [console.firebase.google.com](https://console.firebase.google.com), crie um projeto (o Google Analytics pode
   ficar desligado). Use um projeto novo: as regras de segurança do Rateio substituem as do projeto inteiro.
2. Em **Authentication > Método de login**, ative **Google**. Em **Authentication > Configurações > Domínios
   autorizados**, adicione o domínio onde o app fica publicado (por exemplo, `dkovags.github.io`).
3. Em **Firestore Database**, crie o banco (modo de produção, região `southamerica-east1` para ficar no Brasil). Na aba
   **Regras**, cole o conteúdo do arquivo [`firestore.rules`](firestore.rules) e publique.
4. Em **Configurações do projeto > Seus apps**, adicione um app da Web e copie o objeto `firebaseConfig`.
5. Informe essa configuração ao app, de um destes jeitos:
   - no GitHub, em **Settings > Secrets and variables > Actions > Variables**, crie a variável `FIREBASE_CONFIG` com o
     objeto em JSON (por exemplo `{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}`) e rode o
     *workflow* de novo; ou
   - cole o objeto em `FIREBASE_CONFIG`, no arquivo `src/config.ts`.

Esses dados de configuração não são secretos: quem protege os dados são as regras do passo 3. Com elas, cada pessoa só
lê e altera os grupos e despesas de que participa, e só o próprio usuário acessa a sua lista de amigos e preferências.

Depois de ativar, a tela inicial passa a oferecer **Entrar com Google**. Quem já usava o app só no aparelho pode entrar
e tocar em **Conta > Enviar dados deste aparelho** para levar tudo para a nuvem.

## Como publicar (GitHub Pages)

1. No GitHub, abra **Settings > Pages** e, em **Source**, escolha **GitHub Actions**.
2. Rode de novo o *workflow* **Testes e publicação** (aba **Actions**) ou faça um novo *push* na *branch* padrão.
3. O endereço do app aparece no resultado do passo **Publicar** (algo como `https://<usuário>.github.io/<repositório>/`).

Enquanto o Pages não estiver ativado, o *workflow* só roda os testes e o *build*, sem marcar erro.

Outra opção é publicar no próprio Firebase Hosting: `npm run build` e depois
`npx firebase-tools deploy --only hosting,firestore:rules --project <id-do-projeto>`.

## Como rodar no computador

Requer Node.js 22.

```bash
npm install
npm run dev              # abre em http://localhost:5173
npm test                 # testes da lógica de divisão e saldos
npm run build            # gera a versão publicada em dist/
npm run test:e2e         # teste completo no navegador (gera capturas em screenshots/)
npm run test:cloud       # testes da sincronização com os emuladores do Firebase (requer Java 21)
npm run test:e2e-cloud   # dois usuários sincronizando no navegador, com os emuladores
```

## Organização do código

```
src/domain/     regras de negócio sem interface: dinheiro em centavos, divisões, saldos,
                simplificação de dívidas, recorrência, categorias, atividade e CSV
src/store/      ações (criar grupo, salvar despesa, acertar contas...) e armazenamento
                (store.ts no aparelho, cloud.ts no Firestore)
src/ui/         telas, componentes e diálogos (React)
tests/          testes automatizados (Vitest)
scripts/        geração de ícones e teste de ponta a ponta (Playwright)
```

Os valores são guardados em centavos (números inteiros), então não há erro de arredondamento: na divisão igual, os
centavos que sobram vão para as primeiras pessoas da lista, e a soma das partes sempre fecha com o total.

Para trocar o nome do aplicativo, edite `src/config.ts`, `index.html` e `public/manifest.webmanifest`.

## Post Pronto: stories e publicações para o Instagram

Você envia as fotos e, se quiser, conta o contexto (só as fotos são obrigatórias); o Claude olha as imagens, pergunta
o que faltar (só quando falta algo essencial, e dá para pular) e sugere os textos. Depois que você escolhe e confirma,
o Post Pronto entrega as fotos prontas para baixar, com as sugestões de música e de localização. O modo principal é o
de *stories*; o de *feed* continua disponível.

- **Stories** (o padrão): uma tela 9:16 para cada foto, até 10 em sequência. O Claude sugere cinco versões da
  sequência, com um texto curto para escrever em cada foto (a primeira tela prende a atenção, a última chama para a
  ação) e a figurinha interativa que combina com cada tela: contagem regressiva, *link* ou "Adicione o seu"; as que
  são perguntas (enquete, caixa de perguntas, *quiz* e *slider* de emoji) só entram quando você pede, no contexto ou num
  ajuste (há o atalho **Com quiz**). Dá para editar o texto e a figurinha de cada tela à mão ou pedir ajustes ao Claude
  (mais curtos, mais divertidos, mais figurinhas...). Em **Tamanho do texto nas fotos**, o texto de
  cada tela pode ser curto (até 12 palavras, para ler num relance) ou mais longo (até 30, para contar mais). A foto sai
  em 1080 × 1920 com o texto escrito nela, longe das áreas cobertas pelos botões do *story*. As figurinhas, a música e a localização só funcionam
  adicionadas no próprio Instagram: a prévia mostra onde entram (tracejadas) e a etapa final lista o que adicionar em
  cada tela, com botões para copiar as perguntas e as opções.
- **Hashtags ocultas**: as *hashtags* sugeridas nunca aparecem para quem vê o post. Nos *stories*, escrita na foto a
  *hashtag* não vira *link* nem entra na busca; por isso a etapa final tem um botão para copiá-las e o passo a passo
  para colá-las no editor do Instagram e escondê-las (letra mínima, na cor do fundo ou embaixo de uma figurinha). No
  *feed*, elas ficam fora da legenda copiada, prontas para colar no primeiro comentário logo depois de publicar.
- **Texto com cara de gente, com fatos no lugar de adjetivos**: os pedidos ao Claude trazem regras contra os vícios
  de texto de IA. Nada de primeira pessoa ("eu", "nós", "a gente"): os textos falam do que aparece na foto e de quem
  está nela, em frases impessoais ou em terceira pessoa, ou falam com quem assiste. Nada de qualificar (lindo,
  incrível, especial, emocionante, muito, super): em vez de dizer como algo é, o texto diz o que é, o que aconteceu e o
  que significa. Quando a foto mostra um lugar, monumento, símbolo, bandeira, obra, inscrição ou data comemorativa, o
  Claude traz um fato histórico ou o significado, só quando tem certeza; sobre as pessoas e o momento, usa só o que
  está no contexto ou nas fotos. Uma das cinco opções é dedicada a um fato ou significado. Também: palavras do dia a
  dia e frases de tamanhos diferentes; nada de expressões como "momentos inesquecíveis", "a magia de" e "jornada",
  estruturas como "não é só X, é Y" e frase de efeito no fim; sem perguntas (pergunta só num *quiz* pedido); no máximo
  uma exclamação e nada de emojis de enfeite. Nos ajustes, **Mais fatos** troca adjetivos e opiniões por fatos, **Mais
  natural** (legenda) e **Mais naturais** (stories) pedem uma reescrita nesse sentido, e **Terminar com convite** fecha
  a legenda sem pergunta.
- **Na tela de escolha**: **Usar e editar** abre o editor dentro da opção escolhida, para mudar o texto à mão.
  **Gerar de novo** refaz todas as opções: se faltou alguma informação (ou alguma estava errada), escreva antes no
  campo opcional **Acrescente ou corrija uma informação**, ou edite o contexto inteiro, e o Claude leva isso em conta;
  com o campo em branco, ele traz opções diferentes com o mesmo contexto.
- **Feed**: cinco legendas com gancho na primeira linha (o que aparece antes do "mais"), chamada para ação e até 5
  *hashtags* ocultas (o limite atual do Instagram), fora da legenda; a foto em 4:5, 3:4, 1:1, 9:16 ou 1,91:1, com texto
  opcional na capa; botões para copiar a legenda e as *hashtags* e texto alternativo para acessibilidade.
- **Nos dois modos**: objetivo (mais interação, mais alcance, divulgar ou vender, registrar um momento), tom, idioma e
  quantidade de emojis; perguntas com respostas prontas para tocar, que dá para pular; cinco músicas com o trecho a usar,
  um botão para ouvir 30 segundos de cada uma (a prévia da Apple Music, que toca na própria página) e *links* para o
  Spotify e o YouTube; três opções de localização, do lugar exato à cidade, usando também a
  data e o GPS gravados na foto quando existem (dá para desligar); enquadramento livre (veja abaixo); *download* da
  foto (ou de um .zip com todas), dos textos em .txt ou de tudo junto;
  dicas e o passo a passo para publicar. O perfil, o @ e as preferências ficam guardados no aparelho.
- **Enquadramento livre**: o *zoom* vai da foto um pouco menor que inteira até 3 vezes mais perto, e dá para
  enquadrar direto na prévia, desde a escolha dos textos (ou da legenda): arrastar a foto com um dedo (ou as setas do
  teclado) e fazer pinça com dois dedos para o *zoom*, que acompanha o meio dos dedos; no computador, a pinça do
  *trackpad* ou Ctrl + roda do mouse. A pinça funciona também em cima da figurinha e da localização; começando em cima
  de um texto, ela muda o tamanho dele (veja abaixo). Quando a foto sobra, arrastar escolhe a parte que aparece; quando ela não ocupa a
  tela toda, escolhe onde ela fica, e o espaço que sobra é preenchido com a própria foto, desfocada. Na etapa final, **Preencher a tela** e **Foto inteira** são atalhos para
  esses dois pontos, e o *zoom* encaixa neles quando chega perto.
- **Título e explicação**: na tela de escolha ou na etapa final, o texto escrito na foto pode ser dividido em título
  e explicação, um embaixo do outro, cada um com a sua fonte, o seu tamanho e a sua caixa. Ao ligar, a página separa o
  título: a primeira linha, a primeira frase (se for curta) ou o começo até dois-pontos ou um travessão; sem nada
  disso, divide num ponto natural perto do meio. Dá para editar os dois; ao desligar, junta de novo. A explicação começa
  na fonte Editorial, um pouco menor que o título. No texto mais longo, o Claude já escreve o título na primeira linha,
  e nos ajustes ele mantém essa divisão. As fontes ficam em **Texto nas fotos**, logo abaixo dos botões de baixar; no
  celular, uma prévia pequena no canto acompanha os ajustes.
- **Fundo e cor do título e da explicação**: cada um (ou o texto todo, sem explicação) tem a sua caixa, do tamanho do
  próprio texto (sem fundo, com sombra, semitransparente, branca ou preta), e a sua cor de texto: branco, preto,
  amarelo, vermelho, verde ou azul, em bolinhas para tocar. Por padrão, as cores se alternam: o título branco numa
  caixa escura e a explicação preta numa caixa clara. A caixa semitransparente é clara atrás do texto preto e escura
  atrás das outras cores; texto da mesma cor da caixa branca ou preta fica na cor oposta, para não sumir.
- **Arrastar e redimensionar o texto na prévia**: o título e a explicação podem ser arrastados (ou movidos com as
  setas) para qualquer lugar da foto, e a foto baixada sai igual. A explicação acompanha o título até ser arrastada
  também; as caixas não saem da foto. Nos *stories*, o lugar vale para cada tela; no *feed*, para o texto da capa. Tocar
  numa opção de **Posição** traz o texto de volta ao lugar padrão. O tamanho também muda na prévia: pinça com dois dedos
  em cima do texto ou em volta dele (basta um dedo no texto, ou o meio dos dedos nele ou bem perto, como no Instagram;
  longe dos textos, a pinça é o *zoom* da foto), as setas no canto da caixa (sempre à vista no celular, com área de
  toque maior; no computador, ao passar o mouse), Ctrl + roda do mouse ou a pinça do *trackpad* em cima do texto, ou as
  teclas + e - com a caixa selecionada. O tamanho vale para todas as telas e fica nos mesmos limites do controle
  **Tamanho**, que acompanha a mudança.
- **Figurinha e localização tracejadas**: na prévia, dá para arrastar a figurinha e a localização (ou movê-las com as
  setas) para ver onde elas ficam melhor em cada tela; arrastar em cima delas não mexe na foto. A figurinha sai pelo ×
  no canto, pelo botão **Remover** na lista de figurinhas da etapa final ou pelo editor dos textos; a localização, por
  **Sem localização**. Elas não vão na foto baixada: no Instagram, as figurinhas se posicionam arrastando com o dedo.
- **Nitidez da foto baixada**: a foto sai em 1080 px de largura, a partir da original, em PNG, sem compressão: assim o
  Instagram comprime uma vez só, ao receber, em vez de comprimir de novo um JPEG (cada tela fica com uns 3 MB). Quando
  o pedaço usado tem menos pixels que isso (foto recebida por mensagem, tirada com zoom do celular, zoom alto no
  enquadramento ou foto deitada recortada em pé), ela precisa ser ampliada e fica borrada: a página avisa ao escolher
  as fotos e na etapa final, com o que fazer (diminuir o zoom, usar Foto inteira ou a foto original), e marca a foto
  na tira. A prévia é desenhada com os pixels de verdade da tela, para não parecer borrada no celular, e o passo a
  passo lembra de ativar **Carregar em alta qualidade** no Instagram, que no Android vem desligada.
- **Direto para o Instagram**: no celular, **Mandar para o Instagram** manda as fotos prontas pelo menu de compartilhar
  do sistema; aí é escolher Instagram (Stories ou Feed) e adicionar as figurinhas, a música e a localização lá. Dentro
  do Claude, o botão aparece quando o claude.ai deixa a página usar esse menu (no app do Claude para iPhone, o próprio
  download abre esse menu). Sem ele, no celular as fotos são baixadas uma a uma, não num .zip, porque o Instagram não
  abre .zip, e um aviso logo abaixo leva ao Instagram, com o botão **Abrir o Instagram**, para escolher as fotos em
  Recentes (ou compartilhar pela Galeria). No navegador do celular sem esse menu (como o Chrome dentro do claude.ai), o
  mesmo **Mandar para o Instagram** mostra as fotos prontas: tocando e segurando uma delas, o navegador oferece
  **Compartilhar imagem**, que leva direto ao Instagram (Stories ou Feed). No app do Claude
  para Android, nem isso funciona (o app não deixa a página abrir o menu de compartilhar), e a página explica o caminho
  pela Galeria. Publicar
  sem abrir o Instagram exigiria a API da Meta, só para contas profissionais e com um servidor, e ela não põe
  figurinhas (enquete, perguntas, localização) nem música nos stories.
- **Celular e computador**: no computador, a prévia fica ao lado dos controles; no celular, tudo vem numa coluna, com
  controles do tamanho do dedo (pelo menos 40 px), opções em grade e o editor dos textos na largura toda. O teste de
  ponta a ponta confere as etapas em 360, 412, 1024 e 1440 px de largura.
- **Imagem da tela**: o botão no alto cria uma imagem da página inteira, em qualquer etapa, e mostra antes de baixar;
  se o download não funcionar, dá para tocar e segurar a imagem para salvar. Serve também quando o celular não deixa
  fazer captura de tela, como na aba anônima do Chrome no Android.
- Os textos nunca usam travessão: se o Claude escrever um, ele vira meia-risca.

### Como usar

- **Dentro do Claude** (o jeito mais simples): abra o artefato
  [Post Pronto](https://claude.ai/artifact/QgwA6tj19x3bCCBwy4Cywv). Ele usa a sua própria conta do Claude, sem chave
  nem configuração; na primeira vez, o Claude pede permissão para a página usar o Claude e enviar as fotos. O link é
  privado: outras pessoas só conseguem abrir depois que você compartilhar o artefato pelo menu dele. Dentro do Claude
  a página não pode buscar nem tocar áudio de outros sites, então lá o botão de ouvir abre a música no YouTube. Para
  gerar de novo o arquivo do artefato a partir do código, rode `npm run build:artifact` (cria
  `dist-artifact/post-pronto.html`).
- **Fora do Claude**: o Post Pronto é publicado junto com o Rateio no GitHub Pages, em
  `https://<usuário>.github.io/<repositório>/post-pronto/`, e roda no computador com `npm run dev`, em
  `http://localhost:5173/post-pronto/`. Nesse modo ele usa a API da Anthropic: toque em **Configurar** e informe uma
  chave criada no [Claude Console](https://platform.claude.com/settings/keys). O uso é cobrado na conta da API; a chave
  fica guardada só no navegador e vai direto para a Anthropic. O modelo pode ser trocado na mesma tela.

As fotos vão para o Claude (ou para a API da Anthropic) só para gerar as sugestões, em versão reduzida e sem os dados
gravados no arquivo; a data e o GPS, quando a opção está ligada, vão como texto no pedido.

### Código do Post Pronto

```
post-pronto/index.html                  a página (entra no build junto com o Rateio)
src/post-pronto/prompts.ts              instruções para o Claude e leitura das respostas
src/post-pronto/ai.ts                   conexão: conta do Claude (artefato) ou API com chave própria
src/post-pronto/render.ts               formatos do Instagram, enquadramento e texto na foto
src/post-pronto/finish.ts               texto de cada foto e nomes dos arquivos na etapa final
src/post-pronto/caption.ts              regras da legenda, figurinhas e arquivos de texto
src/post-pronto/exif.ts                 data e GPS gravados nas fotos
src/post-pronto/zip.ts                  .zip para baixar todas as fotos
src/post-pronto/preview.ts              trecho de 30 segundos das músicas (busca do iTunes, sem chave)
src/post-pronto/capture.ts              imagem da página inteira (botão Salvar imagem da tela)
src/post-pronto/ui/                     telas (React): StoriesPanel e StoryPreview para os stories
tests/post-pronto/                      testes da lógica (Vitest, rodam com npm test)
scripts/build-post-pronto-artifact.mjs  versão em arquivo único, para publicar como artefato
scripts/e2e-post-pronto.mjs             teste de ponta a ponta com as respostas do Claude simuladas
```

```bash
npm run build:artifact   # gera dist-artifact/post-pronto.html
npm run test:e2e-post    # teste completo no navegador (capturas em screenshots/post-pronto/)
```

Para usar um Chromium já instalado no teste de ponta a ponta, informe o caminho em `CHROMIUM_PATH`.
