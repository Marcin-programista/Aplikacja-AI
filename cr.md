# Code Review — ToDo (Vanilla JS + Materialize + localStorage)

## Podsumowanie
Projekt spełnia wymagania funkcjonalne: CRUD, filtry (wszystkie/aktywne/zakończone), sortowanie, wyszukiwarka, deadline (Materialize Datepicker), priorytety (z kolorami), kategorie/tagi (chip), oznaczanie przeterminowanych, licznik aktywnych, import/eksport JSON, zapisy do `localStorage`. UI jest responsywne (siatka Materialize), a UX wspierają toasty i stany puste.

Poniżej szczegółowa ocena i rekomendacje usprawnień.

---

## Architektura i wzorce
**Plusy**
- Jeden punkt wejścia (`index.html`), jasny podział na `style.css` i `app.js`.
- Stan trzymany w pamięci i trwałość w `localStorage` (prosty store).
- Widok kontrolowany przez `viewState` (filtr, sort, query).

**Sugestie**
- Rozważ lekką warstwę modułową:
  - `storage.js` (odczyt/zapis/wersjonowanie danych)
  - `ui.js` (renderowanie, szablony, toasty)
  - `logic.js` (CRUD, sort, filtr, walidacja)
- Dodaj **wersjonowanie schematu** danych (np. `todo.tasks.v2`) z migracją.

---

## HTML
**Plusy**
- Semantyczna struktura, aria-live na liście.
- Szablon `<template>` do pozycji listy — unikasz string-concat HTML.

**Sugestie**
- Dodać `aria-label` do przycisków akcji (Edit/Delete) i checkboxa, np. `aria-label="Oznacz jako zakończone"`.
- Dla ikon Material Icons rozważ `role="img"` + `aria-hidden="true"` tam, gdzie to tylko dekoracja.

_Przykład:_
```html
<a class="btn-flat btn-small edit-btn" aria-label="Edytuj zadanie">
  <i class="material-icons" aria-hidden="true">edit</i>
</a>
```

---

## CSS
**Plusy**
- Czytelne klasy dla priorytetów, animacje dodawania/usuwania.
- Wyraźne różnicowanie zakończonych i przeterminowanych.

**Sugestie**
- Rozważyć preferencje użytkownika: `@media (prefers-reduced-motion: reduce)` by wyłączyć animacje.
- Dodać ograniczenie szerokości tekstów w meta (truncate) i tooltippy przy długich opisach.

_Przykład:_
```css
.task-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .task-item.added, .task-item.removed { animation: none; }
}
```

---

## JavaScript
**Plusy**
- Jasny podział: utils (format, uid), store (load/save), render, CRUD.
- Unikanie XSS (brak wstrzykiwania HTML; operujesz na `textContent`).
- Sortowanie po wielu polach + filtry + wyszukiwarka.
- Import/eksport z walidacją minimalnego kształtu obiektów.

**Sugestie (ważność: wysoka → średnia)**

1. **Odświeżanie komponentów Materialize podczas edycji**
   - `M.FormSelect.getInstance(...).destroy()` + `init` działa, ale na nieistniejącej instancji rzuci błąd.
   - Dodaj strażkę: sprawdź `getInstance` przed `destroy`.

   _Patch:_
   ```js
   const inst = M.FormSelect.getInstance(priorityEl);
   if (inst) inst.destroy();
   M.FormSelect.init(priorityEl);
   ```

2. **Walidacja daty**
   - `new Date(value)` bywa zależne od przeglądarki/locale.
   - Przyjmujesz format `yyyy-mm-dd` — waliduj regexem i twórz datę w UTC, by uniknąć przesunięć czasowych.

   _Patch:_
   ```js
   function toDateStamp(value) {
     if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
     const [y,m,d] = value.split('-').map(Number);
     const ts = Date.UTC(y, m-1, d, 23, 59, 59, 999);
     return ts;
   }
   ```

3. **Stabilność sortowania**
   - Po kilku kryteriach dobrze jest użyć _tiebreaker_ (np. `createdAt`) by uniknąć „skakania” pozycji.

   _Patch (przykład dla deadline):_
   ```js
   case "deadline_asc": return (a.deadline || Infinity) - (b.deadline || Infinity) || a.createdAt - b.createdAt;
   ```

4. **Wydajność renderu**
   - Przy większej liście możesz użyć `DocumentFragment` (masz już przez template clone), oraz _debounce_ wpisywania w wyszukiwarce.

   _Patch:_
   ```js
   const debouncedRender = debounce(render, 120);
   searchInput.addEventListener("input", () => { viewState.query = searchInput.value; debouncedRender(); });
   function debounce(fn, ms){let t; return (...args)=>{clearTimeout(t); t=setTimeout(()=>fn(...args), ms)}}
   ```

5. **Obsługa wyjątków localStorage**
   - Jest test dostępności, ale warto łapać quota exceeded i ostrzegać o zbyt dużym eksporcie/importcie.

