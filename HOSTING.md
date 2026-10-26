# Den Blog auf Firebase online stellen

Diese Anleitung bringt „Permanente Zwischenlagerung“ auf **Firebase** mit der Domain **permanent-blog.de**.
Alles geht im Browser, auch auf dem iPad. Du brauchst etwa **30–45 Minuten**, davon ist viel Warten.

**Kosten:** Firebase verlangt für diese Art Website den Tarif **„Blaze“** (Abrechnung nach Verbrauch, Kreditkarte nötig).
Bei einem kleinen Blog fallen meist **unter 1 € im Monat** an, oft gar nichts. Dazu kommt die Domain mit ca. 5–15 € im Jahr.
Damit nichts überrascht, richtest du in Teil 1 einen **Budget-Alarm** ein.

In einem Firebase-Projekt kannst du später auch **weitere Websites** sammeln: Jede bekommt dort einen eigenen „Hosting-Bereich“.

---

## Teil 1: Firebase-Projekt anlegen (ca. 10 Minuten)

1. **console.firebase.google.com** öffnen und mit deinem Google-Konto anmelden.
2. **„Projekt erstellen“** (bzw. „Neues Firebase-Projekt“) antippen.
   - **Name:** z. B. `Permanent Blog`.
   - Unter dem Namen zeigt Firebase die **Projekt-ID** an, z. B. `permanent-blog-1a2b3`. **Notiere sie dir genau**, du brauchst sie in Teil 2.
   - **Google Analytics:** ausschalten. Der Blog braucht es nicht, und ohne ist es datenschutzfreundlicher.
   - **KI-Hilfe (Gemini):** kannst du ausschalten.
3. Warten, bis das Projekt fertig ist, dann **„Weiter“**.
4. **Blaze-Tarif aktivieren:** Unten links auf **„Spark“** bzw. das Zahnrad → *Nutzung und Abrechnung* → **„Tarif ändern“** → **Blaze** wählen. Ein Rechnungskonto mit Kreditkarte anlegen.
5. **Budget-Alarm** setzen, wenn Firebase danach fragt, z. B. **5 €**. Du bekommst dann eine E-Mail, falls die Kosten je darüber steigen.

> **Wichtig:** Sonst nichts in der Firebase Console anklicken, insbesondere *nicht* „Firestore“ oder „Storage“ selbst anlegen. Das erledigt das Skript in Teil 2, und zwar in Frankfurt.

## Teil 2: Blog einrichten und hochladen (ca. 15 Minuten, meist Warten)

1. In einem neuen Tab **shell.cloud.google.com** öffnen, mit demselben Google-Konto. Das ist ein Terminal im Browser von Google, die „Cloud Shell“. Beim ersten Mal ggf. den Bedingungen zustimmen und auf **„Autorisieren“** tippen, wenn gefragt.
2. Diese Zeilen nacheinander eintippen bzw. einfügen und jeweils Enter drücken. **`PROJEKT-ID`** durch deine Projekt-ID aus Teil 1 ersetzen:

   ```bash
   git clone https://github.com/VibeCodiac/PermZwisch.git
   cd PermZwisch
   ./scripts/firebase-setup.sh PROJEKT-ID
   ```

3. Das Skript arbeitet jetzt alles ab und zeigt jeden Schritt an. Wahrscheinlich fragt es einmal nach einer **Anmeldung bei Firebase**:
   - Es erscheint ein **Link**: antippen, mit deinem Google-Konto anmelden und zustimmen.
   - Du bekommst einen **Code**: kopieren, zurück in die Cloud Shell, einfügen, Enter.
   - Falls gefragt wird, ob Firebase anonyme Nutzungsdaten sammeln darf: `n` und Enter.
4. Am Ende steht **„✔ Fertig!“** und eine Adresse wie `https://permanent-blog-1a2b3.web.app`. Der Blog ist jetzt online, noch ohne eigene Domain.

Bricht das Skript mit einer Fehlermeldung ab: einen Screenshot machen und mir schicken. Das Skript darf gefahrlos noch einmal gestartet werden.

## Teil 3: Admin-Konto anlegen (2 Minuten)

