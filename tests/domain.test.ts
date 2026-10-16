import { describe, expect, it } from "vitest";
import {
  buildLedger, expenseDebts, expenseNets, memberBalance, pairwiseDebts, settleNets, simplifiedDebts,
} from "../src/domain/balances";
import { suggestCategory } from "../src/domain/categories";
import { expensesToCsv } from "../src/domain/csv";
import { addMonths, formatDateShort, relativeTime } from "../src/domain/dates";
import {
  evaluateAmount, formatBalance, formatInput, formatMoney, parseAmount, parseNumber, sumBalances,
} from "../src/domain/money";
import { dueRecurring, occurrenceDate } from "../src/domain/recurring";
import { computeSplit, distribute, splitEqual } from "../src/domain/split";
import type { Dataset, Expense } from "../src/domain/types";

const nbsp = (s: string) => s.replace(/ /g, " ");

function ds(): Dataset {
  const p = (id: string, name: string) => ({ id, name, color: 0, createdAt: "2026-01-01T00:00:00.000Z" });
  return {
    version: 1,
    meId: "me",
    people: { me: p("me", "Eu"), ana: p("ana", "Ana"), bia: p("bia", "Bia"), caio: p("caio", "Caio") },
    groups: {
      g1: {
        id: "g1", name: "Viagem", type: "trip", memberIds: ["me", "ana", "bia", "caio"], simplifyDebts: false,
        currency: "BRL", createdAt: "2026-01-01T00:00:00.000Z", createdBy: "me", history: [],
      },
    },
    expenses: {},
    prefs: { currency: "BRL", theme: "auto" },
  };
}

let seq = 0;
function exp(partial: Partial<Expense> & Pick<Expense, "paidBy" | "owedBy" | "cost">): Expense {
  seq++;
  return {
    id: `e${seq}`, groupId: "g1", payment: false, description: `d${seq}`, currency: "BRL", date: "2026-10-01",
    category: "uncategorized.general", splitMode: "exact", repeat: "never", createdAt: `2026-10-01T00:00:${String(seq % 60).padStart(2, "0")}.000Z`,
    createdBy: "me", history: [], comments: [], ...partial,
  };
}

describe("dinheiro", () => {
  it("interpreta números em formato brasileiro e americano", () => {
    expect(parseNumber("12,50")).toBe(12.5);
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("12.500")).toBe(12500);
    expect(parseNumber("0.500")).toBe(0.5);
    expect(parseNumber("1.5")).toBe(1.5);
    expect(parseNumber("10.")).toBe(10);
    expect(parseNumber(",5")).toBe(0.5);
    expect(parseNumber("1.2.3,4,5")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });

  it("aceita contas simples no campo de valor", () => {
    expect(evaluateAmount("10+5,5")).toBe(15.5);
    expect(evaluateAmount("100/4")).toBe(25);
    expect(evaluateAmount("2*(15+3)")).toBe(36);
    expect(evaluateAmount("R$ 1.234,56")).toBe(1234.56);
    expect(evaluateAmount("10/0")).toBeNull();
    expect(evaluateAmount("10+")).toBeNull();
    expect(evaluateAmount("")).toBeNull();
  });

  it("converte para centavos sem erro de arredondamento", () => {
    expect(parseAmount("0,1+0,2", "BRL")).toBe(30);
    expect(parseAmount("1,005", "BRL")).toBe(101);
    expect(parseAmount("19,99", "BRL")).toBe(1999);
    expect(parseAmount("1500", "JPY")).toBe(1500);
  });

  it("formata valores", () => {
    expect(nbsp(formatMoney(123456, "BRL"))).toBe("R$ 1.234,56");
    expect(nbsp(formatMoney(-500, "BRL", { abs: true }))).toBe("R$ 5,00");
    expect(nbsp(formatMoney(500, "USD"))).toBe("US$ 5,00");
    expect(formatInput(1250, "BRL")).toBe("12,50");
    expect(formatInput(5, "BRL")).toBe("0,05");
    expect(nbsp(formatBalance({ BRL: 1000, USD: -500 }, { abs: true }))).toBe("R$ 10,00 + US$ 5,00");
    expect(sumBalances({ BRL: 100 }, { BRL: -100, USD: 5 })).toEqual({ USD: 5 });
  });
});