6. **Undo po usunięciu (opcjonalnie)**
   - Materiały UX: toast z przyciskiem „Cofnij” po `deleteTask`.

   _Szkic:_
   ```js
   let lastDeleted = null;
   function deleteTask(id){
     const idx = tasks.findIndex(t=>t.id===id);
     lastDeleted = tasks[idx];
     tasks.splice(idx,1); saveTasks(tasks); render();
     M.toast({html: 'Usunięto. <a class="btn-flat toast-action" id="undoDel">Cofnij</a>'});
     setTimeout(()=>{
       const el = document.getElementById('undoDel');
       if(el) el.addEventListener('click', ()=>{ tasks.unshift(lastDeleted); saveTasks(tasks); render(); });
     },0);
   }
   ```

7. **Dane i migracje (opcjonalnie)**
   - Dodaj metadane (np. `appVersion`) + migrator dla przyszłych zmian schematu.

8. **Testy szybkie (manualne)**
   - Dodaj tryb „seed/off” przez `localStorage.setItem('todo.seed', '0/1')` aby łatwo czyścić i wypełniać demo.

---

## Dostępność (a11y)
- Dodać focus styles (`:focus-visible`) na przyciskach akcji w listach.
- Dla checkboxów dodać powiązane `<label for>` oraz tekst alternatywny czytelny dla SR.
- Zapewnić informację o zmianie stanu przez `aria-live` (już jest na UL — 👍) oraz krótkie opisy w toastach.

_Przykład:_
```css
button:focus-visible, a:focus-visible, input:focus-visible {
  outline: 2px solid #26a69a;
  outline-offset: 2px;
}
```

---

## Bezpieczeństwo
- Import JSON — obecnie mapujesz do bezpiecznych typów (`String`, `Number`, `!!`) i renderujesz jako `textContent` → bezpiecznie.
- Dodaj limit wielkości importu (np. 2MB) i prostą walidację pól (`title` długość ≤ 200).

---

## Wydajność i UX
- Virtualizacja listy dla >500 pozycji nie jest konieczna, ale można rozważyć _windowing_ w przyszłości.
- Zapamiętywanie `viewState` w `localStorage` (filtr/sort/query) poprawi UX po odświeżeniu.

_Przykład:_
```js
const VIEW_KEY = 'todo.view.v1';
function saveView(){ localStorage.setItem(VIEW_KEY, JSON.stringify(viewState)); }
function loadView(){ try{ Object.assign(viewState, JSON.parse(localStorage.getItem(VIEW_KEY))||{});}catch{} }
```

---

## Potencjalne bugi do naprawienia
- **Destroy FormSelect bez instancji** — patrz sekcja JS (1).
- **Strefa czasowa deadline** — patrz sekcja JS (2).
- **Brak blokady klików podczas animacji usuwania** — możliwe podwójne akcje. Dodaj `pointer-events: none` w stanie `.removed` albo zdejmij nasłuch po kliknięciu.

```css
.task-item.removed { pointer-events: none; }
```

---

## Co działa bardzo dobrze
- Spójny model danych i komplet funkcji z „nice‑to‑have”.
- Wygląd Materialize + czytelne badge priorytetów.
- Eksport/Import JSON z opcją scalania po `id` (pro!).

---

## Propozycje rozwoju (roadmap)
1. Projekty / listy (wielu tabów) + filtr po kategorii klikając chip.
2. PWA (manifest + service worker) → offline i instalacja na telefonie.
3. Synchronizacja opcjonalna (np. eksport do pliku w chmurze – bez backendu własnego).
4. Testy E2E (Playwright) dla kluczowych scenariuszy.

---

## Krótkie diff‑patches (gotowce)
**Bezpieczne odświeżanie FormSelect**
```js
function refreshSelect(el){
  const inst = M.FormSelect.getInstance(el);
  if (inst) inst.destroy();
  M.FormSelect.init(el);
}
```

**Regex walidacji daty + UTC**
```js
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
function toDateStamp(value){
  if (!value || !DATE_RX.test(value)) return null;
  const [y,m,d] = value.split('-').map(Number);
  return Date.UTC(y, m-1, d, 23, 59, 59, 999);
}
```

**Debounce wyszukiwarki**
```js
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
const debouncedRender = debounce(render, 120);
searchInput.addEventListener("input", ()=>{ viewState.query = searchInput.value; debouncedRender(); });
```

---

### Wniosek
Kod jest solidny i spełnia wymogi zadania. Rekomenduję wdrożyć poprawki w kolejności: (1) walidacja/UTC dla daty, (2) bezpieczne odświeżanie komponentów Materialize, (3) tiebreaker w sortowaniu, (4) drobne poprawki a11y i UX (focus, debounce, undo). To zwiększy stabilność, dostępność i płynność działania bez dużych zmian architektonicznych.
