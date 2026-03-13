import { useEffect, useMemo, useState } from "react";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { storage } from "../../firebase-config";

const thumbUrlCache = new Map();

function buildThumbCandidates(path) {
  const clean = String(path || "").trim();
  if (!clean) return [];
  const candidates = [clean];
  const dot = clean.lastIndexOf(".");
  if (dot > -1) {
    const ext = clean.slice(dot + 1).toLowerCase();
    if (ext !== "webp") {
      candidates.push(`${clean.slice(0, dot)}.webp`);
    }
  }
  return Array.from(new Set(candidates));
}

export default function StorageImage({
  src,
  thumbPath,
  alt,
  className,
  loading = "lazy",
  thumbOnly = false,
}) {
  const [resolvedThumbUrl, setResolvedThumbUrl] = useState("");

  const fallbackSrc = useMemo(() => String(src || "").trim(), [src]);

  useEffect(() => {
    let mounted = true;
    const path = String(thumbPath || "").trim();
    const candidates = buildThumbCandidates(path);

    if (candidates.length === 0) {
      setResolvedThumbUrl("");
      return () => {
        mounted = false;
      };
    }

    const cachedCandidate = candidates.find((candidate) => thumbUrlCache.has(candidate));
    if (cachedCandidate) {
      setResolvedThumbUrl(thumbUrlCache.get(cachedCandidate) || "");
      return () => {
        mounted = false;
      };
    }

    (async () => {
      for (const candidate of candidates) {
        try {
          const url = await getDownloadURL(storageRef(storage, candidate));
          thumbUrlCache.set(candidate, url);
          if (mounted) setResolvedThumbUrl(url);
          return;
        } catch {
          // Try next candidate.
        }
      }
      if (mounted) setResolvedThumbUrl("");
    })();

    return () => {
      mounted = false;
    };
  }, [thumbPath]);

  const finalSrc = resolvedThumbUrl || (thumbOnly ? "" : fallbackSrc);
  if (!finalSrc) {
    return <div className={`image-placeholder ${className || ""}`.trim()} />;
  }

  return <img src={finalSrc} alt={alt} className={className} loading={loading} />;
}