describe("divisão", () => {
  it("divide igualmente distribuindo os centavos", () => {
    expect(splitEqual(10000, ["a", "b", "c"])).toEqual({ a: 3334, b: 3333, c: 3333 });
    expect(splitEqual(2, ["a", "b", "c"])).toEqual({ a: 1, b: 1, c: 0 });
  });

  it("distribui por pesos pelo maior resto, com soma exata", () => {
    const r = distribute(10000, ["a", "b", "c"], [1, 1, 1]);
    expect(Object.values(r).reduce((x, y) => x + y)).toBe(10000);
    expect(distribute(1000, ["a", "b"], [2, 1])).toEqual({ a: 667, b: 333 });
    expect(distribute(999999999, ["a", "b", "c"], [33.333333, 33.333333, 33.333334])).toSatisfy(
      (m: Record<string, number>) => Object.values(m).reduce((x, y) => x + y) === 999999999,
    );
  });

  it("valida cada modo de divisão", () => {
    expect(computeSplit("exact", 1000, ["a", "b"], { a: 600, b: 400 })).toEqual({ ok: true, shares: { a: 600, b: 400 } });
    expect(computeSplit("exact", 1000, ["a", "b"], { a: 600, b: 300 }).ok).toBe(false);
    expect(computeSplit("percent", 1000, ["a", "b"], { a: 70, b: 30 })).toEqual({ ok: true, shares: { a: 700, b: 300 } });
    expect(computeSplit("percent", 1000, ["a", "b"], { a: 70, b: 20 }).ok).toBe(false);
    expect(computeSplit("percent", 10000, ["a", "b", "c"], { a: 33.33, b: 33.33, c: 33.34 })).toEqual({
      ok: true, shares: { a: 3333, b: 3333, c: 3334 },
    });
    expect(computeSplit("shares", 9000, ["a", "b"], { a: 2, b: 1 })).toEqual({ ok: true, shares: { a: 6000, b: 3000 } });
    expect(computeSplit("shares", 9000, ["a", "b"], { a: 0, b: 0 }).ok).toBe(false);
    // ajuste: a paga R$ 10 a mais; o resto é dividido igualmente
    expect(computeSplit("adjust", 10000, ["a", "b"], { a: 1000 })).toEqual({ ok: true, shares: { a: 5500, b: 4500 } });
    expect(computeSplit("adjust", 1000, ["a", "b"], { a: 2000 }).ok).toBe(false);
    expect(computeSplit("equal", 0, ["a"]).ok).toBe(false);
    expect(computeSplit("equal", 100, []).ok).toBe(false);
  });
});

