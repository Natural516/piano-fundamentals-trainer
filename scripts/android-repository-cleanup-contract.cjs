const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process')
const manifest = require('./android-repository-cleanup-manifest.json')
const root = path.resolve(__dirname, '..'), base = 'a6a2cfc996ee9a03744c7fcd38cf553ebd07ff08'
assert.equal(manifest.base, base, 'fixed published source; never current HEAD')
assert.equal(require('node:crypto').createHash('sha256').update(JSON.stringify(manifest)).digest('hex'), 'db890bf029c791911ae0a048d2c254d075558c352b4024743ff58685ddb376ab', 'explicit reviewed inventory; cannot widen exclusions')
const clean = s => s.replaceAll('\r\n', '\n')
const migrations = manifest.migrations
const reverse = Object.fromEntries(Object.entries(migrations).map(([a,b]) => [b,a]))
const retired = new Set(manifest.retired.map(x => x.path))
const nativeTestPath = 'android/app/src/test/java/com/pianofundamentals/trainer/ThemeHostCompatibilityTest.kt'
const currentPath = file => migrations[file] ?? file
const historicalPath = file => reverse[file] ?? file
function normalize(file, source) {
  source = clean(source)
  file = historicalPath(file)
  if(file === nativeTestPath) source = source
    .replace('assertEquals("1.7.1", BuildConfig.VERSION_NAME)', 'assertEquals("1.6.0", BuildConfig.VERSION_NAME)')
    .replace('assertEquals(16, BuildConfig.VERSION_CODE)', 'assertEquals(14, BuildConfig.VERSION_CODE)')
    .replace('inspect("1.1.0", "1.7.2", "2.0.0")', 'inspect("1.1.0", "1.6.1", "2.0.0")')
    .replace('inspect("1.1.0", "1.5.3", "1.7.1")', 'inspect("1.1.0", "1.5.3", "1.6.0")')
  if (manifest.importFiles.includes(file)) source = source
    .replaceAll('src/shared/musicNotation/MusicStaffRenderer', 'src/renderer/src/components/MusicStaffRenderer')
    .replaceAll('src/shared/musicNotation/musicNotationFont', 'src/renderer/src/utils/musicNotationFont')
    .replaceAll('src/shared/styles/themes.css', 'src/renderer/src/styles/themes.css')
  if (file === 'src/renderer/src/components/MusicStaffRenderer.tsx') source = source
    .replace("from './musicNotationFont'", "from '../utils/musicNotationFont'")
    .replace("from './musicStaffModel'", "from '../utils/musicStaffModel'")
    .replace("from '../../sightReading/musicNotationTypes'", "from '../utils/musicNotationTypes'")
    .replace("from '../../sightReading/musicKeySignatures'", "from '../utils/musicKeySignatures'")
  if (file === 'src/renderer/src/utils/musicStaffModel.ts') source = source
    .replace("from '../../sightReading/musicKeySignatures'", "from './musicKeySignatures'")
    .replace("from '../../sightReading/musicNotationTypes'", "from './musicNotationTypes'")
  return source
}
const read = file => normalize(file, fs.readFileSync(path.join(root, currentPath(file)), 'utf8'))
const oldCache = new Map()
const old = file => { if(!oldCache.has(file)) oldCache.set(file,clean(execFileSync('git', ['show', base + ':' + file], {cwd:root, encoding:'utf8', maxBuffer:64*1024*1024}))); return oldCache.get(file) }
const allowedPaths = [...retired, ...Object.values(migrations), ...manifest.importFiles, nativeTestPath, 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.web.json', 'prototype/android-tablet-v1/tsconfig.json']
let verified = false
function assertCleanupDelta() {
  if (verified) return
  const tree = execFileSync('git', ['ls-tree','-r',base], {cwd:root,encoding:'utf8'}).trim().split('\n').map(line => {const [header,file]=line.split('\t'); return {file,blob:header.split(' ')[2]}})
  const blobs = new Map(tree.map(x=>[x.file,x.blob]))
  for (const item of manifest.retired) {
    assert.equal(item.blob, blobs.get(item.path), item.path + ' exact retired published blob')
    assert.equal(fs.existsSync(path.join(root,item.path)), false, item.path + ' retired, not relocated legacy')
  }
  for (const [from,to] of Object.entries(migrations)) {
    assert.equal(read(to), old(from), to + ' identical content except exact import relocation')
    assert.throws(()=>assert.equal(normalize(to, fs.readFileSync(path.join(root,to),'utf8')+'\n// mutation\n'),old(from)))
  }
  // Every existing Android source/resource/domain/native/theme byte remains protected.
  for (const {file} of tree.filter(x => /^(android\/|prototype\/android-tablet-v1\/|src\/sightReading\/|theme-api\/|theme-contract\/|theme-packages\/|artwork\/)/.test(x.file))) {
    if (file === 'prototype/android-tablet-v1/tsconfig.json') continue
    if (manifest.importFiles.includes(file) || file === nativeTestPath) assert.equal(read(file), old(file), file + ' exact relocation or test-only version synchronization')
    else {
      let bytes = fs.readFileSync(path.join(root,file))
      if(/\.(ts|tsx|cjs|mjs|json|css|html|md|txt|kt|java|xml|gradle|properties|bat|sh|pro|toml)$/.test(file)||/\/(?:gradlew|\.gitignore)$/.test(file)) bytes = Buffer.from(clean(bytes.toString('utf8')))
      const hash = require('node:crypto').createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')
      assert.equal(hash,blobs.get(file),file+' unchanged')
    }
  }
  const expected = JSON.parse(old('package.json')), actual = JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'))
  delete expected.main; delete expected.build
  expected.description = 'Piano Fundamentals Trainer for Android tablets: MIDI practice, theory tools and practice history.'
  for(const key of manifest.removedScripts) delete expected.scripts[key]
  for(const key of manifest.removedDependencies) delete expected.devDependencies[key]
  expected.scripts.typecheck = 'tsc --noEmit -p prototype/android-tablet-v1/tsconfig.json'
  expected.scripts['test:android-repository-cleanup'] = 'node scripts/android-repository-cleanup-check.cjs'
  expected.scripts['test:android-music-notation'] = 'node scripts/android-music-notation-check.cjs'
  assert.deepEqual(actual,expected,'only reviewed desktop metadata/commands/dependencies removed')
  const before = JSON.parse(old('package-lock.json')), after = JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'))
  for(const [name,entry]of Object.entries(after.packages)) if(name) {
    assert.ok(before.packages[name], name+' no new dependency')
    for(const field of ['version','resolved','integrity']) assert.equal(entry[field],before.packages[name][field],name+' unchanged '+field)
  }
  for(const name of manifest.removedDependencies) assert.equal(after.packages['node_modules/'+name],undefined,name+' absent')
  assert.deepEqual(after.packages[''].dependencies,actual.dependencies)
  assert.deepEqual(after.packages[''].devDependencies,actual.devDependencies)
  assert.equal(read('android/version.properties'),old('android/version.properties'))
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,"tsconfig.json"),'utf8')), {"extends":"./prototype/android-tablet-v1/tsconfig.json"}, 'precise Android compiler configuration')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,"tsconfig.web.json"),'utf8')), {"compilerOptions":{"composite":false,"target":"ES2020","useDefineForClassFields":true,"lib":["DOM","DOM.Iterable","ES2020"],"allowSyntheticDefaultImports":true,"esModuleInterop":true,"strict":true,"module":"ESNext","moduleResolution":"Bundler","resolveJsonModule":true,"isolatedModules":true,"noEmit":true,"jsx":"react-jsx","skipLibCheck":true},"include":["prototype/android-tablet-v1/src/**/*.ts","prototype/android-tablet-v1/src/**/*.tsx","src/sightReading/**/*.ts","src/shared/**/*.ts","src/shared/**/*.tsx"]}, 'precise Android compiler configuration')
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,"prototype/android-tablet-v1/tsconfig.json"),'utf8')), {"extends":"../../tsconfig.web.json","compilerOptions":{"composite":false,"noEmit":true,"types":["vite/client"]},"include":["./src/**/*.ts","./src/**/*.tsx","../../src/shared/**/*.ts","../../src/shared/**/*.tsx"]}, 'precise Android compiler configuration')
  verified = true
}
module.exports = {base,root,manifest,migrations,currentPath,historicalPath,normalize,read,allowedPaths,nativeTestPath,isRetired:file=>retired.has(file),assertCleanupDelta}
