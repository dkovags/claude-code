# Rateio

Aplicativo para dividir despesas com amigos, praticamente idêntico ao Splitwise, em português.
Funciona no navegador do computador e do celular, pode ser instalado como aplicativo (PWA) e funciona sem internet.

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
