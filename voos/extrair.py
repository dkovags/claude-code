"""Extrai voos de e-mails de companhias aéreas e agências e devolve linhas
no formato da planilha "Voos".

Uso:
    python3 -m voos.extrair mensagens.json --csv voos.csv --relatorio relatorio.md

`mensagens.json` é uma lista de mensagens do Gmail, cada uma com as chaves
`id`, `date`, `sender`, `subject` e `plaintextBody` — exatamente o que a API do
Gmail (users.messages.get) e o conector de Gmail do Claude devolvem.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field, asdict
from datetime import date, datetime

# Colunas da aba "Voos", na ordem exata da planilha.
COLUNAS = [
    "Data", "Localizador", "Cidade", "Origem", "H. Ida", "Destino", "H. Chegada",
    "Companhia", "Voo", "Alterado", "Forma", "Assento", "Ida", "Volta",
    "Antecipação Desejada?", "Conexões", "Observações",
]

MESES_PT = {
    "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
    "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
    "janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
    "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11,
    "dezembro": 12,
}
MESES_EN = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# Cidade mostrada na planilha é a do destino; o nome vem em vários idiomas.
CIDADES = {
    "BSB": "Brasília", "CGH": "São Paulo", "GRU": "Guarulhos", "VCP": "Campinas",
    "GIG": "Rio de Janeiro", "SDU": "Rio de Janeiro", "CNF": "Belo Horizonte",
    "SLZ": "São Luiz", "BEL": "Belém", "REC": "Recife", "FOR": "Fortaleza",
    "SSA": "Salvador", "MCP": "Macapá", "MAO": "Manaus", "CGB": "Cuiabá",
    "CGR": "Campo Grande", "RAO": "Ribeirão Preto", "POA": "Porto Alegre",
    "CWB": "Curitiba", "FLN": "Florianópolis", "NAT": "Natal", "MCZ": "Maceió",
    "LIS": "Lisboa", "OPO": "Porto", "NBJ": "Luanda", "LAD": "Luanda",
    "RAK": "Marraquexe", "BUD": "Budapeste", "GYD": "Baku", "TBS": "Tbilisi",
    "ATH": "Atenas", "MAD": "Madri", "CDG": "Paris", "SVQ": "Sevilha",
    "VIE": "Viena", "OTP": "Bucareste", "LIM": "Lima", "SCL": "Santiago",
    "CUZ": "Cusco", "CJC": "Calama", "PBM": "Paramaribo",
}

# Domínio do remetente -> canal de compra registrado na coluna "Forma".
FORMA_POR_REMETENTE = {
    "booking.com": "Booking",
    "ryanair.com": "Ryanair",
    "ryanairemail.com": "Ryanair",
    "wizzair.com": "Wizz Air",
    "kiwi.com": "Kiwi",
    "edreams.com": "eDreams",
    "mailer.edreams.com": "eDreams",
    "skyexpress.com": "SKY express",
    "skyexpress.gr": "SKY express",
    "azal.az": "AZAL",
    "aegeanair.com": "Aegean",
    "latam.com": "Latam",
    "decolar.com": "Decolar",
    "cvc.com.br": "CVC",
}


@dataclass
class Voo:
    """Um trecho de voo, já no vocabulário da planilha."""

    data: date
    origem: str
    destino: str
    h_ida: str
    h_chegada: str
    companhia: str = ""
    voo: str = ""
    localizador: str = ""
    forma: str = ""
    assento: str = ""
    alterado: str = "Não"
    conexoes: str = ""
    observacoes: str = ""
    # Procedência: não vai para a planilha, serve para auditar cada linha.
    fonte_id: str = ""
    fonte_assunto: str = ""
    fonte_data: str = ""

    @property
    def cidade(self) -> str:
        return CIDADES.get(self.destino, self.destino)

    @property
    def chave(self) -> tuple:
        """Identidade do trecho, para casar avisos de alteração com a reserva."""
        return (self.data, self.origem, self.destino, so_digitos(self.voo))

    def linha(self) -> dict:
        return {
            "Data": self.data.strftime("%d/%m/%Y"),
            "Localizador": self.localizador,
            "Cidade": self.cidade,
            "Origem": self.origem,
            "H. Ida": self.h_ida,
            "Destino": self.destino,
            "H. Chegada": self.h_chegada,
            "Companhia": self.companhia,
            "Voo": self.voo,
            "Alterado": self.alterado,
            "Forma": self.forma,
            "Assento": self.assento,
            "Ida": "",
            "Volta": "",
            "Antecipação Desejada?": "",
            "Conexões": self.conexoes,
            "Observações": self.observacoes,
        }


@dataclass
class Alteracao:
    """Aviso de atraso, remarcação ou cancelamento."""

    voo: str
    descricao: str
    nova_partida: str = ""
    fonte_id: str = ""
    fonte_assunto: str = ""
    fonte_data: str = ""


@dataclass
class Resultado:
    voos: list[Voo] = field(default_factory=list)
    alteracoes: list[Alteracao] = field(default_factory=list)


# --------------------------------------------------------------------------
# Utilidades de texto
# --------------------------------------------------------------------------

def sem_acento(texto: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn"
    )


def limpar(corpo: str) -> str:
    """Remove HTML, alvos de link e o excesso de pipes dos e-mails de marketing."""
    corpo = re.sub(r"(?is)<(style|script|head)[^>]*>.*?</\1>", " ", corpo)
    corpo = re.sub(r"(?s)<[^>]+>", " ", corpo)
    corpo = html.unescape(corpo)
    corpo = re.sub(r"\[\]\([^)]*\)", " ", corpo)
    corpo = re.sub(r"\((?:https?|ed-app|mailto)[^)]*\)", " ", corpo)
    corpo = re.sub(r"[ \t\xa0]+", " ", corpo)
    return corpo


def linhas_uteis(corpo: str) -> list[str]:
    """Cada célula dos e-mails em tabela vira um item, sem vazios."""
    bruto = re.split(r"[|\n]", limpar(corpo))
    return [p.strip() for p in bruto if p.strip()]


def so_digitos(voo: str) -> str:
    """Parte numérica do voo, sem o código da companhia.

    'W6 2460', 'W62460' e 'w6 2460' viram '2460' — é por aí que um aviso de
    atraso é casado com a reserva. O dígito do código ('6' em 'W6') não pode
    entrar, senão 'W6 2460' viraria '62460'.
    """
    texto = (voo or "").upper().strip()
    texto = re.sub(r"^(?:[A-Z]{2}|[A-Z]\d)(?=\s*\d)", "", texto)
    achado = re.search(r"\d{1,4}", texto)
    return achado.group(0) if achado else ""


def normalizar_voo(voo: str) -> str:
    """'W62460' e 'W6 2460' viram 'W6 2460'."""
    m = re.fullmatch(r"\s*([A-Z0-9]{2})\s*(\d{1,4})\s*", (voo or "").upper())
    return f"{m.group(1)} {m.group(2)}" if m else (voo or "").strip()


def hora(texto: str) -> str:
    m = re.search(r"(\d{1,2})[h:](\d{2})", texto)
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else ""


def com_dia_seguinte(chegada: str, dias: int) -> str:
    """A planilha marca virada de data como '06:40(+1)'."""
    return f"{chegada}(+{dias})" if dias > 0 else chegada


def forma_de(remetente: str) -> str:
    dominio = (remetente or "").split("@")[-1].lower()
    for chave, valor in FORMA_POR_REMETENTE.items():
        if dominio.endswith(chave):
            return valor
    return ""


# --------------------------------------------------------------------------
# Parsers por remetente
# --------------------------------------------------------------------------

def parse_booking(msg: dict) -> Resultado:
    """Booking.com Flights: 'Detalhes da reserva de voo X – Y'."""
    texto = limpar(msg.get("plaintextBody", ""))
    resultado = Resultado()
    trechos = re.finditer(
        r"De\s+(?P<co>[^(]+?)\s*\((?P<o>[A-Z]{3})\)\s*para\s+(?P<cd>[^(]+?)\s*\((?P<d>[A-Z]{3})\)"
        r".{0,200}?(?P<d1>\d{1,2})\s+de\s+(?P<m1>\w{3})\w*\.?\s*·\s*(?P<h1>\d{1,2}h\d{2})"
        r"\s*-\s*.{0,40}?(?P<d2>\d{1,2})\s+de\s+(?P<m2>\w{3})\w*\.?\s*·\s*(?P<h2>\d{1,2}h\d{2})"
        r".{0,300}?·\s*(?P<voo>[A-Z]{2}\s?\d{2,4})",
        texto,
        re.S,
    )
    pnr = re.search(r"Refer[êe]ncia da reserva:\s*([A-Z0-9]{5,8})", texto)
    ano = _ano_do_email(msg)
    for t in trechos:
        m1 = MESES_PT.get(sem_acento(t.group("m1")).lower()[:3])
        m2 = MESES_PT.get(sem_acento(t.group("m2")).lower()[:3])
        if not m1 or not m2:
            continue
        d1 = date(ano if m1 >= _mes_do_email(msg) else ano + 1, m1, int(t.group("d1")))
        dias = 1 if (m2, int(t.group("d2"))) != (m1, int(t.group("d1"))) else 0
        companhia = re.search(
            r"([A-Z][\w ]+?)\s*·\s*" + re.escape(t.group("voo")), texto
        )
        resultado.voos.append(
            Voo(
                data=d1,
                origem=t.group("o"),
                destino=t.group("d"),
                h_ida=hora(t.group("h1")),
                h_chegada=com_dia_seguinte(hora(t.group("h2")), dias),
                companhia=_companhia_curta(companhia.group(1) if companhia else ""),
                voo=normalizar_voo(t.group("voo")),
                localizador=pnr.group(1) if pnr else "",
                forma="Booking",
                **_procedencia(msg),
            )
        )
    return resultado


def parse_wizzair(msg: dict) -> Resultado:
    """Wizz Air: 'Your travel itinerary: XPRRKG'."""
    texto = limpar(msg.get("plaintextBody", ""))
    resultado = Resultado()
    pnr = re.search(r"Flight confirmation code:\s*\|?\s*([A-Z0-9]{6})", texto)
    assento = re.search(
        r"\|\s*(?:MR|MRS|MS)\s*\|.*?\|\s*([A-Z]{3})-([A-Z]{3})\s*\|[^|]*\|[^|]*\|\s*([^|]*?)\s*\|",
        texto,
        re.S,
    )
    for t in re.finditer(
        r"Flight Number:\s*(?P<voo>[A-Z0-9]{2}\s?\d{1,4}).{0,400}?"
        r"\((?P<o>[A-Z]{3})\).{0,200}?\((?P<d>[A-Z]{3})\).{0,200}?"
        r"(?P<dt1>\d{2}/\d{2}/\d{4})\s+(?P<h1>\d{2}:\d{2}).{0,80}?"
        r"(?P<dt2>\d{2}/\d{2}/\d{4})\s+(?P<h2>\d{2}:\d{2})",
        texto,
        re.S,
    ):
        d1 = datetime.strptime(t.group("dt1"), "%d/%m/%Y").date()
        d2 = datetime.strptime(t.group("dt2"), "%d/%m/%Y").date()
        resultado.voos.append(
            Voo(
                data=d1,
                origem=t.group("o"),
                destino=t.group("d"),
                h_ida=t.group("h1"),
                h_chegada=com_dia_seguinte(t.group("h2"), (d2 - d1).days),
                companhia="Wizz Air",
                voo=normalizar_voo(t.group("voo")),
                localizador=pnr.group(1) if pnr else "",
                forma="Wizz Air",
                assento=_assento_valido(assento.group(3) if assento else ""),
                **_procedencia(msg),
            )
        )
    return resultado


def parse_ryanair(msg: dict) -> Resultado:
    """Ryanair: itinerário de viagem e avisos de atraso."""
    texto = limpar(msg.get("plaintextBody", ""))
    resultado = Resultado()

    atraso = re.search(
        r"o teu\s+(?P<voo>[A-Z]{2}\s?\d{1,4}),\s*de\s+(?P<o>.+?)\s+para\s+(?P<d>.+?)\s+"
        r"est[áa] atrasado e a nova hora de partida prevista [ée]\s*(?P<nova>\d{2}:\d{2})",
        texto,
    )
    if atraso:
        resultado.alteracoes.append(
            Alteracao(
                voo=normalizar_voo(atraso.group("voo")),
                descricao=(
                    f"Atraso: partida de {atraso.group('o').strip()} para "
                    f"{atraso.group('d').strip()} remarcada para {atraso.group('nova')}"
                ),
                nova_partida=atraso.group("nova"),
                **_procedencia(msg),
            )
        )
        return resultado

    itinerario = re.search(
        r"(?P<voo>FR\s?\d{2,4})\s+.*?\s(?P<dt>\d{2}/\d{2}/\d{4}).{0,120}?"
        r"Hora de partida\s*-\s*(?P<h1>\d{2}:\d{2}).{0,120}?"
        r"Hora de chegada\s*-\s*(?P<h2>\d{2}:\d{2}).{0,120}?"
        r"\((?P<o>[A-Z]{3})\).{0,60}?\((?P<d>[A-Z]{3})\)",
        texto,
        re.S,
    )
    pnr = re.search(r"Reserva:\s*([A-Z0-9]{6})", texto)
    if itinerario:
        resultado.voos.append(
            Voo(
                data=datetime.strptime(itinerario.group("dt"), "%d/%m/%Y").date(),
                origem=itinerario.group("o"),
                destino=itinerario.group("d"),
                h_ida=itinerario.group("h1"),
                h_chegada=itinerario.group("h2"),
                companhia="Ryanair",
                voo=normalizar_voo(itinerario.group("voo")),
                localizador=pnr.group(1) if pnr else "",
                forma="Ryanair",
                **_procedencia(msg),
            )
        )
    return resultado


def parse_kiwi(msg: dict) -> Resultado:
    """Kiwi.com: confirmação de reserva e avisos de atraso."""
    texto = limpar(msg.get("plaintextBody", ""))
    resultado = Resultado()

    atraso = re.search(
        r"flight\s+\*?(?P<voo>[A-Z0-9]{2}\d{1,4})\*?\s+(?P<o>.+?)\s*→\s*(?P<d>.+?)\s*\*?was delayed",
        texto,
    )
    if atraso:
        resultado.alteracoes.append(
            Alteracao(
                voo=normalizar_voo(atraso.group("voo")),
                descricao=(
                    f"Atraso: {atraso.group('o').strip()} → {atraso.group('d').strip()} "
                    "(Kiwi não informou o novo horário)"
                ),
                **_procedencia(msg),
            )
        )
        return resultado

    reserva = re.search(r"Booking number\s*([\d ]{6,20})", texto)
    partes = linhas_uteis(msg.get("plaintextBody", ""))
    # O itinerário aparece como: hora, data, cidade•IATA, ..., voo, hora, data, cidade•IATA
    perna = re.search(
        r"(?P<h1>\d{2}:\d{2})[\s|]*\w{3},\s*(?P<d1>\d{2}\.\d{2})\..{0,200}?"
        r"•\s*(?P<o>[A-Z]{3}).{0,400}?\b(?P<voo>[A-Z]{1,2}\d{1,2}\s?\d{3,4})\b.{0,200}?"
        r"(?P<h2>\d{2}:\d{2})[\s|]*\w{3},\s*(?P<d2>\d{2}\.\d{2})\..{0,200}?•\s*(?P<d>[A-Z]{3})",
        " | ".join(partes),
        re.S,
    )
    if perna:
        ano = _ano_do_email(msg)
        d1 = _data_ddmm(perna.group("d1"), ano)
        d2 = _data_ddmm(perna.group("d2"), ano)
        resultado.voos.append(
            Voo(
                data=d1,
                origem=perna.group("o"),
                destino=perna.group("d"),
                h_ida=perna.group("h1"),
                h_chegada=com_dia_seguinte(perna.group("h2"), (d2 - d1).days),
                companhia="Wizz Air" if perna.group("voo").startswith("W6") else "",
                voo=normalizar_voo(perna.group("voo")),
                localizador=(reserva.group(1).replace(" ", "") if reserva else ""),
                forma="Kiwi",
                observacoes="Localizador é o nº da reserva Kiwi; a cia pode ter outro.",
                **_procedencia(msg),
            )
        )
    return resultado


def parse_edreams(msg: dict) -> Resultado:
    """eDreams: 'A tua reserva está confirmada!'."""
    texto = limpar(msg.get("plaintextBody", ""))
    resultado = Resultado()
    cabecalho = re.search(
        r"(?P<dia>\d{1,2})\s+(?P<mes>[A-ZÇÃÉ]{3,12})\s+(?P<ano>\d{4})\s*\|\s*Confirmado", texto
    )
    pnr = re.search(r"Refer[êe]ncia da companhia a[ée]rea\s*([A-Z0-9]{6})", texto)
    trecho = re.search(
        r"(?P<h1>\d{2}:\d{2}).{0,200}?(?P<o>[A-Z]{3})\s*·.{0,300}?"
        r"(?P<cia>[\w ]+?)\s*·\s*(?P<voo>[A-Z0-9]{2}\s?\d{1,4}).{0,900}?"
        r"(?P<h2>\d{2}:\d{2}).{0,200}?(?P<d>[A-Z]{3})\s*·",
        texto,
        re.S,
    )
    if cabecalho and trecho:
        mes = MESES_PT.get(sem_acento(cabecalho.group("mes")).lower()[:3])
        if mes:
            resultado.voos.append(
                Voo(
                    data=date(int(cabecalho.group("ano")), mes, int(cabecalho.group("dia"))),
                    origem=trecho.group("o"),
                    destino=trecho.group("d"),
                    h_ida=trecho.group("h1"),
                    h_chegada=trecho.group("h2"),
                    companhia=_companhia_curta(trecho.group("cia")),
                    voo=normalizar_voo(trecho.group("voo")),
                    localizador=pnr.group(1) if pnr else "",
                    forma="eDreams",
                    **_procedencia(msg),
                )
            )
    return resultado


def parse_skyexpress(msg: dict) -> Resultado:
    """SKY express: 'Your SKY express reservation: HT190N'."""
    texto = limpar(msg.get("plaintextBody", ""))
    resultado = Resultado()
    t = re.search(
        r"Confirmation Number:\s*(?P<pnr>[A-Z0-9]{6}).{0,400}?"
        r"\((?P<o>[A-Z]{3})\)\s*-\s*.{0,80}?\((?P<d>[A-Z]{3})\).{0,200}?"
        r"(?P<dia>\d{2})\s*/\s*(?P<mes>\d{2})\s*/\s*(?P<ano>\d{4}).{0,200}?"
        r"(?P<h1>\d{2}:\d{2})\s*(?P=o).{0,80}?(?P<h2>\d{2}:\d{2})\s*(?P=d)",
        texto,
        re.S,
    )
    if t:
        resultado.voos.append(
            Voo(
                data=date(int(t.group("ano")), int(t.group("mes")), int(t.group("dia"))),
                origem=t.group("o"),
                destino=t.group("d"),
                h_ida=t.group("h1"),
                h_chegada=t.group("h2"),
                companhia="SKY express",
                voo=normalizar_voo(
                    (re.search(r"Flight number:\s*([A-Z0-9]{2}\s?\d{1,4})", texto) or
                     re.search(r"(GQ\s?\d{3,4})", texto)).group(1)
                ),
                localizador=t.group("pnr"),
                forma="SKY express",
                **_procedencia(msg),
            )
        )
    return resultado


def parse_azal(msg: dict) -> Resultado:
    """Azerbaijan Airlines: 'Your tickets'."""
    texto = limpar(msg.get("plaintextBody", ""))
    resultado = Resultado()
    pnr = re.search(r"Booking reference \(PNR\)\s*([A-Z0-9]{6})", texto)
    t = re.search(
        r"(?P<dia1>\d{1,2})\s+(?P<mes1>[A-Za-z]{3})\w*\s+(?P<ano1>\d{4})\s+(?P<h1>\d{2}:\d{2}).{0,80}?"
        r"(?P<dia2>\d{1,2})\s+(?P<mes2>[A-Za-z]{3})\w*\s+(?P<ano2>\d{4})\s+(?P<h2>\d{2}:\d{2}).{0,80}?"
        r"(?P<voo>J2\s?\d{3,4})",
        texto,
        re.S,
    )
    bilhete = re.search(r"\b(\d{13})\b", texto)
    if t:
        m1 = MESES_EN.get(t.group("mes1").lower())
        m2 = MESES_EN.get(t.group("mes2").lower())
        if m1 and m2:
            d1 = date(int(t.group("ano1")), m1, int(t.group("dia1")))
            d2 = date(int(t.group("ano2")), m2, int(t.group("dia2")))
            resultado.voos.append(
                Voo(
                    data=d1,
                    origem="GYD",
                    destino="TBS",
                    h_ida=t.group("h1"),
                    h_chegada=com_dia_seguinte(t.group("h2"), (d2 - d1).days),
                    companhia="AZAL",
                    voo=normalizar_voo(t.group("voo")),
                    localizador=pnr.group(1) if pnr else "",
                    forma="AZAL",
                    observacoes=(f"Bilhete {bilhete.group(1)}." if bilhete else ""),
                    **_procedencia(msg),
                )
            )
    return resultado


PARSERS = {
    "booking.com": parse_booking,
    "wizzair.com": parse_wizzair,
    "ryanair.com": parse_ryanair,
    "ryanairemail.com": parse_ryanair,
    "kiwi.com": parse_kiwi,
    "edreams.com": parse_edreams,
    "skyexpress.com": parse_skyexpress,
    "skyexpress.gr": parse_skyexpress,
    "azal.az": parse_azal,
}


def _procedencia(msg: dict) -> dict:
    return {
        "fonte_id": msg.get("id", ""),
        "fonte_assunto": msg.get("subject", ""),
        "fonte_data": (msg.get("date", "") or "")[:10],
    }


def _ano_do_email(msg: dict) -> int:
    texto = msg.get("date", "") or ""
    return int(texto[:4]) if texto[:4].isdigit() else date.today().year


def _mes_do_email(msg: dict) -> int:
    texto = msg.get("date", "") or ""
    return int(texto[5:7]) if texto[5:7].isdigit() else 1


def _data_ddmm(ddmm: str, ano: int) -> date:
    dia, mes = ddmm.split(".")
    return date(ano, int(mes), int(dia))


def _companhia_curta(nome: str) -> str:
    nome = (nome or "").strip()
    conhecidas = {
        "azul": "Azul", "gol": "Gol", "latam": "Latam", "taag": "TAAG",
        "wizz": "Wizz Air", "ryanair": "Ryanair", "aegean": "Aegean",
        "sky express": "SKY express", "azerbaijan": "AZAL",
    }
    for chave, valor in conhecidas.items():
        if chave in nome.lower():
            return valor
    return nome


def _assento_valido(texto: str) -> str:
    texto = (texto or "").strip()
    return texto if re.fullmatch(r"\d{1,2}[A-F]", texto) else ""


# --------------------------------------------------------------------------
# Orquestração
# --------------------------------------------------------------------------

def extrair(mensagens: list[dict]) -> Resultado:
    """Roda o parser certo para cada mensagem e junta tudo."""
    total = Resultado()
    for msg in mensagens:
        dominio = (msg.get("sender", "") or "").split("@")[-1].lower()
        for chave, parser in PARSERS.items():
            if dominio.endswith(chave):
                try:
                    parcial = parser(msg)
                except Exception as erro:  # um e-mail estranho não derruba o lote
                    print(
                        f"aviso: falha ao ler {msg.get('id')} ({msg.get('subject')}): {erro}",
                        file=sys.stderr,
                    )
                    break
                total.voos.extend(parcial.voos)
                total.alteracoes.extend(parcial.alteracoes)
                break
    return consolidar(total)


def consolidar(resultado: Resultado) -> Resultado:
    """Remove duplicatas, aplica as alterações e ordena por data."""
    unicos: dict[tuple, Voo] = {}
    for voo in resultado.voos:
        atual = unicos.get(voo.chave)
        # Entre duas fontes do mesmo trecho, fica a da companhia (mais confiável
        # que a da agência, que costuma arredondar horários).
        if atual is None or _prioridade(voo) > _prioridade(atual):
            unicos[voo.chave] = voo

    for alteracao in resultado.alteracoes:
        for voo in unicos.values():
            if so_digitos(voo.voo) == so_digitos(alteracao.voo):
                voo.alterado = "Sim"
                voo.observacoes = " ".join(
                    p for p in [voo.observacoes, f"{alteracao.descricao} "
                                f"(aviso de {alteracao.fonte_data})."] if p
                ).strip()

    return Resultado(
        voos=sorted(unicos.values(), key=lambda v: (v.data, v.h_ida)),
        alteracoes=resultado.alteracoes,
    )


def _prioridade(voo: Voo) -> int:
    """Companhia aérea vale mais que agência na hora de desempatar."""
    return 2 if voo.forma in {
        "Wizz Air", "Ryanair", "AZAL", "SKY express", "Aegean", "Azul", "Gol", "Latam"
    } else 1


def escrever_csv(voos: list[Voo], caminho: str) -> None:
    with open(caminho, "w", newline="", encoding="utf-8") as arquivo:
        escritor = csv.DictWriter(arquivo, fieldnames=COLUNAS)
        escritor.writeheader()
        for voo in voos:
            escritor.writerow(voo.linha())


def escrever_relatorio(resultado: Resultado, caminho: str) -> None:
    linhas = ["# Voos extraídos do Gmail", ""]
    linhas.append(f"{len(resultado.voos)} trecho(s) encontrado(s).")
    linhas.append("")
    linhas.append("| Data | Trecho | Voo | Partida | Chegada | Localizador | Fonte |")
    linhas.append("| --- | --- | --- | --- | --- | --- | --- |")
    for voo in resultado.voos:
        linhas.append(
            f"| {voo.data.strftime('%d/%m/%Y')} | {voo.origem} → {voo.destino} | "
            f"{voo.companhia} {voo.voo} | {voo.h_ida} | {voo.h_chegada} | "
            f"{voo.localizador} | {voo.fonte_assunto} ({voo.fonte_data}) |"
        )
    if resultado.alteracoes:
        linhas += ["", "## Alterações avisadas pela companhia", ""]
        for alteracao in resultado.alteracoes:
            linhas.append(
                f"- **{alteracao.voo}** — {alteracao.descricao} "
                f"(e-mail de {alteracao.fonte_data}: {alteracao.fonte_assunto})"
            )
    with open(caminho, "w", encoding="utf-8") as arquivo:
        arquivo.write("\n".join(linhas) + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mensagens", help="JSON com a lista de mensagens do Gmail")
    parser.add_argument("--csv", help="arquivo CSV de saída, no formato da planilha")
    parser.add_argument("--relatorio", help="arquivo Markdown com o resumo e as alterações")
    parser.add_argument("--json", help="arquivo JSON com os voos normalizados")
    args = parser.parse_args(argv)

    with open(args.mensagens, encoding="utf-8") as arquivo:
        mensagens = json.load(arquivo)
    if isinstance(mensagens, dict):
        mensagens = mensagens.get("messages", [])

    resultado = extrair(mensagens)

    if args.csv:
        escrever_csv(resultado.voos, args.csv)
    if args.relatorio:
        escrever_relatorio(resultado, args.relatorio)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as arquivo:
            json.dump(
                [{**asdict(v), "data": v.data.isoformat()} for v in resultado.voos],
                arquivo, ensure_ascii=False, indent=2,
            )
    if not any([args.csv, args.relatorio, args.json]):
        escritor = csv.DictWriter(sys.stdout, fieldnames=COLUNAS)
        escritor.writeheader()
        for voo in resultado.voos:
            escritor.writerow(voo.linha())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
