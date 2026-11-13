'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

async function install() {
  const version = '2.3.232';
  const url = `https://repo.maven.apache.org/maven2/com/h2database/h2/${version}/h2-${version}.jar`;
  const [jar, digest] = await Promise.all([fetch(url), fetch(url + '.sha256')]);
  if (!jar.ok || !digest.ok) throw new Error('无法下载H2驱动或校验和');
  const bytes = Buffer.from(await jar.arrayBuffer());
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== (await digest.text()).trim()) throw new Error('H2驱动校验失败');
  const dir = path.resolve(__dirname, '../backend/.runtime');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `h2-${version}.jar`), bytes);
  console.log(`Installed H2 ${version}; SHA-256 verified.`);
}
install().catch(error => { console.error(error.message); process.exitCode = 1; });
