# Mobile QA retained storage disposition

Status: RETAINED - cleanup ownership cannot be re-established by the existing safeguard.
Reviewed by Main Astra on 5 September 2026 during bounded mobile remediation.

The disposable QA resource is `C:/Users/EERON/AppData/Local/Temp/kaul-documents-e2e-mobile_qa_20260905_01`, associated with the explicitly authorized test ID `mobile_qa_20260905_01`. The directory still exists. Its fictional contents were retained after the original exploratory worker was interrupted.

The repository helper `src/test/document-test-storage.ts` creates a fresh directory and captures its device/inode identity and a random owner token in a closure. Its disposal function checks the original identity, resolved root, marker type and original token before recursive removal. It deliberately refuses an existing directory. The interrupted worker lost that original closure. Reading the current marker would not prove that it equals the lost expected token, and the helper provides no supported adoption operation.

No cleanup was attempted, no marker was read or rewritten, and no ownership check was weakened. The known safe disposition is to retain this directory. It is excluded from the remediation browser work. A fresh recreation of the same authorized task database is separate from ownership of this retained filesystem directory. Full Documents regression runs use the existing isolated GitHub CI lifecycle. The local post-fix walkthrough uses a separately created process-local temporary parent, `remediation-temp-mobile_qa_20260905_01`, with the unchanged repository helper creating and disposing a fresh child for the same authorized ID. Both server and test worker share that process-local temporary setting. This preserves the retained directory and uses the original ownership closure for new cleanup.

No live, brother-testing or persistent Kaul storage, scanner, configuration or keys were inspected or changed. Future deletion remains contingent on positive exclusive-ownership proof through approved tooling; a matching directory name alone is insufficient.

The 6 September post-fix walkthrough and existing Documents regression completed. Their new storage child was removed by its original helper closures; absence was verified afterward. The recreated disposable database was dropped through the repository guard, the exact labeled no-mount QA scanner was removed, and the task server was stopped. The old retained directory remains present and untouched.
