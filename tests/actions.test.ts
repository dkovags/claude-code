import { describe, expect, it } from "vitest";
import { buildFeed } from "../src/domain/activity";
import { buildLedger } from "../src/domain/balances";
import { splitEqual } from "../src/domain/split";
import * as A from "../src/store/actions";
import { createDataset, normalizeDataset, toBackup } from "../src/store/dataset";
import { LocalStore, MemoryStorage, run } from "../src/store/store";
import { initialState } from "../src/ui/dialogs/ExpenseDialog";

let n = 0;
const ctxBase = () => ({ now: new Date(Date.UTC(2026, 9, 16, 12, 0, n++)).toISOString(), today: "2026-10-16", id: (p = "") => `${p}${++n}` });

function setup() {
  const store = new LocalStore(new MemoryStorage());
  store.replace(createDataset(ctxBase(), { name: "Diego", email: "diego@example.com", currency: "BRL" }));
  const ana = run(store, A.addPerson, { name: "Ana", email: "ana@example.com" });
  const bia = run(store, A.addPerson, { name: "Bia" });
  const me = store.getSnapshot()!.meId;
  return { store, me, ana, bia };
}

describe("ações", () => {
  it("impede amigos duplicados pelo e-mail", () => {
    const { store } = setup();
    expect(() => run(store, A.addPerson, { name: "Outra Ana", email: "ANA@example.com" })).toThrow(/já está/);
    expect(() => run(store, A.addPerson, { name: "Eu", email: "diego@example.com" })).toThrow(/seu próprio/);
    expect(() => run(store, A.addPerson, { name: " " })).toThrow(/nome/);
  });

  it("cria grupo, lança despesa e acerta as contas", () => {
    const { store, me, ana, bia } = setup();
    const g = run(store, A.createGroup, { name: "Casa", type: "home", currency: "BRL", simplifyDebts: true, memberIds: [ana, bia] });
    const ds1 = store.getSnapshot()!;
    expect(ds1.groups[g].memberIds).toEqual([me, ana, bia]);

    run(store, A.saveExpense, {
      groupId: g, description: "Mercado", cost: 30000, currency: "BRL", date: "2026-10-10", category: "food.groceries",
      paidBy: { [me]: 30000 }, owedBy: splitEqual(30000, [me, ana, bia]), splitMode: "equal", repeat: "never",
    });
    let l = buildLedger(store.getSnapshot()!);
    expect(l.total).toEqual({ BRL: 20000 });
    expect(l.friendBalance.get(ana)).toEqual({ BRL: 10000 });

    // não dá para remover a Ana com saldo em aberto
    expect(() => run(store, A.removeMember, g, ana)).toThrow(/saldo/);

    run(store, A.recordPayments, [{ from: ana, to: me, amount: 10000, currency: "BRL", date: "2026-10-16", groupId: g }]);
    l = buildLedger(store.getSnapshot()!);
    expect(l.friendBalance.get(ana) || {}).toEqual({});
    expect(l.total).toEqual({ BRL: 10000 });
    run(store, A.removeMember, g, ana);
    expect(store.getSnapshot()!.groups[g].memberIds).toEqual([me, bia]);
  });

  it("valida despesas inconsistentes", () => {
    const { store, me, ana } = setup();
    const base = {
      groupId: null, description: "X", cost: 1000, currency: "BRL", date: "2026-10-10", category: "uncategorized.general",
      paidBy: { [me]: 1000 }, owedBy: { [me]: 500, [ana]: 500 }, splitMode: "equal" as const, repeat: "never" as const,
    };
    expect(() => run(store, A.saveExpense, { ...base, description: "" })).toThrow(/descrição/);
    expect(() => run(store, A.saveExpense, { ...base, owedBy: { [me]: 500, [ana]: 400 } })).toThrow(/divisão/);
    expect(() => run(store, A.saveExpense, { ...base, paidBy: { [me]: 900 } })).toThrow(/pago/);
    expect(() => run(store, A.saveExpense, { ...base, date: "2026-02-30" })).toThrow(/Data/);
    expect(run(store, A.saveExpense, base)).toBeTruthy();
  });

  it("registra histórico de edição, exclusão e restauração", () => {
    const { store, me, ana } = setup();
    const id = run(store, A.saveExpense, {
      groupId: null, description: "Pizza", cost: 8000, currency: "BRL", date: "2026-10-10", category: "food.dining",
      paidBy: { [me]: 8000 }, owedBy: { [me]: 4000, [ana]: 4000 }, splitMode: "equal", repeat: "never",
    });
    const e0 = store.getSnapshot()!.expenses[id];
    run(store, A.saveExpense, { ...e0, cost: 9000, paidBy: { [me]: 9000 }, owedBy: { [me]: 4500, [ana]: 4500 } }, id);
    // salvar sem mudar nada não gera histórico
    run(store, A.saveExpense, { ...store.getSnapshot()!.expenses[id] }, id);
    run(store, A.deleteExpense, id);
    expect(buildLedger(store.getSnapshot()!).total).toEqual({});
    run(store, A.restoreExpense, id);
    run(store, A.addComment, id, "Valeu!");
    const e = store.getSnapshot()!.expenses[id];
    expect(e.history.map((h) => h.type)).toEqual(["created", "updated", "deleted", "restored"]);
    expect(e.history[1].changes).toEqual(["valor de R$\u00a080,00 para R$\u00a090,00"]);
    expect(e.comments).toHaveLength(1);
    const feed = buildFeed(store.getSnapshot()!);
    expect(feed[0].kind).toBe("comment");
    expect(buildLedger(store.getSnapshot()!).total).toEqual({ BRL: 4500 });
  });

  it("gera ocorrências de despesas recorrentes uma única vez", () => {
    const { store, me, ana } = setup();
    run(store, A.saveExpense, {
      groupId: null, description: "Netflix", cost: 4000, currency: "BRL", date: "2026-08-20", category: "utilities.internet",
      paidBy: { [me]: 4000 }, owedBy: { [me]: 2000, [ana]: 2000 }, splitMode: "equal", repeat: "monthly",
    });
    // hoje (no contexto do teste) é 16/10/2026: deve gerar 20/09 apenas
    expect(run(store, A.spawnRecurring)).toBe(1);
    expect(run(store, A.spawnRecurring)).toBe(0);
    const dates = Object.values(store.getSnapshot()!.expenses).map((e) => e.date).sort();
    expect(dates).toEqual(["2026-08-20", "2026-09-20"]);
  });

  it("não remove amigo com saldo e exporta/importa backup", () => {
    const { store, me, ana } = setup();
    run(store, A.saveExpense, {
      groupId: null, description: "Cinema", cost: 6000, currency: "BRL", date: "2026-10-10", category: "entertainment.movies",
      paidBy: { [ana]: 6000 }, owedBy: { [me]: 3000, [ana]: 3000 }, splitMode: "equal", repeat: "never",
    });
    expect(() => run(store, A.setFriendHidden, ana, true)).toThrow(/saldo/);
    const restored = normalizeDataset(JSON.parse(toBackup(store.getSnapshot()!)));
    expect(restored).toEqual(store.getSnapshot());
    expect(() => normalizeDataset({ foo: 1 })).toThrow();
  });

  it("identifica pelo e-mail e renomeia quando a pessoa ganha um e-mail", () => {
    const { store, me, ana, bia } = setup();
    expect(me).toBe("m:diego@example.com");
    expect(ana).toBe("m:ana@example.com");
    expect(bia.startsWith("p_")).toBe(true);
    const g = run(store, A.createGroup, { name: "Casa", type: "home", currency: "BRL", simplifyDebts: false, memberIds: [ana, bia] });
    const e = run(store, A.saveExpense, {
      groupId: g, description: "Gás", cost: 9000, currency: "BRL", date: "2026-10-10", category: "utilities.gas",
      paidBy: { [bia]: 9000 }, owedBy: splitEqual(9000, [me, ana, bia]), splitMode: "equal", repeat: "never",
    });
    run(store, A.addComment, e, "Obrigado, Bia!");
    const before = buildLedger(store.getSnapshot()!).friendBalance.get(bia);
    const newId = run(store, A.updatePerson, bia, { name: "Bia", email: "Bia@Example.com" });
    expect(newId).toBe("m:bia@example.com");
    const ds = store.getSnapshot()!;
    expect(ds.people[bia]).toBeUndefined();
    expect(ds.people[newId].email).toBe("bia@example.com");
    expect(ds.groups[g].memberIds).toContain(newId);
    expect(Object.keys(ds.expenses[e].paidBy)).toEqual([newId]);
    expect(buildLedger(ds).friendBalance.get(newId)).toEqual(before);
    // o próprio usuário trocando de e-mail
    const meNew = run(store, A.updatePerson, me, { name: "Diego", email: "diego@novo.com" });
    const ds2 = store.getSnapshot()!;
    expect(ds2.meId).toBe(meNew);
    expect(ds2.groups[g].memberIds[0]).toBe(meNew);
    expect(ds2.groups[g].createdBy).toBe(meNew);
    expect(ds2.expenses[e].comments[0].by).toBe(meNew);
    expect(buildLedger(ds2).total).toEqual({ BRL: -3000 });
  });

  it("mantém quem saiu do grupo ao editar uma despesa antiga", () => {
    const { store, me, ana, bia } = setup();
    const g = run(store, A.createGroup, { name: "Casa", type: "home", currency: "BRL", simplifyDebts: false, memberIds: [ana, bia] });
    const e = run(store, A.saveExpense, {
      groupId: g, description: "Pizza", cost: 9000, currency: "BRL", date: "2026-10-10", category: "food.dining",
      paidBy: { [me]: 9000 }, owedBy: splitEqual(9000, [me, ana, bia]), splitMode: "equal", repeat: "never",
    });
    run(store, A.recordPayments, [{ from: bia, to: me, amount: 3000, currency: "BRL", date: "2026-10-11", groupId: g }]);
    run(store, A.removeMember, g, bia);
    const cur = store.getSnapshot()!.expenses[e];
    run(store, A.saveExpense, { ...cur, description: "Pizza de sexta" }, e);
    expect(store.getSnapshot()!.expenses[e].owedBy[bia]).toBe(3000);
    // mas não dá para incluir quem nunca esteve na despesa e não é do grupo
    const carla = run(store, A.addPerson, { name: "Carla" });
    expect(() =>
      run(store, A.saveExpense, { ...cur, owedBy: { [me]: 3000, [ana]: 3000, [carla]: 3000 } }, e),
    ).toThrow(/não participa/);
  });

  it("formulário de edição não inclui você numa despesa da qual você não participa", () => {
    const { store, ana, bia, me } = setup();
    const e = run(store, A.saveExpense, {
      groupId: null, description: "Táxi", cost: 4000, currency: "BRL", date: "2026-10-10", category: "transport.taxi",
      paidBy: { [ana]: 4000 }, owedBy: { [ana]: 2000, [bia]: 2000 }, splitMode: "equal", repeat: "never",
    });
    const ds = store.getSnapshot()!;
    const init = initialState(ds, ds.expenses[e]);
    expect(init.friends.sort()).toEqual([ana, bia].sort());
    expect(init.excluded).toEqual([me]);
    expect(init.payerId).toBe(ana);
  });

  it("guarda a chave Pix", () => {
    const { store, me } = setup();
    const caio = run(store, A.addPerson, { name: "Caio", pix: " caio@pix.com " });
    expect(store.getSnapshot()!.people[caio].pix).toBe("caio@pix.com");
    run(store, A.updatePerson, me, { name: "Diego", email: "diego@example.com", pix: "123.456.789-00" });
    expect(store.getSnapshot()!.people[me].pix).toBe("123.456.789-00");
    run(store, A.updatePerson, me, { name: "Diego", email: "diego@example.com", pix: "" });
    expect(store.getSnapshot()!.people[me].pix).toBeUndefined();
  });

  it("guarda uma cópia quando os dados salvos estão corrompidos", () => {
    const storage = new MemoryStorage();
    storage.setItem("rateio:data:v1", "{quebrado");
    const s = new LocalStore(storage);
    expect(s.getSnapshot()).toBeNull();
    expect(s.corrupted).toBe("{quebrado");
  });
});
