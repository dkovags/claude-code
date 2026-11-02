// Controles da Resolução 400: testes sobre objetos construídos aqui, nunca
// sobre a base real. Teste que depende de dado pessoal quebra quando o dado é
// corrigido, e foi exatamente o que aconteceu.
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage();
const erros = [];
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
await p.goto('file://' + process.cwd() + '/exemplo.html');
await p.waitForTimeout(1000);

const ok = [], falhou = [];
const t = (n, c, e = '') => (c ? ok : falhou).push(n + (e ? ' :: ' + e : ''));

const r = await p.evaluate(() => {
  const v = window.__voos;
  // voo sintético: tudo explícito, nada vindo da base
  const voo = (extra = {}) => Object.assign({
    id: 'x', data: '2028-06-01', localizador: 'ZZZ999', cidade: 'Porto',
    origem: 'VCP', horaIda: '19:15', destino: 'OPO', horaChegada: '09:20(+1)',
    companhia: 'Azul', voo: '8800', alterado: 'Alterado', forma: 'Viajanet',
    assento: '', ida: false, volta: false, antecipacao: '', conexoes: [],
    conexoesRaw: '', observacoes: '', aba: 'Voos', historico: [], conferidoEm: '',
    fonte: '', avisadoEm: '', original: null, internacional: null, decisao: '',
    decididoEm: '', tipoOcorrencia: 'alteracao_programada', atrasoMin: null,
  }, extra);
  const contratado = { data: '2028-06-01', horaIda: '19:50', horaChegada: '09:55(+1)', voo: '8800' };

  const comBase = voo({ original: contratado });
  const domestico = voo({ origem: 'BSB', destino: 'SLZ', horaIda: '19:15', horaChegada: '21:00',
    original: { data: '2028-06-01', horaIda: '19:50', horaChegada: '21:35', voo: '1' } });
  const noLimite = voo({ origem: 'BSB', destino: 'SLZ', horaIda: '20:20', horaChegada: '22:05',
    original: { data: '2028-06-01', horaIda: '19:50', horaChegada: '21:35', voo: '1' } });
  const atrasoCurto = voo({ tipoOcorrencia: 'atraso', atrasoMin: 65, original: contratado,
    avisadoEm: '2028-06-01T18:30' });
  const atrasoLongo = voo({ tipoOcorrencia: 'atraso', atrasoMin: 300, original: contratado });
  const avisoTarde = voo({ original: contratado, avisadoEm: '2028-05-31T20:00' });
  const avisoEmDia = voo({ original: contratado, avisadoEm: '2028-05-01T10:00' });
  const silencio = voo({ historico: [{ em: '2028-05-20', tipo: 'alteracao',
    texto: 'mudou', fonte: 'Consulta ao site da Azul' }] });
  const avisado = voo({ avisadoEm: '2028-05-01T10:00', original: contratado,
    historico: [{ em: '2028-05-01', tipo: 'alteracao', texto: 'mudou',
      fonte: 'Azul, e-mail de 01/05' }] });
  const redatado = voo({ data: '2029-02-01', original: contratado });
  const conexaoQuebrada = voo({ horaChegada: '10:55(+1)',
    original: { data: '2028-06-01', horaIda: '19:50', horaChegada: '09:55(+1)', voo: '8800' },
    conexoes: [{ iata: 'LIS', chegada: '10:00', partida: '10:50' }] });
  const conexaoNoite = voo({ horaChegada: '10:00(+1)',
    original: { data: '2028-06-01', horaIda: '19:50', horaChegada: '09:55(+1)', voo: '8800' },
    conexoes: [{ iata: 'LIS', chegada: '23:35', partida: '00:20' }] });
  const semBase = voo({ alterado: 'Remarcado', original: null });
  const limpo = voo({ alterado: 'Não', original: null });

  return {
    normaNova: v.regraDe('2026-11-02').norma, naoConferida: v.regraDe('2026-11-02').conferido,
    normaVelha: v.regraDe('2026-05-01').norma,
    intlVcpOpo: v.ehInternacional({ origem: 'VCP', destino: 'OPO' }),
    intlBsbSlz: v.ehInternacional({ origem: 'BSB', destino: 'SLZ' }),
    delta: v.controleDelta(comBase),
    limIntl: v.controleLimiar(comBase),
    limDom: v.controleLimiar(domestico),
    limNoLimite: v.controleLimiar(noLimite),
    limAtrasoCurto: v.controleLimiar(atrasoCurto),
    limAtrasoLongo: v.controleLimiar(atrasoLongo),
    anteTarde: v.controleAntecedencia(avisoTarde),
    anteEmDia: v.controleAntecedencia(avisoEmDia),
    anteAtraso: v.controleAntecedencia(atrasoCurto),
    sil: v.controleSilencio(silencio),
    silAvisado: v.controleSilencio(avisado),
    redat: v.controleLimiar(redatado),
    cxQuebrada: v.controleConexao(conexaoQuebrada),
    cxNoite: v.controleConexao(conexaoNoite),
    semBase: v.controleSemBase(semBase), semBaseLimpo: v.controleSemBase(limpo),
    diagTarde: v.diagnosticar(avisoTarde).map(a => a.controle),
    diagSemBase: v.diagnosticar(semBase).map(a => a.controle),
    textoRedat: v.diagnosticar(redatado).map(a => a.texto).join(' '),
  };
});

