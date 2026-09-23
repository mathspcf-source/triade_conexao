/* ============================================================
   TRÍADE CONEXÃO — Cliente Supabase
   Login por matrícula (8 dígitos) — o e-mail fake é gerado
   internamente como "MATRICULA@triade.local".
   ============================================================ */

(function () {
  const SUPABASE_URL = 'https://akbxaxujdjskaoofudno.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFrYnhheHVqZGpza2Fvb2Z1ZG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwOTkxMjQsImV4cCI6MjEwNTY3NTEyNH0.qrbMoBV_Ykh_n90Ib3AQLltoGQBeFngnIBnCrhrR6Wg';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[Supabase] SDK não carregado. Verifique se o <script> do CDN veio antes.');
    return;
  }

  window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'triade_auth'
    }
  });

  console.log('[Supabase] cliente inicializado');
})();
