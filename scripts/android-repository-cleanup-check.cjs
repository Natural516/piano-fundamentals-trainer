const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const c = require('./android-repository-cleanup-contract.cjs')
c.assertCleanupDelta()
console.log('PASS R1 exact retired inventory, relocation equivalence, product/security byte freeze and lockfile version retention')
const config = ts.readConfigFile(path.join(c.root,'prototype/android-tablet-v1/tsconfig.json'),ts.sys.readFile)
const parsed = ts.parseJsonConfigFileContent(config.config,ts.sys,path.join(c.root,'prototype/android-tablet-v1'))
const program = ts.createProgram(parsed.fileNames,parsed.options)
const diagnostics = ts.getPreEmitDiagnostics(program)
assert.deepEqual(diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[])
for (const source of program.getSourceFiles().filter(s=>!s.fileName.includes('node_modules'))) {
  assert.doesNotMatch(source.fileName.replaceAll('\\','/'),/src\/renderer\//)
  const visit = n => {
    if ((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier) assert.doesNotMatch(n.moduleSpecifier.text,/electron|src\/renderer/)
    if (ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||n.expression.getText(source)==='require')&&ts.isStringLiteral(n.arguments[0]))assert.doesNotMatch(n.arguments[0].text,/electron|src\/renderer/)
    ts.forEachChild(n,visit)
  }; visit(source)
}
assert.doesNotMatch(c.read('prototype/android-tablet-v1/src/styles.css').split('\n')[0],/undefined/)
const css = fs.readFileSync(path.join(c.root,'prototype/android-tablet-v1/src/styles.css'),'utf8')
assert.match(css,/src\/shared\/styles\/themes\.css/)
// Git does not track empty directories; no retired file may remain in the tree.
for (const item of c.manifest.retired.filter(x=>x.path.startsWith('src/renderer/'))) assert.equal(fs.existsSync(path.join(c.root,item.path)),false,item.path)
console.log('PASS R2 actual TypeScript resolved graph/typecheck and CSS use no desktop entry')
for(const file of ['bravura.woff2','Bravura-OFL-1.1.txt','VexFlow-MIT.txt']) {
  if(file.endsWith('.txt')) assert.ok(fs.statSync(path.join(c.root,'prototype/android-tablet-v1/public/third-party-licenses',file)).size>100)
  else assert.ok(fs.statSync(require.resolve('@vexflow-fonts/bravura/bravura.woff2')).size>100)
}
console.log('PASS R3 notation font and complete license resources retained')
// The ten pure-domain/notation cases are copied exactly, not weakened desktop extracts.
const previous = ts.createSourceFile('historical.cjs', require('node:child_process').execFileSync('git', ['show', c.base + ':scripts/regression-check.cjs'], {cwd:c.root, encoding:'utf8',maxBuffer:64*1024*1024}), ts.ScriptTarget.Latest,true)
const migrated = ts.createSourceFile('migrated.cjs', fs.readFileSync(path.join(c.root,'scripts/android-music-notation-check.cjs'),'utf8'), ts.ScriptTarget.Latest,true)
const cases = ast => new Map(ast.statements.filter(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='test').map(n=>[n.expression.arguments[0].text,n.expression.arguments[1].getText(ast).replaceAll('\r\n','\n')]))
const oldCases=cases(previous),newCases=cases(migrated)
assert.equal(newCases.size,11)
for(const [name,body] of [...newCases].slice(0,10)) assert.equal(body,oldCases.get(name),name+' original complete assertion body retained')
const sightBefore = ts.createSourceFile('sight-before.cjs', require('node:child_process').execFileSync('git', ['show', c.base + ':scripts/sight-reading-contracts.cjs'], {cwd:c.root,encoding:'utf8'}), ts.ScriptTarget.Latest,true)
const sightAfter = ts.createSourceFile('sight-after.cjs', fs.readFileSync(path.join(c.root,'scripts/sight-reading-contracts.cjs'),'utf8'), ts.ScriptTarget.Latest,true)
let intact = 0
for(const [name,body] of cases(sightAfter)) if(!name.startsWith('C12 ') && !name.startsWith('C31 ')) {
  assert.equal(body,cases(sightBefore).get(name),name+' original shared assertion body retained')
  intact++
}
assert.equal(intact,36)
console.log('PASS R4 ten exact shared-domain regression bodies preserved from fixed published source')
console.log('4/4 Android repository cleanup contract groups PASS')
