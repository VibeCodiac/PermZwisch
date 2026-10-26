// Datenablage: dieselbe kleine Schnittstelle für Firestore (Firebase), eine lokale JSON-Datei
// (Entwicklung) und den Arbeitsspeicher (Tests). Dokumente sind flache Objekte mit einer ID.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

/** Hält alles im Speicher; optional wird nach jeder Änderung in eine JSON-Datei geschrieben. */
class MemoryDriver {
  constructor(file = null) {
    this.file = file;
    this.data = {};
    if (file && fs.existsSync(file)) this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  col(name) {
    return (this.data[name] ??= {});
  }

  persist() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  async list(name) {
    return Object.entries(this.col(name)).map(([id, doc]) => ({ ...structuredClone(doc), id }));
  }

  async get(name, id) {
    const doc = this.col(name)[String(id)];
    return doc ? { ...structuredClone(doc), id: String(id) } : null;
  }

  async set(name, id, data) {
    const { id: _ignore, ...rest } = data;
    this.col(name)[String(id)] = structuredClone(rest);
    this.persist();
  }

  async update(name, id, data) {
    const current = this.col(name)[String(id)];
    if (!current) throw new Error(`${name}/${id} existiert nicht`);
    const { id: _ignore, ...rest } = data;
    Object.assign(current, structuredClone(rest));
    this.persist();
  }

  async remove(name, id) {
    delete this.col(name)[String(id)];
    this.persist();
  }

  async nextId(counter) {
    const counters = this.col('_counters');
    counters[counter] = (counters[counter] || 0) + 1;
    this.persist();
    return counters[counter];
  }

  async ensureCounterAtLeast(counter, value) {
    const counters = this.col('_counters');
    if ((counters[counter] || 0) < value) counters[counter] = value;
    this.persist();
  }
}

class FirestoreDriver {
  constructor(db) {
    this.db = db;
  }

  async list(name) {
    const snap = await this.db.collection(name).get();
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  }

  async get(name, id) {
    const d = await this.db.collection(name).doc(String(id)).get();
    return d.exists ? { ...d.data(), id: d.id } : null;
  }

  async set(name, id, data) {
    const { id: _ignore, ...rest } = data;
    await this.db.collection(name).doc(String(id)).set(rest);
  }

  async update(name, id, data) {
    const { id: _ignore, ...rest } = data;
    await this.db.collection(name).doc(String(id)).update(rest);
  }

  async remove(name, id) {
    await this.db.collection(name).doc(String(id)).delete();
  }

  /** Fortlaufende Nummern (für URLs und Lagernummern), sicher auch bei parallelen Zugriffen. */
  async nextId(counter) {
    const ref = this.db.collection('_counters').doc(counter);
    return this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const value = (snap.exists ? snap.data().value : 0) + 1;
      tx.set(ref, { value });
      return value;
    });
  }

  async ensureCounterAtLeast(counter, value) {
    const ref = this.db.collection('_counters').doc(counter);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().value < value) tx.set(ref, { value });
    });
  }
}

let driver;

export async function getDriver() {
  if (driver) return driver;
  if (config.dataDriver === 'firestore') {
    const { firebaseApp } = await import('./firebase.js');
    const { getFirestore } = await import('firebase-admin/firestore');
    const db = getFirestore(firebaseApp());
    db.settings({ ignoreUndefinedProperties: true });
    driver = new FirestoreDriver(db);
  } else if (config.dataDriver === 'memory') {
    driver = new MemoryDriver();
  } else {
    driver = new MemoryDriver(config.dataFile);
  }
  return driver;
}
