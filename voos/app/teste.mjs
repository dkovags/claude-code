import pkg from '/opt/node-tools/node_modules/playwright/index.js';
const { chromium } = pkg;
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1340, height: 1200 } });
const erros = [];
p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
p.on('pageerror', e => erros.push('PAGEERROR: ' + e.message));
await p.goto('file://' + process.cwd() + '/exemplo.html');
await p.waitForTimeout(1200);

const ok = [], falhou = [];
const t = (nome, cond, extra='') => (cond ? ok : falhou).push(nome + (extra ? ' :: ' + extra : ''));

// 1. carga
const base = await p.evaluate(() => ({
  total: window.__voos.dados.length,
  futuros: window.__voos.dados.filter(r => r.aba === 'Voos').length,
  chave: !!localStorage.getItem('voos_app_data_v5'),
}));
t('carrega a base de exemplo', base.total === 8, 'total=' + base.total);
t('grava na chave v5', base.chave);
t('separa futuros', base.futuros === 6, 'futuros=' + base.futuros);

// 2. máquina de estados (unidade)
const est = await p.evaluate(() => {
  const f = window.__voos.proximoEstado;
  return {
    a: f('Não','alteracao'), b: f('Alterado','remarcacao'), c: f('Remarcado','alteracao'),
    d: f('Remarcado','remarcacao'), e: f('Não','remarcacao'), g: f('Alterado',''),
  };
});
t('Não + alteração = Alterado', est.a === 'Alterado');
t('Alterado + remarcação = Remarcado', est.b === 'Remarcado');
t('Remarcado + alteração = Alterado', est.c === 'Alterado');
t('Remarcado persiste', est.d === 'Remarcado');
t('remarcação voluntária não suja', est.e === 'Não');
t('sem evento preserva', est.g === 'Alterado');

// 3. importação por consulta: divergência vira alteração silenciosa
const r1 = await p.evaluate(() => {
  const v = window.__voos;
  const plano = v.planejarImportacao(
    [{data:'2028-04-11',localizador:'AAA111',origem:'BSB',horaIda:'19:40',destino:'SSA',
      horaChegada:'01:20(+1)',companhia:'Azul',voo:'4200'}], 'consulta', 'teste');
  return { mudados: plano.mudados.length, estadoNovo: plano.mudados[0]?.estadoNovo,
           difs: plano.mudados[0]?.difs.length };
});
t('consulta divergente é detectada', r1.mudados === 1, JSON.stringify(r1));
t('casa por localizador+destino apesar da data mudar', r1.difs >= 3, 'difs=' + r1.difs);
t('Remarcado volta a Alterado na consulta', r1.estadoNovo === 'Alterado', r1.estadoNovo);

// 4. confirmação nova sobre voo que estava Alterado = a reserva foi refeita
const r2 = await p.evaluate(() => {
  const v = window.__voos;
  // CCC333 -> RAK está como Alterado na base de exemplo
  const plano = v.planejarImportacao(
    [{data:'2028-06-02',localizador:'CCC333',origem:'LIS',horaIda:'23:25',destino:'RAK',
      horaChegada:'00:05',companhia:'Ryanair',voo:'4391'}], 'confirmacao', 'teste');
  return plano.mudados[0]?.estadoNovo;
});
t('confirmação sobre Alterado = Remarcado', r2 === 'Remarcado', String(r2));

// 5. CSV: leitura e exportação
const csv = await p.evaluate(() => {
  const v = window.__voos;
  const texto = 'Data,Localizador,Cidade,Origem,H. Ida,Destino,H. Chegada,Companhia,Voo,Alterado,Forma,Assento,Ida,Volta,Antecipação Desejada?,Conexões,Observações\n'
    + '10/12/2027,NOVO01,Recife,BSB,08:00,REC,11:00,Gol,1111,Não,Smiles,,,,,,"teste, com vírgula"\n'
    + '*Outro voo do mesmo localizador alterado,,,,,,,,,,,,,,,,\n';
  const lido = v.lerEntrada(texto);
  const saida = v.paraCsv(v.dados.slice(0, 2));
  return { qtd: lido.length, obs: lido[0]?.observacoes, data: lido[0]?.data,
           cabecalho: saida.split('\n')[0] };
});
t('CSV lido, legenda ignorada', csv.qtd === 1, 'qtd=' + csv.qtd);
t('CSV respeita aspas e vírgula', csv.obs === 'teste, com vírgula', csv.obs);
t('CSV converte data para ISO', csv.data === '2027-12-10', csv.data);
t('CSV exporta as 17 colunas', csv.cabecalho.split(',').length === 17);

