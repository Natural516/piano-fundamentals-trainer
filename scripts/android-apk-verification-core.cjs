function normalizeFingerprint(value) {
  if (typeof value !== 'string') throw new Error('signer fingerprint is missing')
  const hexadecimal = value.replace(/:/g, '').trim().toUpperCase()
  if (!/^[0-9A-F]{64}$/.test(hexadecimal)) throw new Error('signer fingerprint is malformed')
  return hexadecimal.match(/.{2}/g).join(':')
}

function parseSignerReport(report) {
  if (typeof report !== 'string' || !report.trim()) throw new Error('apksigner output is missing')
  const dnMatches = [...report.matchAll(/Signer #(\d+) certificate DN:\s*(.+)/gi)]
  const fingerprintMatches = [...report.matchAll(/Signer #(\d+) certificate SHA-256 digest:\s*([^\r\n]+)/gi)]
  if (!dnMatches.length || !fingerprintMatches.length) throw new Error('apksigner signer metadata is missing')

  const namesByIndex = new Map(dnMatches.map((match) => [match[1], match[2].trim()]))
  const signers = fingerprintMatches.map((match) => {
    const distinguishedName = namesByIndex.get(match[1])
    if (!distinguishedName) throw new Error(`apksigner signer #${match[1]} distinguished name is missing`)
    return {
      index: Number(match[1]),
      distinguishedName,
      fingerprint: normalizeFingerprint(match[2])
    }
  })
  if (signers.length !== namesByIndex.size) throw new Error('apksigner signer metadata is inconsistent')
  return signers
}

function assertExactReleaseSigner(report, expectedFingerprint) {
  const expected = normalizeFingerprint(expectedFingerprint)
  const signers = parseSignerReport(report)
  if (signers.some((signer) => /CN=Android Debug(?:,|$)/i.test(signer.distinguishedName))) {
    throw new Error('release APK is signed with the Android Debug certificate')
  }
  if (signers.length !== 1) throw new Error(`release APK must have exactly one current signer; found ${signers.length}`)
  if (signers[0].fingerprint !== expected) {
    throw new Error(`release APK signer does not match the frozen permanent signer (actual ${signers[0].fingerprint})`)
  }
  return signers[0]
}

module.exports = {
  normalizeFingerprint,
  parseSignerReport,
  assertExactReleaseSigner
}
