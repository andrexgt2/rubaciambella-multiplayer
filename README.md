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

## Scelta del circuito · v12 (prototipo)

Nella schermata iniziale, lascia vuoto il codice stanza e scegli la pista.
Chi crea la stanza ne decide il circuito; chi entra con un codice eredita quello
dell'host e non puo' sostituirlo a gara in corso.

- **Circuito delle Creste:** pista originale, invariata.
- **Monza (Italia):** layout compatto ispirato alle curve storiche e ai rettilinei veloci.
- **Spa-Francorchamps (Belgio):** layout compatto ispirato alle sezioni tecniche e al Kemmel.

Le forme sono ricostruzioni semplificate per il gameplay: conservano proporzioni
sullo schermo tramite un fattore uniforme sugli assi (non sono mappe FIA al
centimetro). La simulazione usa per ciascuna pista la stessa geometria su
browser e server per asfalto, barriere, griglia, giri e classifiche.
I record sono separati per circuito; i record precedenti delle Creste restano
disponibili. Tutti i circuiti sono omaggi geografici non ufficiali, senza
loghi o marchi commerciali della Formula 1.

## Controlli smartphone · v11

- **Sterzo anti-blocco:** il rilascio del dito viene rilevato sia sull'elemento sia sulla finestra, inclusi `pointercancel` e perdita della cattura.
- **Recupero multitouch:** gli eventi touch verificano quale dito stava sterzando: sollevare il dito dello sterzo rimette le ruote dritte anche se GAS rimane premuto.
- Un tocco successivo sullo sterzo sostituisce un puntatore eventualmente rimasto orfano. I controlli si azzerano anche passando a fine gara, perdendo il focus o alla disconnessione.
- Test automatici dedicati per perdita di `pointerup`, `touchcancel`, multitouch e recupero senza ricaricare.

## Audio e classifica persistente · v10

- **Motore a regime continuo:** nessun cambio o taglio di potenza. Il server calcola accelerazione, resistenza aerodinamica e un RPM inerziale; il telefono ricostruisce localmente il proprio RPM a 60 FPS in base alla velocita' e al pedale GAS, evitando scatti dovuti ai pacchetti multiplayer.
- Due campioni locali CC0 di automobile da corsa sono miscelati con Web Audio mediante crossfade e pitch automatici: il suono e' una simulazione, **non una registrazione F1 autentica**. Un basso strato originale di impulsi V8 (4 accensioni per giro) e aspirazione filtrata arricchiscono il timbro. Non c'e' streaming esterno Myinstants e l'audio torna silenzioso fuori gara.
- Cruscotto con RPM x1000 progressivi al posto della marcia. Countdown, urti e traguardo restano sonorizzati.
- **Hall of Fame:** i migliori 20 giri validati dal server restano nel Durable Object globale anche dopo aver chiuso la stanza o aggiornato il gioco. La classifica non richiede account; nickname identici condividono il record.

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


## V7 (storico, sostituito): Motore e cambio automatico

Il motore audio ora usa due texture sonore di combustione e aspirazione create in Web Audio, non una singola onda sawtooth. Sei rapporti automatici cambiano in base alla velocità nella simulazione server: il regime sale prima della cambiata, poi scende quando entra il rapporto superiore. Si sente anche il breve taglio di potenza e uno scatto meccanico. In HUD compaiono il numero della marcia e una barra del regime. L'audio si attiva solo in seguito a un tocco, conserva il pulsante per disattivarlo ed è pensato per Safari e Android.

**Nota:** il motore è una simulazione acustica originale, non una registrazione di un'autentica monoposto. Non sono stati inseriti audio di Formula 1 protetti da diritti. La classifica permanente e le stanze multiplayer rimangono invariate.


## V8 (storico, sostituito): 9 marce e registrazione audio CC0 integrata

Questa versione risponde al feedback sul rumore troppo elettronico della v7.

- **Nove marce avanti** simulate nel motore server, con otto cambiate riconoscibili in accelerazione, scalata automatica, isteresi e circa 170 ms di taglio di coppia. La retromarcia resta disponibile tenendo premuto FRENO da fermo. Sono **nove rapporti da gioco**, non la specifica regolamentare di Formula 1 (otto marce avanti + retromarcia).
- **Motore campionato**: due piccoli loop PCM WAV CC0 di motore d'auto ottenuti da [domasx2 / OpenGameArt](https://opengameart.org/content/racing-car-engine-sound-loops), con variazione del pitch basata sui giri e crossfade tra registri; leggera componente originale V6 e aspirazione. I file vengono serviti dallo stesso Worker, anche durante il multiplayer.
- Se uno smartphone non può decodificare i WAV, il motore passa a un fallback sintetico; gli altri suoni continuano a funzionare.
- Le cambiate sono calcolate da Cloudflare e inviate tramite lo snapshot multiplayer (`gear`, `rpm`, `shiftSeq`), non inventate dal browser.
- Versione Web `gp8-1` per evitare file JavaScript/audio memorizzati in cache da Safari.

**Qualità audio**: i campioni CC0 provengono da un'automobile da corsa e NON da una vera monoposto di Formula 1. Sono un passo concreto verso un timbro meno elettronico; una riproduzione veramente fedele richiederebbe registrazioni autentiche con licenza adeguata a diversi regimi.

### Licenza audio
I file `public/sfx/engine-low.wav` e `public/sfx/engine-high.wav` corrispondono a `loop_2_0.wav` e `loop_5_0.wav`, opera `racing car engine sound loops` di **domasx2**, pubblicata sotto **CC0 1.0** su OpenGameArt. Sono distribuiti insieme al gioco e possono essere riutilizzati secondo la licenza CC0.


## v9 · Prova facoltativa del riferimento F1 V8

- Il pulsante **PROVA MOTORE F1 V8** nella schermata iniziale e nella lobby abilita
  solo sul dispositivo locale un MP3 remoto da Myinstants (`f1-v8.mp3`).
- Il file **non viene copiato, incorporato o ridistribuito** tramite questo repository.
  Il browser lo riproduce direttamente dal sito esterno quando il giocatore autorizza
  la prova; se l'audio non e' accessibile, resta attivo il motore CC0 precedente.
- Il regime del campione segue gli RPM, il suo volume viene abbassato durante i cambi
  e l'audio CC0 passa in secondo piano. Il cambio multiplayer a 9 marce non cambia.
- **Non e' una soluzione di distribuzione definitiva**: servono diritti adeguati per
  utilizzare stabilmente quel campione come asset pubblico. Anche i loop di un singolo
  MP3 non possono sostituire un motore multi-campione professionale.
- Non usare cuffie ad alto volume: Myinstants segnala il campione come molto forte.


## V10: motore progressivo senza cambi

I sistemi di cambiata della v7/v8/v9 sono stati rimossi su richiesta: non esiste piu' un salto di rapporto, un taglio di coppia o una dipendenza da audio remoto. La simulazione lato server produce un'accelerazione fisicamente continua, con trascinamento aerodinamico quadratico e un regime inerziale. L'Web Audio Engine mantiene i due sample CC0 in loop **solo come texture sotto il controllo del mix**, li sovrappone a potenza costante e aggiorna la frequenza gradualmente. Il master si dissolve a zero in lobby / risultati / spettatore. L'RPM visualizzato segue lo stesso modello utilizzato per l'audio.
