---
'generaltranslation': patch
---

`GT.queryFiles()` and `GT.queryFilesContent()` send selectors that resolve to the same file, version, and locale (for example a custom-mapped alias and its canonical locale) once instead of failing the whole request, and answer every original selector in request order, under the locale it requested.
