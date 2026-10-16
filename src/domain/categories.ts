/** Categorias iguais às do Splitwise, traduzidas. */
export interface Category {
  key: string;
  label: string;
  parent: string;
}

export interface CategoryGroup {
  key: string;
  label: string;
  color: string;
  items: Category[];
}

const g = (key: string, label: string, color: string, items: [string, string][]): CategoryGroup => ({
  key,
  label,
  color,
  items: items.map(([k, l]) => ({ key: `${key}.${k}`, label: l, parent: key })),
});

export const CATEGORY_GROUPS: CategoryGroup[] = [
  g("entertainment", "Entretenimento", "#8656cd", [
    ["games", "Jogos"],
    ["movies", "Filmes"],
    ["music", "Música"],
    ["sports", "Esportes"],
    ["other", "Outros"],
  ]),
  g("food", "Comida e bebida", "#3fae8c", [
    ["dining", "Restaurantes"],
    ["groceries", "Mercado"],
    ["liquor", "Bebidas alcoólicas"],
    ["other", "Outros"],
  ]),
  g("home", "Casa", "#e27d3e", [
    ["electronics", "Eletrônicos"],
    ["furniture", "Móveis"],
    ["supplies", "Utilidades domésticas"],
    ["maintenance", "Manutenção"],
    ["mortgage", "Financiamento"],
    ["pets", "Animais de estimação"],
    ["rent", "Aluguel"],
    ["services", "Serviços"],
    ["other", "Outros"],
  ]),
  g("life", "Vida", "#d9534f", [
    ["childcare", "Cuidados infantis"],
    ["clothing", "Roupas"],
    ["education", "Educação"],
    ["gifts", "Presentes"],
    ["insurance", "Seguros"],
    ["medical", "Saúde"],
    ["taxes", "Impostos"],
    ["other", "Outros"],
  ]),
  g("transport", "Transporte", "#3d8fd1", [
    ["bicycle", "Bicicleta"],
    ["bus", "Ônibus/metrô/trem"],
    ["car", "Carro"],
    ["fuel", "Combustível"],
    ["hotel", "Hospedagem"],
    ["parking", "Estacionamento"],
    ["plane", "Avião"],
    ["taxi", "Táxi/aplicativo"],
    ["other", "Outros"],
  ]),
  g("utilities", "Contas da casa", "#5a6f84", [
    ["cleaning", "Limpeza"],
    ["electricity", "Energia elétrica"],
    ["gas", "Gás"],
    ["trash", "Lixo"],
    ["internet", "TV/telefone/internet"],
    ["water", "Água"],
    ["other", "Outros"],
  ]),
  g("uncategorized", "Sem categoria", "#9aa3ad", [["general", "Geral"]]),
];

export const DEFAULT_CATEGORY = "uncategorized.general";
export const PAYMENT_CATEGORY = "payment";

const BY_KEY = new Map<string, Category>();
for (const grp of CATEGORY_GROUPS) for (const c of grp.items) BY_KEY.set(c.key, c);

export function categoryOf(key: string): Category {
  if (key === PAYMENT_CATEGORY) return { key, label: "Pagamento", parent: "payment" };
  return BY_KEY.get(key) || BY_KEY.get(DEFAULT_CATEGORY)!;
}

export function categoryGroupOf(key: string): CategoryGroup | undefined {
  return CATEGORY_GROUPS.find((x) => x.key === categoryOf(key).parent);
}

export function categoryColor(key: string): string {
  if (key === PAYMENT_CATEGORY) return "#5bc5a7";
  return categoryGroupOf(key)?.color || "#9aa3ad";
}

/** Nome completo: "Comida e bebida – Mercado". */
export function categoryFullLabel(key: string): string {
  const c = categoryOf(key);
  const grp = categoryGroupOf(key);
  if (!grp || grp.items.length === 1) return c.label;
  return `${grp.label} – ${c.label}`;
}

const KEYWORDS: [RegExp, string][] = [
  [/\b(uber|99|99pop|taxi|cabify|corrida)\b/, "transport.taxi"],
  [/\b(gasolina|combustivel|etanol|diesel|posto|abastec)/, "transport.fuel"],
  [/\b(estacionamento|zona azul|valet)\b/, "transport.parking"],
  [/\b(passagens?|voo|aereo|aereas?|latam|gol|azul|aviao)\b/, "transport.plane"],
  [/\b(onibus|metro|trem|brt|bilhete unico|rodoviaria)\b/, "transport.bus"],
  [/\b(hotel|hostel|pousada|airbnb|hospedagem|booking)\b/, "transport.hotel"],
  [/\b(pedagio|oficina|mecanico|ipva|lavagem|lava.jato|carro)\b/, "transport.car"],
  [/\b(bike|bicicleta)\b/, "transport.bicycle"],
  [/\b(mercado|supermercado|feira|hortifruti|acougue|padaria|atacadao|assai)\b/, "food.groceries"],
  [/\b(cerveja|chopp?|vinho|bar|cachaca|drinks?|caipirinha|whisky|vodka)\b/, "food.liquor"],
  [/\b(restaurante|jantar|almoco|lanche|pizza|hamburguer|ifood|cafe|sushi|churrasco|rodizio|acai|sorvete|marmita)\b/, "food.dining"],
  [/\b(aluguel|condominio)\b/, "home.rent"],
  [/\b(financiamento|prestacao da casa)\b/, "home.mortgage"],
  [/\b(moveis?|sofa|cama|mesa|cadeira|armario)\b/, "home.furniture"],
  [/\b(tv|televisao|celular|notebook|computador|geladeira|fogao|eletronicos?)\b/, "home.electronics"],
  [/\b(pet|racao|veterinari[oa]|cachorro|gato)\b/, "home.pets"],
  [/\b(faxina|diarista|limpeza)\b/, "utilities.cleaning"],
  [/\b(luz|energia|enel|cemig|copel|celpe|coelba|neoenergia)\b/, "utilities.electricity"],
  [/\b(agua|saneamento|sabesp|caesb|cedae|copasa)\b/, "utilities.water"],
  [/\b(gas|botijao)\b/, "utilities.gas"],
  [/\b(internet|wi.?fi|vivo|tim|netflix|spotify|streaming|telefone)\b/, "utilities.internet"],
  [/\b(cinema|filme)\b/, "entertainment.movies"],
  [/\b(show|ingressos?|festival|musica)\b/, "entertainment.music"],
  [/\b(jogo|game|steam|playstation|xbox)\b/, "entertainment.games"],
  [/\b(futebol|academia|esporte|quadra|beach tennis|tenis)\b/, "entertainment.sports"],
  [/\b(presente|aniversario|vaquinha)\b/, "life.gifts"],
  [/\b(farmacia|remedio|medico|consulta|exame|hospital|dentista|plano de saude)\b/, "life.medical"],
  [/\b(roupas?|camisa|calca|sapato|vestido)\b/, "life.clothing"],
  [/\b(escola|curso|faculdade|livros?|material escolar|mensalidade)\b/, "life.education"],
  [/\b(seguro)\b/, "life.insurance"],
  [/\b(imposto|iptu|darf)\b/, "life.taxes"],
  [/\b(baba|creche|fraldas?)\b/, "life.childcare"],
];

/** Sugere a categoria pela descrição, como o Splitwise faz ao digitar. */
export function suggestCategory(description: string): string | null {
  const s = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [re, key] of KEYWORDS) if (re.test(s)) return key;
  return null;
}
