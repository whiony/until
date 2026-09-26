"use client";
import { useEffect, useState } from "react";
import { Apple, Flower2, Pill, Package, PawPrint, Leaf } from "lucide-react";
import { getPhoto } from "@/lib/until/repository";
const icons: Record<string, typeof Apple> = {
  Food: Apple,
  Beauty: Flower2,
  Medicine: Pill,
  Supplements: Leaf,
  Household: Package,
  Pet: PawPrint,
};
export function Photo({
  id,
  category,
  name,
  blob,
}: {
  id?: string;
  category: string;
  name: string;
  blob?: Blob;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const load = async () => {
      const b = blob || (id ? await getPhoto(id) : undefined);
      if (b && active) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      } else if (active) setUrl("");
    };
    const update = () => {
      void load().catch(() => {});
    };
    update();
    window.addEventListener("until-records", update);
    return () => {
      active = false;
      window.removeEventListener("until-records", update);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, blob]);
  const Icon = icons[category] || Package;
  return (
    <div className={`photo photo-${category.toLowerCase()}`}>
      {url ? (
        // IndexedDB blob URLs are already resized and must remain available offline.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} onError={() => setUrl("")} />
      ) : (
        <Icon strokeWidth={1.3} aria-hidden="true" />
      )}
    </div>
  );
}
