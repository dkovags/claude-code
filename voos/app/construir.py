"""Injeta uma base de voos no molde e grava o app pronto para abrir.

    python3 construir.py voos.html dados.json controle-de-voos.html

O molde traz o marcador __DADOS__ no lugar da semente. Assim o código fica
versionado sem nenhum localizador dentro: a base é um arquivo à parte.
"""
import json
import pathlib
import sys

molde_arq, dados_arq, saida_arq = (sys.argv + ["voos.html", "dados.json",
                                               "controle-de-voos.html"])[1:4]
molde = pathlib.Path(molde_arq).read_text(encoding="utf-8")
regs = json.loads(pathlib.Path(dados_arq).read_text(encoding="utf-8"))

if "__DADOS__" not in molde:
    sys.exit(f"{molde_arq}: marcador __DADOS__ não encontrado")

saida = molde.replace("__DADOS__", json.dumps(regs, ensure_ascii=False,
                                              separators=(",", ":")))
pathlib.Path(saida_arq).write_text(saida, encoding="utf-8")
print(f"{saida_arq}: {len(regs)} registros, {len(saida) // 1024} KB")
