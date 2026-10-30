# Rateio

Aplicativo para dividir despesas com amigos, praticamente idêntico ao Splitwise, em português.
Funciona no navegador do computador e do celular, pode ser instalado como aplicativo (PWA) e funciona sem internet.

Este repositório também traz o **Autos**, controle de processos judiciais com prazos, base de conhecimento dos autos e
jurisprudência (veja [Autos](#autos-controle-de-processos-judiciais), no fim).

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

## Autos: controle de processos judiciais

O Autos controla os processos de um escritório ou de um advogado: a situação de cada um, os expedientes dirigidos a
cada parte, os prazos e as petições que precisam ser protocoladas, com a lista de documentos para instruí-las. Guarda o
processo inteiro, os documentos e os expedientes numa base de conhecimento pesquisável e mantém a jurisprudência usada
nas petições, com as partes de cada julgado e a verificação das citações. Funciona no navegador do computador e do
celular, pode ser instalado como aplicativo e funciona sem internet.

### O que ele faz

- **Processos e situação**: número CNJ com conferência do dígito verificador e do tribunal, partes por polo (com o
  cliente marcado, o tipo de pessoa e o prazo em dobro da Fazenda Pública, do Ministério Público e da Defensoria),
  classe, órgão julgador, valor da causa, rito dos prazos (cível, juizado, trabalhista ou penal) e situação (em
  andamento, aguardando manifestação, concluso, sentenciado, em grau de recurso, transitado em julgado, cumprimento de
  sentença, suspenso, arquivado...). Cada mudança de situação fica nos andamentos, junto com as anotações, os
  documentos juntados e as petições protocoladas.
- **Expedientes de cada parte**: intimações, citações, notificações e vistas, com os destinatários, o meio (DJEN, diário
  do tribunal, sistema, Domicílio Judicial Eletrônico, correio, oficial de justiça, *e-mail*, audiência, edital), as
  datas e o prazo. A aba de prazos do processo mostra, para cada parte, os expedientes em aberto, o último e o próximo
  vencimento, e cada expediente diz se é dirigido ao cliente ou à parte contrária.
- **Prazos com memória de cálculo**: dias úteis (CPC, art. 219; CLT, art. 775; juizados) ou corridos (CPP, art. 798),
  publicação no dia útil seguinte à disponibilização no DJEN (CPC, art. 224, §§ 2º e 3º), ciência ficta em 10 dias
  corridos na intimação pelo sistema (Lei 11.419/2006, art. 5º), juntada do aviso de recebimento ou do mandado (CPC,
  art. 231), 5º dia útil depois da confirmação na citação eletrônica (art. 231, IX), prazo contado da audiência (art.
  335, I), prazo em dobro, expediente reduzido no começo ou no fim do prazo, como na Quarta-feira de Cinzas (art. 224,
  § 1º), feriados nacionais (inclusive o de 20 de novembro, desde 2024), Carnaval e Sexta-feira da Paixão, os feriados
  da Justiça Federal e Corpus Christi quando marcados, o recesso e a suspensão de 20/12 a 20/01 (CPC, art. 220; CLT,
  art. 775-A; CPP, art. 798-A) e os feriados locais e suspensões que você cadastrar para cada tribunal. Cada prazo mostra o passo a passo do cálculo, que dá para copiar.
  Há também uma calculadora avulsa.
- **Petições a protocolar e documentos para instruí-las**: ao colar a intimação (ou a decisão, o despacho, o ato
  ordinatório), o Autos lê o ato a praticar (réplica, contestação, emenda, contrarrazões, manifestação sobre laudo,
  especificação de provas, recolhimento de custas, pagamento no cumprimento de sentença, recurso cabível contra a
  sentença ou o acórdão conforme o rito...), o prazo escrito ou o legal, a quem a ordem se dirige, a audiência marcada e
  os documentos pedidos ("junte comprovante de residência e cópia do contrato"). Com isso, cria a providência com o
  prazo fatal, o prazo interno (alguns dias úteis antes, configurável) e a lista de documentos para instruir a petição;
  quando um documento da lista já está nos autos (a procuração, por exemplo), ele aparece para marcar. Ao importar o
  processo, o resumo avisa o que pede a última decisão ainda sem expediente.
- **Conferência da citação**: nos expedientes de citação, lembra as regras do meio escolhido para o tipo de réu
  (Domicílio Judicial Eletrônico para empresas e entes públicos, confirmação em 3 dias úteis, carta entregue ao próprio
  citando, edital só depois de esgotadas as tentativas, sem edital nos juizados, regras do processo penal e do
  trabalhista) e o início do prazo da contestação.
- **Base de conhecimento**: o PDF do processo inteiro baixado do PJe vira um processo cadastrado, com a capa lida
  (número, classe, órgão julgador, distribuição, valor, assuntos, justiça gratuita), as partes e os advogados, e cada
  documento separado pelo carimbo "Num. Id - Pág." com nome, tipo, data e quem assinou; no e-SAJ, os documentos são
  separados pelo código da pasta digital. Quando um processo integral mais novo é importado, os documentos já
  guardados passam para o arquivo novo, sem duplicar. Também aceita documentos avulsos (PDF, Word, ODT, HTML e texto,
  inclusive colado) e o expediente. A pesquisa ignora acentos e maiúsculas, procura as palavras pelo começo, aceita
  "frase exata" e -exclusão, ordena por relevância e abre o documento na página, com os termos destacados e o botão
  para abrir o PDF original naquela página.
- **Jurisprudência com as partes identificadas**: ao colar o cabeçalho e a ementa de um acórdão (ou o resultado da
  pesquisa do STJ, do STF ou de repositórios), o Autos lê o tribunal, a classe, o número, o relator ou a relatora, o órgão
  julgador, as datas, a ementa, o tema e as partes com os seus papéis (recorrente, agravado, impetrante, apelante...) e
  advogados. A base mostra os processos seus que têm parte em comum com cada decisão, separa os precedentes
  qualificados (CPC, art. 927) e marca as decisões já conferidas na fonte oficial. O inteiro teor pode ser guardado e
  entra na pesquisa.
- **Citação no formato adequado**: cada decisão tem a referência nos formatos forense
  ("STJ, REsp 1.234.567/SP, Rel. Min. ..., Terceira Turma, j. 12/03/2024, DJe 15/03/2024"), do STJ e da ABNT (NBR
  6023, com as partes). O botão "Copiar com a ementa" traz a referência e, na linha de baixo, a ementa como citação
  direta; colada no Word, ela vem com recuo de 4 cm e letra menor (NBR 10520).
- **Verificação das citações**: num texto colado, num arquivo ou num documento da base, encontra as citações de
  acórdãos dos tribunais superiores, de números CNJ de segundo grau, de súmulas e de temas, e aponta: classe que não é
  daquele tribunal (REsp no STF, por exemplo), turma ou seção que não existe, relator com o título errado, publicação
  anterior ao julgamento ou em fim de semana, datas no futuro, súmula do STF acima da 736, número CNJ com dígito
  verificador errado ou de outro tribunal, citação incompleta (CPC, art. 1.029, § 1º), divergência com a decisão
  cadastrada (relator, órgão, datas, entendimento superado) e diferenças entre o trecho entre aspas e a ementa, com as
  palavras acrescentadas e suprimidas destacadas (as supressões marcadas com [...] são aceitas). Para cada citação,
  mostra a referência adequada da base ou os *links* para conferir no *site* do tribunal.
- **Avisos e agenda**: o painel mostra os prazos vencidos, os de hoje e os próximos, as audiências e quantas petições
  ainda não têm todos os documentos; o navegador avisa dos prazos do dia quando o Autos é aberto; o ícone do aplicativo
  instalado mostra quantos prazos venceram ou vencem hoje; e os prazos e audiências podem ser exportados para o Google Agenda, o
  Outlook ou o calendário do celular (arquivo .ics, com lembrete).
- **Planilha e cópia de segurança**: a lista de processos sai em planilha (.csv) para o Excel, e a cópia de segurança
  é um .zip com os dados, os arquivos originais e o texto já lido, que restaura tudo em outro aparelho.

### Onde ficam os dados

Tudo fica guardado só no navegador do aparelho (IndexedDB): processos, documentos e jurisprudência não vão para a
internet, e a leitura dos PDFs e as análises são feitas no próprio navegador. Por isso:

- faça a cópia de segurança com frequência (**Configurações > Fazer cópia de segurança**) e guarde o .zip num lugar
  seguro: se os dados do navegador forem apagados, só a cópia recupera os processos e os arquivos;
- para usar em outro aparelho, restaure a cópia lá (não há sincronização automática);
- instalar o aplicativo e tocar em **Pedir ao navegador para não apagar os dados** ajuda a preservar a base.

### Como usar

- **Publicado**: o Autos vai para o GitHub Pages junto com o Rateio, em `https://<usuário>.github.io/<repositório>/autos/`
  (veja [Como publicar](#como-publicar-github-pages)).
- **No computador**: `npm run dev` e abra `http://localhost:5173/autos/`.
- **Para conhecer**: na primeira tela, **Ver um exemplo** carrega dois processos fictícios, com prazos, documentos e
  súmulas reais do STJ, que podem ser apagados depois.
- **No dia a dia**: importe o PDF de cada processo (**Processos > Importar PDF do processo**); a cada intimação, abra o
  processo, toque em **Colar intimação** e confira o que o Autos preencheu; acompanhe o painel e a agenda de prazos e
  marque cada providência como protocolada.

### Limites e cuidados

- Os cálculos e as análises são auxiliares e podem errar: confira sempre os prazos no sistema do tribunal. Na dúvida, o
  calendário fica do lado seguro (feriados forenses incertos, como Corpus Christi, vêm desmarcados e o prazo calculado
  fica mais curto, nunca mais longo); cadastre os feriados e as suspensões do seu tribunal em **Configurações**.
- A leitura de expedientes e acórdãos é feita por regras, sem inteligência artificial: o resultado é uma sugestão que
  você confirma antes de salvar.
- Páginas digitalizadas sem texto (imagem) ficam guardadas, mas não entram na pesquisa: o Autos avisa quando isso
  acontece. Prefira baixar o processo com texto (OCR) no sistema do tribunal.
- A verificação de citações não consulta os tribunais: "fora da base" quer dizer que a decisão ainda não foi
  cadastrada, não que ela não exista. Os *links* levam à pesquisa no *site* do tribunal; depois de conferir, cadastre a
  decisão e marque **Conferi os dados na fonte oficial**.
- As intimações do DJEN e as movimentações do DataJud ainda não são buscadas automaticamente: copie o teor da
  comunicação e cole no Autos. A busca automática fica para uma próxima etapa, que depende de confirmar o acesso às
  APIs públicas do CNJ a partir do navegador (ou de um pequeno servidor intermediário).

### Código do Autos

```
autos/index.html                 a página (entra no build junto com o Rateio)
src/autos/domain/cnj.ts          número único do CNJ: dígito verificador e tribunal
src/autos/domain/calendar.ts     calendário forense: feriados, Páscoa, recesso e feriados locais
src/autos/domain/deadlines.ts    cálculo dos prazos com a memória de cálculo
src/autos/domain/analysis.ts     leitura de expedientes e decisões: ato, prazo, documentos, audiência
src/autos/domain/casefile.ts     leitura do PDF do processo integral (PJe e e-SAJ)
src/autos/domain/summons.ts      conferência da citação (o ato)
src/autos/domain/precedents.ts   leitura de acórdãos e das partes, formatos de citação
src/autos/domain/refs.ts         citações de jurisprudência encontradas num texto
src/autos/domain/citations.ts    verificação das citações e do trecho citado
src/autos/domain/search.ts       pesquisa sem acentos, com pontuação e destaques
src/autos/store/                 ações, IndexedDB, leitura de arquivos (pdf.js, Word), cópia de segurança, exemplo
src/autos/ui/                    telas (React)
tests/autos/                     testes da lógica (Vitest, rodam com npm test)
scripts/e2e-autos.mjs            teste de ponta a ponta no navegador, com um PDF no formato do PJe
```

```bash
npm run test:e2e-autos   # teste completo no navegador (capturas em screenshots/autos/)
```

Para usar um Chromium já instalado nos testes de ponta a ponta e na geração dos ícones
(`node scripts/make-icons.mjs public/autos "#24406b"`), informe o caminho em `CHROMIUM_PATH`.
