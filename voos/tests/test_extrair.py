"""Testes dos parsers de e-mail de voo.

As fixtures são sintéticas: mesmos formatos dos e-mails reais, com nomes,
localizadores e números de voo inventados.
"""

import json
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from voos.extrair import (  # noqa: E402
    COLUNAS, Voo, extrair, normalizar_voo, com_dia_seguinte, hora, so_digitos,
)

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures.json")


def carregar():
    with open(FIXTURES, encoding="utf-8") as arquivo:
        return json.load(arquivo)


def por_voo(voos, numero):
    return next(v for v in voos if v.voo == numero)


class TestAuxiliares(unittest.TestCase):
    def test_normalizar_voo_aceita_colado_e_separado(self):
        self.assertEqual(normalizar_voo("W62460"), "W6 2460")
        self.assertEqual(normalizar_voo("W6 2460"), "W6 2460")
        self.assertEqual(normalizar_voo("ad6017"), "AD 6017")

    def test_dia_seguinte_so_marca_quando_vira_a_data(self):
        self.assertEqual(com_dia_seguinte("06:40", 1), "06:40(+1)")
        self.assertEqual(com_dia_seguinte("06:40", 0), "06:40")

    def test_hora_entende_os_dois_formatos(self):
        self.assertEqual(hora("15h55"), "15:55")
        self.assertEqual(hora("9h05"), "09:05")
        self.assertEqual(hora("22:20"), "22:20")

    def test_so_digitos_ignora_o_prefixo_da_cia(self):
        self.assertEqual(so_digitos("W6 2460"), "2460")


class TestParsers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.resultado = extrair(carregar())
        cls.voos = cls.resultado.voos

    def test_booking_le_ida_e_volta(self):
        ida = por_voo(self.voos, "AD 1111")
        volta = por_voo(self.voos, "AD 2222")
        self.assertEqual(ida.data, date(2027, 4, 9))
        self.assertEqual((ida.origem, ida.destino), ("BSB", "SSA"))
        self.assertEqual((ida.h_ida, ida.h_chegada), ("15:55", "17:40"))
        self.assertEqual(ida.localizador, "AAA111")
        self.assertEqual(ida.companhia, "Azul")
        self.assertEqual(volta.data, date(2027, 4, 15))
        self.assertEqual((volta.origem, volta.destino), ("SSA", "BSB"))

    def test_ryanair_le_itinerario(self):
        voo = por_voo(self.voos, "FR 1234")
        self.assertEqual(voo.data, date(2027, 4, 10))
        self.assertEqual((voo.origem, voo.destino), ("LIS", "SVQ"))
        self.assertEqual(voo.localizador, "BBB222")

    def test_kiwi_le_perna_que_vira_a_data(self):
        voo = por_voo(self.voos, "W6 9999")
        self.assertEqual(voo.data, date(2027, 4, 12))
        self.assertEqual((voo.origem, voo.destino), ("SVQ", "VIE"))
        self.assertEqual(voo.h_chegada, "01:30(+1)")

    def test_wizzair_le_assento_e_terminais(self):
        voo = por_voo(self.voos, "W6 8888")
        self.assertEqual(voo.data, date(2027, 4, 15))
        self.assertEqual((voo.h_ida, voo.h_chegada), ("16:15", "22:50"))
        self.assertEqual(voo.assento, "12C")
        self.assertEqual(voo.localizador, "CCC333")

    def test_azal_le_bilhete(self):
        voo = por_voo(self.voos, "J2 7777")
        self.assertEqual(voo.data, date(2027, 4, 18))
        self.assertEqual(voo.localizador, "DDD444")
        self.assertIn("1234567890123", voo.observacoes)

    def test_skyexpress_le_horario_de_chegada(self):
        voo = por_voo(self.voos, "GQ 555")
        self.assertEqual(voo.data, date(2027, 4, 20))
        self.assertEqual((voo.h_ida, voo.h_chegada), ("02:45", "03:45"))


class TestConsolidacao(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.voos = extrair(carregar()).voos

    def test_nao_duplica_o_trecho_que_veio_de_duas_fontes(self):
        """A Wizz e a eDreams confirmam o mesmo W6 8888; vale uma linha só."""
        iguais = [v for v in self.voos if v.voo == "W6 8888"]
        self.assertEqual(len(iguais), 1)

    def test_entre_cia_e_agencia_prevalece_a_cia(self):
        voo = por_voo(self.voos, "W6 8888")
        self.assertEqual(voo.forma, "Wizz Air")
        self.assertEqual(voo.assento, "12C")  # só a cia informa o assento

    def test_atraso_marca_alterado_e_registra_o_novo_horario(self):
        voo = por_voo(self.voos, "FR 1234")
        self.assertEqual(voo.alterado, "Sim")
        self.assertIn("23:25", voo.observacoes)

    def test_atraso_sem_novo_horario_ainda_marca_alterado(self):
        voo = por_voo(self.voos, "W6 9999")
        self.assertEqual(voo.alterado, "Sim")

    def test_voo_sem_aviso_fica_como_nao_alterado(self):
        self.assertEqual(por_voo(self.voos, "AD 1111").alterado, "Não")

    def test_sai_ordenado_por_data(self):
        datas = [v.data for v in self.voos]
        self.assertEqual(datas, sorted(datas))

    def test_linha_tem_exatamente_as_colunas_da_planilha(self):
        self.assertEqual(list(self.voos[0].linha().keys()), COLUNAS)

    def test_cada_linha_guarda_o_email_de_origem(self):
        for voo in self.voos:
            self.assertTrue(voo.fonte_id, f"{voo.voo} sem procedência")


class TestRobustez(unittest.TestCase):
    def test_remetente_desconhecido_e_ignorado_sem_erro(self):
        resultado = extrair([
            {"id": "x", "date": "2027-01-01T00:00:00Z", "sender": "promo@exemplo.com",
             "subject": "Promoção", "plaintextBody": "Voe barato!"}
        ])
        self.assertEqual(resultado.voos, [])

    def test_email_corrompido_nao_derruba_o_lote(self):
        mensagens = carregar() + [
            {"id": "ruim", "date": "2027-01-01T00:00:00Z",
             "sender": "noreply@booking.com", "subject": "vazio", "plaintextBody": ""}
        ]
        self.assertTrue(extrair(mensagens).voos)

    def test_cidade_cai_no_iata_quando_o_aeroporto_e_desconhecido(self):
        voo = Voo(data=date(2027, 1, 1), origem="BSB", destino="ZZZ",
                  h_ida="10:00", h_chegada="11:00")
        self.assertEqual(voo.cidade, "ZZZ")


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestNumeroDoVoo(unittest.TestCase):
    """so_digitos é o que casa um aviso de atraso com a reserva."""

    def test_tira_o_codigo_da_cia_mesmo_quando_ele_tem_digito(self):
        self.assertEqual(so_digitos("W6 2460"), "2460")
        self.assertEqual(so_digitos("W62460"), "2460")
        self.assertEqual(so_digitos("J2 8225"), "8225")
        self.assertEqual(so_digitos("G3 1830"), "1830")

    def test_voo_sem_digito_no_codigo(self):
        self.assertEqual(so_digitos("AD 6017"), "6017")
        self.assertEqual(so_digitos("FR4390"), "4390")

    def test_trecho_com_duas_pernas_usa_a_primeira(self):
        self.assertEqual(so_digitos("4107/4477"), "4107")
        self.assertEqual(so_digitos("748/652"), "748")

    def test_formatos_equivalentes_casam_entre_si(self):
        self.assertEqual(so_digitos("W6 2460"), so_digitos("W62460"))
