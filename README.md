# GRIDLINE GP 🏁

Un gioco **multiplayer di corse con monoposto** progettato per smartphone in orizzontale. Nato come evoluzione di RUBACIAMBELLA, usa lo stesso progetto Cloudflare e lo stesso repository GitHub; il nuovo design e il gameplay sono originali e non affiliati alla Formula 1 o a Reckless Racing.

![Anteprima della gara mobile](https://github.com/andrexgt2/rubaciambella-multiplayer)

## Come si gioca

1. Apri il sito Cloudflare in **orizzontale** sul telefono (iOS o Android). Non serve installare niente.
2. Inserisci il nome pilota e crea una stanza oppure entra con un codice di sei caratteri.
3. Tocca **COPIA INVITO** e condividi il link con i tuoi amici (fino a 8 piloti contemporaneamente).
4. Il primo giocatore è capostanza: avvia il countdown e tutti partono dalla stessa griglia.
5. Completa **3 giri**, attraversando i checkpoint nell'ordine corretto. Vince chi taglia il traguardo per primo.

**Controlli telefono:** tieni premuto **GAS** per accelerare, **FRENO** per rallentare e, da fermo, inserire la retromarcia. Con il pollice sinistro trascina lo sterzo lateralmente. Entrambi i pollici funzionano contemporaneamente. Niente tasti superflui che coprono la pista.

**PC:** WASD o frecce direzionali; barra spaziatrice per frenare.

La camera segue la monoposto, quindi la tua macchina resta vicino al centro dello schermo. Le barriere impediscono di tagliare fuori dal circuito. I piloti che entrano durante una gara diventano spettatori fino alla rivincita. Se Safari si riconnette entro circa 12 secondi, il pilota riprende lo stesso posto in gara.

## Audio e classifica persistente · v6

- Motore sintetizzato in tempo reale che segue velocità e acceleratore, suoni di countdown, giro, urti e bandiera a scacchi. Non usa tracce o file audio esterni. L'audio si attiva dopo un gesto dell'utente, come richiesto dai browser mobile; l'icona ♫ permette di disattivarlo.
- Pulsante **CLASSIFICA RECORD** nella schermata di ingresso, nel box e a fine gara: mostra i migliori **20 tempi sul giro** del Circuito delle Creste.
- I record sono validati dal server, non inviati dal browser. Ogni nome pilota appare con il suo giro più veloce; nomi uguali condividono la stessa voce (non ci sono account autenticati).
- I record vengono conservati nel Durable Object globale `gridline:global-laps:creste-v1`, usando il binding `GAME_ROOMS` già esistente e la chiave storage `best-laps-creste-v1`. Non dipendono dalla stanza né dai nuovi deploy; restano salvati salvo eliminazione esplicita dei dati del Durable Object.
- Endpoint pubblico di sola lettura: `GET /api/leaderboard`, senza cache. Le scritture avvengono solo dal backend che valida i checkpoint; i giri inferiori a 12 secondi sono scartati come controllo minimo di plausibilità.
- I record iniziano a popolarsi dalle nuove gare v6: non recuperano automaticamente i tempi delle versioni precedenti.

## Architettura

- Frontend: Canvas 2D + HTML/CSS + Pointer Events; grafica del circuito prerenderizzata per non sovraccaricare gli smartphone.
- Geometria condivisa: `public/track.js`, importata anche da `src/engine.js` per garantire gli stessi limiti pista sul client e sul server.
- Backend: un **Cloudflare Durable Object** per stanza, WebSocket nativi; server autoritativo su fisica, posizioni, collisioni, checkpoint, tempi e classifica.
- `src/index.js`: gestione stanze, riconnessione e socket; `src/engine.js`: gara, fisica e checkpoint.
- `public/game.js`: controlli, camera, rendering e aggiornamento HUD.
- Persistenza: stato stanza nel Durable Object e token di riconnessione in `sessionStorage` del browser. Nessuna password o credenziale nei file.

## Pubblicare su Cloudflare senza installare niente

Se il Worker `rubaciambella-multiplayer` è già collegato al repository `andrexgt2/rubaciambella-multiplayer`:

1. Vai in **Workers & Pages → rubaciambella-multiplayer → Settings → Builds** e verifica che la connessione GitHub sia attiva e il branch sia `main`.
2. In **Deployments / Build History**, controlla che il commit più recente sia pubblicato con successo.
3. Apri **l'URL workers.dev che già usi** e ruota il telefono. Se appare la versione vecchia, ricarica la pagina o aprila in una scheda privata.

Il nome del Worker in `wrangler.jsonc` è rimasto uguale per non creare un secondo sito. Non devi caricare uno ZIP se GitHub è collegato.

Per avvio locale facoltativo (Node.js 20+):

```sh
npm install
npm test
npm run dev
```

Per deploy manuale facoltativo: `npm run deploy`.

## Dettagli gara

- Da 1 a 8 partecipanti per stanza (1 per provare il circuito; la modalità principale è multiplayer).
- Tre giri con semaforo di partenza, checkpoint server-side e ordine di arrivo.
- Durata massima della gara: 6 minuti; dopo il limite, classifica secondo giri/checkpoint e progressione raggiunta.
- Monoposto originali colorate, pista con cordoli, ghiaia, paddock, griglia di partenza e paesaggio.
- Solo landscape sui dispositivi touchscreen in modalità ritratto.

## Test

`npm test` esegue test del tracciato, dei controlli, delle barriere, dei tre giri, delle stanze condivise, della riconnessione e dell'API Worker. `npm run check` verifica la sintassi JavaScript.

La visualizzazione è stata provata in Chromium simulando i viewport 844×390, 667×375 e 390×844 e i comandi touch combinati. La pubblicazione reale va comunque verificata nel proprio account Cloudflare e provata almeno con **due telefoni contemporaneamente**.


## V7: Motore di monoposto e cambio automatico

Il motore audio ora usa due texture sonore di combustione e aspirazione create in Web Audio, non una singola onda sawtooth. Sei rapporti automatici cambiano in base alla velocità nella simulazione server: il regime sale prima della cambiata, poi scende quando entra il rapporto superiore. Si sente anche il breve taglio di potenza e uno scatto meccanico. In HUD compaiono il numero della marcia e una barra del regime. L'audio si attiva solo in seguito a un tocco, conserva il pulsante per disattivarlo ed è pensato per Safari e Android.

**Nota:** il motore è una simulazione acustica originale, non una registrazione di un'autentica monoposto. Non sono stati inseriti audio di Formula 1 protetti da diritti. La classifica permanente e le stanze multiplayer rimangono invariate.
