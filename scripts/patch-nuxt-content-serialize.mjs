import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
let contentPkg
try {
  contentPkg = require.resolve('@nuxt/content/package.json')
} catch {
  process.exit(0)
}

const modulePath = join(dirname(contentPkg), 'dist/module.mjs')
if (!existsSync(modulePath)) process.exit(0)

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
