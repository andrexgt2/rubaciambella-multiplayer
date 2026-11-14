# 🍩 RUBACIAMBELLA — pubblicazione dal browser (senza installare nulla)

Questa cartella contiene il codice della web app multiplayer per **Cloudflare Workers + Durable Objects**.

## 1. Carica il progetto su GitHub

1. Apri https://github.com/new (crea un account gratuito se necessario).
2. Nome repository: `rubaciambella-multiplayer`. Seleziona **Private** oppure **Public**. Non aggiungere un README iniziale.
3. Crea il repository.
4. Nella pagina del repository, apri **Add file > Upload files** (oppure **uploading an existing file**).
5. **Estrai il contenuto di questo ZIP** e trascina nella pagina **i file e le cartelle contenuti dentro**, NON lo ZIP e NON una cartella contenitore aggiuntiva.
6. Verifica che `wrangler.jsonc` e `package.json` siano nella radice del repository e che le cartelle `src` e `public` siano visibili.
7. Conferma con **Commit changes**. Non caricare password, token o file `.dev.vars`.

## 2. Collega il repository a Cloudflare

1. Apri https://dash.cloudflare.com/ e vai a **Workers & Pages > Create application**.
2. Scegli **GitHub** e autorizza l'accesso, se richiesto.
3. Seleziona `rubaciambella-multiplayer`.
4. Configura il progetto: nome Worker **`rubaciambella-multiplayer`** (deve corrispondere a `wrangler.jsonc`), branch di produzione **`main`**, directory radice **`/`**.
5. **Build command**: lascia vuoto (questo progetto non richiede un passaggio di compilazione frontend).
6. **Deploy command**: `npx wrangler deploy`.
7. Seleziona **Save and Deploy** e attendi l'esito del build nella dashboard Cloudflare.
8. Se il deploy riesce, apri l'URL `https://rubaciambella-multiplayer.<tuo-sottodominio>.workers.dev` fornito da Cloudflare (è solo un esempio: usa l'indirizzo effettivo).

## 3. Gioca con gli amici

Apri il sito, inserisci il nome da pilota, crea la stanza e usa **COPIA LINK** per condividere l'invito. Fino a 8 giocatori per stanza. Non serve installare nulla per giocare.

## Se qualcosa non funziona

- Se Cloudflare segnala un errore relativo al nome Worker, verifica che il nome del Worker sia `rubaciambella-multiplayer`, come in `wrangler.jsonc`.
- Se non trova il file di configurazione, verifica che `wrangler.jsonc` sia nella radice del repository (non annidato in `rubaciambella-cloudflare/`).
- Se la build o il deployment falliscono, guarda il messaggio in **Deployments / View build history**, e condividi l'errore per diagnosticare il problema.
- Durable Objects SQLite sono disponibili sul piano gratuito, con limiti di risorse e richieste.

Fonti: https://developers.cloudflare.com/workers/ci-cd/builds/ e https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
