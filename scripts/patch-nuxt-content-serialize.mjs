import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// Resolution starts from apps/nexus, which is the only workspace that declares
// @nuxt/content. This script runs as a *root* postinstall, and since #1099 removed
// shamefully-hoist the package is not in the root node_modules at all.
const require = createRequire(new URL('../apps/nexus/package.json', import.meta.url))

let moduleEntry
try {
  // The `.` export, which lands on dist/module.cjs — beside the file this rewrites.
  //
  // This used to resolve '@nuxt/content/package.json'. That subpath is not in the package's
  // exports map (3.15.0 exposes only `.`, ./preview, ./utils, ./runtime, ./server, ./nitro),
  // so it threw ERR_PACKAGE_PATH_NOT_EXPORTED. Combined with the root-resolution problem
  // above, the patch had never once been applied (#538).
  moduleEntry = require.resolve('@nuxt/content')
}
catch (error) {
  // Skipping is legitimate — a partial install may not have apps/nexus. Saying so is not
  // optional: exiting 0 in silence is exactly what hid this for as long as it was hidden.
  process.stdout.write(
    `[patch-nuxt-content] @nuxt/content not resolvable from apps/nexus (${error?.code ?? 'unknown'}); skip\n`,
  )
  process.exit(0)
}

const modulePath = join(dirname(moduleEntry), 'module.mjs')
if (!existsSync(modulePath)) {
  process.stdout.write(`[patch-nuxt-content] no module.mjs beside ${moduleEntry}; skip\n`)
  process.exit(0)
}

let text = readFileSync(modulePath, 'utf8')
if (text.includes('Serialize content parsing/cache writes')) {
  process.stdout.write('[patch-nuxt-content] already applied\n')
  process.exit(0)
}

const old = `      for await (const chunk of chunks(_keys, 25)) {
        await Promise.all(chunk.map(async (key) => {
          const keyInCollection = join(collection.name, source?.prefix || "", key);
          const fullPath = join(cwd, fixed, key);
          const cache = databaseContents[keyInCollection];
          try {
            const content = await source.getItem?.(key) || "";
            const checksum = getContentChecksum(configHash + collectionHash + content);
            let parsedContent;
            if (cache && cache.checksum === checksum) {
              cachedFilesCount += 1;
              parsedContent = JSON.parse(cache.value);
            } else {
              parsedFilesCount += 1;
              parsedContent = await parse({
                id: keyInCollection,
                body: content,
                path: fullPath,
                collectionType: collection.type
              });
              if (parsedContent) {
                db.insertDevelopmentCache(keyInCollection, JSON.stringify(parsedContent), checksum);
              }
            }
            if (parsedContent?.__metadata?.components) {
              usedComponents.push(...parsedContent.__metadata.components);
            }
            const { queries, hash: hash2 } = generateCollectionInsert(collection, parsedContent);
            list.push([key, queries, hash2]);
          } catch (e) {
            logger.warn(\`"\${keyInCollection}" is ignored because parsing is failed. Error: \${e instanceof Error ? e.message : "Unknown error"}\`);
          }
        }));
      }`

const neu = `      // Serialize content parsing/cache writes. Concurrent better-sqlite3 writes
      // on the shared development cache can hang or throw "readonly database".
      for await (const chunk of chunks(_keys, 8)) {
        for (const key of chunk) {
          const keyInCollection = join(collection.name, source?.prefix || "", key);
          const fullPath = join(cwd, fixed, key);
          const cache = databaseContents[keyInCollection];
          try {
            const content = await source.getItem?.(key) || "";
            const checksum = getContentChecksum(configHash + collectionHash + content);
            let parsedContent;
            if (cache && cache.checksum === checksum) {
              cachedFilesCount += 1;
              parsedContent = JSON.parse(cache.value);
            } else {
              parsedFilesCount += 1;
              parsedContent = await parse({
                id: keyInCollection,
                body: content,
                path: fullPath,
                collectionType: collection.type
              });
              if (parsedContent) {
                await db.insertDevelopmentCache(keyInCollection, JSON.stringify(parsedContent), checksum);
              }
            }
            if (parsedContent?.__metadata?.components) {
              usedComponents.push(...parsedContent.__metadata.components);
            }
            const { queries, hash: hash2 } = generateCollectionInsert(collection, parsedContent);
            list.push([key, queries, hash2]);
          } catch (e) {
            logger.warn(\`"\${keyInCollection}" is ignored because parsing is failed. Error: \${e instanceof Error ? e.message : "Unknown error"}\`);
          }
        }
      }`

if (!text.includes(old)) {
  process.stdout.write('[patch-nuxt-content] target block not found; skip\n')
  process.exit(0)
}

text = text.replace(old, neu)
text = text.replace(
  '  const insertDevelopmentCache = async (id, value, checksum) => {\n    deleteDevelopmentCache(id);',
  '  const insertDevelopmentCache = async (id, value, checksum) => {\n    await deleteDevelopmentCache(id);',
)

writeFileSync(modulePath, text)
process.stdout.write(`[patch-nuxt-content] applied to ${modulePath}\n`)
