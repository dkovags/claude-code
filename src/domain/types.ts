export type ID = string;

/** Valor em unidades menores da moeda (centavos no caso do real). Sempre inteiro. */
export type Cents = number;

/** Saldo separado por moeda, por exemplo { BRL: 1234, USD: -500 }. */
export type Balance = Record<string, Cents>;

export interface Person {
  id: ID;
  name: string;
  email?: string;
  /** Índice da paleta de cores do avatar. */
  color: number;
  createdAt: string;
  createdBy?: ID;
  /** Amizade removida: a pessoa some da lista de amigos, mas continua nos grupos e despesas antigas. */
  hidden?: boolean;
}

export type GroupType = "home" | "trip" | "couple" | "other";

export type HistoryType =
  | "created"
  | "updated"
  | "deleted"
  | "restored"
  | "member_added"
  | "member_removed";

export interface HistoryEntry {
  ts: string;
  by: ID;
  type: HistoryType;
  /** Descrições legíveis do que mudou. */
  changes?: string[];
  /** Pessoa afetada (entrada/saída de membro). */
  personId?: ID;
  /** Criada automaticamente (despesa recorrente). */
  auto?: boolean;
}

export interface Group {
  id: ID;
  name: string;
  type: GroupType;
  memberIds: ID[];
  simplifyDebts: boolean;
  currency: string;
  createdAt: string;
  createdBy: ID;
  deletedAt?: string;
  deletedBy?: ID;
  history: HistoryEntry[];
}

export type SplitMode = "equal" | "exact" | "percent" | "shares" | "adjust";

export type Repeat = "never" | "weekly" | "biweekly" | "monthly" | "yearly";

export interface Comment {
  id: ID;
  by: ID;
  text: string;
  ts: string;
  deletedAt?: string;
}

export interface Expense {
  id: ID;
  groupId: ID | null;
  /** true quando é um acerto de contas (pagamento entre duas pessoas). */
  payment: boolean;
  description: string;
  cost: Cents;
  currency: string;
  /** Data da despesa no formato AAAA-MM-DD. */
  date: string;
  category: string;
  /** Quanto cada pessoa pagou. A soma é igual a cost. */
  paidBy: Record<ID, Cents>;
  /** Quanto cada pessoa deve (a parte de cada um). A soma é igual a cost. */
  owedBy: Record<ID, Cents>;
  splitMode: SplitMode;
  /** Valores digitados no modo de divisão (porcentagens, partes, ajustes ou valores), para reabrir a edição. */
  splitValues?: Record<ID, number>;
  notes?: string;
  repeat: Repeat;
  seriesId?: ID;
  seriesIndex?: number;
  seriesStart?: string;
  /** A próxima ocorrência desta despesa recorrente já foi gerada. */
  repeatDone?: boolean;
  createdAt: string;
  createdBy: ID;
  updatedAt?: string;
  updatedBy?: ID;
  deletedAt?: string;
  deletedBy?: ID;
  history: HistoryEntry[];
  comments: Comment[];
}

export type Theme = "auto" | "light" | "dark";

export interface Prefs {
  currency: string;
  theme: Theme;
}

export interface Dataset {
  version: 1;
  meId: ID;
  people: Record<ID, Person>;
  groups: Record<ID, Group>;
  expenses: Record<ID, Expense>;
  prefs: Prefs;
}

export interface Debt {
  from: ID;
  to: ID;
  amount: Cents;
  currency: string;
}
