// Ligação das páginas (GitHub Pages) com o Google Apps Script, que guarda os dados e fala com o Conta Azul.
// Nenhum dado fica nas páginas: tudo vem do Google depois de entrar com a senha.
const API_MERAKI = 'https://script.google.com/macros/s/AKfycbzTMZCN7MlD9PJN17Nu3Ig5R2KSsVsyVSWbAkGJyv_ab_SfjTTizxkZ9UGCA-pCLXXR/exec';

function chamarMeraki(corpo) {
  // text/plain evita a pergunta prévia do navegador (CORS) que o Google não responde
  return fetch(API_MERAKI, {method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, body: JSON.stringify(corpo)})
    .then(r => r.json())
    .then(j => { if (!j.ok) throw new Error(j.erro || 'Erro'); return j.resultado; });
}

function sessaoMeraki(app) { try { return localStorage.getItem('meraki_sessao_' + app); } catch (e) { return null; } }

function sairMeraki(app) { try { localStorage.removeItem('meraki_sessao_' + app); } catch (e) {} location.replace('./'); }

// as telas foram escritas para o Google (google.script.run); aqui a mesma chamada vira um pedido pela internet
function ligarGoogleScriptRun(app) {
  window.google = window.google || {};
  window.google.script = {get run() {
    let ok = () => {}, falha = e => console.error(e);
    const p = new Proxy({}, {get: (t, nome) => {
      if (nome === 'withSuccessHandler') return f => (ok = f, p);
      if (nome === 'withFailureHandler') return f => (falha = f, p);
      return (chave, ...args) => chamarMeraki({fn: nome, chave: chave, args: args}).then(ok).catch(e => {
        if (/Sessão expirada/.test(e.message)) return sairMeraki(app);
        falha(e);
      });
    }});
    return p;
  }};
}
