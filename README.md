# Familienplaner

Eine Web-App (PWA) für den Familienalltag. Sie lässt sich am Handy wie eine normale App installieren und läuft auch offline.

- **Heute**: Schule, Abholungen und Termine von heute und morgen als Zeitleiste, die nächsten Termine und die nächsten Ferien.
- **Kalender**: Monatsansicht mit Ferien, Feiertagen und schulfreien Tagen. Ein Tipp auf einen Tag zeigt seinen Ablauf.
- **Stundenplan**: Pro Kind ein Wochenplan mit eigenem Stundenraster. Der Schulschluss wird pro Tag angezeigt. Den Plan kannst du **abfotografieren** (siehe unten).
- **Abholen**: Feste Abholzeiten pro Wochentag. Für jede Abholzeit legst du fest, wer abholt. Einzelne Tage lassen sich tauschen, verschieben oder absagen („Übernehmen“ mit einem Tipp).
- **Erinnerungen**: Eine Erinnerung zur Abholung bekommt nur, wer an diesem Tag zuständig ist. Bei Terminen bekommt sie die Begleitperson, ohne Begleitperson alle.
- **Ferien**: Schulferien und Feiertage für alle österreichischen Bundesländer (voreingestellt: Kärnten). Dazu eigene freie Tage wie schulautonome Tage oder Schließtage im Kindergarten. An freien Tagen entfallen Abholungen automatisch. Kindergartenkinder sind von Schulferien nicht betroffen, gesetzliche Feiertage gelten für alle.

## Stundenplan abfotografieren

Unter *Stundenplan* auf „Stundenplan abfotografieren“ tippen und ein Foto aufnehmen oder auswählen. Ein **Screenshot aus einer Stundenplan-App** (z. B. Schooly) geht auch und wird meist am besten erkannt: hell oder dunkel, farbige Kästchen, Datum neben dem Wochentag, Lehrer- und Raumkürzel in den Zellen. Die Navigationsleiste der App wird ignoriert. Zeigt die App nur die Beginnzeiten, behält jede Stunde ihre bisherige Länge.

