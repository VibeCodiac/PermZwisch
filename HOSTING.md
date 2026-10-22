# Den Blog online stellen

Diese Anleitung bringt „Permanente Zwischenlagerung“ auf einen eigenen Server mit eigener Domain und HTTPS.
Du brauchst etwa **30 Minuten**. Programmierkenntnisse sind nicht nötig, du kopierst nur ein paar Zeilen.

**Kosten:** ca. 5–7 € im Monat für den Server (inkl. automatischer Backups) plus ca. 5–15 € im Jahr für die Domain.
Die Preise ändern sich gelegentlich, bitte beim Anbieter prüfen.

---

## 1. Domain kaufen

Kaufe die Domain **`permanent-blog.de`** bei einem Domain-Anbieter. Vor dem Kauf zeigt dir der Anbieter, ob sie noch frei ist. Die Domain kann auch direkt bei Hetzner gekauft werden (Schritt 2), dann ist alles an einem Ort. Andere übliche Anbieter sind z. B. INWX, Netcup oder Strato.

Wichtig ist nur, dass du dort später **DNS-Einträge** bearbeiten kannst. Das können alle diese Anbieter.

## 2. Server bei Hetzner anlegen

1. Konto erstellen auf **hetzner.com/cloud** und in der **Cloud Console** ein neues Projekt anlegen, z. B. „Blog“.
2. **Server hinzufügen** und Folgendes auswählen:
   - **Standort:** Nürnberg oder Falkenstein (Deutschland)
   - **Image:** Ubuntu 24.04
   - **Typ:** der kleinste Server mit „Shared vCPU“ (x86) genügt
   - **Netzwerk:** öffentliche IPv4 und IPv6 aktiviert lassen
   - **SSH-Key:** optional. Ohne Key schickt Hetzner dir ein Root-Passwort per E-Mail.
   - **Backups:** aktivieren. Dann gibt es tägliche Sicherungen des ganzen Servers.
   - **Cloud config:** Inhalt der Datei [`deploy/cloud-config.yaml`](deploy/cloud-config.yaml) einfügen. Die Domain `permanent-blog.de` ist dort schon eingetragen. Falls du eine andere Domain kaufst, ändere nur diese eine Zeile (ohne `www` und ohne `https://`).
   - **Name:** z. B. `blog`
3. **Erstellen & kaufen.** Nach etwa einer Minute siehst du die **IPv4-Adresse** (z. B. `203.0.113.10`) und die **IPv6-Adresse** des Servers. Notiere dir beide.

Der Server installiert sich jetzt selbst: Updates, Firewall, Docker und der Blog. Das dauert etwa 5–10 Minuten.

## 3. Domain auf den Server zeigen lassen (DNS)

Lege beim Domain-Anbieter diese vier Einträge an. Vorhandene A- und AAAA-Einträge für `@` und `www` vorher löschen.

| Typ  | Name  | Wert                     |
|------|-------|--------------------------|
| A    | `@`   | IPv4-Adresse des Servers |
| A    | `www` | IPv4-Adresse des Servers |
| AAAA | `@`   | IPv6-Adresse des Servers |
| AAAA | `www` | IPv6-Adresse des Servers |

Bei manchen Anbietern heißt `@` „leer“ oder ist schon die Domain selbst. Bei Hetzner-IPv6 nimm die Adresse mit `1` am Ende, z. B. `2a01:4f8:…::1`.

Nach einigen Minuten (selten bis zu ein paar Stunden) ist die Domain erreichbar. Das **HTTPS-Zertifikat** holt der Server automatisch, sobald die Domain auf ihn zeigt.

## 4. Admin-Konto anlegen

1. In der Hetzner Cloud Console auf den Server klicken, dann oben rechts auf **„>_ Konsole“**. Alternativ per SSH: `ssh root@DEINE-IP`.
2. Als `root` mit dem Passwort aus der E-Mail anmelden. Beim ersten Login fordert der Server ein neues Passwort.
3. Diese Zeile eingeben und Enter drücken:

   ```bash
   cd /opt/permzwisch && docker compose exec app node scripts/create-admin.js
   ```

4. E-Mail, Name und Passwort eingeben. Das Passwort ist beim Tippen unsichtbar.

Falls die Meldung kommt, dass der Dienst nicht läuft, ist die Installation noch nicht fertig. Ein paar Minuten warten und erneut versuchen.

## 5. Loslegen

1. **`https://permanent-blog.de/admin`** öffnen und anmelden.
2. Unter **Einstellungen → Rechtliche Seiten** das **Impressum** und die **Datenschutzerklärung** ausfüllen (Platzhalter in `[eckigen Klammern]` ersetzen). Beim Hosting-Anbieter in der Datenschutzerklärung eintragen: *Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen*. Bitte vorher prüfen, ob die Adresse noch aktuell ist.
3. Weitere Autor\*innen unter **Nutzer\*innen** anlegen.
4. In der Hetzner Console unter **Konto → Datenschutz** den **Auftragsverarbeitungsvertrag (AVV)** abschließen. Das sind ein paar Klicks und wird für die DSGVO benötigt.

Fertig! 🎉

---

## Später

**Neue Version einspielen.** Nachdem neuer Code auf GitHub ist, in der Server-Konsole eingeben:

```bash
cd /opt/permzwisch && ./scripts/update.sh
```

Beiträge, Bilder und Konten bleiben dabei erhalten.

**Backups.** Hetzner sichert den ganzen Server täglich und hebt 7 Sicherungen auf. Wiederherstellen geht in der Cloud Console unter *Server → Backups*.

**Passwort vergessen.** Den Befehl aus Schritt 4 erneut ausführen, mit derselben E-Mail-Adresse. Dann wird das Passwort neu gesetzt.

**Was läuft auf dem Server?**

- **Blog-App** (Node.js) in einem Docker-Container. Die Daten (Datenbank und Bilder) liegen in einem eigenen Docker-Volume.
- **Caddy** als Webserver davor. Er kümmert sich um HTTPS-Zertifikate (Let's Encrypt), leitet `http://` und `www.` auf `https://permanent-blog.de` um und speichert keine Zugriffsprotokolle.
- **Firewall (ufw)**: Offen sind nur SSH sowie Port 80 und 443.
- **fail2ban** blockiert wiederholte SSH-Anmeldeversuche.
- **Automatische Sicherheitsupdates** für das Betriebssystem.

Die Einstellungen (Domain, geheimer Sitzungsschlüssel) stehen in `/opt/permzwisch/.env`. Diese Datei wird beim ersten Start automatisch erzeugt und gehört **nicht** ins Git-Repository.
