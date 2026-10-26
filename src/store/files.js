// Ablage für Bilddateien: Cloud Storage auf Firebase, ein lokaler Ordner sonst.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const SAFE_NAME = /^[a-f0-9]{24}(-sm)?\.webp$/;

class LocalFiles {
  constructor(dir) {
    this.dir = dir;
  }

  async save(name, buffer) {
    await fsp.mkdir(this.dir, { recursive: true });
    await fsp.writeFile(path.join(this.dir, name), buffer);
  }

  async open(name) {
    if (!SAFE_NAME.test(name)) return null;
    const file = path.join(this.dir, name);
    try {
      const { size } = await fsp.stat(file);
      return { stream: fs.createReadStream(file), size };
    } catch {
      return null;
    }
  }

  async remove(name) {
    await fsp.rm(path.join(this.dir, name), { force: true });
  }
}

class BucketFiles {
  constructor(bucket) {
    this.bucket = bucket;
  }

  async save(name, buffer) {
    await this.bucket.file(`uploads/${name}`).save(buffer, {
      resumable: false,
      contentType: 'image/webp',
      metadata: { cacheControl: 'public, max-age=31536000, immutable' },
    });
  }

  async open(name) {
    if (!SAFE_NAME.test(name)) return null;
    const file = this.bucket.file(`uploads/${name}`);
    try {
      const [meta] = await file.getMetadata();
      return { stream: file.createReadStream(), size: Number(meta.size) };
    } catch (err) {
      if (err.code === 404) return null;
      throw err;
    }
  }

  async remove(name) {
    await this.bucket.file(`uploads/${name}`).delete({ ignoreNotFound: true });
  }
}

let files;

export async function getFiles() {
  if (files) return files;
  if (config.dataDriver === 'firestore') {
    if (!config.uploadBucket) throw new Error('UPLOAD_BUCKET ist nicht gesetzt.');
    const { firebaseApp } = await import('./firebase.js');
    const { getStorage } = await import('firebase-admin/storage');
    files = new BucketFiles(getStorage(firebaseApp()).bucket(config.uploadBucket));
  } else {
    files = new LocalFiles(config.uploadDir);
  }
  return files;
}
