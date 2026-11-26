const { execFileSync, execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function fixExecutablePermissions(executablePath) {
  if (fs.existsSync(executablePath)) {
    try {
      const stats = fs.statSync(executablePath)
      const mode = stats.mode
      const ownerExecutable = (mode & parseInt('100', 8)) !== 0
      if (!ownerExecutable) {
        console.log(`  Fixing permissions for: ${executablePath}`)
        fs.chmodSync(executablePath, 0o755)
        console.log('  ✓ Fixed permissions')
        return true
      }
      console.log(`  ✓ Permissions already correct: ${executablePath}`)
      return false
    } catch (err) {
      console.warn(`  Warning: Cannot fix permissions for ${executablePath}: ${err.message}`)
      return false
    }
  }
  return false
}

function fixAppPermissions(appPath) {
  const executablePath = path.join(appPath, 'Contents', 'MacOS', 'tuff')
  console.log(`  Fixing main executable: ${executablePath}`)
  fixExecutablePermissions(executablePath)

  const frameworksPath = path.join(appPath, 'Contents', 'Frameworks')
  if (fs.existsSync(frameworksPath)) {
    try {
      const frameworks = fs.readdirSync(frameworksPath, { withFileTypes: true })
      frameworks.forEach((framework) => {
        if (framework.isDirectory() && framework.name.includes('Helper')) {
          const helperAppPath = path.join(frameworksPath, framework.name)
          const helperMacOSPath = path.join(helperAppPath, 'Contents', 'MacOS')

          if (fs.existsSync(helperMacOSPath)) {
            try {
              const helperFiles = fs.readdirSync(helperMacOSPath, { withFileTypes: true })
              helperFiles.forEach((helperFile) => {
                if (helperFile.isFile()) {
                  const helperPath = path.join(helperMacOSPath, helperFile.name)
                  fixExecutablePermissions(helperPath)
                }
              })
            } catch (err) {
              console.warn(
                `  Warning: Cannot read Helper MacOS directory ${helperMacOSPath}: ${err.message}`
              )
            }
          }
        }
      })
    } catch (err) {
      console.warn(`  Warning: Cannot read Frameworks directory: ${err.message}`)
    }

    const electronFrameworkPath = path.join(frameworksPath, 'Electron Framework.framework')
    if (fs.existsSync(electronFrameworkPath)) {
      const helpersPath = path.join(electronFrameworkPath, 'Helpers')
      if (fs.existsSync(helpersPath)) {
        try {
          const helpers = fs.readdirSync(helpersPath)
          helpers.forEach((helper) => {
            const helperPath = path.join(helpersPath, helper)
            if (fs.statSync(helperPath).isFile() && !helper.endsWith('.dylib')) {
              fixExecutablePermissions(helperPath)
            }
          })
        } catch (err) {
          console.warn(`  Warning: Cannot read Helpers directory: ${err.message}`)
        }
      }
    }
  }
}

function findAppDirs(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true })
  const appDirs = []
  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      if (item.name.endsWith('.app')) {
        appDirs.push(fullPath)
      } else {
        appDirs.push(...findAppDirs(fullPath))
      }
    }
  }
  return appDirs.sort()
}

function fixFrameworkExecutablePermissions(appDirs) {
  console.log('\n=== Fixing all Framework executable permissions ===')
  appDirs.forEach((appPath) => {
    const frameworksPath = path.join(appPath, 'Contents', 'Frameworks')
    if (fs.existsSync(frameworksPath)) {
      try {
        execSync(
          `find "${frameworksPath}" -type f ! -name "*.dylib" ! -name "*.plist" -exec chmod +x {} \\;`,
          { stdio: 'inherit' }
        )
        console.log(`  ✓ Fixed all Framework executable permissions in: ${appPath}`)
      } catch (err) {
        console.warn(`  Warning: Failed to fix Framework permissions in ${appPath}: ${err.message}`)
      }
    }
  })
}

function removeQuarantine(appDirs) {
  console.log('\n=== Removing quarantine attribute ===')
  appDirs.forEach((appPath) => {
    try {
      execSync(`xattr -dr com.apple.quarantine "${appPath}"`, { stdio: 'inherit' })
      console.log(`  ✓ Removed quarantine from: ${appPath}`)
    } catch (err) {
      console.warn(`  Warning: Failed to remove quarantine from ${appPath}: ${err.message}`)
    }
  })
}

