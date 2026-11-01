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
# a partir do zero, só com o Gmail
python3 voos/extrair.py mensagens.json --csv voos.csv --relatorio relatorio.md

# com a planilha atual como base (recomendado)
python3 voos/extrair.py mensagens.json --planilha aba_voos.csv --csv voos.csv
```

Sem `--csv`/`--relatorio`, o CSV sai na saída padrão. É só colar na planilha.

Com `--planilha`, a planilha é a base: linha sem observação nova fica intacta,
e cada divergência encontrada sai em `stderr` para você conferir antes de
colar.

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

## A coluna `Alterado`

Três estados, não dois:

```
Não ──alteração──▶ Alterado ──remarcação──▶ Remarcado ──alteração──▶ Alterado
```

- **`Alterado`** — a companhia mexeu no voo e ele ainda não foi remarcado.
- **`Remarcado`** — já foi refeito depois da alteração. Continua assim até
  sofrer uma alteração nova, que o joga de volta para `Alterado`.
- **`Não`** — nada aconteceu. Remarcação voluntária, sem alteração antes,
  continua `Não`: a coluna registra o que a companhia fez, não o que você fez.

O que dispara cada transição:

| Observação | Vira |
| --- | --- |
| Aviso de atraso ou remarcação da companhia | `Alterado` |
| Consulta ao site/app divergindo da planilha | `Alterado` (mudou sem avisar) |
| Confirmação nova sobre voo que estava `Alterado` | `Remarcado` |
| Nada diferente | o estado que já estava na planilha |

## A planilha manda

`Alterado`, `Assento`, `Ida`, `Volta` e `Antecipação Desejada?` **só existem na
planilha** e nunca são sobrescritos. Isso importa porque a Azul muda voo sem
mandar e-mail: quem registra essas alterações é você, olhando o app, e o
extrator não pode apagar esse trabalho.

Um trecho é casado por **localizador + destino**, nunca por data — quando a
companhia muda a data (05/11 virar 04/11) ou o aeroporto de origem (CGH virar
GRU), continua sendo o mesmo trecho, e é exatamente esse caso que precisa ser
detectado em vez de virar linha duplicada.

## Regras que ele aplica

- **Uma linha por trecho.** O mesmo voo costuma chegar pela companhia *e* pela
  agência. Vale a versão da companhia: a agência arredonda horário (a eDreams,
  por exemplo, manda o horário de retirada de carro, uns 30–40 min depois do
  pouso) e não traz assento.
- **Chegada no dia seguinte vira `(+1)`**, como na planilha.
- **Toda linha guarda a procedência** (`fonte_id`, `fonte_assunto`,
  `fonte_data`), para conferir depois de onde veio cada dado. Esses campos não
  vão para o CSV — use `--json` para vê-los.

## Limites conhecidos

- **Não lê anexo.** Cartão de embarque em PDF (assento, portão, terminal) fica
  de fora.
- **Nem toda alteração chega por e-mail.** A Azul remarca voo em silêncio: a
  mudança só aparece no site ou no app. Para esses casos é preciso alimentar o
  extrator com uma observação do tipo `consulta` — hoje, à mão.
- **Só lê as suas reservas.** Localizador de acompanhante que veio por outro
  canal não está no seu Gmail.

## Testes

```bash
python3 -m unittest discover -s voos/tests -t .
```

As fixtures em `voos/tests/fixtures.json` reproduzem o formato real dos
e-mails com nomes, localizadores e números de voo inventados — este
repositório é público, então nenhum dado real de reserva entra aqui.
