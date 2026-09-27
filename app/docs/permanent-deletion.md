# Permanent deletion and reconciliation

Used and Discarded are ordinary history states. They retain their item, product,
quantity, completion date, and photo references. Delete permanently is a separate,
confirmed action on one record (all units of that record); other history entries
and active records remain.

The local IndexedDB transaction removes the item and, only when no other item
references it, its product. It queues compact item/product deletion markers in the
same account snapshot. No network is required. Local collection prunes the same
explicit deletions from account baseline/recovery copies, then checks references
in every account and recovery snapshot before removing shared photo bytes.
Cleanup failures do not undo a committed deletion; successful sync retries them.

The authenticated sync endpoint merges these markers with its authoritative
markers and applies them before committing records with compare-and-swap. A
marker wins over edits or an old copy of the same ID. Product removal never removes
another referencing item. The server chooses the first deletion timestamp.

Remote collection is account-scoped and checks the latest committed references,
including claimed legacy copies. It removes unshared product/label objects from
that account and its claimed legacy namespaces. An account storage lease serializes
record/photo writes and collection; existing object reads remain concurrent.
Orphan uploads have a 24-hour grace period. Collection processes at most 100 objects
per sync and retries failed work on later pulls. It does not require a scheduler.

Markers contain IDs, a server timestamp, and only pending photo IDs. After photo
cleanup and 30 days, the next sync compacts them and advances deletionEpoch. Stale
clients must reconcile against their old baseline: previously known entities now
missing from the cloud are removed; independent offline creations remain. A stale
copy without a usable baseline is preserved as a conflict requiring explicit cloud
adoption rather than automatically importing potentially deleted IDs. The server
rejects writes with an old epoch, including older app versions. Thus compaction
cannot silently resurrect a permanently deleted record.

No background timer runs when every device is closed. Pending remote cleanup and
marker compaction complete on the next authenticated sync. Offline data and
conflicts remain locally available. Record bodies are removed immediately; marker
retention is bounded by successful cleanup and the next sync after the retention
window. Physical iPhone keyboard behavior requires separate real-device checking.