function adHocSignApps(appDirs) {
  console.log('\n=== Adding ad-hoc code signature ===')
  appDirs.forEach((appPath) => {
    try {
      const frameworksPath = path.join(appPath, 'Contents', 'Frameworks')

      if (fs.existsSync(frameworksPath)) {
        try {
          const frameworks = fs.readdirSync(frameworksPath, { withFileTypes: true })
          frameworks.forEach((framework) => {
            if (framework.isDirectory() && framework.name.endsWith('.app')) {
              const helperAppPath = path.join(frameworksPath, framework.name)
              try {
                execSync(`codesign --force --sign - "${helperAppPath}"`, { stdio: 'pipe' })
                console.log(`  ✓ Signed Helper: ${framework.name}`)
              } catch (err) {
                console.warn(`  ⚠️  Failed to sign Helper ${framework.name}: ${err.message}`)
              }
            }
          })
        } catch (err) {
          console.warn(`  Warning: Cannot read Frameworks directory: ${err.message}`)
        }

        try {
          const frameworks = fs.readdirSync(frameworksPath, { withFileTypes: true })
          frameworks.forEach((framework) => {
            if (framework.isDirectory() && framework.name.endsWith('.framework')) {
              const frameworkPath = path.join(frameworksPath, framework.name)
              try {
                execSync(`codesign --force --sign - "${frameworkPath}"`, { stdio: 'pipe' })
                console.log(`  ✓ Signed Framework: ${framework.name}`)
              } catch (err) {
                console.warn(`  ⚠️  Failed to sign Framework ${framework.name}: ${err.message}`)
              }
            }
          })
        } catch (err) {
          console.warn(`  Warning: Cannot read Frameworks for framework signing: ${err.message}`)
        }
      }

      execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
      console.log(`  ✓ Added ad-hoc signature to main app: ${appPath}`)

      try {
        execSync(`codesign --verify --strict --verbose "${appPath}"`, { stdio: 'pipe' })
        console.log(`  ✓ Verified signature for: ${appPath}`)
      } catch (verifyErr) {
        console.warn(`  ⚠️  Signature verification warning: ${verifyErr.message}`)
        console.warn('  → This is often normal for ad-hoc signatures. The app should still work.')
        console.warn(
          "  → Note: Ad-hoc signatures are not trusted by Gatekeeper, but bypass 'damaged' error."
        )
        console.warn("  → Users may need to right-click and select 'Open' the first time.")
      }
    } catch (err) {
      console.warn(`  Warning: Failed to add ad-hoc signature to ${appPath}: ${err.message}`)
      console.warn(
        "  → The app may still show 'damaged' error. Users can right-click and select 'Open' to bypass."
      )
    }
  })
}

function isOfficialReleaseBuild() {
  const value = String(process.env.TUFF_OFFICIAL_RELEASE_BUILD || '')
    .trim()
    .toLowerCase()
  return value === '1' || value === 'true'
}

function verifyOfficialSignedApps(appDirs) {
  console.log('\n=== Verifying Developer ID signatures before archive ===')
  appDirs.forEach((appPath) => {
    const verification = spawnSync(
      '/usr/bin/codesign',
      ['--verify', '--deep', '--strict', '--verbose=4', appPath],
      { encoding: 'utf8' }
    )
    if (verification.status !== 0) {
      throw new Error(`Developer ID signature verification failed for ${appPath}`)
    }

    const details = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', appPath], {
      encoding: 'utf8'
    })
    const output = `${details.stdout || ''}\n${details.stderr || ''}`
    const hasDeveloperId = /^Authority=Developer ID Application:/m.test(output)
    const teamMatch = output.match(/^TeamIdentifier=(.+)$/m)
    const teamIdentifier = teamMatch?.[1]?.trim()
    if (
      details.status !== 0 ||
      !hasDeveloperId ||
      !teamIdentifier ||
      teamIdentifier === 'not set'
    ) {
      throw new Error(`Official build is not signed with a Developer ID identity: ${appPath}`)
    }

    console.log(`  ✓ Verified Developer ID signature (${teamIdentifier}): ${appPath}`)
  })
}

function resolveMacAppBundleArch(appPath, fallbackArch = 'arm64') {
  const parentName = path.basename(path.dirname(appPath)).toLowerCase()
  if (parentName === 'mac-arm64' || parentName === 'mac-aarch64') {
    return 'arm64'
  }
  if (parentName === 'mac-x64' || parentName === 'mac-amd64' || parentName === 'mac') {
    // electron-builder omits the suffix for its default macOS arch (Arch.x64 -> dist/mac/*.app)
    // and appends -arm64 / -universal for non-default architectures.
    return 'x64'
  }
  if (parentName === 'mac-universal') {
    return 'universal'
  }
  return fallbackArch || 'arm64'
}

function findExistingElectronBuilderZip(distDir, appStem, version, bundleArch) {
  const candidate = path.join(distDir, `${appStem}-${version}-macos-${bundleArch}.zip`)
  try {
    const stats = fs.statSync(candidate)
    if (stats.isFile() && stats.size > 0) {
      return candidate
    }
  } catch {
    // No pre-existing electron-builder zip archive for this architecture.
  }
  return null
}

