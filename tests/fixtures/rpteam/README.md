# Public Axure team regression fixtures

These are unchanged public files from the repositories below, downloaded on
2026-11-06. `sources.json` records the exact source commit, byte length, SHA-256,
and regression expectations. The source projects remain attributable to their
original authors.

| File | Source project | Test purpose |
| --- | --- | --- |
| `fanbo-job.rpteam` | [2019-summer-internship/Csharp](https://github.com/2019-summer-internship/Csharp/blob/4d0ef6f509d539ba1cd9ac17600c54200b355b18/design/view/axure/fanbo-job.rpteam) | Early RP9 directory without `StartPage`; 12 pages, including an empty page |
| `706platform.rpteam` | [706YouthSpace/706platform](https://github.com/706YouthSpace/706platform/blob/8ff393bbb7aae3e6e4484b24046c80b58b765285/resource/axure/706platform.rpteam) | Null leaf groups, fragmented page chains, 25 pages including three empty pages |
| `TNT.rpteam` | [RobTain/InnoTech2](https://github.com/RobTain/InnoTech2/blob/94a4b5fb8c85f7c02cf9af6918f4d3c6ecbd6229/TNT.rpteam) | Unsupported container header must produce an explicit error |

`npm run test:ci` loads all three files and verifies their checksums before
testing them. `npx --no-install tsx scripts/validate-rpteam.ts` also exports and
compiles the two supported projects and compares all their HTML/React pages.
Neither test downloads fixtures or requires a local `research` directory.

The small authored fixtures in `../rpteam.ts` complement these original files
with targeted corruption and size-limit regressions. Known conversion
diagnostics and the distinction between renderer consistency and native Axure
parity are documented in `../../../docs/rpteam.md`.
