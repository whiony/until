/** Shared metadata keeps separators conditional in every shelf and detail view. */
export function ItemMetadata({
  brand,
  category,
  location,
  fallback = "",
}: {
  brand?: string;
  category?: string;
  location?: string;
  fallback?: string;
}) {
  const values = [brand, category, location].filter((value) => value?.trim());
  return (
    <span className="item-metadata">
      {values.length
        ? values.map((value, index) => (
            <span key={index}>
              {index > 0 && (
                <>
                  {" "}
                  <span className="metadata-separator" aria-hidden="true">
                    ·
                  </span>{" "}
                </>
              )}
              {value}
            </span>
          ))
        : fallback}
    </span>
  );
}