function planMacAppZipArchives(
  appDirs,
  distDir,
  version,
  fallbackArch,
  officialReleaseBuild = false
) {
  const plans = []
  const plannedOutputs = new Map()

  for (const appPath of [...appDirs].sort()) {
    const appName = path.basename(appPath)
    const appParent = path.dirname(appPath)
    const appStem = appName.endsWith('.app') ? appName.slice(0, -4) : appName
    const bundleArch = resolveMacAppBundleArch(appPath, fallbackArch)
    const existingZipPath = findExistingElectronBuilderZip(distDir, appStem, version, bundleArch)

    if (officialReleaseBuild && existingZipPath) {
      plans.push({
        action: 'skip',
        appName,
        appParent,
        appPath,
        bundleArch,
        existingZipPath
      })
      continue
    }

    const zipPath = path.join(distDir, `${appStem}-${version}-${bundleArch}.app.zip`)
    const absZipPath = path.resolve(zipPath)
    const previousAppPath = plannedOutputs.get(absZipPath)
    if (previousAppPath) {
      throw new Error(
        `Refusing to overwrite macOS zip archive ${absZipPath}: both ${previousAppPath} and ${appPath} resolved to arch "${bundleArch}"`
      )
    }
    plannedOutputs.set(absZipPath, appPath)

    plans.push({
      action: 'create',
      appName,
      appParent,
      appPath,
      bundleArch,
      zipPath,
      absZipPath
    })
  }

  return plans
}

function zipApps(appDirs, distDir, version, arch, officialReleaseBuild = false, options = {}) {
  console.log('\n=== Creating zip file ===')
  const runFile = options.execFileSync || execFileSync
  const plans = planMacAppZipArchives(appDirs, distDir, version, arch, officialReleaseBuild)

  for (const plan of plans) {
    if (plan.action === 'skip') {
      console.log(
        `  ✓ Skipping redundant .app.zip for ${plan.bundleArch}; electron-builder archive already exists: ${plan.existingZipPath}`
      )
      continue
    }

    try {
      if (fs.existsSync(plan.zipPath)) {
        fs.unlinkSync(plan.zipPath)
      }
      if (officialReleaseBuild) {
        runFile(
          '/usr/bin/ditto',
          ['-c', '-k', '--sequesterRsrc', '--keepParent', plan.appPath, plan.absZipPath],
          { stdio: 'inherit' }
        )
      } else {
        runFile('zip', ['-r', plan.absZipPath, plan.appName], {
          cwd: plan.appParent,
          stdio: 'inherit'
        })
      }
      console.log(`  ✓ Created zip: ${plan.absZipPath}`)

      if (!fs.existsSync(plan.zipPath)) {
        throw new Error(`Zip archive not found after creation: ${plan.zipPath}`)
      }
      const stats = fs.statSync(plan.zipPath)
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
      console.log(`  ✓ Zip file verified: ${sizeMB} MB`)
    } catch (err) {
      if (officialReleaseBuild) {
        throw err
      }
      console.warn(`  Warning: Failed to create zip ${plan.zipPath}: ${err.message}`)
    }
  }

  return plans
}

function postProcessMacArtifacts(distDir, version, arch, options = {}) {
  const officialReleaseBuild =
    typeof options.officialReleaseBuild === 'boolean'
      ? options.officialReleaseBuild
      : isOfficialReleaseBuild()
  console.log(`\n=== macOS postprocess (${officialReleaseBuild ? 'official' : 'local'}) ===`)
  try {
    const appDirs = findAppDirs(distDir)
    if (appDirs.length === 0) {
      if (officialReleaseBuild) {
        throw new Error('Official macOS build produced no .app bundle')
      }
      console.log('  No .app bundles found to fix')
      return []
    }

    if (officialReleaseBuild) {
      ;(options.verifyOfficialSignedApps || verifyOfficialSignedApps)(appDirs)
    } else {
      appDirs.forEach((appPath) => {
        fixAppPermissions(appPath)
      })
      console.log(`✓ Fixed permissions for ${appDirs.length} .app bundle(s)`)
      fixFrameworkExecutablePermissions(appDirs)
      removeQuarantine(appDirs)
      adHocSignApps(appDirs)
    }

    return zipApps(appDirs, distDir, version, arch, officialReleaseBuild, options)
  } catch (err) {
    if (officialReleaseBuild) {
      throw err
    }
    console.warn(`  Warning: Failed to postprocess macOS artifacts: ${err.message}`)
    return []
  }
}

module.exports = {
  findAppDirs,
  findExistingElectronBuilderZip,
  planMacAppZipArchives,
  postProcessMacArtifacts,
  resolveMacAppBundleArch,
  zipApps
}
