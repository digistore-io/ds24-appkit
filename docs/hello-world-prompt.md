# Erste App: „Hello World" — der Einstiegs-Prompt

Bevor du deine echte App baust, lohnt sich ein **Probelauf**: eine winzige App,
die trotzdem alles Wichtige einmal durchspielt — Login, zwei Rollen, eine eigene
Tabelle mit Migration, eine Admin-Funktion und Tests.

Danach kennst du den Ablauf und weißt, dass deine Umgebung funktioniert.

## So gehst du vor

```bash
make start        # Datenbank + App starten (http://localhost:3000)
claude            # Claude Code im Projektordner öffnen
```

Kopier dann den folgenden Prompt komplett in Claude Code hinein.

---

## Der Prompt (zum Kopieren)

> Baue in diesem Template eine kleine „Hello-World"-App als Probelauf. Halte dich
> an die Regeln in `CLAUDE.md` und an die vorhandene Struktur — reiß nichts heraus.
>
> **Was die App können soll**
>
> 1. **Öffentliche Startseite** (`/`): zeigt einen Begrüßungstext, der aus der
>    Datenbank kommt (nicht fest im Code). Standardtext: „Hello World".
> 2. **Login** für alle Nutzer über den bestehenden E-Mail-Magic-Link
>    (`/login`) — bau keinen eigenen Login-Mechanismus.
> 3. **Zwei Rollen**, wie in `db/schema.ts` bereits angelegt:
>    - `member` (normaler Nutzer): sieht nach dem Login unter `/dashboard` den
>      Begrüßungstext und seine eigene E-Mail-Adresse. Sonst nichts.
>    - `owner` (Admin): sieht zusätzlich den Admin-Bereich unter `/dashboard/admin`.
> 4. **Admin kann den Begrüßungstext ändern**: unter `/dashboard/admin` ein
>    Formular, das den Text speichert. Nach dem Speichern zeigt die Startseite
>    sofort den neuen Text.
> 5. **Admin kann Nutzer verwalten**: unter `/dashboard/admin/users` eine Liste
>    aller Nutzer (E-Mail, Rolle, angelegt am) mit der Möglichkeit,
>    - einen neuen Nutzer per E-Mail-Adresse anzulegen,
>    - die Rolle eines Nutzers zwischen `member` und `owner` umzuschalten,
>    - einen Nutzer zu löschen.
>
> **Technische Vorgaben**
>
> - Datenmodell in `db/schema.ts` erweitern: eine Tabelle `app_settings`
>   (Key/Value) für den Begrüßungstext. Die Nutzer kommen aus der bestehenden
>   `users`-Tabelle — leg dafür keine zweite Tabelle an.
> - Die Schemaänderung als **Migration** ausliefern: `make db-generate`, die
>   erzeugte Datei in `drizzle/` prüfen, dann `make db-migrate`. Kein `db:push`.
>   (Siehe `docs/database.md`.)
> - Schreibende Aktionen als **Server Actions** umsetzen, Eingaben mit `zod`
>   validieren.
> - **Jede** Admin-Seite und **jede** Server Action beginnt mit `requireOwner()`
>   aus `lib/authz.ts`. Ein `member`, der `/dashboard/admin` oder eine
>   Admin-Action direkt aufruft, darf nichts ändern können.
> - Zwei Sicherheitsregeln in der Nutzerverwaltung: ein Admin kann **sich selbst
>   nicht löschen** und **sich nicht selbst degradieren**; und der **letzte
>   verbleibende `owner`** darf nicht gelöscht oder degradiert werden.
> - UI mit shadcn/ui und den Tokens aus `app/globals.css` — keine hart kodierten
>   Farben, kein eigenes Design.
>
> **Tests (Pflicht)**
>
> Schreib `vitest`-Tests für die Logik, mindestens:
> - Begrüßungstext lesen liefert den Standardwert, wenn noch nichts gesetzt ist.
> - Text speichern und wieder lesen ergibt den neuen Text.
> - Ein `member` darf den Text nicht ändern und keine Rollen ändern.
> - Der letzte `owner` kann nicht gelöscht oder degradiert werden.
> - Ein Admin kann sich nicht selbst löschen.
>
> `make test` muss am Ende grün sein.
>
> **Zum Schluss**
>
> Sag mir in wenigen Sätzen, was du gebaut hast, welche Dateien neu sind, und wie
> ich es ausprobiere — inklusive der Befehle, mit denen ich mir einen
> Admin-Account anlege.

---

## Danach ausprobieren

```bash
# Admin-Account anlegen (Rolle owner)
make user-create ARGS="--email ich@meine-domain.de --role owner --apply"

# Normalen Nutzer anlegen
make user-create ARGS="--email test@meine-domain.de --apply"

make user-list                     # zeigt beide mit Rolle
```

Dann auf http://localhost:3000/login mit der Admin-Adresse einloggen (der
Magic-Link kommt per E-Mail — der Versand muss dafür eingerichtet sein, siehe
[`auth-setup.md`](auth-setup.md)). Prüf der Reihe nach:

- [ ] Startseite zeigt „Hello World".
- [ ] Als Admin unter `/dashboard/admin` den Text ändern → Startseite zeigt den neuen Text.
- [ ] Unter `/dashboard/admin/users` beide Accounts sehen, Rolle umschalten, Nutzer anlegen und löschen.
- [ ] Als normaler Nutzer einloggen: `/dashboard/admin` ist **nicht** erreichbar
      (Weiterleitung auf `/dashboard`).
- [ ] `make test` ist grün.

Wenn du zwischendurch aufräumen willst: `make db-reset` setzt die lokale
Datenbank zurück und legt die Seed-Accounts neu an.

## Und dann?

Der Probelauf darf ruhig wieder weg. Für die echte App startest du mit dem Skill
**`build-app`** („Baue meine App") — oder mit **`market-research`**, wenn die Idee
noch nicht steht. Der Weg von der Idee bis zur Vermarktung steht in der
[README](../README.md).
