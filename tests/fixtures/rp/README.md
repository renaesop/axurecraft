# Public RP directory regression sample

`b2c-platform.rp` is the unchanged public “B2C通用电商平台原型设计【商城App 后台PC】” sample from [thiszhangyong/axureresource](https://github.com/thiszhangyong/axureresource/blob/9eddcea0a4dd671fe4aafc9178f358b5b0b8ebfd/%E5%8E%9F%E5%9E%8B/PmDaniu.com_B2C%E9%80%9A%E7%94%A8%E7%94%B5%E5%95%86%E5%B9%B3%E5%8F%B0%E5%8E%9F%E5%9E%8B%E8%AE%BE%E8%AE%A1%E3%80%90%E5%95%86%E5%9F%8EApp%20%E5%90%8E%E5%8F%B0PC%E3%80%91.rp), downloaded on 2026-11-06. Original authors retain attribution; no edits were made to the binary. The exact source commit, original filename, byte size and SHA-256 are in `b2c-source.json`.

The sample contains 175 pages and 68 folders across 11 levels. `b2c-directory.json` freezes the ordered sitemap traversal as `[depth, name, page GUID or null]`, read directly from the native SiteTreeMap and PackageInfos without using `convertRp9` or `readPageTree`.

The normal unit suite checks the binary checksum and all 243 directory entries. `scripts/validate-large-page-directory.ts` exports the actual RP and verifies every directory entry in HTML and React, folder toggling, the deepest page and duplicate page names. Tests use checked-in files and require no downloads.
