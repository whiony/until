#!/usr/bin/env python3
"""Verify an Until data ZIP and extract it to a NEW local directory only.

This is an isolated recovery aid, not a production D1/R2 restore command.
"""
import hashlib
import json
import sys
import zipfile
from pathlib import Path


def fail(message):
    raise SystemExit(message)


def main():
    if len(sys.argv) != 3:
        fail("Usage: restore-portable-archive.py <until-data.zip> <new-output-directory>")
    source, destination = Path(sys.argv[1]), Path(sys.argv[2])
    if destination.exists():
        fail("Output directory already exists; choose a new isolated path.")
    with zipfile.ZipFile(source) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or not {"records.json", "manifest.json"}.issubset(names):
            fail("Archive has missing or duplicate entries.")
        data = json.loads(archive.read("records.json"))
        manifest = json.loads(archive.read("manifest.json"))
        if data.get("format") != "until-portable-v1" or manifest.get("format") != data["format"]:
            fail("Unsupported archive format.")
        if hashlib.sha256(archive.read("records.json")).hexdigest() != manifest.get("recordsSha256"):
            fail("Record integrity check failed.")
        records = [data["records"], *data.get("recovery", [])]
        for record in records:
            products = {product["id"] for product in record["products"]}
            if any(item["productId"] not in products for item in record["items"]):
                fail("Item and product associations are incomplete.")
        expected = {
            photo_id
            for record in records
            for photo_id in [
                *(product.get("photoId") for product in record["products"]),
                *(item.get("packagingPhotoId") for item in record["items"]),
            ]
            if photo_id
        }
        files = manifest["files"]
        if len(files) != len(expected) or set(names) != {"records.json", "manifest.json", *(entry["path"] for entry in files)}:
            fail("Photo list is incomplete or archive has unexpected entries.")
        for entry in files:
            photo_id, path = entry["id"], entry["path"]
            if photo_id not in expected or path not in names or not path.startswith(f"photos/{photo_id}.") or "/" in path[7:]:
                fail("Unsafe or unassociated photo path.")
            content = archive.read(path)
            if len(content) != entry["size"] or hashlib.sha256(content).hexdigest() != entry["sha256"]:
                fail("Photo integrity check failed.")
        destination.mkdir(parents=True)
        for name in names:
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(name))
    print(f"Verified {len(records[0]['items'])} current items and {len(files)} photo files in {destination}")


if __name__ == "__main__":
    main()
