# Releasing

Releases are published to npm by GitHub Actions using npm **trusted publishing**
(OIDC). There is no npm token stored on this repository.

## One-time setup

Trusted publishing is configured from a package's settings page, so it cannot be
used for the very first publish of a package that does not exist yet. The first
release goes out from a workstation; everything after that goes out from CI.

### 1. Publish the first version manually

```bash
npm login                    # interactive, asks for the 2FA code
npm publish --access public  # prepublishOnly reruns typecheck, tests and build
```

### 2. Register the trusted publisher

On npmjs.com, open the package, then **Settings** and the **Trusted Publisher**
section. Every field is case-sensitive and must match this repository exactly:

| Field                | Value               |
| -------------------- | ------------------- |
| Publisher            | GitHub Actions      |
| Organization or user | `smeet666`          |
| Repository           | `mcp-bideetmusique` |
| Workflow filename    | `publish.yml`       |
| Environment          | leave empty         |
| Allowed actions      | `npm publish`       |

### 3. Lock out token publishing (optional, recommended)

In the same settings page, restrict publishing to trusted publishers only. From
then on a leaked npm token cannot push a release of this package.

## Every release after that

1. Bump the version in **four** places, which must stay in step:
   - `package.json`
   - `server.json`, twice: the top-level `version` and the package `version`
   - `packaging/manifest.json`
   - `src/version.ts`, which feeds the User-Agent sent to the site
2. Update `CHANGELOG.md`.
3. Commit, then tag and push:

```bash
git tag v0.3.0
git push origin main --tags
```

The `publish.yml` workflow reruns typecheck, tests and build, then publishes with
`--provenance`, which links the published tarball to the exact commit and workflow
run that produced it. A second job builds the `.mcpb` bundle and attaches it to
the GitHub release.

## Verifying a release

```bash
npm view mcp-bideetmusique version
npx -y mcp-bideetmusique          # should start and wait on stdin
```

The npm package page should show a provenance badge pointing at the workflow run.

Publishing is permanent: a version can only be unpublished within 72 hours, and
the name stays reserved afterwards.

## Listing on the MCP registry

`server.json` at the repository root is ready for the official MCP registry, and
`publish-registry.yml` submits it once npm serves the version. Two things about
that entry are worth knowing before editing it by hand:

- The registry caps the description at **100 characters** and refuses anything
  longer.
- The bundle address carries a version number and is **computed at publish time**
  from the release the workflow just built. Writing it by hand survives a version
  bump, and the registry then advertises one release while serving the file of
  another.

## Glama

Indexing is automatic; the rest needs a signed-in session. Claim the server, with
`glama.json` and its `maintainers` entry as the proof, set the build spec, then
run **Build** on its own followed by **Make Release**, entering the real version
number. The combined button picks a version of its own.