Noch in der Cloud Shell:

```bash
./scripts/firebase-admin.sh
```

- Eventuell kommt wieder ein Link mit Code, genauso wie oben.
- Dann **E-Mail, Name und Passwort** eingeben. Das Passwort ist beim Tippen unsichtbar, das ist so gewollt.

Danach `https://PROJEKT-ID.web.app/admin` öffnen und anmelden. 🎉

## Teil 4: Eigene Domain permanent-blog.de verbinden (10 Minuten + Wartezeit)

1. **Domain kaufen**, z. B. bei **inwx.de**. Vorher prüfen, ob `permanent-blog.de` noch frei ist.
2. In der **Firebase Console** links auf **„Hosting“** (ggf. unter „Build“ oder „Alle Produkte“) → **„Benutzerdefinierte Domain hinzufügen“** → `permanent-blog.de` eingeben.
3. Firebase zeigt dir **DNS-Einträge** an, meist einen **TXT**-Eintrag zur Bestätigung und **A**-Einträge. Diese genau so beim Domain-Anbieter (z. B. INWX → Domain → *DNS* bzw. *Nameserver-Einträge*) anlegen. Vorhandene A-Einträge für die Hauptdomain vorher löschen.
4. Zurück in Firebase auf **„Bestätigen“** tippen. Bis alles grün ist und das HTTPS-Zertifikat steht, kann es **einige Minuten bis 24 Stunden** dauern.
5. Dasselbe noch einmal für **`www.permanent-blog.de`**. Dabei die Option **„Weiterleiten zu permanent-blog.de“** wählen.

Die Einrichtung in Teil 2 ist schon auf `permanent-blog.de` eingestellt, z. B. für Links im RSS-Feed und in der Sitemap.

## Teil 5: Rechtliches

1. Unter **`/admin` → Einstellungen → Rechtliche Seiten** das **Impressum** und die **Datenschutzerklärung** ausfüllen (Platzhalter in `[eckigen Klammern]` ersetzen). Hosting-Anbieter ist jetzt *Google Cloud EMEA Limited* (Firebase), das steht in der Vorlage schon drin.
2. **Vertrag zur Auftragsverarbeitung mit Google:** In der Firebase Console → Zahnrad → **Projekteinstellungen** → Bereich **„Datenschutz“** bzw. „Datenverarbeitungsbedingungen“ die Bedingungen bestätigen. Die Bezeichnung des Menüpunkts kann sich bei Google ändern; schick mir im Zweifel einen Screenshot.

---

## Später

**Neue Version veröffentlichen.** Wenn neuer Code auf GitHub ist, in der Cloud Shell:

```bash
cd PermZwisch && ./scripts/firebase-deploy.sh
```

Beiträge, Fotos und Konten bleiben dabei erhalten.

**Passwort vergessen.** In der Cloud Shell `cd PermZwisch && ./scripts/firebase-admin.sh` ausführen, mit derselben E-Mail-Adresse. Dann wird das Passwort neu gesetzt.

**Etwas langsam beim ersten Aufruf?** Wenn eine Weile niemand die Seite besucht hat, braucht der erste Aufruf 2–5 Sekunden („Kaltstart“). Danach ist sie schnell. Das hält die Kosten bei nahezu null.

**Neuer Beitrag erscheint nicht sofort?** Öffentliche Seiten werden bis zu 2 Minuten zwischengespeichert. Im Redaktionsbereich siehst du Änderungen immer sofort.

## Was wo liegt

| Was | Wo |
|---|---|
| Die App | Cloud Function `permzwisch` in Frankfurt (`europe-west3`) |
| CSS, Schriften, Skripte | Firebase Hosting (weltweites CDN) |
| Beiträge, Reviews, Konten, Einstellungen | Firestore-Datenbank in Frankfurt; direkter Zugriff von außen ist gesperrt |
| Fotos und Cover | Cloud Storage `PROJEKT-ID-blog-bilder` in Frankfurt, nicht öffentlich; ausgeliefert über die App |
| Sitzungsschlüssel | Secret Manager (`SESSION_SECRET`) |
