---
'gt-payload': minor
---

Use the canonical GT API methods (`translateFiles`, `queryJobs`, `queryFilesContent`), so the plugin no longer logs deprecation warnings. A document whose source upload GT does not save is now reported as failed while the other documents are still translated, and translations GT does not save are reported instead of ignored.

`GtClient` now picks the canonical methods (`uploadSourceFiles`, `translateFiles`, `awaitJobs`, `queryFilesContent`, `uploadTranslations`, `queryJobs`, `translateMany`, `customMapping`). A `GT` instance still satisfies it; a custom client passed as `client` must implement these methods instead of `enqueueFiles`, `downloadFileBatch` and `checkJobStatus`.
