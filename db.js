/* ============================================================
   TRÍADE CONEXÃO — Camada de dados
   Cache em memória sincronizado com Supabase.
   O resto do app usa DB.list()/get()/find() de forma SÍNCRONA.
   Apenas create/update/remove são assíncronos.
   ============================================================ */

const DB = (() => {
  const ENTIDADES = [
    'usuarios', 'turmas', 'alunos', 'professores', 'planos',
    'pagamentos', 'atividades', 'notas', 'faltas', 'avisos',
    'relatorios', 'inscricoes'
  ];

  // ---------- Cache ----------
  const cache = {};
  let pronto = false;
  let carregando = null;

  // ---------- camelCase ↔ snake_case ----------
  function toSnake(str) {
    return String(str).replace(/[A-Z]/g, m => '_' + m.toLowerCase());
  }
  function toCamel(str) {
    return String(str).replace(/_([a-z])/g, (_, l) => l.toUpperCase());
  }
  function objToSnake(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'id' && (v === undefined || v === null || v === '')) continue;
      out[toSnake(k)] = v;
    }
    return out;
  }
  function objToCamel(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[toCamel(k)] = v;
    return out;
  }

  // ---------- Sync inicial ----------
  async function sync() {
    if (pronto) return;
    if (carregando) return carregando;

    carregando = (async () => {
      const resultados = await Promise.all(
        ENTIDADES.map(e => supabase.from(e).select('*'))
      );
      ENTIDADES.forEach((e, i) => {
        const { data, error } = resultados[i];
        if (error) {
          console.error('[DB] erro ao carregar', e, error);
          cache[e] = [];
          return;
        }
        cache[e] = (data || []).map(objToCamel);
      });
      pronto = true;
      carregando = null;
      console.log('[DB] cache sincronizado:', Object.fromEntries(
        ENTIDADES.map(e => [e, cache[e].length])
      ));
    })();

    return carregando;
  }

  function ensure(ent) {
    if (!cache[ent]) cache[ent] = [];
    return cache[ent];
  }

  // ---------- API pública ----------
  return {
    ENTIDADES,
    sync,
    isReady: () => pronto,

    /** Lista do cache (cópia). */
    list(ent) { return ensure(ent).slice(); },

    get(ent, id) {
      return ensure(ent).find(r => r.id === id) || null;
    },

    find(ent, filtro = {}) {
      return ensure(ent).filter(r =>
        Object.entries(filtro).every(([k, v]) => r[k] === v)
      );
    },

    async create(ent, obj) {
      const { data, error } = await supabase
        .from(ent).insert(objToSnake(obj)).select().single();
      if (error) { console.error('[DB.create]', ent, error); throw error; }
      const novo = objToCamel(data);
      ensure(ent).push(novo);
      return novo;
    },

    async update(ent, id, patch) {
      const { data, error } = await supabase
        .from(ent).update(objToSnake(patch)).eq('id', id).select().single();
      if (error) { console.error('[DB.update]', ent, error); throw error; }
      const atualizado = objToCamel(data);
      const arr = ensure(ent);
      const i = arr.findIndex(r => r.id === id);
      if (i >= 0) arr[i] = atualizado;
      else arr.push(atualizado);
      return atualizado;
    },

    async remove(ent, id) {
      const { error } = await supabase.from(ent).delete().eq('id', id);
      if (error) { console.error('[DB.remove]', ent, error); return false; }
      const arr = ensure(ent);
      const i = arr.findIndex(r => r.id === id);
      if (i >= 0) arr.splice(i, 1);
      return true;
    },

    invalidate(ent) {
      if (ent) cache[ent] = [];
      else ENTIDADES.forEach(e => { cache[e] = []; });
      pronto = false;
    },

    async refresh(ent) {
      const { data, error } = await supabase.from(ent).select('*');
      if (error) { console.error('[DB.refresh]', ent, error); return; }
      cache[ent] = (data || []).map(objToCamel);
    }
  };
})();
