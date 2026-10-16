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
- **Backup e restauração** em arquivo, tema claro e escuro e lembrete de cobrança pelo WhatsApp.

## Onde ficam os dados

Os dados ficam no próprio aparelho (no armazenamento do navegador). Use **Conta > Fazer backup** de vez em quando: o
arquivo gerado serve para restaurar tudo ou passar os dados para outro aparelho.

## Como publicar (GitHub Pages)

1. No GitHub, abra **Settings > Pages** e, em **Source**, escolha **GitHub Actions**.
2. Rode de novo o workflow **Testes e publicação** (aba **Actions**) ou faça um novo push na branch padrão.
3. O endereço do app aparece no resultado do passo **Publicar** (algo como `https://<usuário>.github.io/<repositório>/`).

Enquanto o Pages não estiver ativado, o workflow só roda os testes e o build, sem marcar erro.

## Como rodar no computador

Requer Node.js 22.

```bash
npm install
npm run dev        # abre em http://localhost:5173
npm test           # testes da lógica de divisão e saldos
npm run build      # gera a versão publicada em dist/
node scripts/e2e.mjs   # teste completo no navegador (gera capturas em screenshots/)
```

## Organização do código

```
src/domain/     regras de negócio sem interface: dinheiro em centavos, divisões, saldos,
                simplificação de dívidas, recorrência, categorias, atividade e CSV
src/store/      ações (criar grupo, salvar despesa, acertar contas...) e armazenamento
src/ui/         telas, componentes e diálogos (React)
tests/          testes automatizados (Vitest)
scripts/        geração de ícones e teste de ponta a ponta (Playwright)
```

Os valores são guardados em centavos (números inteiros), então não há erro de arredondamento: na divisão igual, os
centavos que sobram vão para as primeiras pessoas da lista, e a soma das partes sempre fecha com o total.

Para trocar o nome do aplicativo, edite `src/config.ts`, `index.html` e `public/manifest.webmanifest`.