t('norma de 2026 vale para voo de hoje', /813\/2026/.test(r.normaNova), r.normaNova);
t('parâmetro de 2026 marcado como não conferido', r.naoConferida === false);
t('redação original vale para voo anterior', /redação original/.test(r.normaVelha), r.normaVelha);
t('VCP-OPO é internacional', r.intlVcpOpo === true);
t('BSB-SLZ é doméstico', r.intlBsbSlz === false);

t('delta de -35 min na partida e na chegada',
  r.delta?.partida === -35 && r.delta?.chegada === -35, JSON.stringify(r.delta));
t('35 min fica dentro dos 60 do internacional',
  r.limIntl?.acionou === false && r.limIntl?.limite === 60, JSON.stringify(r.limIntl));
t('35 min passa dos 30 do doméstico',
  r.limDom?.acionou === true && r.limDom?.limite === 30, JSON.stringify(r.limDom));
t('30 min exatos NÃO acionam (é superior a)',
  r.limNoLimite?.maior === 30 && r.limNoLimite?.acionou === false, JSON.stringify(r.limNoLimite));

t('atraso corre pelo art. 21', r.limAtrasoCurto?.artigo === 'art. 21');
t('atraso de 65 min não aciona as 4 h', r.limAtrasoCurto?.acionou === false);
t('atraso de 300 min aciona as 4 h', r.limAtrasoLongo?.acionou === true);

t('aviso com menos de 72 h aciona', r.anteTarde?.acionou === true, JSON.stringify(r.anteTarde));
t('aviso com folga não aciona', r.anteEmDia?.acionou === false, JSON.stringify(r.anteEmDia));
t('as 72 h não se aplicam a atraso', r.anteAtraso === null);

t('alteração vista só em consulta vira silêncio', r.sil?.acionou === true);
t('alteração avisada por e-mail não vira silêncio', r.silAvisado === null);

t('mudança de mais de um dia vira regime próprio', r.redat?.regime === 'remarcacao_data');
t('remarcação de data não aplica os 30/60 min', r.redat?.acionou === false);
t('texto da remarcação não traz minuto absurdo', !/\d{5,} min/.test(r.textoRedat), r.textoRedat.slice(0, 120));

t('atraso que alcança a escala acusa', r.cxQuebrada?.acionou === true, JSON.stringify(r.cxQuebrada));
t('escala que vira a noite não dá falso positivo', r.cxNoite === null, JSON.stringify(r.cxNoite));

t('falta de base vira pendência', r.semBase?.acionou === true);
t('voo limpo sem base não vira pendência', r.semBaseLimpo?.acionou === false);
t('aviso tardio vem na frente', r.diagTarde[0] === 'Aviso fora do prazo', r.diagTarde.join(' | '));
t('sem base aparece como achado', r.diagSemBase.includes('Horário contratado ausente'),
  r.diagSemBase.join(' | '));

console.log('ERROS DE JS:', erros.length ? erros : 'nenhum');
console.log(`\nPASSOU ${ok.length} | FALHOU ${falhou.length}`);
falhou.forEach(f => console.log('  ✗', f));
await b.close();
process.exit(falhou.length ? 1 : 0);
