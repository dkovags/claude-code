import { classifyText, docTypeFromLabel } from "./analysis";
import { CNJ_RE, formatCnj, parseCnj } from "./cnj";
import { DOC_TYPES } from "./labels";
import type { DocType, Pole } from "./types";
import { findDates, fold, isUpper, parseMoney, squash, titleCase } from "./text";

// Leitura do PDF do processo inteiro baixado do sistema do tribunal ("processo integral").
// PJe: capa com os dados do processo, partes e índice de documentos; cada página tem o carimbo "Num. <Id> - Pág. <n>".
// e-SAJ: cada página traz na margem "assinado digitalmente por ..., protocolado em ..., código <X>".
// Outros formatos: o arquivo inteiro vira um documento (continua pesquisável página por página).

export interface FileParty {
  name: string;
  role: string;
  pole: Pole;
  lawyers: string[];
}

export interface FileDoc {
  courtId?: string;
  title: string;
  type: DocType;
  date?: string;
  signer?: string;
  /** Primeira e última página (1 = primeira). */
  pages: [number, number];
}

export interface CaseFileInfo {
  system?: string;
  number?: string;
  className?: string;
  body?: string;
  filedAt?: string;
  value?: number;
  subjects?: string;
  secret?: boolean;
  freeJustice?: boolean;
  parties: FileParty[];
  docs: FileDoc[];
}

const LAWYER_ROLES = /^(advogad[oa]|procurador[a]?|defensor[a]?( publico| publica)?|representante|curador[a]?|perit[oa])/;
const ACTIVE = /^(autor|autora|paciente|requerente|reclamante|exequente|impetrante|apelante|agravante|embargante|recorrente|demandante|querelante|promovente|denunciante|suscitante|polo ativo|ativo)/;
const PASSIVE = /^(reu|re|requerid|reclamad|executad|impetrad|apelad|agravad|embargad|recorrid|demandad|querelad|promovid|denunciad|acusad|suscitad|autoridade coatora|polo passivo|passivo)/;

export function poleOfRole(role: string): Pole {
  const r = fold(role).trim();
  if (ACTIVE.test(r)) return "ativo";
  if (PASSIVE.test(r)) return "passivo";
  return "terceiro";
}

/** "MARIA (AUTOR) JOSÉ ADV (ADVOGADO)" → pares nome e papel, na ordem. */
function pairs(line: string): { name: string; role: string }[] {
  const out: { name: string; role: string }[] = [];
  for (const m of line.matchAll(/([^()]+?)\s*\(([^()]{2,60})\)/g)) {
    const name = squash(m[1]).replace(/^[-–,;:]\s*/, "");
    if (name.length >= 2) out.push({ name, role: squash(m[2]) });
  }
  return out;
}

// Tipos de documento do PJe, para separar "nome" e "tipo" nas linhas do índice (do mais longo ao mais curto).
const PJE_TYPES = [
  "Petição Inicial Anexos", "Petição Inicial", "Petição Intercorrente", "Petição", "Procuração", "Substabelecimento",
  "Documento de Identificação", "Documento de Comprovação", "Comprovante de Residência", "Outros Documentos", "Documento Diverso",
  "Contestação", "Réplica", "Manifestação", "Decisão", "Despacho", "Sentença", "Acórdão", "Ementa", "Relatório", "Voto",
  "Certidão", "Intimação", "Citação", "Notificação", "Mandado", "Ato Ordinatório", "Ata da Audiência", "Termo de Audiência",
  "Laudo Pericial", "Laudo", "Parecer", "Apelação", "Contrarrazões", "Embargos de Declaração", "Agravo de Instrumento",
  "Agravo Interno", "Recurso Inominado", "Recurso Ordinário", "Recurso", "Guia de Custas", "Custas", "Comprovante",
  "Pedido de Habilitação", "Habilitação", "Informação", "Ofício", "Alvará", "Carta", "Edital", "Termo", "Cálculo",
  "Planilha de Cálculos", "Documento",
].sort((a, b) => b.length - a.length);

/** Separa "Contestação Banco Contestação" em nome e tipo. */
function splitNameType(rest: string): { title: string; typeLabel?: string } {
  const r = squash(rest);
  const fr = fold(r);
  for (const t of PJE_TYPES) {
    const ft = fold(t);
    if (fr.endsWith(" " + ft) || fr === ft) {
      const title = squash(r.slice(0, r.length - t.length));
      return { title: title || t, typeLabel: t };
    }
  }
  // nome e tipo repetidos ("Decisão Decisão")
  const words = r.split(" ");
  if (words.length % 2 === 0) {
    const half = words.length / 2;
    if (fold(words.slice(0, half).join(" ")) === fold(words.slice(half).join(" "))) return { title: words.slice(0, half).join(" "), typeLabel: words.slice(half).join(" ") };
  }
  return { title: r };
}

