# Controle de Voos — o app

Página única, sem dependência externa: abre com dois cliques, funciona offline
e guarda tudo no `localStorage` do navegador. Nada sai da sua máquina.

Substitui o *bundle* React da versão 3.x, que não tinha fonte legível.

## Construir

O molde `voos.html` traz o marcador `__DADOS__` no lugar da base. Assim o
código fica versionado **sem nenhum localizador dentro** — a base é um arquivo
à parte, que não entra no repositório.

```bash
python3 construir.py voos.html dados.json controle-de-voos.html
```

Para experimentar sem dados reais, use a base de exemplo:

```bash
python3 construir.py voos.html dados-exemplo.json exemplo.html
```

## Testar

```bash
node teste.mjs      # 28 testes, Playwright + Chromium, sobre exemplo.html
```

Cobre a máquina de estados, o casamento de trechos, a leitura de CSV e JSON, a
exportação, a persistência e o painel.

## A coluna `Alterado`

```
Não ──alteração──▶ Alterado ──remarcação──▶ Remarcado ──alteração──▶ Alterado
```

- **`Alterado`** — a companhia mexeu no voo e ele ainda não foi remarcado.
- **`Remarcado`** — já refeito depois da alteração. Continua assim até sofrer
  alteração nova, que o devolve para `Alterado`.
- **`Não`** — nada aconteceu. Remarcação voluntária, sem alteração antes,
  continua `Não`: a coluna registra o que a companhia fez, não o que você fez.

Os códigos antigos com asterisco (`Sim*`, `Não***`) continuam valendo e
aparecem na legenda. `Sim...` conta como pendência; `Não...` não.

## Importar

Aceita JSON ou o CSV com o cabeçalho da planilha. Nada é aplicado antes da
prévia, que mostra o que entra como novo e o que diverge, campo a campo.

A **procedência** muda a leitura de uma divergência de horário:

| Procedência | Divergência quer dizer |
| --- | --- |
| Consulta ao site ou app da companhia | alteração silenciosa, daquelas que a Azul não manda por e-mail → `Alterado` |
| E-mail de confirmação, sobre voo já `Alterado` | a reserva foi refeita → `Remarcado` |
| E-mail de confirmação, sobre voo limpo | a companhia mexeu → `Alterado` |

Um trecho é casado por **localizador + destino, nunca por data**: quando a
companhia muda a data ou o aeroporto de origem, continua sendo o mesmo trecho.
Só reservas ativas entram no casamento — importação nunca reescreve voo
arquivado, que é o que guarda a prova do que aconteceu.

## Conferência

A Azul remarca voo sem mandar e-mail. O painel cobra a conferência manual por
localizador: 14 dias para a Azul, 30 para as demais. O botão *Conferi agora*
carimba a data e registra na linha do tempo.

## Linha do tempo

Cada voo guarda o que mudou, quando e de onde veio a informação. É o que
sustenta a aba Sub Judice: o registro de que a companhia alterou, com data.

## Migração

A chave é `voos_app_data_v5`. Na primeira abertura, o app absorve o que houver
em `voos_app_data_v4` ou `v3` e completa com a semente, **sem apagar as chaves
antigas** — dá para voltar atrás.

## O que ele não faz

- **Não lê o seu Gmail** nem consulta o site da companhia: é página estática,
  sem credencial e barrada por CORS. A busca é feita fora e entra por *Importar*.
- **Não roda sozinho de madrugada.** O painel mostra o que está vencido quando
  você abre.
