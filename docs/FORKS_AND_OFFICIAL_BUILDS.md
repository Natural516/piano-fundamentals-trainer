# Forks and official builds

## Official identity

- Package ID: `com.pianofundamentals.trainer`
- Official release repository: `Natural516/piano-trainer-releases`
- Official update Manifest: `https://github.com/Natural516/piano-trainer-releases/releases/latest/download/latest.json`
- Official builds are signed with the Natural516-controlled permanent release identity. Private signing material is not public.

Android signature rules and the updater's exact signer-set verification protect the official package. They do not make an unchanged fork identity safe for redistribution: a modified build can conflict with the installed official app, query the official channel and present confusing update information.

## Requirements for redistributed forks

Anyone distributing a modified build should change all identity and trust surfaces together:

- `applicationId` / package ID and Capacitor `appId`
- display name
- icon and official branding
- signing identity
- updater endpoint
- updater signer trust pin
- FileProvider authority where it is not already derived safely from the new package ID
- release and update channel

A fork must either disable the updater or fully replace it with its own HTTPS Manifest, artifacts, signing identity and verification configuration. Modified distributed builds must not use Natural516's official update Manifest or present themselves as official Natural516 releases.

Do not weaken package, version, hash, signer, verified-token or FileProvider validation to make a fork easier. Reconfigure the complete trust boundary instead.