/** Valor depois de um rótulo na capa ("Classe: PROCEDIMENTO COMUM CÍVEL"). */
function field(lines: string[], label: RegExp): string | undefined {
  for (const line of lines) {
    const f = fold(line);
    const m = f.match(label);
    if (!m) continue;
    const v = line.slice(m.index! + m[0].length).replace(/^\s*\??\s*:?\s*/, "").trim();
    if (v) return v;
  }
  return undefined;
}

const PJE_STAMP = /Num\.\s*(\d{4,14})\s*-\s*P[áa]g\.\s*(\d+)/;
const PJE_SIGNED = /Assinado eletronicamente por:\s*(.+?)\s*-\s*(\d{2}\/\d{2}\/\d{4})/;
const ESAJ_CODE = /c[óo]digo\s+([0-9A-Za-z]{6,})/;
const ESAJ_SIGNED = /assinado digitalmente por\s+(.+?)(?:\s+e\s+Tribunal|,)[^]*?(?:protocolado|liberado nos autos digitais|liberado nos autos)\s+em\s+(\d{2}\/\d{2}\/\d{4})/i;

function parsePjeCover(pages: string[], info: CaseFileInfo) {
  // a capa e o índice ocupam as primeiras páginas, antes do primeiro carimbo
  const cover: string[] = [];
  for (const p of pages) {
    if (PJE_STAMP.test(p)) break;
    cover.push(...p.split("\n"));
  }
  if (!cover.length) cover.push(...(pages[0] || "").split("\n"));
  const num = field(cover, /^\s*numero( do processo)?\s*:/);
  if (num) {
    const c = parseCnj((num.match(CNJ_RE) || [num])[0]);
    info.number = c ? formatCnj(c) : num;
  }
  const cls = field(cover, /^\s*classe\s*:/);
  if (cls) info.className = isUpper(cls) ? titleCase(cls) : cls;
  info.body = field(cover, /^\s*orgao julgador( colegiado)?\s*:/) ?? info.body;
  const dist = field(cover, /^\s*(ultima distribuicao|data da distribuicao|distribuicao|autuacao)\s*:/);
  if (dist) info.filedAt = findDates(dist)[0]?.iso;
  const value = field(cover, /^\s*valor da causa\s*:/);
  if (value) info.value = parseMoney(value) ?? undefined;
  const subjects = field(cover, /^\s*assuntos?\s*:/);
  if (subjects) info.subjects = isUpper(subjects) ? titleCase(subjects) : subjects;
  const secret = field(cover, /^\s*segredo de justica\s*/);
  if (secret) info.secret = /^sim/i.test(fold(secret));
  const free = field(cover, /^\s*justica gratuita\s*/);
  if (free) info.freeJustice = /^sim/i.test(fold(free));

  // partes: entre o cabeçalho "Partes" e "Documentos"
  let inParties = false;
  for (const line of cover) {
    const f = fold(line).trim();
    if (/^partes\b/.test(f)) {
      inParties = true;
      continue;
    }
    if (/^documentos\b/.test(f) || /^id\.?\s+data/.test(f)) inParties = false;
    if (!inParties) continue;
    for (const { name, role } of pairs(line)) {
      const fr = fold(role);
      const last = info.parties[info.parties.length - 1];
      if (LAWYER_ROLES.test(fr)) {
        if (last) last.lawyers.push(titleCase(name));
      } else info.parties.push({ name: titleCase(name), role: titleCase(role), pole: poleOfRole(role), lawyers: [] });
    }
  }
}

interface IndexEntry {
  id: string;
  date: string;
  title: string;
  typeLabel?: string;
}

