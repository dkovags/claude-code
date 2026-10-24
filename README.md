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

- **Stories** (o padrão): uma tela 9:16 para cada foto, até 10 em sequência. O Claude sugere três versões da
  sequência, com um texto curto para escrever em cada foto (a primeira tela prende a atenção, a última chama para a
  ação) e a figurinha interativa que combina com cada tela: enquete, caixa de perguntas, *quiz*, *slider* de emoji,
  contagem regressiva, *link* ou "Adicione o seu". Dá para editar o texto e a figurinha de cada tela à mão ou pedir
  ajustes ao Claude (mais curtos, mais divertidos, mais figurinhas...). Em **Tamanho do texto nas fotos**, o texto de
  cada tela pode ser curto (até 12 palavras, para ler num relance) ou mais longo (até 30, para contar mais). A foto sai
  em 1080 × 1920 com o texto escrito nela, longe das áreas cobertas pelos botões do *story*. As figurinhas, a música e a localização só funcionam
  adicionadas no próprio Instagram: a prévia mostra onde entram (tracejadas) e a etapa final lista o que adicionar em
  cada tela, com botões para copiar as perguntas e as opções.
- **Na tela de escolha**: **Usar e editar** abre o editor dentro da opção escolhida, para mudar o texto à mão.
  **Gerar de novo** refaz todas as opções: se faltou alguma informação (ou alguma estava errada), escreva antes no
  campo opcional **Acrescente ou corrija uma informação**, ou edite o contexto inteiro, e o Claude leva isso em conta;
  com o campo em branco, ele traz opções diferentes com o mesmo contexto.
- **Feed**: três legendas com gancho na primeira linha (o que aparece antes do "mais"), chamada para ação e até 5
  *hashtags*, o limite atual do Instagram; a foto em 4:5, 3:4, 1:1, 9:16 ou 1,91:1, com texto opcional na capa; botão
  para copiar a legenda e texto alternativo para acessibilidade.
- **Nos dois modos**: objetivo (mais interação, mais alcance, divulgar ou vender, registrar um momento), tom, idioma e
  quantidade de emojis; perguntas com respostas prontas para tocar, que dá para pular; cinco músicas com o trecho a usar,
  um botão para ouvir 30 segundos de cada uma (a prévia da Apple Music, que toca na própria página) e *links* para o
  Spotify e o YouTube; três opções de localização, do lugar exato à cidade, usando também a
  data e o GPS gravados na foto quando existem (dá para desligar); enquadramento arrastando a foto e *zoom*, ou a foto
  inteira com fundo desfocado; *download* da foto (ou de um .zip com todas), dos textos em .txt ou de tudo junto;
  dicas e o passo a passo para publicar. O perfil, o @ e as preferências ficam guardados no aparelho.
- **Imagem da tela**: o botão no alto salva uma imagem da página inteira, em qualquer etapa (também quando o celular
  não deixa fazer captura de tela, como na aba anônima do Chrome no Android).
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
