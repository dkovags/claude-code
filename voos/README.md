# Voos — extrator de e-mails para a planilha de controle

Lê os e-mails de confirmação e de alteração das companhias aéreas e das
agências e devolve as linhas já no formato da aba **Voos** da planilha de
controle de voos.

A planilha continua sendo a fonte de verdade. O extrator só evita a digitação
manual e, principalmente, **não deixa passar alteração de voo** — que é o que
alimenta a coluna `Alterado`.

## Por que

Preencher à mão dá trabalho e erra: horário copiado do e-mail errado, voo que a
companhia remarcou e ninguém anotou, trecho que simplesmente não foi lançado.
O extrator resolve os três.

## Como usar

```bash
# mensagens.json é uma lista de mensagens do Gmail
python3 voos/extrair.py mensagens.json --csv voos.csv --relatorio relatorio.md
```

Sem `--csv`/`--relatorio`, o CSV sai na saída padrão. É só colar na planilha.

### De onde vem o `mensagens.json`

Uma lista de objetos com `id`, `date`, `sender`, `subject` e `plaintextBody` —
o formato que a API do Gmail (`users.messages.get`) e o conector de Gmail do
Claude devolvem. Uma busca que pega quase tudo:

```
category:reservations newer_than:90d
```

## O que ele entende

| Remetente | O que lê |
| --- | --- |
| Booking.com Flights | ida e volta, companhia, voo, localizador |
| Ryanair | itinerário **e** aviso de atraso com o novo horário |
| Kiwi.com | perna da viagem (inclusive virando a data) e aviso de atraso |
| Wizz Air | voo, terminais, assento, localizador |
| eDreams | trecho e localizador da companhia |
| SKY express | voo, horários e localizador |
| Azerbaijan Airlines | voo, horários, localizador e nº do bilhete |

Remetente desconhecido é ignorado sem erro; e-mail malformado não derruba o
lote (sai um aviso em `stderr`).

## Regras que ele aplica

- **Uma linha por trecho.** O mesmo voo costuma chegar pela companhia *e* pela
  agência. Vale a versão da companhia: a agência arredonda horário (a eDreams,
  por exemplo, manda o horário de retirada de carro, uns 30–40 min depois do
  pouso) e não traz assento.
- **`Alterado` sai de aviso de verdade.** Atraso ou remarcação marca `Sim` e
  escreve o novo horário e a data do aviso em `Observações`.
- **Chegada no dia seguinte vira `(+1)`**, como na planilha.
- **Toda linha guarda a procedência** (`fonte_id`, `fonte_assunto`,
  `fonte_data`), para conferir depois de onde veio cada dado. Esses campos não
  vão para o CSV — use `--json` para vê-los.

## Limites conhecidos

- **Não lê anexo.** Cartão de embarque em PDF (assento, portão, terminal) fica
  de fora.
- **Nem toda alteração chega por e-mail.** Já houve remarcação que só apareceu
  no aplicativo da companhia. O extrator não substitui conferir o app antes da
  viagem.
- **Só lê as suas reservas.** Localizador de acompanhante que veio por outro
  canal não está no seu Gmail.

## Testes

```bash
python3 -m unittest discover -s voos/tests -t .
```

As fixtures em `voos/tests/fixtures.json` reproduzem o formato real dos
e-mails com nomes, localizadores e números de voo inventados — este
repositório é público, então nenhum dado real de reserva entra aqui.