function parsePjeIndex(pages: string[]): Map<string, IndexEntry> {
  const out = new Map<string, IndexEntry>();
  for (const p of pages) {
    if (PJE_STAMP.test(p) && out.size) break;
    for (const line of p.split("\n")) {
      const m = line.trim().match(/^(\d{5,14})\s+(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?\s+(.+)$/);
      if (!m) continue;
      const date = findDates(m[2])[0]?.iso;
      if (!date) continue;
      out.set(m[1], { id: m[1], date, ...splitNameType(m[3]) });
    }
  }
  return out;
}

function parsePje(pages: string[], info: CaseFileInfo) {
  info.system = "PJe";
  parsePjeCover(pages, info);
  const index = parsePjeIndex(pages);
  let current: FileDoc | null = null;
  let currentId = "";
  let coverEnd = 0;
  pages.forEach((text, i) => {
    const page = i + 1;
    const m = text.match(PJE_STAMP);
    if (!m) {
      if (current) current.pages[1] = page;
      else coverEnd = page;
      return;
    }
    if (m[1] !== currentId || !current) {
      currentId = m[1];
      const entry = index.get(m[1]);
      const signed = text.match(PJE_SIGNED);
      const typeFromIndex = entry?.typeLabel ? docTypeFromLabel(entry.typeLabel) : undefined;
      const type = typeFromIndex && typeFromIndex !== "peticao" ? typeFromIndex : classifyText(text) !== "outro" ? classifyText(text) : typeFromIndex || "outro";
      current = {
        courtId: m[1],
        title: entry?.title || DOC_TYPES[type],
        type,
        date: entry?.date || (signed ? findDates(signed[2])[0]?.iso : undefined),
        signer: signed ? titleCase(signed[1]) : undefined,
        pages: [page, page],
      };
      info.docs.push(current);
    } else current.pages[1] = page;
  });
  if (coverEnd > 0) info.docs.unshift({ title: "Capa e índice do processo", type: "outro", pages: [1, coverEnd] });
}

function parseEsaj(pages: string[], info: CaseFileInfo) {
  info.system = "e-SAJ";
  let current: FileDoc | null = null;
  let code = "";
  pages.forEach((text, i) => {
    const page = i + 1;
    const m = text.match(ESAJ_CODE);
    if (!m) {
      if (current) current.pages[1] = page;
      return;
    }
    if (m[1] !== code || !current) {
      code = m[1];
      const signed = text.match(ESAJ_SIGNED);
      const type = classifyText(text);
      current = {
        courtId: m[1],
        title: DOC_TYPES[type],
        type,
        date: signed ? findDates(signed[2])[0]?.iso : undefined,
        signer: signed ? titleCase(signed[1]) : undefined,
        pages: [page, page],
      };
      info.docs.push(current);
    } else current.pages[1] = page;
  });
  const anyText = pages.join("\n");
  const proc = fold(anyText).match(/informe o processo\s+(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/);
  if (proc) info.number = proc[1];
}

/** Partes escritas como "Autor: FULANO" ou "Requerido: BANCO X" (petições, capas de outros sistemas). */
function partiesFromLabels(text: string): FileParty[] {
  const out: FileParty[] = [];
  const re = /^\s*(autor\w*|requerente\w*|reclamante\w*|exequente\w*|impetrante\w*|apelante\w*|agravante\w*|recorrente\w*|reu|re|reus|requerid\w*|reclamad\w*|executad\w*|impetrad\w*|apelad\w*|agravad\w*|recorrid\w*)\s*(?:\(s\)|\(a\)|\(as\))?\s*:\s*(.+)$/;
  for (const line of text.split("\n").slice(0, 400)) {
    const m = fold(line).match(re);
    if (!m) continue;
    const name = squash(line.slice(line.length - m[2].length)).replace(/\s*\(.*$/, "");
    if (name.length < 3 || name.length > 120) continue;
    if (!out.some((p) => fold(p.name) === fold(name))) out.push({ name: titleCase(name), role: titleCase(m[1]), pole: poleOfRole(m[1]), lawyers: [] });
  }
  return out;
}

/** Lê o texto das páginas do processo integral. */
export function parseCaseFile(pages: string[]): CaseFileInfo {
  const info: CaseFileInfo = { parties: [], docs: [] };
  const sample = pages.slice(0, 12).join("\n");
  if (pages.some((p) => PJE_STAMP.test(p))) parsePje(pages, info);
  else if (pages.filter((p) => ESAJ_CODE.test(p)).length >= Math.min(2, pages.length)) parseEsaj(pages, info);

  if (!info.number) {
    // número mais frequente nas primeiras páginas
    const count = new Map<string, number>();
    for (const m of sample.matchAll(CNJ_RE)) {
      const c = parseCnj(m[0]);
      if (c) count.set(formatCnj(c), (count.get(formatCnj(c)) || 0) + 1);
    }
    info.number = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  }
  if (!info.parties.length) info.parties = partiesFromLabels(sample);
  if (!info.docs.length) info.docs.push({ title: "Processo integral", type: "processo", pages: [1, Math.max(1, pages.length)] });
  return info;
}
