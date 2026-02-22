const fs = require('fs');
const path = require('path');

const localesDir = path.join(
  process.cwd(),
  'node_modules',
  '@react-native',
  'debugger-frontend',
  'dist',
  'third-party',
  'front_end',
  'core',
  'i18n',
  'locales'
);

const enUsFile = path.join(localesDir, 'en-US.json');
const jaFile = path.join(localesDir, 'ja.json');

if (!fs.existsSync(localesDir) || !fs.existsSync(enUsFile)) {
  process.exit(0);
}

if (!fs.existsSync(jaFile)) {
  fs.copyFileSync(enUsFile, jaFile);
  console.log('Created missing debugger locale: ja.json');
}
