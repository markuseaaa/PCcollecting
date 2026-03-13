import { useEffect, useMemo, useState } from "react";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { storage } from "../../firebase-config";
import { buildResizedPath, DEFAULT_CARD_THUMB_SIZE } from "../lib/imagePaths";

const thumbUrlCache = new Map();

function normalizeThumbPath(path) {
  const clean = String(path || "").trim();
  if (!clean) return "";
  const dot = clean.lastIndexOf(".");
  if (dot < 0) return `${clean}.webp`;
  return `${clean.slice(0, dot)}.webp`;
}

function buildLegacyThumbFromImagePath(imagePath, size) {
  const clean = String(imagePath || "").trim();
  if (!clean) return "";
  const dot = clean.lastIndexOf(".");
  const base = dot < 0 ? clean : clean.slice(0, dot);
  return `${base}_${size}.webp`;
}

function withSize(path, size) {
  const clean = normalizeThumbPath(path);
  if (!clean) return "";
  return clean.replace(/_(\d+)x(\d+)\.webp$/i, `_${size}.webp`);
}

function buildThumbCandidates(thumbPath, imagePath) {
  const candidates = [];
  const seen = new Set();
  const add = (value) => {
    const next = String(value || "").trim();
    if (!next || seen.has(next)) return;
    seen.add(next);
    candidates.push(next);
  };

  const normalizedThumb = normalizeThumbPath(thumbPath);
  add(normalizedThumb);
  add(withSize(normalizedThumb, DEFAULT_CARD_THUMB_SIZE));
  add(withSize(normalizedThumb, "300x400"));

  // If a recent migration wrote "thumbs/users/..." for legacy originals,
  // also try the original legacy folder path.
  if (normalizedThumb.startsWith("thumbs/users/")) {
    add(normalizedThumb.slice("thumbs/".length));
    add(withSize(normalizedThumb.slice("thumbs/".length), DEFAULT_CARD_THUMB_SIZE));
    add(withSize(normalizedThumb.slice("thumbs/".length), "300x400"));
  }

  const normalizedImagePath = String(imagePath || "").trim();
  if (normalizedImagePath) {
    add(buildResizedPath(normalizedImagePath, DEFAULT_CARD_THUMB_SIZE));
    add(buildLegacyThumbFromImagePath(normalizedImagePath, DEFAULT_CARD_THUMB_SIZE));
    add(buildLegacyThumbFromImagePath(normalizedImagePath, "300x400"));
  }

  return candidates;
}

export default function StorageImage({
  src,
  thumbPath,
  imagePath,
  alt,
  className,
  loading = "lazy",
  thumbOnly = false,
}) {
  const [resolvedThumbUrl, setResolvedThumbUrl] = useState("");

  const fallbackSrc = useMemo(() => String(src || "").trim(), [src]);

  useEffect(() => {
    let mounted = true;
    const candidates = buildThumbCandidates(thumbPath, imagePath);

    if (!candidates.length) {
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
  }, [thumbPath, imagePath]);

  const finalSrc = resolvedThumbUrl || (thumbOnly ? "" : fallbackSrc);
  if (!finalSrc) {
    return <div className={`image-placeholder ${className || ""}`.trim()} />;
  }

  return <img src={finalSrc} alt={alt} className={className} loading={loading} />;
}