1. Das Foto wird verkleinert beim Kind gespeichert (ca. 100 KB) und ist jederzeit ansehbar.
2. Die Texterkennung ([Tesseract](https://github.com/naptha/tesseract.js)) läuft **auf dem Handy**, das Foto verlässt das Gerät nicht. Beim ersten Mal werden ca. 5 MB geladen, danach geht es auch offline.
3. Fotos werden zuerst schwarz-weiß aufbereitet, Screenshots zuerst nur in Graustufen; dunkle Bilder werden invertiert. Ist das Ergebnis schwach, folgt ein zweiter Durchgang mit der anderen Aufbereitung.
4. Die App sucht die Wochentage (Spalten, auch englisch „Mon“, „Tue“ …) und Stundennummern bzw. Uhrzeiten (Zeilen). Erkannte Wörter gleicht sie mit Fächern und üblichen Kürzeln ab, z. B. „D“, „SU“, „Turnen“, „Reli“. Auch schief aufgenommene Fotos werden ausgerichtet.
5. Unsichere Stunden sind gelb markiert. Zum Korrigieren oben ein Fach wählen und die Stunden antippen. So lässt sich ein Plan auch ganz ohne Erkennung schnell eintragen, mit dem Foto im Blick.

**Grenzen:** Gedruckte Vordrucke mit handschriftlichen Fächern funktionieren gut, wenn die Schrift ordentlich ist. Bei flüssiger Schreibschrift oder schlechtem Licht erkennt die Texterkennung oft wenig. Dann bleibt das Antippen. Tipps: gerade von oben fotografieren, gutes Licht, Blatt füllt das Bild.

## Am Handy installieren

1. Die App-Adresse im Browser öffnen (iPhone: Safari, Android: Chrome).
2. **iPhone:** Teilen → „Zum Home-Bildschirm“. **Android:** Menü → „App installieren“.
3. Die App vom Home-Bildschirm aus öffnen, unter **Mehr** angeben, wer du bist, und die Benachrichtigungen einschalten.

Am iPhone gibt es Benachrichtigungen erst ab iOS 16.4 und nur für die installierte App.

## Wo die Daten liegen

Ohne Backend bleiben alle Daten **lokal auf dem Gerät** (localStorage).

- **Zweites Handy, z. B. Partner/in:** Unter *Mehr → Daten teilen & sichern* eine Datei erstellen, schicken und auf dem anderen Handy importieren. Beim Zusammenführen gewinnt pro Eintrag die neuere Änderung. Gelöschte Einträge bleiben gelöscht.
- **Backup:** dieselbe Datei.
- Die Angaben „Ich bin …“ und Benachrichtigungen gelten nur für das jeweilige Gerät und werden nicht geteilt.

## Erinnerungen ohne Server: was geht und was nicht

Eine Web-App ohne Server kann sich nicht selbst wecken. Deshalb:

| Weg | Wann es erinnert |
| --- | --- |
| Benachrichtigung der App | solange die App offen ist oder im Hintergrund noch läuft. Bis zu 30 Min. verpasste Erinnerungen werden beim Öffnen nachgeholt. |
| **Kalender-Export** (*Mehr → Im Handy-Kalender erinnern*) | immer. Die .ics-Datei enthält Abholungen und Termine mit Alarmen für den Handy-Kalender. Nach Änderungen neu erstellen. |

Echte Push-Nachrichten bei geschlossener App kommen mit dem Backend (siehe unten).

## Entwicklung

Kein Build-Schritt, keine Abhängigkeiten: reines HTML, CSS und JavaScript-Module.

```bash
npm start   # lokaler Server auf http://localhost:8080
npm test    # Tests für Ferien, Abholungen, Wiederholungen, Erinnerungen, Zusammenführen, Kalenderdatei, Stundenplan-Erkennung
```

```
index.html            App-Gerüst
css/app.css           Gestaltung (hell/dunkel)
js/app.js             Router, Navigation, Service Worker, Erinnerungsschleife
js/model.js           Datenmodell, Zusammenführen (für späteren Sync)
js/store.js           Speicherung im Browser
js/holidays.js        Ferien/Feiertage Österreich nach Schulzeitgesetz
js/schedule.js        Was passiert an einem Tag? (Abholungen, Termine, Erinnerungen)
js/ics.js             Kalenderdatei mit Alarmen
js/photo.js           Foto verkleinern, Schwarz-Weiß-Aufbereitung für die Texterkennung
js/ocr.js             Texterkennung (lädt vendor/tesseract erst bei Bedarf)
js/timetable-parse.js Erkannte Wörter → Stundenplan (Spalten, Zeilen, Fächer)
js/photo-import.js    Ablauf „Stundenplan vom Foto“ mit Korrektur per Antippen
js/subjects.js        Kurzformen und Farben der Fächer
js/reminders.js       Benachrichtigungen ohne Server
js/forms.js           Eingabeformulare
js/views/*.js         Ansichten Heute, Kalender, Stundenplan, Abholen, Mehr
sw.js                 Offline-Cache und Klick auf Benachrichtigungen
vendor/tesseract/     Texterkennung (Apache-2.0), siehe vendor/tesseract/README.md
```

**Wichtig bei Änderungen:** In `sw.js` die `VERSION` erhöhen und neue Dateien in `ASSETS` eintragen. Sonst bekommen installierte Apps das Update nicht.

## Veröffentlichen (GitHub Pages)

Der Workflow `.github/workflows/pages.yml` veröffentlicht die App bei jedem Push auf `main`. Einmalig unter *Settings → Pages → Source* „GitHub Actions“ wählen.
GitHub Pages für **private** Repositories braucht einen kostenpflichtigen GitHub-Plan. Alternativen: das Repo öffentlich machen (im Code stehen keine Familiendaten), oder Netlify bzw. Cloudflare Pages verwenden.

## Nächste Schritte: Backend

Für den gemeinsamen Datenstand und Push-Nachrichten bei geschlossener App ist z. B. Supabase vorgesehen:

1. Familien-Konto mit Login, Einladung des Partners per Code.
2. Sync der Sammlungen aus `js/model.js`. `updatedAt` und die Grabsteine (`tombstones`) sind dafür schon da, `mergeStates()` kann serverseitig genauso zusammenführen.
3. Web-Push: Das Gerät registriert ein Push-Abo. Eine zeitgesteuerte Funktion prüft jede Minute `remindersBetween()` und schickt die Nachricht an die zuständige Person.
