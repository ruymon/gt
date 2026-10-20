---
'gt-sanity': patch
---

Use the canonical General Translation API methods (`getFileStatus`, `translateFiles`, `generateProjectContext`, `queryFiles`, `queryFilesContent`, and `createBranch({ name, isDefault })`) instead of the deprecated ones. Documents or translations that fail to upload are now reported in the Studio and the console, and failed documents are no longer sent for translation or used for uploading existing translations. After uploading, the plugin sets the project's default locale to the configured source locale when they differ, as the previous upload route did; if the API key lacks `project:write`, it warns in the console and continues.