// 6. aplicar de verdade e conferir a linha do tempo
const apl = await p.evaluate(() => {
  const v = window.__voos;
  const antes = v.dados.length;
  const plano = v.planejarImportacao(
    [{data:'2028-04-12',localizador:'AAA111',origem:'VCP',horaIda:'20:00',destino:'SSA',
      horaChegada:'10:00',companhia:'Azul',voo:'8800'},
     {data:'2028-01-15',localizador:'NOVA99',cidade:'Lima',origem:'BSB',horaIda:'09:00',
      destino:'LIM',horaChegada:'14:00',companhia:'Latam',voo:'8000'}],
    'consulta', 'print do site 01/11');
  v.aplicarImportacao(plano);
  // o ativo, não o arquivado de 2026 com o mesmo localizador e destino
  const h = v.dados.find(r => r.localizador === 'AAA111' && r.destino === 'SSA' && r.aba === 'Voos');
  const arquivado = v.dados.find(r => r.localizador === 'AAA111' && r.destino === 'SSA' && r.aba === 'Historico');
  return { cresceu: v.dados.length - antes, estado: h.alterado,
           hist: h.historico.length, ultimo: h.historico.at(-1),
           conferido: h.conferidoEm, novoExiste: v.dados.some(r => r.localizador === 'NOVA99'),
           arquivadoIntacto: arquivado?.alterado, arquivadoHist: (arquivado?.historico||[]).length };
});
t('voo novo entra', apl.cresceu === 1 && apl.novoExiste, 'cresceu=' + apl.cresceu);
t('divergência registra na linha do tempo', apl.hist >= 1, 'hist=' + apl.hist);
t('linha do tempo guarda de→para', /05:00 → /.test(apl.ultimo?.texto || ''), apl.ultimo?.texto);
t('consulta atualiza a data de conferência', !!apl.conferido, apl.conferido);
t('estado vai para Alterado', apl.estado === 'Alterado', apl.estado);
t('voo arquivado nao e tocado', apl.arquivadoIntacto === 'Sim*' && apl.arquivadoHist === 0,
  'estado=' + apl.arquivadoIntacto + ' hist=' + apl.arquivadoHist);

// 7. persiste e reabre
await p.reload(); await p.waitForTimeout(1000);
const depois = await p.evaluate(() => ({
  total: window.__voos.dados.length,
  nova: window.__voos.dados.some(r => r.localizador === 'NOVA99'),
}));
t('persiste após recarregar', depois.total === 9 && depois.nova, 'total=' + depois.total);

// 7b. ordem: mesmo dia tem de sair por horário de partida
const ordem = await p.evaluate(async () => {
  const v = window.__voos;
  const doDia = v.dados.filter(r => r.data === '2028-07-04' && r.aba === 'Voos');
  // ordem como a tabela monta
  document.querySelector('nav.abas button[data-aba="Voos"]').click();
  await new Promise(r => setTimeout(r, 300));
  const linhas = [...document.querySelectorAll('tr.voo')]
    .map(tr => [...tr.children].map(td => td.innerText.trim()))
    .filter(c => c[0] === '04/07/2028')
    .map(c => c[1] + ' ' + c[4]);
  return { quantos: doDia.length, linhas };
});
t('os dois voos do mesmo dia aparecem', ordem.quantos === 2, JSON.stringify(ordem));
t('mesmo dia sai por horário de partida',
  ordem.linhas[0]?.startsWith('FFF666') && ordem.linhas[1]?.startsWith('EEE555'),
  ordem.linhas.join(' | '));
// volta ao painel: os testes seguintes leem a tela dele
await p.click('nav.abas button[data-aba="painel"]'); await p.waitForTimeout(400);


// 8. interface
const ui = await p.evaluate(() => {
  const txt = document.body.innerText;
  return { temPainel: txt.includes('Conferência pendente'),
           temMudou: txt.includes('O que mudou'),
           temLegenda: txt.includes('Remarcado') };
});
t('painel tem conferência pendente', ui.temPainel);
t('painel tem o que mudou', ui.temMudou);
t('legenda cita Remarcado', ui.temLegenda);

// 9. abas
await p.click('nav.abas button[data-aba="Voos"]'); await p.waitForTimeout(400);
const tabela = await p.evaluate(() => document.querySelectorAll('tr.voo').length);
t('aba Voos lista a tabela', tabela > 0, 'linhas=' + tabela);

console.log('ERROS DE JS:', erros.length ? erros : 'nenhum');
console.log(`\nPASSOU ${ok.length} | FALHOU ${falhou.length}`);
falhou.forEach(f => console.log('  ✗', f));
await p.screenshot({ path: 'novo-painel.png' });
await p.click('nav.abas button[data-aba="painel"]'); await p.waitForTimeout(400);
await p.screenshot({ path: 'novo-painel.png' });
await b.close();
process.exit(falhou.length ? 1 : 0);
