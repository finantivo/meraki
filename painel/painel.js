
const DATA = window.__DADOS__;
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const brl = v => (v < 0 ? "−" : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", {minimumFractionDigits: 0, maximumFractionDigits: 0});
const brlc = v => Math.abs(v) < 0.5 ? "–" : (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("pt-BR", {maximumFractionDigits: 0});
const pct = v => isFinite(v) ? (v * 100).toLocaleString("pt-BR", {maximumFractionDigits: 1}) + "%" : "–";
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const el = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

const est = { ano: null, regime: "c", aba: "geral", status: "andamento", proj: null, abertos: new Set(), av: false, ah: false, statusGeral: "todos", dreModo: "ano", periodo: null };

// ---------- modelo ----------
const CAT = DATA.categorias, CC = DATA.centros;
const grupoCat = i => DATA.mapa_categorias[CAT[i]];
const projCC = i => (DATA.mapa_centros[CC[i]] || {projeto: "Sem centro de custo"}).projeto;
const OPERACIONAL = ["Receita Operacional Bruta", "Deduções da Receita", "Reembolsos", "Despesas Administrativas", "Despesas com Diretoria", "Despesas com Pessoal", "Despesas Comerciais", "Outras Despesas"];
const ORDEM = [
  {g: "Receita Operacional Bruta", rot: "Receita bruta"},
  {g: "Deduções da Receita", rot: "(−) Deduções da receita"},
  {tot: "Receita líquida", soma: ["Receita Operacional Bruta", "Deduções da Receita"]},
  {g: "Reembolsos", rot: "(+) Reembolsos de despesas"},
  {g: "Despesas Comerciais", rot: "(−) Despesas variáveis"},
  {tot: "Margem de contribuição", soma: ["Receita Operacional Bruta", "Deduções da Receita", "Reembolsos", "Despesas Comerciais"], destaque: true, margem: "Margem de contribuição %"},
  {g: "Despesas Administrativas", rot: "(−) Despesas administrativas"},
  {g: "Despesas com Diretoria", rot: "(−) Despesas com diretoria"},
  {g: "Despesas com Pessoal", rot: "(−) Despesas com pessoal"},
  {g: "Outras Despesas", rot: "(−) Outras despesas"},
  {tot: "Resultado operacional", soma: OPERACIONAL, destaque: true, margem: "Margem operacional %"},
  {g: "Receitas Financeiras", rot: "(+) Receitas financeiras"},
  {g: "Despesas Financeiras", rot: "(−) Despesas financeiras"},
  {g: "Receitas Não Operacionais", rot: "(+) Receitas não operacionais"},
  {g: "Investimentos", rot: "(−) Investimentos"},
  {g: "Despesas Não Operacionais", rot: "(−) Despesas não operacionais"},
  {tot: "Resultado líquido", soma: "*-Distribuição de Lucros", destaque: true, margem: "Margem líquida %"},
  {g: "Distribuição de Lucros", rot: "(−) Antecipação de lucros"},
  {tot: "Resultado final", soma: "*"},
];
const entraNoTotal = (soma, g) => soma === "*" || (typeof soma === "string" ? soma.startsWith("*-") && g !== soma.slice(2) : soma.includes(g));
function fatos(regime, ano) {
  const p = String(ano);
  return DATA.fatos.filter(f => f[0] === regime && f[1].startsWith(p));
}
function anos() {
  const fim = +DATA.atualizado_em.slice(0, 4);  // anos futuros só têm agendamentos
  const s = new Set(DATA.fatos.filter(f => f[0] !== "p").map(f => +f[1].slice(0, 4)).filter(a => a <= fim));
  return [...s].sort();
}
function serieMeses() { return Array(12).fill(0); }
function somaPor(fs, chave) {
  const m = new Map();
  for (const f of fs) { const k = chave(f); if (k == null) continue; const a = m.get(k) || serieMeses(); a[+f[1].slice(5, 7) - 1] += f[4]; m.set(k, a); }
  return m;
}
const total = a => a.reduce((s, v) => s + v, 0);

// custos fixos e rateio
// Custos fixos: meses já registrados na aba "Custos Fixos" da planilha usam o valor digitado; os demais vêm do Conta Azul
// (centro Meraki, categorias do rateio), abertos por prestador: em "Prestador de Serviços" pela função (descrição do
// lançamento, como na planilha), nas outras categorias pelo fornecedor.
const mesAtual = DATA.atualizado_em.slice(0, 7);
const ym = (ano, i) => `${ano}-${String(i + 1).padStart(2, "0")}`;
const totalManualCF = DATA.custos_fixos_manuais.filter(r => r.nivel === 0).reduce((o, r) => Object.assign(o, r.valores), {});
const cfManual = m => m in totalManualCF;
const inicioRateio = DATA.rateio.map(r => r.de).sort()[0];  // antes disso não havia controle de custos fixos
const limpa = t => String(t || "—").replace(/\s+/g, " ").trim();
function custosFixosCalc(ano) {
  const porCat = new Map();
  if (String(ano) < inicioRateio.slice(0, 4)) return porCat;
  const cats = new Set(DATA.custos_fixos);
  for (const l of DATA.lancamentos) {
    if (!l.p || !l.p.startsWith(String(ano))) continue;
    const i = +l.p.slice(5, 7) - 1;
    for (const [cat, cc, v] of l.r) {
      if (!cats.has(cat) || v >= 0 || projCC(CC.indexOf(cc || "")) !== "Estrutura Meraki") continue;
      const c = porCat.get(cat) || {a: serieMeses(), subs: new Map()};
      c.a[i] += v;
      const quem = cat === "Prestador de Serviços" ? limpa(l.desc) : limpa(l.quem);
      const sa = c.subs.get(quem) || serieMeses(); sa[i] += v; c.subs.set(quem, sa);
      porCat.set(cat, c);
    }
  }
  // fixo dos sócios que trabalham nos projetos (não passa pelo Conta Azul): entra como prestador, no item da função
  for (const f of DATA.fixos_mensais || []) {
    const c = porCat.get(f.categoria) || {a: serieMeses(), subs: new Map()};
    const sa = c.subs.get(f.item) || serieMeses();
    serieMeses().forEach((_, i) => { if (ym(ano, i) <= mesAtual && ym(ano, i) >= inicioRateio) { c.a[i] += f.valor; sa[i] += f.valor; } });
    c.subs.set(f.item, sa); porCat.set(f.categoria, c);
  }
  return porCat;
}
function custosFixosMes(ano) {
  const calc = custosFixosCalc(ano);
  return serieMeses().map((_, i) => {
    const m = ym(ano, i);
    if (cfManual(m)) return totalManualCF[m];
    let s = 0; for (const c of calc.values()) s += c.a[i]; return s;
  });
}
function regraRateio(mes) { return DATA.rateio.find(r => mes >= r.de && mes <= r.ate); }

// projetos: digitado (planilha) quando existe, senão Conta Azul
function manual(proj, ano) { return DATA.manuais.filter(r => r.projeto === proj && r.ano === ano); }
function resumoManual(regs, ano) {
  const mm = k => { const a = serieMeses(); for (const r of regs) if (k(r)) for (const [m, v] of Object.entries(r.valores)) if (m.startsWith(String(ano))) a[+m.slice(5) - 1] += v; return a; };
  const lvl1 = r => r.nivel === 1;
  const bruta = mm(r => lvl1(r) && r.tipo === "plataforma");
  const meraki = mm(r => lvl1(r) && r.tipo === "meraki");
  const expert = mm(r => lvl1(r) && r.tipo === "expert");
  const taxas = mm(r => lvl1(r) && r.tipo === "taxa").map(v => -Math.abs(v));
  const hdr = regs.find(r => r.bloco === "despesa" && r.nivel === 1 && /^despesas$/i.test(r.rotulo.trim()));
  let desp = hdr ? mm(r => r === hdr) : mm(r => lvl1(r) && r.tipo === "despesa");
  desp = desp.map(v => -Math.abs(v));
  const temMes = serieMeses().map((_, i) => bruta[i] !== 0 || meraki[i] !== 0 || desp[i] !== 0);
  const das = mm(r => r.bloco === "despesa" && r.nivel === 1 && /^das$/i.test(r.rotulo.trim())).map(v => -Math.abs(v));
  return {bruta, meraki, expert, taxas, desp, temMes, das};
}
// Despesas diretas pelo Conta Azul (de 2026 em diante): mesma regra da planilha — competência, centro de custo da Meraki
// no projeto (Meraki_Gabi...), sem tarifas das plataformas (já descontadas na receita), sem Simples, sem antecipação e
// sem reembolso (acerto de contas com o expert, não é custo).
// O DAS continua vindo da planilha (é um rateio calculado, não existe por projeto no Conta Azul).
const DESPESAS_LIGADAS_DESDE = 2026;
// "Reembolso" é só acerto de contas com o expert: a despesa já está nas contas a pagar, dividida entre os centros
const foraDespProjeto = cat => /^(tarifa|simples nacional|antecipa|devolu|reembolso)/i.test(cat);
const grupoMkt = nome => (/^(facebook|meta|google|instagram|tiktok|youtube|kwai|taboola|pinterest)/i.test(nome) ? "Tráfego pago" : "Comercial e prestadores");
function despesasProjetoCA(proj, ano) {
  const porCat = new Map(), itens = [];
  for (const l of DATA.lancamentos) {
    if (!l.k || !l.k.startsWith(String(ano))) continue;
    const i = +l.k.slice(5, 7) - 1;
    for (const [cat, cc, v] of l.r) {
      if (v >= 0 || foraDespProjeto(cat)) continue;
      const m = DATA.mapa_centros[cc || ""] || {};
      if (m.projeto !== proj || m.lado !== "meraki") continue;
      const c = porCat.get(cat) || {a: serieMeses(), itens: new Map()};
      c.a[i] += v;
      const q = limpa(l.quem), ds = limpa(l.desc);
      const nome = ds === "—" || ds === q ? q : ds.toLowerCase().startsWith(q.toLowerCase()) ? ds : `${q} · ${ds}`;
      const it = c.itens.get(nome) || serieMeses(); it[i] += v; c.itens.set(nome, it);
      porCat.set(cat, c);
      itens.push({l, cat, cc, v, i, nome});
    }
  }
  const tot = serieMeses(); for (const c of porCat.values()) c.a.forEach((v, i) => tot[i] += v);
  return {porCat, itens, tot};
}
function resumoContaAzul(proj, ano) {
  const r = {bruta: serieMeses(), receitas: serieMeses(), desp: serieMeses()};
  for (const f of fatos(est.regime, ano)) {
    if (projCC(f[3]) !== proj) continue;
    const i = +f[1].slice(5, 7) - 1, g = grupoCat(f[2]);
    if (g === "Receita Operacional Bruta") r.bruta[i] += f[4];
    if (f[4] > 0) r.receitas[i] += f[4]; else r.desp[i] += f[4];
  }
  return r;
}
function resumoProjeto(proj, ano) {
  const regs = manual(proj, ano), ca = resumoContaAzul(proj, ano);
  const mn = regs.length ? resumoManual(regs, ano) : null;
  const out = {bruta: serieMeses(), meraki: serieMeses(), desp: serieMeses(), fixos: serieMeses(), fonte: serieMeses().map(() => ""), regs};
  const cf = custosFixosMes(ano);
  const ligado = mn && ano >= DESPESAS_LIGADAS_DESDE ? despesasProjetoCA(proj, ano) : null;
  out.ligado = ligado;
  for (let i = 0; i < 12; i++) {
    // com planilha no ano, mês não digitado fica vazio (misturar com o Conta Azul distorce: lá não há o split Expert/Meraki)
    if (mn) { if (mn.temMes[i]) { out.bruta[i] = mn.bruta[i]; out.meraki[i] = mn.meraki[i]; out.desp[i] = ligado ? mn.das[i] + ligado.tot[i] : mn.desp[i]; out.fonte[i] = "planilha"; } }
    else if (ca.receitas[i] || ca.desp[i]) { out.bruta[i] = ca.bruta[i]; out.meraki[i] = ca.receitas[i]; out.desp[i] = ca.desp[i]; out.fonte[i] = "conta azul"; }
    const regra = regraRateio(`${ano}-${String(i + 1).padStart(2, "0")}`);
    if (regra && regra.projetos[proj] && out.fonte[i]) out.fixos[i] = cf[i] * regra.projetos[proj];
  }
  out.resultado = out.meraki.map((v, i) => v + out.desp[i]);
  out.aposEstrutura = out.resultado.map((v, i) => v + out.fixos[i]);
  return out;
}
function listaProjetos() {
  const s = new Set(Object.keys(DATA.projetos_cfg));
  for (const c of CC) { const p = projCC(CC.indexOf(c)); if (p !== "Estrutura Meraki" && p !== "Sem centro de custo") s.add(p); }
  for (const r of DATA.manuais) s.add(r.projeto);
  return [...s];
}
const statusDe = p => (DATA.projetos_cfg[p] || {}).status || "encerrado";

// ---------- lançamentos (modal) ----------
function abrirLancamentos(titulo, filtro) {
  const mes = filtro.mes, campo = est.regime === "c" ? "p" : "k";
  const linhas = [];
  for (const l of DATA.lancamentos) {
    const data = l[campo] || (est.regime === "c" ? null : l.d);
    if (!data || !data.startsWith(mes)) continue;
    for (const [cat, cc, v] of l.r) {
      if (filtro.cats && !filtro.cats.has(cat)) continue;
      if (filtro.proj && projCC(CC.indexOf(cc || "")) !== filtro.proj) continue;
      if (filtro.quem && filtro.quem(l, cat) !== true) continue;
      linhas.push({l, cat, cc, v});
    }
  }
  for (const x of filtro.extras || []) linhas.push(x);
  const quando = mes.length === 4 ? mes : `${MESES[+mes.slice(5) - 1].toLowerCase()}/${mes.slice(0, 4)}`;
  mostrarLancamentos(titulo, `${est.regime === "c" ? "regime de caixa · pagos" : "regime de competência · competência"} em ${quando}`, linhas, est.regime);
}
// lista de lançamentos: mostra sempre a data real do pagamento e a competência; a coluna do regime em uso fica destacada
function mostrarLancamentos(titulo, contexto, linhas, regime) {
  const dia = d => (d ? d.split("-").reverse().join("/") : "");
  linhas.sort((a, b) => (a.fora ? 1 : 0) - (b.fora ? 1 : 0) || ((a.l.pp || a.l.d) || "").localeCompare((b.l.pp || b.l.d) || ""));
  const tot = total(linhas.map(x => x.v)), n = linhas.length;
  el("m-tit").textContent = titulo;
  el("m-sub").textContent = `${n} ${n === 1 ? "lançamento" : "lançamentos"} · ${contexto} · total ${brl(tot)}`;
  const hc = regime === "c" ? ' style="color:var(--marca-verde)"' : "", hk = regime === "k" ? ' style="color:var(--marca-verde)"' : "";
  el("m-corpo").innerHTML = `<table><thead><tr><th${hc}>Data do pagamento${regime === "c" ? " (caixa)" : ""}</th><th${hk}>Competência${regime === "k" ? " (DRE)" : ""}</th><th style="text-align:left">Descrição</th><th style="text-align:left">Cliente/fornecedor</th><th style="text-align:left">Categoria</th><th style="text-align:left">Centro de custo</th><th>Valor</th></tr></thead><tbody>${
    linhas.map(({l, cat, cc, v, prev, fora}) => {
      if (fora) return `<tr style="background:#faf5ec"><td style="position:static;min-width:0;color:var(--text-3)">fora do Conta Azul</td><td></td><td style="text-align:left">${esc(fora.item)} · valor fixo mensal</td><td style="text-align:left">${esc(fora.quem)}</td><td style="text-align:left">${esc(cat)}</td><td style="text-align:left">Meraki</td><td class="neg">${brlc(v)}</td></tr>`;
      const aberto = prev || (!l.pp && Math.abs(l.a || 0) > .004);
      const pg = aberto ? `<span style="color:var(--text-3)">em aberto · vence ${dia(l.d)}</span>` : dia(l.pp || l.p) + (l.p && l.pp && l.p.slice(0, 7) !== l.pp.slice(0, 7) ? `<br><span style="color:var(--text-3);font-size:11px">cartão · fatura vence ${dia(l.p)}</span>` : "");
      return `<tr><td style="position:static;min-width:0">${pg}</td><td>${dia(l.k)}</td><td style="text-align:left">${esc(l.desc)}</td><td style="text-align:left">${esc(l.quem)}</td><td style="text-align:left">${esc(cat)}</td><td style="text-align:left">${esc(cc || "—")}</td><td class="${v < 0 ? "neg" : ""}">${brlc(v)}</td></tr>`;
    }).join("")
  }</tbody></table>`;
  el("modal").classList.add("on");
}
function fecharModal() { el("modal").classList.remove("on"); }
el("modal").addEventListener("click", e => { if (e.target.id === "modal") fecharModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") fecharModal(); });

// ---------- gráficos ----------
const charts = {};
function grafico(id, cfg) {
  if (charts[id]) charts[id].destroy();
  Chart.defaults.font.family = "Inter, system-ui, sans-serif";
  Chart.defaults.color = css("--text-2");
  Object.assign(Chart.defaults.plugins.tooltip, {backgroundColor: "#ffffff", titleColor: css("--text"), bodyColor: css("--text-2"),
    borderColor: css("--line"), borderWidth: 1, padding: 12, cornerRadius: 10, boxPadding: 6, usePointStyle: true,
    titleFont: {weight: "600", size: 13}, bodyFont: {size: 12}, caretSize: 6});
  charts[id] = new Chart(el(id), cfg);
}
const eixos = (extra = {}) => ({
  x: {grid: {display: false}, border: {color: css("--line")}, ticks: {maxRotation: 0, autoSkip: false}},
  y: {grid: {color: c => (c.tick.value === 0 ? css("--text-3") : "transparent"), drawTicks: false}, border: {display: false}, ticks: {padding: 8, callback: v => (v / 1000).toLocaleString("pt-BR") + " mil"}},
  ...extra,
});
const rotuloBarras = {id: "rotuloBarras", afterDatasetsDraw(c) {
  const ctx = c.ctx; ctx.save(); ctx.font = "500 10px Inter, sans-serif"; ctx.fillStyle = css("--text-2"); ctx.textAlign = "center";
  c.data.datasets.forEach((d, i) => { if (d.type === "line" || c.getDatasetMeta(i).hidden) return;
    c.getDatasetMeta(i).data.forEach((b, j) => { const v = d.data[j]; if (!v) return;
      ctx.fillText(((v < 0 ? "−" : "") + Math.round(Math.abs(v) / 1000).toLocaleString("pt-BR")), b.x, v >= 0 ? b.y - 5 : b.y + 13); }); });
  ctx.restore(); }};
const dica = {callbacks: {label: c => `${c.dataset.label}: ${brl(c.parsed.y)}`}};
const barra = (label, data, cor, extra = {}) => ({type: "bar", label, data, backgroundColor: cor, borderRadius: 4, borderSkipped: "start", maxBarThickness: 26, ...extra});

// ---------- seções ----------
function dreLinhas(regime, ano) {
  const fs = fatos(regime, ano);
  const porGrupo = somaPor(fs, f => grupoCat(f[2]));
  const porCat = somaPor(fs, f => grupoCat(f[2]) + "|" + CAT[f[2]]);
  const porProj = somaPor(fs, f => grupoCat(f[2]) + "|" + CAT[f[2]] + "|" + projCC(f[3]));
  return {porGrupo, porCat, porProj};
}
function celulas(a, base, clique) {
  const t = total(a);
  return a.map((v, i) => `<td class="${Math.abs(v) < .5 ? "zero" : v < 0 ? "neg" : ""}" ${clique ? `data-m="${i}"` : ""}>${brlc(v)}</td>`).join("") +
    `<td class="${t < 0 ? "neg" : ""}"><b>${brlc(t)}</b></td><td class="av">${base ? pct(t / base) : ""}</td>`;
}
// ---------- DRE: colunas por mês do ano, por ano (todos os anos) ou por um período escolhido ----------
const rotPeriodo = k => (k.length === 4 ? k : `${MESES[+k.slice(5) - 1]}/${k.slice(2, 4)}`);
const mesSeguinte = m => { const [a, mm] = m.split("-").map(Number); return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`; };
function colunasDRE() {
  if (est.dreModo === "anos") return anos().map(a => ({key: String(a), rot: String(a)}));
  if (est.dreModo === "periodo") {
    let {de, ate} = est.periodo; if (de > ate) [de, ate] = [ate, de];
    const cols = []; for (let m = de; m <= ate && cols.length < 36; m = mesSeguinte(m)) cols.push({key: m, rot: rotPeriodo(m)});
    return cols;
  }
  return MESES.map((m, i) => ({key: ym(est.ano, i), rot: m}));
}
const chaveAnterior = k => (k.length === 4 ? String(+k - 1) : mesAnterior(k));
function dreColunas(regime, cols) {
  // soma por grupo / grupo|categoria / grupo|categoria|projeto em cada coluna, e o período anterior à 1ª coluna (para a AH)
  const idx = new Map(cols.map((c, i) => [c.key, i])), n = cols.length, ant = chaveAnterior(cols[0].key);
  const mapas = {porGrupo: new Map(), porCat: new Map(), porProj: new Map()}, prev = {porGrupo: new Map(), porCat: new Map(), porProj: new Map()};
  const soma = (m, k, i, v) => { const a = m.get(k) || Array(n).fill(0); a[i] += v; m.set(k, a); };
  for (const f of DATA.fatos) {
    if (f[0] !== regime) continue;
    const i = idx.has(f[1]) ? idx.get(f[1]) : idx.get(f[1].slice(0, 4));
    const g = grupoCat(f[2]), kc = g + "|" + CAT[f[2]], kp = kc + "|" + projCC(f[3]);
    if (i !== undefined) { soma(mapas.porGrupo, g, i, f[4]); soma(mapas.porCat, kc, i, f[4]); soma(mapas.porProj, kp, i, f[4]); }
    if (f[1] === ant || f[1].slice(0, 4) === ant) for (const [m, k] of [[prev.porGrupo, g], [prev.porCat, kc], [prev.porProj, kp]]) m.set(k, (m.get(k) || 0) + f[4]);
  }
  return {mapas, prev};
}
function renderDRE(soTabela) {
  const cols = colunasDRE(), n = cols.length, modoAno = (est.dreModo || "ano") === "ano";
  const {mapas: cur, prev} = dreColunas(est.regime, cols);
  const totAnt = modoAno ? dreLinhas(est.regime, est.ano - 1) : null;  // AH do total: contra o ano anterior
  const vazio = Array(n).fill(0);
  const brutaCol = cur.porGrupo.get("Receita Operacional Bruta") || vazio, base = total(brutaCol);
  const av = est.av, ah = est.ah;
  // AV% = valor ÷ receita bruta da mesma coluna; AH% = variação contra a coluna anterior (a 1ª compara com o período anterior)
  const cel = (a, pAnt, tAnt, clique) => {
    let h = "";
    a.forEach((v, i) => {
      h += `<td class="${Math.abs(v) < .5 ? "zero" : v < 0 ? "neg" : ""}" ${clique ? `data-m="${i}"` : ""}>${brlc(v)}</td>`;
      if (av) h += `<td class="av">${brutaCol[i] && Math.abs(v) > .5 ? pct(v / brutaCol[i]) : "–"}</td>`;
      if (ah) { const p = i ? a[i - 1] : (pAnt || 0); h += `<td class="av">${Math.abs(p) > .5 && Math.abs(v) > .5 ? pct((v - p) / Math.abs(p)) : "–"}</td>`; }
    });
    const t = total(a);
    h += `<td class="${t < 0 ? "neg" : ""}"><b>${brlc(t)}</b></td>`;
    if (av) h += `<td class="av">${base ? pct(t / base) : ""}</td>`;
    if (ah) h += modoAno ? `<td class="av" title="contra ${est.ano - 1}">${tAnt && Math.abs(tAnt) > .5 ? pct((t - tAnt) / Math.abs(tAnt)) : "–"}</td>` : `<td class="av">–</td>`;
    return h;
  };
  const sub = (av ? "<th class='av'>AV%</th>" : "") + (ah ? "<th class='av'>AH%</th>" : "");
  const titulo = modoAno ? `DRE ${est.ano}` : est.dreModo === "anos" ? "DRE · todos os anos" : `DRE · ${rotPeriodo(cols[0].key)} a ${rotPeriodo(cols[n - 1].key)}`;
  let h = `<table><thead><tr><th>${titulo} · ${est.regime === "c" ? "caixa" : "competência"}</th>${cols.map(c => `<th>${c.rot}</th>${sub}`).join("")}<th>Total</th>${av ? "<th class='av'>AV%</th>" : ""}${ah ? `<th class='av'>${modoAno ? `AH% vs ${est.ano - 1}` : "AH%"}</th>` : ""}</tr></thead><tbody>`;
  const somaTot = (pg, soma) => { const a = Array(n).fill(0); for (const [g, s] of pg) if (entraNoTotal(soma, g)) s.forEach((v, i) => a[i] += v); return a; };
  const somaPrev = (pm, soma) => { let s = 0; for (const [g, v] of pm) if (entraNoTotal(soma, g)) s += v; return s; };
  const totPrevAno = (soma, g) => (totAnt ? (soma ? total(somaTot12(totAnt.porGrupo, soma)) : total(totAnt.porGrupo.get(g) || [])) : 0);
  const somaTot12 = (pg, soma) => { const a = serieMeses(); for (const [g, s] of pg) if (entraNoTotal(soma, g)) s.forEach((v, i) => a[i] += v); return a; };
  const extra = (av ? 1 : 0) + (ah ? 1 : 0);
  for (const o of ORDEM) {
    if (o.tot) {
      const a = somaTot(cur.porGrupo, o.soma);
      h += `<tr class="tot ${o.destaque ? "destaque" : ""}"><td>${o.tot}</td>${cel(a, somaPrev(prev.porGrupo, o.soma), totPrevAno(o.soma))}</tr>`;
      if (o.margem) {  // margem em % da receita bruta; verde quando positiva, laranja quando negativa
        const m = (v, b) => { if (!b) return `<td>–</td>`; const r = v / b; return `<td class="${r < 0 ? "mneg" : "mpos"}">${pct(r)}</td>`; };
        h += `<tr class="margem"><td>${o.margem}</td>${a.map((v, i) => m(v, brutaCol[i]) + "<td></td>".repeat(extra)).join("")}${m(total(a), base).replace("<td", "<td style='font-weight:700'")}${"<td></td>".repeat(extra)}</tr>`;
      }
      continue;
    }
    const a = cur.porGrupo.get(o.g);
    if (!a) continue;
    const kg = "g|" + o.g, aberto = est.abertos.has(kg);
    const tAnt = totAnt ? total(totAnt.porGrupo.get(o.g) || []) : 0;
    h += `<tr class="g clic" data-k="${esc(kg)}"><td><span class="seta">${aberto ? "▾" : "▸"}</span>${o.rot}</td>${cel(a, prev.porGrupo.get(o.g), tAnt)}</tr>`;
    if (!aberto) continue;
    const cats = [...cur.porCat].filter(([k]) => k.startsWith(o.g + "|")).sort((x, y) => Math.abs(total(y[1])) - Math.abs(total(x[1])));
    for (const [k, s] of cats) {
      const cat = k.split("|")[1], kc = "c|" + k, ab = est.abertos.has(kc);
      h += `<tr class="n2 clic" data-k="${esc(kc)}" data-cat="${esc(cat)}"><td title="${esc(cat)}"><span class="seta">${ab ? "▾" : "▸"}</span>${esc(cat)}</td>${cel(s, prev.porCat.get(k), totAnt ? total(totAnt.porCat.get(k) || []) : 0, true)}</tr>`;
      if (!ab) continue;
      const ps = [...cur.porProj].filter(([kk]) => kk.startsWith(k + "|")).sort((x, y) => Math.abs(total(y[1])) - Math.abs(total(x[1])));
      for (const [kk, sp] of ps) {
        const p = kk.split("|")[2];
        h += `<tr class="n3" data-cat="${esc(cat)}" data-proj="${esc(p)}"><td>${esc(p)}</td>${cel(sp, prev.porProj.get(kk), totAnt ? total(totAnt.porProj.get(kk) || []) : 0, true)}</tr>`;
      }
    }
  }
  el("t-dre").innerHTML = h + "</tbody></table>";
  renderDRE.cols = cols;
  document.querySelectorAll("#dre-analises button").forEach(b => b.classList.toggle("on", !!est[b.dataset.an]));
  atualizaControlesPeriodo();
}
el("dre-analises").addEventListener("click", e => { const b = e.target.closest("[data-an]"); if (b) { est[b.dataset.an] = !est[b.dataset.an]; renderDRE(true); } });
// o período (ano / todos os anos / de-até) vale para Visão geral, DRE e lista de projetos; fluxo, custos fixos e o
// detalhe de um projeto continuam por ano
const usaPeriodo = () => ["geral", "dre"].includes(est.aba) || (est.aba === "projetos" && !est.proj);
function atualizaControlesPeriodo() {
  const usa = usaPeriodo(), modo = est.dreModo || "ano";
  el("per-controles").style.display = usa ? "" : "none";
  document.querySelectorAll("#dre-modo button").forEach(b => b.classList.toggle("on", b.dataset.modo === modo));
  el("dre-periodo").style.display = usa && modo === "periodo" ? "" : "none";
  el("ano").disabled = usa && modo !== "ano";
}
el("dre-modo").addEventListener("click", e => { const b = e.target.closest("[data-modo]"); if (b) { est.dreModo = b.dataset.modo; atualizaControlesPeriodo(); render(); } });
el("dre-periodo").addEventListener("change", () => { est.periodo = {de: el("per-de").value || est.periodo.de, ate: el("per-ate").value || est.periodo.ate}; render(); });
el("t-dre").addEventListener("click", e => {
  const td = e.target.closest("td[data-m]"), tr = e.target.closest("tr");
  if (td && tr.dataset.cat) {
    const mes = renderDRE.cols[+td.dataset.m].key;
    abrirLancamentos(tr.dataset.cat + (tr.dataset.proj ? " · " + tr.dataset.proj : ""), {mes, cats: new Set([tr.dataset.cat]), proj: tr.dataset.proj});
    return;
  }
  if (tr && tr.dataset.k) { est.abertos.has(tr.dataset.k) ? est.abertos.delete(tr.dataset.k) : est.abertos.add(tr.dataset.k); renderDRE(true); }
});

function resultados(regime, ano) {
  const fs = fatos(regime, ano), op = serieMeses(), fin = serieMeses(), bruta = serieMeses(), dist = serieMeses(), ent = serieMeses(), sai = serieMeses();
  for (const f of fs) {
    const i = +f[1].slice(5, 7) - 1, g = grupoCat(f[2]);
    fin[i] += f[4];
    if (OPERACIONAL.includes(g)) op[i] += f[4];
    if (g === "Receita Operacional Bruta") bruta[i] += f[4];
    if (g === "Distribuição de Lucros") dist[i] += f[4];
    if (f[4] > 0) ent[i] += f[4]; else sai[i] += f[4];
  }
  return {op, fin, bruta, dist, ent, sai};
}
const rotuloPeriodo = () => { const m = est.dreModo || "ano"; if (m === "ano") return String(est.ano); if (m === "anos") return "todos os anos";
  const c = colunasDRE(); return `${rotPeriodo(c[0].key)} a ${rotPeriodo(c[c.length - 1].key)}`; };
function colunaDoMes(cols) { const idx = new Map(cols.map((c, i) => [c.key, i])); return m => (idx.has(m) ? idx.get(m) : idx.get(m.slice(0, 4))); }
function resultadosPeriodo(regime, cols) {
  const n = cols.length, col = colunaDoMes(cols), z = () => Array(n).fill(0);
  const out = {op: z(), fin: z(), bruta: z(), dist: z(), ent: z(), sai: z()};
  for (const f of DATA.fatos) {
    if (f[0] !== regime) continue;
    const i = col(f[1]); if (i === undefined) continue;
    const g = grupoCat(f[2]);
    out.fin[i] += f[4];
    if (OPERACIONAL.includes(g)) out.op[i] += f[4];
    if (g === "Receita Operacional Bruta") out.bruta[i] += f[4];
    if (g === "Distribuição de Lucros") out.dist[i] += f[4];
    if (f[4] > 0) out.ent[i] += f[4]; else out.sai[i] += f[4];
  }
  return out;
}
// resumo de um projeto somado nas colunas do período escolhido (mês a mês ou por ano)
function resumoProjetoPeriodo(p) {
  if ((est.dreModo || "ano") === "ano") return resumoProjeto(p, est.ano);
  const cols = colunasDRE(), col = colunaDoMes(cols), n = cols.length, ks = ["bruta", "meraki", "desp", "fixos", "resultado", "aposEstrutura"];
  const out = Object.fromEntries(ks.map(k => [k, Array(n).fill(0)])); out.fonte = Array(n).fill("");
  const anosP = [...new Set(cols.map(c => +c.key.slice(0, 4)))];
  for (const a of anosP) {
    const r = resumoProjeto(p, a);
    for (let i = 0; i < 12; i++) { const j = col(ym(a, i)); if (j === undefined) continue; for (const k of ks) out[k][j] += r[k][i]; if (r.fonte[i]) out.fonte[j] = r.fonte[i]; }
  }
  return out;
}
function custosFixosPeriodo() {
  if ((est.dreModo || "ano") === "ano") return custosFixosMes(est.ano);
  const cols = colunasDRE(), col = colunaDoMes(cols), out = [];
  for (const a of [...new Set(cols.map(c => +c.key.slice(0, 4)))]) custosFixosMes(a).forEach((v, i) => { if (col(ym(a, i)) !== undefined) out.push(v); });
  return out;
}
function renderGeral() {
  const modoAno = (est.dreModo || "ano") === "ano", cols = colunasDRE();
  const r = modoAno ? resultados(est.regime, est.ano) : resultadosPeriodo(est.regime, cols), ant = modoAno ? resultados(est.regime, est.ano - 1) : null;
  const bruta = total(r.bruta), op = total(r.op), fin = total(r.fin);
  const cfMeses = custosFixosPeriodo(), cf = total(cfMeses);
  const k = [
    ["Receita bruta", brl(bruta), ant && total(ant.bruta) ? `${est.ano - 1}: ${brl(total(ant.bruta))}` : rotuloPeriodo(), true],
    ["Resultado operacional", brl(op), bruta ? `margem de ${pct(op / bruta)} sobre a receita bruta` : "", true],
    ["Antecipação de lucros", brl(total(r.dist)), modoAno ? "retiradas da sócia no ano" : "retiradas da sócia no período"],
    ["Resultado final", brl(fin), "inclui financeiro, empréstimos e retiradas"],
    cf ? ["Custos fixos da estrutura", brl(cf), `média ${brl(cf / Math.max(1, cfMeses.filter(Boolean).length))}/mês`]
       : ["Custos fixos da estrutura", "–", `controle e rateio começaram em ${inicioRateio.slice(0, 4)}`],
  ];
  el("kpis").innerHTML = k.map(([rot, v, c, d]) => `<div class="cartao kpi ${d ? "destaque" : ""}"><div class="rot">${rot}</div><div class="val" style="${v.startsWith("−") ? "color:var(--neg)" : ""}">${v}</div><div class="cmp">${c}</div></div>`).join("");
  el("sub-mensal").textContent = `${rotuloPeriodo()} · ${est.regime === "c" ? "regime de caixa" : "regime de competência"}`;
  el("tit-mensal").textContent = est.dreModo === "anos" ? "Entradas e saídas por ano" : "Entradas e saídas por mês";
  // receita e despesa lado a lado (as duas para cima); linha = resultado operacional
  grafico("g-mensal", {data: {labels: modoAno ? MESES : cols.map(c => c.rot), datasets: [
    {type: "line", label: "Resultado operacional", data: r.op, borderColor: css("--ink"), borderWidth: 2, pointRadius: 4, pointBackgroundColor: css("--ink"), pointBorderColor: "#fff", pointBorderWidth: 2, tension: .3, order: 0},
    barra("Entradas", r.ent, css("--pos"), {maxBarThickness: 16, order: 1}), barra("Saídas", r.sai.map(v => -v), css("--neg"), {maxBarThickness: 16, order: 1}),
  ]}, options: {maintainAspectRatio: false, interaction: {mode: "index", intersect: false}, plugins: {legend: {display: false}, tooltip: dica}, scales: eixos()}});
  const as = anos(), rs = as.map(a => resultados(est.regime, a));
  grafico("g-anos", {type: "bar", data: {labels: as, datasets: [
    barra("Resultado operacional", rs.map(x => total(x.op)), css("--pos"), {maxBarThickness: 28, borderSkipped: false}),
    barra("Resultado final", rs.map(x => total(x.fin)), css("--ink"), {maxBarThickness: 28, borderSkipped: false}),
  ]}, plugins: [rotuloBarras], options: {maintainAspectRatio: false, layout: {padding: {top: 18}}, interaction: {mode: "index", intersect: false}, plugins: {legend: {display: false}, tooltip: dica}, scales: (() => { const sc = eixos(); sc.y.grace = "22%"; return sc; })()}});
  renderProjetosAno();
}
function renderProjetosAno() {
  el("tit-proj-ano").textContent = (est.dreModo || "ano") === "ano" ? "Projetos no ano" : `Projetos · ${rotuloPeriodo()}`;
  const todas = listaProjetos().map(p => ({p, r: resumoProjetoPeriodo(p)})).filter(x => total(x.r.bruta) || total(x.r.desp));
  const contaSt = st => todas.filter(x => statusDe(x.p) === st).length;
  el("chips-geral").innerHTML = [["todos", "Todos"], ["andamento", "Em andamento"], ["novo", "Novos"], ["encerrado", "Encerrados"]]
    .map(([st, rot]) => `<button class="chip ${est.statusGeral === st ? "on" : ""}" data-st="${st}">${rot} (${st === "todos" ? todas.length : contaSt(st)})</button>`).join("");
  const linhas = todas.filter(x => est.statusGeral === "todos" || statusDe(x.p) === est.statusGeral);
  linhas.sort((a, b) => total(b.r.bruta) - total(a.r.bruta));
  const soma = k => total(linhas.map(x => total(x.r[k])));
  // mesma lógica da planilha: % do resultado = ROI operacional (sobre a receita Meraki); ROI = retorno sobre o investimento (resultado ÷ despesas diretas)
  const td = (v, extra = "") => `<td class="${Math.abs(v) < .5 ? "zero" : v < 0 ? "neg" : ""} ${extra}">${brlc(v)}</td>`;
  el("t-geral-proj").innerHTML = `<table class="projs-ano"><thead><tr><th>Status</th><th>Projeto</th><th>Venda bruta</th><th>Receita Meraki</th><th>Despesas diretas</th><th>Resultado</th><th>% resultado</th><th>Custos fixos rateados</th><th>Resultado após estrutura</th><th style="text-align:center">ROI</th></tr></thead><tbody>${
    linhas.map(({p, r}) => { const res = total(r.resultado), d = total(r.desp), rm = total(r.meraki);
      return `<tr class="clic" data-p="${esc(p)}"><td><span class="selo ${statusDe(p)}">${statusDe(p)}</span></td><td style="font-weight:600">${esc(p)}</td>${td(total(r.bruta))}${td(rm)}${td(d)}${td(res)}<td class="av">${rm ? pct(res / rm) : "–"}</td>${td(total(r.fixos))}${td(total(r.aposEstrutura))}<td class="av" style="text-align:center">${d ? pct(res / -d) : "–"}</td></tr>`; }).join("")
  }${(() => { const res = soma("resultado"), d = soma("desp"), rm = soma("meraki");
    return `<tr class="total-sel"><td></td><td>Total${est.statusGeral === "todos" ? "" : " · " + est.statusGeral}</td>${td(soma("bruta"))}${td(rm)}${td(d)}${td(res)}<td>${rm ? pct(res / rm) : "–"}</td>${td(soma("fixos"))}${td(soma("aposEstrutura"))}<td style="text-align:center">${d ? pct(res / -d) : "–"}</td></tr>`; })()}</tbody></table>`;
}
el("chips-geral").addEventListener("click", e => { const b = e.target.closest("[data-st]"); if (b) { est.statusGeral = b.dataset.st; renderProjetosAno(); } });
el("t-geral-proj").addEventListener("click", e => { const tr = e.target.closest("tr[data-p]"); if (tr) { est.proj = tr.dataset.p; irPara("projetos"); } });

// ---------- fluxo de caixa ----------
// Saldo: âncora no saldo de hoje das contas da empresa (banco, aplicação e plataformas). Para trás, desconta o
// movimento real dessas contas (inclui pagamento de fatura e acertos via transferência); para frente, soma o que está
// em aberto no Conta Azul. Vencido e não pago entra no mês atual.
const HOJE = DATA.saldo_data, MES_HOJE = HOJE.slice(0, 7);
const fimMes = m => { const [a, mm] = m.split("-").map(Number); return new Date(Date.UTC(a, mm, 0)).toISOString().slice(0, 10); };
const mesAnterior = m => { const [a, mm] = m.split("-").map(Number); return mm === 1 ? `${a - 1}-12` : `${a}-${String(mm - 1).padStart(2, "0")}`; };
const nomeMes = m => `${MESES[+m.slice(5) - 1]}/${m.slice(0, 4)}`;
function movimentosFluxo() {
  // por lançamento: parte realizada (no mês do pagamento) e parte em aberto (no mês do vencimento, nunca antes do atual)
  const out = [];
  for (const l of DATA.lancamentos) {
    const real = l.v - (l.a || 0), tot = Math.abs(l.v) || 1;
    for (const [cat, cc, v] of l.r) {
      const peso = Math.abs(v) / tot;
      if (Math.abs(real) > .004 && (l.pp || l.p)) out.push({m: (l.pp || l.p).slice(0, 7), prev: false, cat, cc, v: real * peso, l});
      if (Math.abs(l.a || 0) > .004) {
        const mv = l.d.slice(0, 7) < MES_HOJE ? MES_HOJE : l.d.slice(0, 7);
        out.push({m: mv, prev: true, venc: l.d < HOJE, cat, cc, v: l.a * peso, l});
      }
    }
  }
  return out;
}
let MOVS = null;
const cacheSaldo = new Map();
function saldoFim(m) {
  if (cacheSaldo.has(m)) return cacheSaldo.get(m);
  let s = DATA.saldo_hoje;
  if (m < MES_HOJE) { for (const x of MOVS) if (!x.prev && x.m > m) s -= x.v; }
  else for (const x of MOVS) if (x.prev && x.m <= m) s += x.v;
  cacheSaldo.set(m, s);
  return s;
}
function anosFluxo() {
  MOVS = MOVS || movimentosFluxo();
  const s = new Set(anos());
  for (const x of MOVS) if (x.prev) s.add(+x.m.slice(0, 4));
  return [...s].sort();
}
function renderFluxo() {
  MOVS = MOVS || movimentosFluxo();
  const Y = String(est.ano), meses = serieMeses().map((_, i) => ym(est.ano, i));
  const doAno = MOVS.filter(x => x.m.startsWith(Y));
  const ent = serieMeses(), sai = serieMeses(), pe = serieMeses(), ps = serieMeses();
  for (const x of doAno) { const i = +x.m.slice(5) - 1; if (x.prev) (x.v > 0 ? pe : ps)[i] += x.v; else (x.v > 0 ? ent : sai)[i] += x.v; }
  const ultimoPrev = MOVS.filter(x => x.prev).reduce((a, x) => (x.m > a ? x.m : a), MES_HOJE);
  const temDado = meses.map(m => m <= ultimoPrev && m >= "2022-01");
  const sFim = meses.map((m, i) => temDado[i] ? saldoFim(m) : null);
  const sIni = meses.map((m, i) => temDado[i] ? saldoFim(mesAnterior(m)) : null);
  const proj = [...new Set(MOVS.filter(x => x.prev).map(x => x.m).concat([MES_HOJE]))].sort().map(m => [m, saldoFim(m)]);
  const menor = proj.reduce((a, b) => (b[1] < a[1] ? b : a));
  el("sub-fluxo").textContent = `${est.ano} · pontos = saldo no fim de cada mês · tracejado = previsto`;
  // o saldo é o protagonista: verde acima de zero, laranja abaixo; tracejado a partir de hoje
  const iHoje = meses.indexOf(MES_HOJE);
  const depoisDeHoje = i => (iHoje >= 0 ? i >= iHoje : meses[0] > MES_HOJE);
  // "hoje" fica no dia certo: entre o fim do mês passado e o fim deste, proporcional ao dia, com o saldo real de hoje
  const marcaHoje = {id: "marcaHoje", afterDatasetsDraw(c) { if (iHoje < 0) return;
    const ctx = c.ctx, xs = c.scales.x, ys = c.scales.y, dia = +HOJE.slice(8), diasMes = +fimMes(MES_HOJE).slice(8);
    const x0 = iHoje > 0 ? xs.getPixelForValue(iHoje - 1) : xs.getPixelForValue(0) - (xs.getPixelForValue(1) - xs.getPixelForValue(0));
    const x = x0 + (xs.getPixelForValue(iHoje) - x0) * dia / diasMes, y = ys.getPixelForValue(DATA.saldo_hoje);
    ctx.save(); ctx.setLineDash([3, 3]); ctx.strokeStyle = css("--text-3"); ctx.beginPath(); ctx.moveTo(x, c.chartArea.top); ctx.lineTo(x, c.chartArea.bottom); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = css("--ink"); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 5, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.font = "600 11px Inter, sans-serif"; ctx.textAlign = "center";
    const txt = `Hoje (${fmtDia(HOJE).slice(0, 5)}): ${Math.round(DATA.saldo_hoje / 1000).toLocaleString("pt-BR")} mil`, w = ctx.measureText(txt).width + 12, ty = c.chartArea.top - 2;
    ctx.fillStyle = "#fff"; ctx.strokeStyle = css("--line"); ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x - w / 2, ty - 12, w, 20, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = css("--ink"); ctx.fillText(txt, x, ty + 2); ctx.restore(); }};
  const rotSaldo = {id: "rotSaldo", afterDatasetsDraw(c) { const ctx = c.ctx; ctx.save(); ctx.font = "500 10px Inter, sans-serif"; ctx.textAlign = "center";
    c.getDatasetMeta(0).data.forEach((pt, i) => { const v = sFim[i]; if (v == null) return; ctx.fillStyle = v < 0 ? css("--neg") : css("--text-2");
      ctx.fillText((v < 0 ? "−" : "") + Math.round(Math.abs(v) / 1000).toLocaleString("pt-BR") + " mil", pt.x, v < 0 ? pt.y + 16 : pt.y - 9); }); ctx.restore(); }};
  grafico("g-fluxo", {type: "line", data: {labels: MESES, datasets: [{label: "Saldo no fim do mês", data: sFim, borderWidth: 2.5, tension: .3, pointRadius: 4,
    pointBorderColor: "#fff", pointBorderWidth: 2, pointBackgroundColor: sFim.map(v => (v != null && v < 0 ? css("--neg") : css("--pos"))),
    fill: {target: {value: 0}, above: "rgba(31,132,102,.12)", below: "rgba(200,96,12,.18)"},
    segment: {borderColor: c => (c.p1.parsed.y < 0 ? css("--neg") : css("--pos")), borderDash: c => (depoisDeHoje(c.p0DataIndex) ? [5, 4] : undefined)}}]},
    plugins: [marcaHoje, rotSaldo],
    options: {maintainAspectRatio: false, layout: {padding: {top: 26, right: 24}}, plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => `Saldo no fim do mês: ${brl(c.parsed.y)}`}}},
      scales: (() => { const sc = eixos(); sc.y.grace = "15%"; sc.x.offset = true; return sc; })()}});
  el("sub-contas").textContent = `Conta Azul em ${HOJE.split("-").reverse().join("/")}`;
  const contas = DATA.contas_saldo.filter(c => c.caixa && Math.abs(c.saldo) > .004).sort((a, b) => b.saldo - a.saldo);
  el("t-contas").innerHTML = `<table class="contas">${contas.map(c => `<tr><td>${esc(c.nome)}</td><td class="${c.saldo < 0 ? "neg" : ""}">${brl(c.saldo)}</td></tr>`).join("")}<tr class="tot"><td>Total disponível</td><td>${brl(DATA.saldo_hoje)}</td></tr></table>`;
  renderDias();
  FLUXO_ARGS = [doAno, meses, sIni, sFim, temDado];
  renderFluxoTabela(...FLUXO_ARGS);
}
let FLUXO_ARGS = null;
function renderFluxoTabela(doAno, meses, sIni, sFim, temDado) {
  const fut = meses.map(m => m > MES_HOJE);
  const cel = (a, forte, k) => a.map((v, i) => `<td class="${fut[i] ? "fut " : ""}${Math.abs(v) < .5 ? "zero" : v < 0 ? "neg" : ""}"${k && Math.abs(v) >= .5 ? ` data-m="${i}" data-f="${esc(k)}"` : ""}>${forte ? "<b>" : ""}${brlc(v)}${forte ? "</b>" : ""}</td>`).join("");
  const celTot = a => { const t = total(a); return `<td class="${t < 0 ? "neg" : ""}"><b>${brlc(t)}</b></td>`; };
  const celSaldo = (a, forte) => a.map((v, i) => `<td class="${fut[i] ? "fut " : ""}${v != null && v < 0 ? "neg" : ""}">${v == null ? "" : (forte ? "<b>" : "") + brlc(v) + (forte ? "</b>" : "")}</td>`).join("");
  let h = `<table><thead><tr><th>Fluxo de caixa ${est.ano}</th>${meses.map((m, i) => `<th class="${fut[i] ? "fut" : ""}">${MESES[i]}${m === MES_HOJE ? "<br><span style='font-weight:400;color:var(--marca-laranja)'>hoje</span>" : fut[i] ? "<br><span style='font-weight:400;color:var(--text-3)'>previsto</span>" : ""}</th>`).join("")}<th>Total</th></tr></thead><tbody>`;
  h += `<tr class="g"><td>Saldo inicial</td>${celSaldo(sIni)}<td></td></tr>`;
  const ordemG = ORDEM.filter(o => o.g).map(o => o.g);
  const bloco = (titulo, positivo) => {
    const xs = doAno.filter(x => positivo ? x.v > 0 : x.v < 0);
    const tot = serieMeses(); for (const x of xs) tot[+x.m.slice(5) - 1] += x.v;
    const kb = "fx|" + titulo, ab = est.abertos.has(kb);
    let r = `<tr class="g clic linha-${positivo ? "ent" : "sai"}" data-k="${esc(kb)}"><td><span class="seta">${ab ? "▾" : "▸"}</span>${positivo ? "+ Entradas" : "− Saídas"}</td>${cel(tot, true, kb)}${celTot(tot)}</tr>`;
    if (!ab) return {r, tot};
    // sempre visível: quanto já entrou/saiu e quanto ainda está em aberto
    const feito = serieMeses(), aberto = serieMeses();
    for (const x of xs) (x.prev ? aberto : feito)[+x.m.slice(5) - 1] += x.v;
    r += `<tr class="n2 sit"><td>${positivo ? "✓ Já recebido" : "✓ Já pago"}</td>${cel(feito, false, kb + "|#feito")}${celTot(feito)}</tr>`;
    r += `<tr class="n2 sit aberto"><td>${positivo ? "○ A receber" : "○ A pagar"}${(positivo ? 0 : 1) && xs.some(x => x.prev && x.venc) ? ' <span class="vencido">tem vencido</span>' : ""}</td>${cel(aberto, false, kb + "|#aberto")}${celTot(aberto)}</tr>`;
    if (!ab) return {r, tot};
    const porG = new Map();
    for (const x of xs) {
      const i = +x.m.slice(5) - 1, g = grupoCat(CAT.indexOf(x.cat)) || "Outras Despesas";
      const o = porG.get(g) || {a: serieMeses(), cats: new Map()}; o.a[i] += x.v;
      const c = o.cats.get(x.cat) || {a: serieMeses(), itens: new Map()}; c.a[i] += x.v;
      const quem = limpa(x.l.quem), desc = limpa(x.l.desc), nome = desc !== "—" && desc !== quem ? `${quem} · ${desc}` : quem;
      const it = c.itens.get(nome) || serieMeses(); it[i] += x.v; c.itens.set(nome, it);
      o.cats.set(x.cat, c); porG.set(g, o);
    }
    for (const [g, o] of [...porG].sort((a, b) => ordemG.indexOf(a[0]) - ordemG.indexOf(b[0]))) {
      const kg = kb + "|" + g, abg = est.abertos.has(kg), rot = (ORDEM.find(o2 => o2.g === g) || {rot: g}).rot.replace(/^\([−+]\) /, "");
      r += `<tr class="n2 clic" data-k="${esc(kg)}"><td><span class="seta">${abg ? "▾" : "▸"}</span>${esc(rot)}</td>${cel(o.a, false, kg)}${celTot(o.a)}</tr>`;
      if (!abg) continue;
      for (const [cat, c] of [...o.cats].sort((a, b) => Math.abs(total(b[1].a)) - Math.abs(total(a[1].a)))) {
        const kc = kg + "|" + cat, abc = est.abertos.has(kc);
        r += `<tr class="n3 clic" data-k="${esc(kc)}"><td title="${esc(cat)}"><span class="seta">${abc ? "▾" : "▸"}</span>${esc(cat)}</td>${cel(c.a, false, kc)}${celTot(c.a)}</tr>`;
        if (!abc) continue;
        for (const [nome, a] of [...c.itens].sort((x, y) => Math.abs(total(y[1])) - Math.abs(total(x[1]))))
          r += `<tr class="n4"><td title="${esc(nome)}">${esc(nome)}</td>${cel(a, false, kc + "|" + nome)}${celTot(a)}</tr>`;
      }
    }
    return {r, tot};
  };
  const E = bloco("Entradas", true), S = bloco("Saídas", false);
  h += E.r + S.r;
  const res = E.tot.map((v, i) => v + S.tot[i]);
  const aj = [];
  if (false)
    h += `<tr class="n2"><td title="As compras no cartão aparecem no mês em que foram feitas, mas o banco às vezes paga a fatura só no mês seguinte. Esta linha corrige essa diferença para o saldo bater com o extrato do banco.">Fatura de cartão paga em outro mês ⓘ</td>${cel(aj)}${celTot(aj)}</tr>`;
  h += `<tr class="tot destaque saldo-final"><td>Saldo final</td>${celSaldo(sFim, true)}<td></td></tr>`;
  el("t-fluxo").innerHTML = h + "</tbody></table>";
}
const nomeItem = l => { const quem = limpa(l.quem), desc = limpa(l.desc); return desc !== "—" && desc !== quem ? `${quem} · ${desc}` : quem; };
el("t-fluxo").addEventListener("click", e => {
  const td = e.target.closest("td[data-f]");
  if (td) {  // abre os lançamentos daquela célula: fx|Entradas|grupo|categoria|item (ou |#feito / |#aberto)
    const [, bloco, ...resto] = td.dataset.f.split("|"), m = FLUXO_ARGS[1][+td.dataset.m];
    const sit = resto[0] === "#feito" ? false : resto[0] === "#aberto" ? true : null, [g, cat, item] = sit === null ? resto : [];
    const xs = MOVS.filter(x => x.m === m && (bloco === "Entradas" ? x.v > 0 : x.v < 0) && (sit === null || x.prev === sit)
      && (!g || (grupoCat(CAT.indexOf(x.cat)) || "Outras Despesas") === g) && (!cat || x.cat === cat) && (!item || nomeItem(x.l) === item));
    const rot = [bloco, sit === true ? (bloco === "Entradas" ? "a receber" : "a pagar") : sit === false ? (bloco === "Entradas" ? "já recebido" : "já pago") : null, cat || (g && (ORDEM.find(o => o.g === g) || {rot: g}).rot.replace(/^\([−+]\) /, "")), item].filter(Boolean).join(" · ");
    mostrarLancamentos(rot, `fluxo de caixa · ${MESES[+m.slice(5) - 1].toLowerCase()}/${m.slice(0, 4)}`, xs.map(x => ({l: x.l, cat: x.cat, cc: x.cc, v: x.v, prev: x.prev})), "c");
    return;
  }
  const tr = e.target.closest("tr[data-k]"); if (!tr) return;
  const k = tr.dataset.k; est.abertos.has(k) ? est.abertos.delete(k) : est.abertos.add(k);
  renderFluxoTabela(...FLUXO_ARGS);
});

// ---------- caixa dia a dia (próximos 90 dias) ----------
// Parte do saldo de hoje e soma cada conta em aberto no dia do vencimento (vencidas entram hoje).
const fmtDia = d => d.split("-").reverse().join("/");
const somaDias = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
function diasCaixa() {
  const porDia = new Map();
  for (const l of DATA.lancamentos) {
    if (Math.abs(l.a || 0) <= .004) continue;
    const d = l.d < HOJE ? HOJE : l.d;
    const o = porDia.get(d) || {ent: 0, sai: 0, itens: []};
    l.a > 0 ? (o.ent += l.a) : (o.sai += l.a);
    o.itens.push(l); porDia.set(d, o);
  }
  let s = DATA.saldo_hoje;
  return [...porDia].sort((a, b) => a[0].localeCompare(b[0])).map(([d, o]) => ({d, ...o, saldo: (s += o.ent + o.sai)}));
}
const PERIODOS = [[30, "30 dias"], [60, "60 dias"], [90, "90 dias"], [120, "120 dias"], [180, "6 meses"], [365, "1 ano"]];
function renderDias() {
  const N = est.dias || 90;
  el("chips-dias").innerHTML = PERIODOS.map(([n, r]) => `<button class="chip ${n === N ? "on" : ""}" data-n="${n}">${r}</button>`).join("");
  const dias = diasCaixa(), fim = somaDias(HOJE, N);
  const janela = dias.filter(x => x.d <= fim);
  // cards do topo acompanham o período escolhido
  const nomeP = PERIODOS.find(q => q[0] === N)[1], itensJ = janela.flatMap(x => x.itens);
  const soma = f => total(itensJ.filter(f).map(l => l.a));
  const aRec = soma(l => l.a > 0), aPag = soma(l => l.a < 0), vRec = soma(l => l.a > 0 && l.d < HOJE), vPag = soma(l => l.a < 0 && l.d < HOJE);
  const saldoFimJ = janela.length ? janela[janela.length - 1].saldo : DATA.saldo_hoje;
  const menorJ = janela.reduce((m, x) => (x.saldo < m.saldo ? x : m), {d: HOJE, saldo: DATA.saldo_hoje});
  el("kpis-fluxo").innerHTML = [
    ["Saldo hoje", brl(DATA.saldo_hoje), `contas da empresa em ${fmtDia(HOJE)}`, true],
    [`A receber · ${nomeP}`, brl(aRec), vRec ? `${brl(vRec)} já vencido` : "nada vencido"],
    [`A pagar · ${nomeP}`, brl(aPag), vPag ? `${brl(vPag)} já vencido` : "nada vencido"],
    [`Saldo em ${fmtDia(fim)}`, brl(saldoFimJ), "se tudo for pago e recebido até lá"],
    [`Menor saldo · ${nomeP}`, brl(menorJ.saldo), `em ${fmtDia(menorJ.d)}`],
  ].map(([r, v, c, d]) => `<div class="cartao kpi ${d ? "destaque" : ""}"><div class="rot">${r}</div><div class="val" style="${v.startsWith("−") ? "color:var(--neg)" : ""}">${v}</div><div class="cmp">${c}</div></div>`).join("");
  const primeiroNeg = dias.find(x => x.saldo < 0);
  // série diária contínua para o gráfico
  const labels = [], serie = [];
  let s = DATA.saldo_hoje, k = 0;
  for (let i = 0; i <= N; i++) {
    const d = somaDias(HOJE, i);
    while (k < janela.length && janela[k].d === d) s = janela[k++].saldo;
    labels.push(d); serie.push(s);
  }
  grafico("g-dias", {type: "line", data: {labels: labels.map(d => d.slice(8) + "/" + d.slice(5, 7)), datasets: [{
    label: "Saldo no fim do dia", data: serie, stepped: true, borderWidth: 2, pointRadius: 0, pointHitRadius: 6,
    borderColor: css("--pos"), fill: {target: {value: 0}, above: "rgba(31,132,102,.10)", below: "rgba(200,96,12,.16)"},
    segment: {borderColor: c => (c.p1.parsed.y < 0 ? css("--neg") : css("--pos"))},
  }]}, options: {maintainAspectRatio: false, interaction: {mode: "index", intersect: false},
    plugins: {legend: {display: false}, tooltip: {callbacks: {title: c => fmtDia(labels[c[0].dataIndex]), label: c => `Saldo: ${brl(c.parsed.y)}`}}},
    scales: eixos({x: {grid: {display: false}, border: {color: css("--line")}, ticks: {maxRotation: 0, autoSkip: true, maxTicksLimit: 10}}})}});
  el("sub-dias").innerHTML = primeiroNeg
    ? `O caixa fica negativo em <b style="color:var(--neg)">${fmtDia(primeiroNeg.d)}</b> (${brl(primeiroNeg.saldo)}), se nada novo entrar até lá.`
    : `Com o que está agendado, o saldo não fica negativo nos próximos ${PERIODOS.find(p => p[0] === N)[1]}.`;
  el("t-dias").innerHTML = `<table><thead><tr><th>Dia</th><th>Entra</th><th>Sai</th><th>Saldo do dia</th></tr></thead><tbody>${
    janela.map((x, i) => `<tr class="clic${x.saldo < 0 ? " negdia" : ""}" data-i="${i}"><td title="${x.itens.length} lançamentos">${fmtDia(x.d)}${x.d === HOJE && x.itens.some(l => l.d < HOJE) ? ' <span class="vencido" title="inclui contas vencidas e não pagas">vencidos</span>' : ""}</td><td>${x.ent ? brlc(x.ent) : "–"}</td><td class="${x.sai ? "neg" : "zero"}">${x.sai ? brlc(x.sai) : "–"}</td><td class="${x.saldo < 0 ? "neg" : ""}"><b>${brlc(x.saldo)}</b></td></tr>`).join("")
  }</tbody></table>`;
  renderDias.janela = janela;
}
function abrirDia(x) {
  el("m-tit").textContent = `Vencimentos de ${fmtDia(x.d)}`;
  el("m-sub").textContent = `${x.itens.length} lançamentos em aberto · saldo no fim do dia ${brl(x.saldo)}`;
  el("m-corpo").innerHTML = `<table><thead><tr><th>Vencimento</th><th style="text-align:left">Descrição</th><th style="text-align:left">Cliente/fornecedor</th><th style="text-align:left">Categoria</th><th>Em aberto</th></tr></thead><tbody>${
    x.itens.sort((a, b) => a.a - b.a).map(l => `<tr><td>${fmtDia(l.d)}</td><td style="text-align:left">${esc(l.desc)}</td><td style="text-align:left">${esc(l.quem)}</td><td style="text-align:left">${esc(l.r.map(r => r[0]).filter((v, i, a) => a.indexOf(v) === i).join(", "))}</td><td class="${l.a < 0 ? "neg" : ""}">${brlc(l.a)}</td></tr>`).join("")
  }</tbody></table>`;
  el("modal").classList.add("on");
}
el("chips-dias").addEventListener("click", e => { const b = e.target.closest("[data-n]"); if (b) { est.dias = +b.dataset.n; renderDias(); } });
el("t-dias").addEventListener("click", e => { const tr = e.target.closest("tr[data-i]"); if (tr) abrirDia(renderDias.janela[+tr.dataset.i]); });

function renderProjetos() {
  const ps = listaProjetos();
  const cont = s => ps.filter(p => statusDe(p) === s).length;
  el("chips-status").innerHTML = [["andamento", "Em andamento"], ["novo", "Novos"], ["encerrado", "Encerrados"], ["todos", "Todos"]]
    .map(([s, r]) => `<button class="chip ${est.status === s ? "on" : ""}" data-st="${s}">${r} (${s === "todos" ? ps.length : cont(s)})</button>`).join("");
  if (est.proj) return renderProjetoDetalhe(est.proj);
  el("proj-lista").style.display = ""; el("proj-detalhe").style.display = "none";
  atualizaControlesPeriodo();
  const vis = ps.filter(p => est.status === "todos" || statusDe(p) === est.status).map(p => ({p, r: resumoProjetoPeriodo(p)}));
  vis.sort((a, b) => total(b.r.bruta) - total(a.r.bruta));
  const rk = vis.map(x => [x.p, total(x.r.resultado)]).filter(x => Math.abs(x[1]) > .5).sort((a, b) => b[1] - a[1]);
  el("sub-ranking").textContent = `Resultado do projeto · ${rotuloPeriodo()} · verde = lucro, laranja = prejuízo`;
  el("box-ranking").style.height = Math.max(90, rk.length * 22 + 24) + "px";
  grafico("g-ranking", {type: "bar", data: {labels: rk.map(x => x[0]), datasets: [{label: "Resultado", data: rk.map(x => x[1]), backgroundColor: rk.map(x => (x[1] >= 0 ? css("--pos") : css("--neg"))), borderRadius: 3, borderSkipped: false, maxBarThickness: 13, categoryPercentage: .8}]},
    plugins: [{id: "vRank", afterDatasetsDraw(c) { const ctx = c.ctx; ctx.save(); ctx.font = "500 11px Inter, sans-serif"; ctx.fillStyle = css("--text-2");
      c.getDatasetMeta(0).data.forEach((b, j) => { const v = rk[j][1]; ctx.textAlign = v >= 0 ? "left" : "right"; ctx.fillText(brl(v), v >= 0 ? b.x + 6 : b.x - 6, b.y + 4); }); ctx.restore(); }}],
    options: {indexAxis: "y", maintainAspectRatio: false, layout: {padding: {left: 70, right: 90}}, plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => `Resultado: ${brl(c.parsed.x)}`}}},
      scales: {x: {grid: {color: c => (c.tick.value === 0 ? css("--text-3") : "transparent"), drawTicks: false}, border: {display: false}, ticks: {display: false}},
               y: {grid: {display: false}, border: {display: false}, ticks: {font: {weight: "500"}}}}}});
  el("cards-proj").innerHTML = vis.map(({p, r}) => {
    const temAno = r.fonte.some(Boolean), fontes = [...new Set(r.fonte.filter(Boolean))].join(" + ");
    return `<div class="cartao proj" data-p="${esc(p)}"><div class="nome">${esc(p)} <span class="selo ${statusDe(p)}">${statusDe(p)}</span></div>
      ${temAno ? `<div class="linha">Venda bruta <b>${brl(total(r.bruta))}</b></div><div class="linha">Receita Meraki <b>${brl(total(r.meraki))}</b></div>
      <div class="linha">Despesas diretas <b>${brl(total(r.desp))}</b></div><div class="linha">Resultado <b style="color:${total(r.resultado) < 0 ? "var(--neg)" : "inherit"}">${brl(total(r.resultado))}</b></div>
      ` : `<div class="fonte">Sem movimento em ${rotuloPeriodo()}</div>`}</div>`;
  }).join("") || `<div class="sub">Nenhum projeto nesse filtro.</div>`;
}
el("chips-status").addEventListener("click", e => { const b = e.target.closest("[data-st]"); if (b) { est.status = b.dataset.st; est.proj = null; renderProjetos(); } });
el("cards-proj").addEventListener("click", e => { const c = e.target.closest("[data-p]"); if (c) { est.proj = c.dataset.p; atualizaControlesPeriodo(); renderProjetos(); window.scrollTo(0, 0); } });

// do que é feito o valor de "despesas diretas" no resumo (só nos meses que entram no resumo)
function composicaoDespesas(r) {
  const vale = a => a.map((v, i) => (r.fonte[i] ? v : 0)), linhas = [];
  if (r.ligado) {
    const das = resumoManual(r.regs, est.ano).das;
    if (total(das.map(Math.abs))) linhas.push(["DAS (rateio da planilha)", vale(das)]);
    for (const [cat, c] of r.ligado.porCat) linhas.push([cat, vale(c.a)]);
  } else {
    for (const x of r.regs.filter(x => x.bloco === "despesa" && x.nivel === 1 && x.tipo === "despesa" && !/^despesas$/i.test(x.rotulo.trim()))) {
      const a = serieMeses(); for (const [m, v] of Object.entries(x.valores)) if (m.startsWith(String(est.ano))) a[+m.slice(5) - 1] -= Math.abs(v);
      linhas.push([x.rotulo, vale(a)]);
    }
  }
  return linhas.filter(([, a]) => total(a.map(Math.abs)) > .5).sort((a, b) => total(a[1]) - total(b[1]));
}
function renderProjetoDetalhe(p) {
  el("proj-lista").style.display = "none"; const box = el("proj-detalhe"); box.style.display = "";
  const r = resumoProjeto(p, est.ano);
  const linhaRes = (rot, a, cls = "") => `<tr class="${cls}"><td>${rot}</td>${celulas(a)}</tr>`;
  const razao = (a, b) => a.map((v, i) => b[i] ? v / Math.abs(b[i]) : NaN);
  const linhaPct = (rot, a, b, dica) => `<tr><td title="${dica}">${rot}</td>${razao(a, b).map(v => `<td class="av">${pct(v)}</td>`).join("")}<td class="av">${pct(total(a) / Math.abs(total(b)))}</td><td></td></tr>`;
  const regs = r.regs;
  let prod = "";
  if (regs.length) {
    // vendas por plataforma > produto, como nas abas da planilha
    // cada plataforma abre/fecha: produtos, taxas, líquido e a divisão Expert/Meraki ficam dentro dela
    let h = "", plat = null;
    const doAnoP = x => Object.entries(x.valores).reduce((t, [m, v]) => t + (m.startsWith(String(est.ano)) ? v : 0), 0);
    const recRegs = [];
    for (const x of regs.filter(x => x.bloco === "receita")) {  // ordena cada bloco de produtos pelo total vendido no ano
      if (x.nivel === 2 && recRegs.length && recRegs[recRegs.length - 1].nivel === 2) { let j = recRegs.length; while (j > 0 && recRegs[j - 1].nivel === 2 && doAnoP(recRegs[j - 1]) < doAnoP(x)) j--; recRegs.splice(j, 0, x); }
      else recRegs.push(x);
    }
    for (const x of recRegs) {
      const a = serieMeses(); for (const [m, v] of Object.entries(x.valores)) if (m.startsWith(String(est.ano))) a[+m.slice(5) - 1] += v;
      if (x.tipo === "plataforma") plat = x.rotulo; else if (x.tipo === "total") plat = null;
      if (!total(a.map(Math.abs))) continue;
      const vv = ["taxa"].includes(x.tipo) ? a.map(v => -Math.abs(v)) : a;
      const kp = "rp|" + p + "|" + plat, aberta = est.recTudo ? !est.abertos.has(kp + "|x") : est.abertos.has(kp);
      if (x.tipo === "plataforma") { h += `<tr class="g clic" data-k="${esc(kp)}"><td title="${esc(x.rotulo)}"><span class="seta">${aberta ? "▾" : "▸"}</span>${esc(x.rotulo)}</td>${celulas(vv)}</tr>`; continue; }
      if (plat && !aberta) continue;
      const cls = x.tipo === "total" ? "tot" : x.nivel === 2 ? "n3" : "n2";
      h += `<tr class="${cls}"><td title="${esc(x.rotulo)}">${esc(x.rotulo)}</td>${celulas(vv)}</tr>`;
    }
    let d = "";
    if (r.ligado) {
      // despesas vindas do Conta Azul (clicáveis) + DAS da planilha
      const das = resumoManual(regs, est.ano).das, totD = r.ligado.tot.map((v, i) => v + das[i]);
      d += `<tr class="tot"><td>Despesas</td>${celulas(totD)}</tr>`;
      if (total(das.map(Math.abs))) d += `<tr class="g"><td title="Rateio calculado na planilha; não existe por projeto no Conta Azul">DAS (rateio da planilha)</td>${celulas(das)}</tr>`;
      for (const [cat, c] of [...r.ligado.porCat].sort((a, b) => total(a[1].a) - total(b[1].a))) {
        const k = "pd|" + p + "|" + cat, ab = est.abertos.has(k);
        d += `<tr class="g clic" data-k="${esc(k)}" data-cat="${esc(cat)}"><td><span class="seta">${ab ? "▾" : "▸"}</span>${esc(cat)}</td>${celulas(c.a, 0, true)}</tr>`;
        if (!ab) continue;
        const itens = [...c.itens].sort((x, y) => total(x[1]) - total(y[1]));
        const grupos = cat === "Marketing e Publicidade" ? [...new Set(itens.map(([n]) => grupoMkt(n)))] : [null];
        for (const g of grupos) {
          const doG = itens.filter(([n]) => !g || grupoMkt(n) === g);
          let ind = "n2";
          if (g) {
            const kg = k + "|" + g, abg = est.abertos.has(kg), ag = serieMeses(); doG.forEach(([, a]) => a.forEach((v, i) => ag[i] += v));
            d += `<tr class="n2 clic" data-k="${esc(kg)}" data-cat="${esc(cat)}" data-grupo="${esc(g)}"><td><span class="seta">${abg ? "▾" : "▸"}</span>${esc(g)}</td>${celulas(ag, 0, true)}</tr>`;
            if (!abg) continue;
            ind = "n3";
          }
          for (const [nome, a] of doG) d += `<tr class="${ind}" data-cat="${esc(cat)}" data-item="${esc(nome)}"><td title="${esc(nome)}">${esc(nome)}</td>${celulas(a, 0, true)}</tr>`;
        }
      }
    } else for (const x of regs.filter(x => x.bloco === "despesa" && x.tipo !== "resultado")) {
      const a = serieMeses(); for (const [m, v] of Object.entries(x.valores)) if (m.startsWith(String(est.ano))) a[+m.slice(5) - 1] += v;
      if (!total(a.map(Math.abs))) continue;
      const cls = /^despesas$/i.test(x.rotulo.trim()) ? "tot" : x.nivel === 1 ? "g" : "n2";
      d += `<tr class="${cls}"><td title="${esc(x.rotulo)}">${esc(x.rotulo)}</td>${celulas(a.map(v => -Math.abs(v)))}</tr>`;
    }
    const produtos = new Map();
    for (const x of regs.filter(x => x.tipo === "produto")) { let s = 0; for (const [m, v] of Object.entries(x.valores)) if (m.startsWith(String(est.ano))) s += v; if (s) produtos.set(x.rotulo, (produtos.get(x.rotulo) || 0) + s); }
    // os 8 maiores e o resto somado em "Outros"
    const ord = [...produtos].sort((a, b) => b[1] - a[1]), soma = total(ord.map(x => x[1]));
    const top = ord.slice(0, 8);
    if (ord.length > 8) top.push([`Outros (${ord.length - 8} produtos)`, total(ord.slice(8).map(x => x[1]))]);
    const max = Math.max(1, ...top.map(x => x[1]));
    prod = `<h2>Vendas por produto (${est.ano})</h2><div class="cartao"><table style="width:100%">${top.map(([n, v]) => `<tr><td style="position:static;min-width:0;max-width:none;white-space:normal">${esc(n)}</td><td style="width:40%"><div class="barra"><i style="width:${(v / max * 100).toFixed(1)}%"></i></div></td><td>${brl(v)}</td><td class="av">${pct(v / soma)}</td></tr>`).join("")}</table></div>
      <div style="display:flex;align-items:center;gap:12px;margin:24px 0 10px"><h2 style="margin:0">Receitas por plataforma</h2><button class="chip" id="rec-tudo">${est.recTudo ? "Recolher tudo" : "Expandir tudo"}</button></div><div class="tabela-wrap" id="t-rec-proj"><table><thead><tr><th>Receita ${est.ano}</th>${MESES.map(m => `<th>${m}</th>`).join("")}<th>Total</th><th></th></tr></thead><tbody>${h}</tbody></table></div>
      <h2>Despesas diretas</h2><div class="tabela-wrap" id="t-desp-proj"><table><thead><tr><th>Despesas ${est.ano}</th>${MESES.map(m => `<th>${m}</th>`).join("")}<th>Total</th><th></th></tr></thead><tbody>${d}</tbody></table></div>`;
  } else {
    prod = `<div class="aviso" style="margin-top:14px">Não há detalhamento por produto digitado para ${esc(p)} em ${est.ano}. Os números acima vêm do Conta Azul (centros de custo "${esc(p)}" e "Meraki_${esc(p)}").</div>`;
  }
  const fontes = r.fonte.map(f => f === "planilha" ? "P" : f === "conta azul" ? "CA" : "");
  box.innerHTML = `<button class="voltar" id="voltar">← Todos os projetos</button>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><h2 style="margin:0;font-size:20px">${esc(p)}</h2><span class="selo ${statusDe(p)}">${statusDe(p)}</span></div>
    <div class="grade kpis">${[["Venda bruta", total(r.bruta)], ["Receita Meraki", total(r.meraki)], ["Despesas diretas", total(r.desp)], ["Resultado do projeto", total(r.resultado)], ["Após custos fixos", total(r.aposEstrutura)]]
      .map(([rot, v]) => `<div class="cartao kpi"><div class="rot">${rot}</div><div class="val" style="${v < 0 ? "color:var(--neg)" : ""}">${brl(v)}</div></div>`).join("")}</div>
    <div class="tabela-wrap"><table><thead><tr><th>Resumo ${est.ano}</th>${MESES.map((m, i) => `<th>${m}</th>`).join("")}<th>Total</th><th></th></tr></thead><tbody>
      ${linhaRes("(+) Venda bruta", r.bruta)}${linhaRes("Receita Meraki", r.meraki, "g")}
      <tr class="clic" id="abre-desp"><td><span class="seta">${est.abertos.has("rd|" + p) ? "▾" : "▸"}</span>(−) Despesas diretas</td>${celulas(r.desp)}</tr>
      ${est.abertos.has("rd|" + p) ? composicaoDespesas(r).map(([rot, a]) => `<tr class="n2"><td title="${esc(rot)}">${esc(rot)}</td>${celulas(a)}</tr>`).join("") : ""}
      ${linhaRes("(=) Resultado do projeto", r.resultado, "tot")}
      ${linhaPct("ROI operacional", r.resultado, r.meraki, "Resultado do projeto ÷ receita Meraki")}
      ${linhaRes("(−) Custos fixos rateados", r.fixos)}${linhaRes("(=) Resultado após estrutura", r.aposEstrutura, "tot")}
      ${linhaPct("ROI gerencial (com estrutura)", r.aposEstrutura, r.meraki, "Resultado após estrutura ÷ receita Meraki")}
      ${linhaPct("Retorno sobre o investimento", r.resultado, r.desp, "Resultado do projeto ÷ despesas diretas")}
    </tbody></table></div>
    ${prod}`;
  el("voltar").onclick = () => { est.proj = null; atualizaControlesPeriodo(); renderProjetos(); };
  const trp = el("t-rec-proj");
  if (trp) trp.onclick = e => { const tr = e.target.closest("tr[data-k]"); if (!tr) return; const k = tr.dataset.k;
    if (est.recTudo) est.abertos.has(k + "|x") ? est.abertos.delete(k + "|x") : est.abertos.add(k + "|x"); else est.abertos.has(k) ? est.abertos.delete(k) : est.abertos.add(k);
    const y = window.scrollY; renderProjetoDetalhe(p); window.scrollTo(0, y); };
  const rt = el("rec-tudo");
  if (rt) rt.onclick = () => { est.recTudo = !est.recTudo; [...est.abertos].filter(k => k.startsWith("rp|")).forEach(k => est.abertos.delete(k)); const y = window.scrollY; renderProjetoDetalhe(p); window.scrollTo(0, y); };
  el("abre-desp").onclick = () => { const k = "rd|" + p; est.abertos.has(k) ? est.abertos.delete(k) : est.abertos.add(k); const y = window.scrollY; renderProjetoDetalhe(p); window.scrollTo(0, y); };
  const tdp = el("t-desp-proj");
  if (tdp && r.ligado) tdp.onclick = e => {
    const td = e.target.closest("td[data-m]"), tr = e.target.closest("tr");
    if (td && tr.dataset.cat) {
      const i = +td.dataset.m, xs = r.ligado.itens.filter(x => x.i === i && x.cat === tr.dataset.cat && (!tr.dataset.item || x.nome === tr.dataset.item) && (!tr.dataset.grupo || grupoMkt(x.nome) === tr.dataset.grupo));
      mostrarLancamentos(`${p} · ${tr.dataset.cat}${tr.dataset.grupo ? " · " + tr.dataset.grupo : ""}${tr.dataset.item ? " · " + tr.dataset.item : ""}`, `competência em ${MESES[i].toLowerCase()}/${est.ano}`, xs.map(x => ({l: x.l, cat: x.cat, cc: x.cc, v: x.v})), "k");
      return;
    }
    if (tr && tr.dataset.k) { est.abertos.has(tr.dataset.k) ? est.abertos.delete(tr.dataset.k) : est.abertos.add(tr.dataset.k); const y = window.scrollY; renderProjetoDetalhe(p); window.scrollTo(0, y); }
  };
}

function renderComposicao() {
  // despesas operacionais do ano por grupo; no passar do mouse, as 5 maiores categorias do grupo + outros
  const grupos = [["Despesas Comerciais", "Variáveis"], ["Despesas com Pessoal", "Pessoal"], ["Despesas com Diretoria", "Diretoria"], ["Despesas Administrativas", "Administrativas"]];
  const cores = [css("--pos"), css("--neg"), css("--marca-oliva"), "#b8a27a"];
  const fs = fatos("c", est.ano);
  const dados = grupos.map(([g, rot]) => { const cats = new Map(); let t = 0;
    for (const f of fs) if (grupoCat(f[2]) === g && f[4] < 0) { t -= f[4]; cats.set(CAT[f[2]], (cats.get(CAT[f[2]]) || 0) - f[4]); }
    const ord = [...cats].sort((a, b) => b[1] - a[1]); const top = ord.slice(0, 5); if (ord.length > 5) top.push(["Outros", ord.slice(5).reduce((s, x) => s + x[1], 0)]);
    return {rot, t, top}; });
  const tot = dados.reduce((s, d) => s + d.t, 0) || 1;
  el("sub-comp").textContent = `Quanto cada grupo pesa no total das despesas operacionais de ${est.ano} · passe o mouse para ver as categorias`;
  el("leg-comp").innerHTML = dados.map((d, i) => `<span style="--c:${cores[i]}">${d.rot} ${pct(d.t / tot)} · ${brl(d.t)}</span>`).join("");
  grafico("g-comp", {type: "bar", data: {labels: [String(est.ano)], datasets: dados.map((d, i) => ({label: d.rot, data: [d.t], backgroundColor: cores[i], borderColor: "#fff", borderWidth: {right: 2}, borderSkipped: false, maxBarThickness: 36}))},
    options: {indexAxis: "y", maintainAspectRatio: false, plugins: {legend: {display: false}, tooltip: {callbacks: {
      title: c => `${c[0].dataset.label} · ${brl(c[0].parsed.x)} (${pct(c[0].parsed.x / tot)})`,
      label: c => dados[c.datasetIndex].top.map(([n, v]) => `${n}: ${brl(v)}`)}}},
      scales: {x: {stacked: true, display: false, max: tot}, y: {stacked: true, display: false}}}});
}
function renderFixos(soTabela) {  // soTabela: só abriu/fechou uma linha, não redesenha o gráfico
  if (!soTabela) renderComposicao();
  const calc = custosFixosCalc(est.ano);
  const tot = custosFixosMes(est.ano);
  // categorias (com seus prestadores/fornecedores): planilha nos meses digitados, Conta Azul nos demais
  const cats = new Map(), chave = t => limpa(t).toLowerCase();
  const pegaCat = rot => { const k = chave(rot); if (!cats.has(k)) cats.set(k, {rot, a: serieMeses(), subs: new Map()}); return cats.get(k); };
  const pegaSub = (c, rot) => { const k = chave(rot); if (!c.subs.has(k)) c.subs.set(k, {rot: limpa(rot), a: serieMeses()}); return c.subs.get(k); };
  let atual = null;
  for (const r of DATA.custos_fixos_manuais.filter(r => r.nivel > 0)) {
    const alvo = r.nivel === 1 ? (atual = pegaCat(r.rotulo)) : pegaSub(atual, r.rotulo);
    for (const [m, v] of Object.entries(r.valores)) if (m.startsWith(String(est.ano))) alvo.a[+m.slice(5) - 1] += v;
  }
  for (const [cat, c] of calc) {
    const dest = pegaCat(cat);
    c.a.forEach((v, i) => { if (!cfManual(ym(est.ano, i))) dest.a[i] += v; });
    for (const [quem, a] of c.subs) { const sub = pegaSub(dest, quem); a.forEach((v, i) => { if (!cfManual(ym(est.ano, i))) sub.a[i] += v; }); }
  }
  const vivas = [...cats.values()].filter(x => total(x.a.map(Math.abs)) > 0.5);
  if (!soTabela) grafico("g-fixos", {type: "bar", data: {labels: MESES, datasets: [barra("Custos fixos", tot.map(v => -v), css("--marca-oliva"))]},
    options: {maintainAspectRatio: false, plugins: {legend: {display: false}, tooltip: {callbacks: {label: c => brl(c.parsed.y)}}}, scales: eixos()}});
  const fontes = serieMeses().map((_, i) => cfManual(ym(est.ano, i)) ? "P" : ym(est.ano, i) <= mesAtual ? "CA" : "");
  let h = `<table><thead><tr><th>Custos fixos ${est.ano}</th>${MESES.map(m => `<th>${m}</th>`).join("")}<th>Total</th><th></th></tr></thead><tbody>`;
  for (const c of vivas) {
    const subs = [...c.subs.values()].filter(x => total(x.a.map(Math.abs)) > 0.5).sort((x, y) => total(x.a) - total(y.a));
    const k = "cf|" + chave(c.rot), aberto = est.abertos.has(k) || (c.rot === "Prestador de Serviços" && !est.abertos.has(k + "|fechado"));
    h += `<tr class="clic" data-cat="${esc(c.rot)}" data-k="${esc(k)}" data-aberto="${aberto ? 1 : 0}"><td><span class="seta">${subs.length ? (aberto ? "▾" : "▸") : ""}</span>${esc(c.rot)}</td>${celulas(c.a, 0, true)}</tr>`;
    if (aberto) for (const sb of subs) { const fx = (DATA.fixos_mensais || []).find(f => f.categoria === c.rot && chave(f.item) === chave(sb.rot));
      h += `<tr class="n2" data-cat="${esc(c.rot)}" data-sub="${esc(sb.rot)}"><td title="${esc(sb.rot)}">${esc(sb.rot)}${fx ? ` <span class="tag-fora" title="Inclui ${brl(fx.valor)} por mês de fixo de ${esc(fx.quem)}, que não passa pelo Conta Azul">+ fixo sócio</span>` : ""}</td>${celulas(sb.a, 0, true)}</tr>`; }
  }
  el("t-fixos").innerHTML = h + `<tr class="tot"><td>Total</td>${celulas(tot)}</tr></tbody></table>`;
  const regras = DATA.rateio.filter(r => r.de.slice(0, 4) <= String(est.ano) && r.ate.slice(0, 4) >= String(est.ano));
  el("aviso-rateio").innerHTML = regras.length ? "Regra de rateio em " + est.ano + ": " + regras.map(r => `${r.de.slice(5)}/${r.de.slice(0, 4)}${r.ate < "2099" ? " a " + r.ate.slice(5) + "/" + r.ate.slice(0, 4) : " em diante"} → ${Object.entries(r.projetos).map(([p, v]) => `${p} ${pct(v)}`).join(", ")}`).join(" · ")
    : `Não havia rateio de custos fixos em ${est.ano}. O rateio começou em 2025.`;
  const projs = [...new Set(regras.flatMap(r => Object.keys(r.projetos)))];
  el("t-rateio").innerHTML = projs.length ? `<table><thead><tr><th>Projeto</th>${MESES.map(m => `<th>${m}</th>`).join("")}<th>Total</th><th></th></tr></thead><tbody>${
    projs.map(p => `<tr><td>${esc(p)}</td>${celulas(resumoProjeto(p, est.ano).fixos)}</tr>`).join("")}</tbody></table>` : "";
}
el("t-fixos").addEventListener("click", e => {
  const td = e.target.closest("td[data-m]"), tr = e.target.closest("tr[data-cat]");
  if (!tr) return;
  if (td) {
    const sub = tr.dataset.sub, cat = tr.dataset.cat, chave = t => limpa(t).toLowerCase();
    const filtroQuem = sub ? ((l, c) => chave(c === "Prestador de Serviços" ? l.desc : l.quem) === chave(sub)) : null;
    const mes = `${est.ano}-${String(+td.dataset.m + 1).padStart(2, "0")}`;
    const extras = cfManual(mes) || mes > mesAtual || mes < inicioRateio ? [] : (DATA.fixos_mensais || []).filter(f => f.categoria === cat && (!sub || chave(f.item) === chave(sub)))
      .map(f => ({l: {}, cat, cc: "Meraki", v: f.valor, fora: f}));
    const r0 = est.regime; est.regime = "c";
    abrirLancamentos(cat + (sub ? " · " + sub : "") + " · Estrutura Meraki", {mes, cats: new Set([cat]), proj: "Estrutura Meraki", quem: filtroQuem, extras});
    est.regime = r0; return;
  }
  const k = tr.dataset.k;
  if (tr.dataset.aberto === "1") { est.abertos.delete(k); est.abertos.add(k + "|fechado"); } else { est.abertos.add(k); est.abertos.delete(k + "|fechado"); }
  renderFixos(true);
});

// ---------- navegação ----------
function render() {
  ({geral: renderGeral, dre: renderDRE, fluxo: renderFluxo, projetos: renderProjetos, fixos: renderFixos})[est.aba]();
}
function irPara(aba) {
  est.aba = aba;
  document.querySelectorAll("#abas button").forEach(b => b.classList.toggle("on", b.dataset.s === aba));
  document.querySelectorAll(".secao").forEach(s => s.classList.toggle("on", s.id === "s-" + aba));
  el("regime").style.visibility = ["fluxo", "fixos"].includes(aba) ? "hidden" : "visible";
  el("dre-controles").style.display = aba === "dre" ? "" : "none";
  atualizaControlesPeriodo();
  preencheAnos(aba === "fluxo" ? anosFluxo() : anos());  // o fluxo vai até o último ano com agendamento (2027...)
  render();
}
function preencheAnos(lista) {
  if (!lista.includes(est.ano)) est.ano = Math.min(Math.max(est.ano, lista[0]), lista[lista.length - 1]);
  el("ano").innerHTML = lista.map(a => `<option ${a === est.ano ? "selected" : ""}>${a}</option>`).join("");
}
el("abas").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { if (b.dataset.s !== "projetos") est.proj = null; irPara(b.dataset.s); } });
el("regime").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; est.regime = b.dataset.r; el("regime").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); render(); });
const as = anos(); est.ano = as.includes(new Date().getFullYear()) ? new Date().getFullYear() : as[as.length - 1];
el("ano").addEventListener("change", e => { est.ano = +e.target.value; render(); });
est.periodo = {de: `${est.ano}-01`, ate: MES_HOJE};
el("per-de").value = est.periodo.de; el("per-ate").value = est.periodo.ate;
el("per-de").min = el("per-ate").min = "2022-01"; el("per-de").max = el("per-ate").max = MES_HOJE;
el("atualizado").textContent = "Dados do Conta Azul atualizados em " + DATA.atualizado_em.split("-").reverse().join("/");
irPara("geral");
