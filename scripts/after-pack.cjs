const path = require('node:path')

module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') {
    return
  }

  const { rcedit } = await import('rcedit')
  const appInfo = context.packager.appInfo
  const executablePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`)
  const iconPath = path.join(context.packager.projectDir, 'build', 'icon.ico')

  await rcedit(executablePath, {
    icon: iconPath,
    'file-version': '0.9.0.0',
    'product-version': '0.9.0.0',
    'requested-execution-level': 'asInvoker',
    'version-string': {
      CompanyName: 'Piano Fundamentals Trainer',
      FileDescription: '钢琴基本功训练器',
      InternalName: 'Piano Fundamentals Trainer',
      LegalCopyright: 'Copyright © 2026 Piano Fundamentals Trainer',
      OriginalFilename: `${appInfo.productFilename}.exe`,
      ProductName: '钢琴基本功训练器'
    }
  })
}
