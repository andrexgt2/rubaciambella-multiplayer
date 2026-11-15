import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');

test('solo il canvas della pista e' fullscreen; le miniature restano nel pannello',()=>{
  assert.match(css,/\.stage\s*>\s*#trackCanvas\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*\}/);
  assert.doesNotMatch(css,/\.stage\s+canvas\s*\{/,
    'una regola generica sui canvas posizionerebbe le miniature sopra la UI');
  assert.match(css,/\.track-choice canvas\s*\{[^}]*aspect-ratio:\s*25\/13/);
  assert.match(css,/\.lobby-track-preview\s*\{[^}]*aspect-ratio:\s*24\/7/);
  for(const id of ['trackCanvas','trackPreview','lobbyTrackPreview'])
    assert.match(html,new RegExp('id="'+id+'"'),id+' presente nel DOM');
});