describe("saldos", () => {
  it("calcula quem deve a quem numa despesa", () => {
    const e = exp({ cost: 9000, paidBy: { me: 9000 }, owedBy: { me: 3000, ana: 3000, bia: 3000 } });
    expect(expenseNets(e)).toEqual({ me: 6000, ana: -3000, bia: -3000 });
    expect(expenseDebts(e)).toEqual([
      { from: "ana", to: "me", amount: 3000, currency: "BRL" },
      { from: "bia", to: "me", amount: 3000, currency: "BRL" },
    ]);
  });

  it("lida com vários pagadores", () => {
    const e = exp({ cost: 10000, paidBy: { me: 6000, ana: 4000 }, owedBy: { me: 2500, ana: 2500, bia: 2500, caio: 2500 } });
    const debts = expenseDebts(e);
    const total = debts.reduce((s, d) => s + d.amount, 0);
    expect(total).toBe(5000);
    expect(debts.every((d) => d.from === "bia" || d.from === "caio")).toBe(true);
  });

  it("compensa dívidas entre o mesmo par", () => {
    const list = [
      exp({ cost: 2000, paidBy: { me: 2000 }, owedBy: { me: 1000, ana: 1000 } }),
      exp({ cost: 600, paidBy: { ana: 600 }, owedBy: { me: 300, ana: 300 } }),
    ];
    expect(pairwiseDebts(list)).toEqual([{ from: "ana", to: "me", amount: 700, currency: "BRL" }]);
  });

  it("simplifica dívidas mantendo o saldo de cada um", () => {
    // ana deve 10 a bia, bia deve 10 a caio → simplificado: ana deve 10 a caio
    const list = [
      exp({ cost: 1000, paidBy: { bia: 1000 }, owedBy: { ana: 1000 } }),
      exp({ cost: 1000, paidBy: { caio: 1000 }, owedBy: { bia: 1000 } }),
    ];
    expect(pairwiseDebts(list)).toHaveLength(2);
    expect(simplifiedDebts(list)).toEqual([{ from: "ana", to: "caio", amount: 1000, currency: "BRL" }]);
  });

  it("monta o painel com valores a pagar e a receber", () => {
    const d = ds();
    const list = [
      exp({ cost: 9000, paidBy: { me: 9000 }, owedBy: { me: 3000, ana: 3000, bia: 3000 } }),
      exp({ cost: 4000, paidBy: { caio: 4000 }, owedBy: { me: 2000, caio: 2000 } }),
      exp({ cost: 1000, currency: "USD", paidBy: { ana: 1000 }, owedBy: { me: 500, ana: 500 } }),
    ];
    for (const e of list) d.expenses[e.id] = e;
    const l = buildLedger(d);
    expect(l.friendBalance.get("ana")).toEqual({ BRL: 3000, USD: -500 });
    expect(l.friendBalance.get("caio")).toEqual({ BRL: -2000 });
    expect(l.owed).toEqual({ BRL: 6000 });
    expect(l.owe).toEqual({ BRL: -2000, USD: -500 });
    expect(l.total).toEqual({ BRL: 4000, USD: -500 });
    expect(memberBalance(l, "g1", "me")).toEqual({ BRL: 4000, USD: -500 });
  });

  it("ignora despesas excluídas e grupos excluídos", () => {
    const d = ds();
    const a = exp({ cost: 1000, paidBy: { me: 1000 }, owedBy: { ana: 1000 }, deletedAt: "2026-10-02T00:00:00Z" });
    const b = exp({ cost: 1000, paidBy: { me: 1000 }, owedBy: { ana: 1000 }, groupId: null });
    d.expenses[a.id] = a;
    d.expenses[b.id] = b;
    expect(buildLedger(d).total).toEqual({ BRL: 1000 });
    d.groups.g1.deletedAt = "2026-10-03T00:00:00Z";
    const c = exp({ cost: 500, paidBy: { me: 500 }, owedBy: { ana: 500 } });
    d.expenses[c.id] = c;
    expect(buildLedger(d).total).toEqual({ BRL: 1000 });
  });

  it("mantém as somas consistentes em cenários aleatórios", () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const people = ["me", "ana", "bia", "caio"];
    for (let round = 0; round < 50; round++) {
      const d = ds();
      d.groups.g1.simplifyDebts = round % 2 === 0;
      for (let i = 0; i < 12; i++) {
        const cost = 1 + Math.floor(rnd() * 50000);
        const parts = people.filter(() => rnd() > 0.3);
        if (!parts.length) parts.push("ana");
        const payer = people[Math.floor(rnd() * people.length)];
        const e = exp({
          cost, paidBy: { [payer]: cost }, owedBy: splitEqual(cost, parts),
          groupId: rnd() > 0.5 ? "g1" : null, currency: rnd() > 0.8 ? "USD" : "BRL",
        });
        d.expenses[e.id] = e;
      }
      const l = buildLedger(d);
      // o saldo total é a soma do que eu paguei menos o que eu devo
      const mine: Record<string, number> = {};
      for (const e of l.active) mine[e.currency] = (mine[e.currency] || 0) + (e.paidBy.me || 0) - (e.owedBy.me || 0);
      expect(l.total).toEqual(Object.fromEntries(Object.entries(mine).filter(([, v]) => v)));
      // simplificação não muda o saldo de ninguém
      const g = l.active.filter((e) => e.groupId === "g1");
      for (const cur of ["BRL", "USD"]) {
        const nets: Record<string, number> = {};
        for (const e of g.filter((x) => x.currency === cur))
          for (const [id, v] of Object.entries(expenseNets(e))) nets[id] = (nets[id] || 0) + v;
        const fromDebts: Record<string, number> = {};
        for (const dd of simplifiedDebts(g).filter((x) => x.currency === cur)) {
          fromDebts[dd.from] = (fromDebts[dd.from] || 0) - dd.amount;
          fromDebts[dd.to] = (fromDebts[dd.to] || 0) + dd.amount;
        }
        for (const id of people) expect(fromDebts[id] || 0).toBe(nets[id] || 0);
        expect(simplifiedDebts(g).filter((x) => x.currency === cur).length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("settleNets gera no máximo n-1 pagamentos", () => {
    expect(settleNets({ a: 500, b: 300, c: -400, d: -400 }, "BRL")).toHaveLength(3);
    expect(settleNets({}, "BRL")).toEqual([]);
  });
});

describe("datas e recorrência", () => {
  it("soma meses limitando ao fim do mês", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(occurrenceDate("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(occurrenceDate("2026-10-01", "biweekly", 2)).toBe("2026-10-29");
  });

  it("gera as ocorrências vencidas de uma despesa recorrente", () => {
    const d = ds();
    const e = exp({
      cost: 100000, paidBy: { me: 100000 }, owedBy: { me: 50000, ana: 50000 }, repeat: "monthly",
      date: "2026-08-05", seriesId: "rent", seriesStart: "2026-08-05", seriesIndex: 0, description: "Aluguel",
    });
    d.expenses[e.id] = e;
    const { created, updated } = dueRecurring(d, "2026-10-16", "2026-10-16T12:00:00.000Z");
    expect(created.map((x) => x.date)).toEqual(["2026-09-05", "2026-10-05"]);
    expect(created[0].repeatDone).toBe(true);
    expect(created[1].repeatDone).toBe(false);
    expect(updated).toHaveLength(1);
    expect(updated[0].repeatDone).toBe(true);
    expect(created[1].id).toBe("r_rent_2026-10-05");
  });

  it("formata datas relativas", () => {
    const now = new Date(2026, 9, 16, 15, 0);
    expect(relativeTime(new Date(2026, 9, 16, 14, 58).toISOString(), now)).toBe("há 2 min");
    expect(relativeTime(new Date(2026, 9, 16, 9, 5).toISOString(), now)).toBe("hoje às 09:05");
    expect(relativeTime(new Date(2026, 9, 15, 9, 5).toISOString(), now)).toBe("ontem às 09:05");
    expect(formatDateShort("2026-10-01", "2026-10-16")).toBe("1 de out.");
    expect(formatDateShort("2025-10-01", "2026-10-16")).toBe("1 de out. de 2025");
  });
});

describe("outros", () => {
  it("sugere categorias pela descrição", () => {
    expect(suggestCategory("Uber pro aeroporto")).toBe("transport.taxi");
    expect(suggestCategory("Conta de água")).toBe("utilities.water");
    expect(suggestCategory("Ônibus")).toBe("transport.bus");
    expect(suggestCategory("Supermercado do mês")).toBe("food.groceries");
    expect(suggestCategory("qualquer coisa")).toBeNull();
  });

  it("exporta CSV no formato do Splitwise", () => {
    const d = ds();
    const e = exp({ cost: 9000, paidBy: { me: 9000 }, owedBy: { me: 3000, ana: 3000, bia: 3000 }, description: "Jantar; vinho" });
    d.expenses[e.id] = e;
    const csv = expensesToCsv(d, [e], ["me", "ana", "bia"]);
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines[0]).toBe("Data;Descrição;Categoria;Custo;Moeda;Eu;Ana;Bia");
    expect(lines[1]).toBe('01/10/2026;"Jantar; vinho";Geral;90,00;BRL;60,00;-30,00;-30,00');
    expect(lines[3]).toBe(";Saldo total;;;BRL;60,00;-30,00;-30,00");
  });
});
