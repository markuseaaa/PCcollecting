import { useEffect, useMemo, useState } from "react";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { storage } from "../../firebase-config";

const thumbUrlCache = new Map();

export default function StorageImage({
  src,
  thumbPath,
  alt,
  className,
  loading = "lazy",
}) {
  const [resolvedThumbUrl, setResolvedThumbUrl] = useState("");

  const fallbackSrc = useMemo(() => String(src || "").trim(), [src]);

  useEffect(() => {
    let mounted = true;
    const path = String(thumbPath || "").trim();

    if (!path) {
      setResolvedThumbUrl("");
      return () => {
        mounted = false;
      };
    }

    const cached = thumbUrlCache.get(path);
    if (cached) {
      setResolvedThumbUrl(cached);
      return () => {
        mounted = false;
      };
    }

    getDownloadURL(storageRef(storage, path))
      .then((url) => {
        thumbUrlCache.set(path, url);
        if (mounted) setResolvedThumbUrl(url);
      })
      .catch(() => {
        if (mounted) setResolvedThumbUrl("");
      });

    return () => {
      mounted = false;
    };
  }, [thumbPath]);

  const finalSrc = resolvedThumbUrl || fallbackSrc;
  if (!finalSrc) {
    return <div className={`image-placeholder ${className || ""}`.trim()} />;
  }

  return <img src={finalSrc} alt={alt} className={className} loading={loading} />;
}
